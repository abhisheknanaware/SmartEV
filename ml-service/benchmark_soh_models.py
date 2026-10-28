"""Benchmark classical ML and deep-learning models for the what-if SOH simulator.

Same data and protocol as train_soh_simulator.py: 320 laboratory cells, inputs
(cycle number, chemistry, ambient temperature, charge C-rate, discharge C-rate), target
SOH % of initial capacity, 5-fold GroupKFold by cell, so every score is on unseen cells.

Besides accuracy, each model is checked for monotonicity: across a grid of usage
conditions, how often does its predicted SOH *rise* with more cycles (a what-if simulator
must not show a battery getting healthier with use).

Usage: python -I benchmark_soh_models.py MASTER_DIR [OUT_JSON]
"""
import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from sklearn.ensemble import ExtraTreesRegressor, HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import GroupKFold, GroupShuffleSplit
from sklearn.neighbors import KNeighborsRegressor
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVR

sys.path.insert(0, str(Path(__file__).parent))
from train_soh_simulator import CHEMS, FEATURES, MONOTONE, PARAMS, load  # noqa: E402

SEED = 20261023
PRODUCTION = "LightGBM (monotone)"  # model served by /simulate/soh (train_soh_simulator.py)
TIE_RMSE = 0.05
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
COND = [f for f in FEATURES if f != "cycle_number"]


# ---------------------------------------------------------------- feature helpers
def physics_features(X: pd.DataFrame) -> pd.DataFrame:
    """Ridge gets degradation-shaped terms: sqrt/log of cycles and their interaction with conditions."""
    c = X.cycle_number / 1000.0
    out = X[COND].copy()
    for name, f in {"sqrt_c": np.sqrt(c), "log_c": np.log1p(c * 10), "c": c}.items():
        out[name] = f
        for col in COND:
            out[f"{name}*{col}"] = f * X[col]
    return out


# ---------------------------------------------------------------- deep-learning models
class MLP(torch.nn.Module):
    def __init__(self, d):
        super().__init__()
        self.net = torch.nn.Sequential(
            torch.nn.Linear(d, 128), torch.nn.SiLU(), torch.nn.Dropout(0.05),
            torch.nn.Linear(128, 128), torch.nn.SiLU(), torch.nn.Dropout(0.05),
            torch.nn.Linear(128, 64), torch.nn.SiLU(), torch.nn.Linear(64, 1))

    def forward(self, x):
        return self.net(x).squeeze(-1)


class PhysicsNet(torch.nn.Module):
    """SOH = 100 * (s0 - a(cond) * (cycles/1000) ** b(cond)), with a > 0 and b > 0.

    Degradation follows a condition-dependent power law, so SOH is strictly non-increasing
    in cycles by construction (no monotonicity violations possible)."""

    def __init__(self, d):
        super().__init__()
        self.body = torch.nn.Sequential(torch.nn.Linear(d, 64), torch.nn.SiLU(), torch.nn.Linear(64, 64), torch.nn.SiLU())
        self.head = torch.nn.Linear(64, 3)

    def forward(self, cond, cycles):
        h = self.head(self.body(cond))
        s0 = 1.0 + 0.05 * torch.tanh(h[:, 0])                 # initial SOH 0.95-1.05
        a = torch.nn.functional.softplus(h[:, 1]) * 0.2         # fade per (1000 cycles)^b
        b = 0.3 + torch.nn.functional.softplus(h[:, 2])         # exponent > 0.3
        return 100.0 * (s0 - a * torch.clamp(cycles / 1000.0, min=0) ** b)


class TorchRegressor:
    def __init__(self, kind, epochs=120, lr=2e-3, batch=1024, patience=12):
        self.kind, self.epochs, self.lr, self.batch, self.patience = kind, epochs, lr, batch, patience

    def _tensors(self, X):
        cond = torch.tensor(((X[COND].values - self.mu) / self.sd), dtype=torch.float32, device=DEVICE)
        cyc = torch.tensor(X.cycle_number.values, dtype=torch.float32, device=DEVICE)
        return cond, cyc

    def _forward(self, cond, cyc):
        if self.kind == "physics":
            return self.model(cond, cyc)
        return self.model(torch.cat([cond, (cyc / 1000.0).unsqueeze(-1), torch.sqrt(cyc / 1000.0).unsqueeze(-1)], 1))

    def fit(self, X, y, groups):
        torch.manual_seed(SEED)
        self.mu, self.sd = X[COND].values.mean(0), X[COND].values.std(0) + 1e-6
        tr, va = next(GroupShuffleSplit(n_splits=1, test_size=0.12, random_state=SEED).split(X, y, groups))
        d = len(COND)
        self.model = (PhysicsNet(d) if self.kind == "physics" else MLP(d + 2)).to(DEVICE)
        opt = torch.optim.AdamW(self.model.parameters(), lr=self.lr, weight_decay=1e-4)
        ctr, ytr = self._tensors(X.iloc[tr]), torch.tensor(y[tr], dtype=torch.float32, device=DEVICE)
        cva, yva = self._tensors(X.iloc[va]), torch.tensor(y[va], dtype=torch.float32, device=DEVICE)
        best, best_state, wait = 1e9, None, 0
        for _ in range(self.epochs):
            self.model.train()
            perm = torch.randperm(len(ytr), device=DEVICE)
            for i in range(0, len(perm), self.batch):
                j = perm[i:i + self.batch]
                loss = torch.nn.functional.huber_loss(self._forward(ctr[0][j], ctr[1][j]), ytr[j], delta=3.0)
                opt.zero_grad(); loss.backward(); opt.step()
            self.model.eval()
            with torch.no_grad():
                v = torch.sqrt(torch.mean((self._forward(*cva) - yva) ** 2)).item()
            if v < best - 1e-3:
                best, best_state, wait = v, {k: t.detach().clone() for k, t in self.model.state_dict().items()}, 0
            else:
                wait += 1
                if wait >= self.patience:
                    break
        self.model.load_state_dict(best_state)
        return self

    def predict(self, X):
        self.model.eval()
        with torch.no_grad():
            return self._forward(*self._tensors(X)).cpu().numpy()


# ---------------------------------------------------------------- model zoo
def zoo():
    import lightgbm as lgb
    import xgboost as xgb
    from catboost import CatBoostRegressor
    mono = MONOTONE
    return {
        # name: (family, factory, uses_groups, train_subsample)
        "Ridge (physics features)": ("Linear", lambda: _Wrap(make_pipeline(StandardScaler(), Ridge(alpha=1.0)), physics_features), False, None),
        "k-Nearest Neighbours": ("Instance-based", lambda: make_pipeline(StandardScaler(), KNeighborsRegressor(n_neighbors=25, weights="distance")), False, None),
        "Support Vector Regression (RBF)": ("Kernel", lambda: make_pipeline(StandardScaler(), SVR(C=30.0, epsilon=0.5, gamma="scale")), False, 8000),
        "Random Forest": ("Bagging ensemble", lambda: RandomForestRegressor(n_estimators=300, min_samples_leaf=10, n_jobs=-1, random_state=SEED), False, None),
        "Extra Trees": ("Bagging ensemble", lambda: ExtraTreesRegressor(n_estimators=300, min_samples_leaf=10, n_jobs=-1, random_state=SEED), False, None),
        "HistGradientBoosting (monotone)": ("Boosting", lambda: HistGradientBoostingRegressor(max_iter=600, learning_rate=0.05, max_leaf_nodes=31, monotonic_cst=mono, random_state=SEED), False, None),
        "XGBoost (monotone)": ("Boosting", lambda: xgb.XGBRegressor(n_estimators=900, learning_rate=0.03, max_depth=7, subsample=0.8, colsample_bytree=0.9,
                                                                    monotone_constraints="(" + ",".join(map(str, mono)) + ")", tree_method="hist",
                                                                    device="cuda" if DEVICE.type == "cuda" else "cpu", random_state=SEED), False, None),
        "CatBoost (monotone)": ("Boosting", lambda: CatBoostRegressor(iterations=1200, learning_rate=0.05, depth=6, loss_function="RMSE",
                                                                      monotone_constraints=mono, random_seed=SEED, verbose=False, thread_count=-1), False, None),
        "LightGBM (monotone)": ("Boosting", lambda: lgb.LGBMRegressor(**dict(PARAMS, monotone_constraints=mono)), False, None),
        "MLP neural network": ("Deep learning", lambda: TorchRegressor("mlp"), True, None),
        "Physics-informed NN (power-law fade)": ("Deep learning", lambda: TorchRegressor("physics"), True, None),
    }


class _Wrap:
    def __init__(self, est, transform):
        self.est, self.t = est, transform

    def fit(self, X, y):
        self.est.fit(self.t(X), y); return self

    def predict(self, X):
        return self.est.predict(self.t(X))


# ---------------------------------------------------------------- evaluation
def monotonic_violation_rate(model, step=50, horizon=3000, tol=0.5):
    """Share of condition grids whose predicted curve rises by more than `tol` points anywhere."""
    grid, bad = [], 0
    cycles = np.arange(0, horizon + 1, step)
    for chem in CHEMS:
        for t in (15, 25, 35):
            for cr in ((0.5, 4.0) if chem == "LFP" else (0.5,)):
                for dr in (1.0, 3.0):
                    rows = []
                    for c in cycles:
                        r = {f: 0.0 for f in FEATURES}
                        r.update(cycle_number=float(c), ambient_temp_C=t, max_charge_rate_C=cr, max_discharge_rate_C=dr)
                        r[f"chem_{chem}"] = 1.0
                        rows.append(r)
                    p = model.predict(pd.DataFrame(rows)[FEATURES])
                    grid.append(1)
                    if np.any(np.diff(p) > tol):
                        bad += 1
    return bad / len(grid)


def main(master, out_json):
    df = load(Path(master))
    X, y, groups = df[FEATURES].reset_index(drop=True), df.soh.values, df.cell_id.values
    chem = df.chemistry.values
    folds = list(GroupKFold(n_splits=5).split(X, y, groups))
    rng = np.random.default_rng(SEED)
    results = []
    for name, (family, make, uses_groups, sub) in zoo().items():
        oof = np.zeros(len(y)); fit_s = []; pred_ms = []; last = None
        for tr, te in folds:
            if sub and len(tr) > sub:
                tr = rng.choice(tr, sub, replace=False)
            m = make()
            t0 = time.perf_counter()
            m.fit(X.iloc[tr], y[tr], groups[tr]) if uses_groups else m.fit(X.iloc[tr], y[tr])
            fit_s.append(time.perf_counter() - t0)
            t0 = time.perf_counter()
            oof[te] = m.predict(X.iloc[te])
            pred_ms.append((time.perf_counter() - t0) / len(te) * 1000 * 1000)  # ms per 1,000 rows
            last = m
        res = {
            "name": name, "family": family,
            "mae": float(mean_absolute_error(y, oof)), "rmse": float(np.sqrt(mean_squared_error(y, oof))), "r2": float(r2_score(y, oof)),
            "by_chemistry_mae": {c: float(mean_absolute_error(y[chem == c], oof[chem == c])) for c in CHEMS},
            "fit_seconds": float(np.mean(fit_s)), "predict_ms_per_1k": float(np.mean(pred_ms)),
            "monotonic_violation_rate": float(monotonic_violation_rate(last)),
            "train_subsample": sub,
        }
        results.append(res)
        print(f"{name:40s} MAE {res['mae']:.2f} RMSE {res['rmse']:.2f} R2 {res['r2']:.3f} "
              f"fit {res['fit_seconds']:.1f}s mono-viol {res['monotonic_violation_rate']:.0%}", flush=True)

    results.sort(key=lambda r: r["rmse"])
    eligible = [r for r in results if r["monotonic_violation_rate"] == 0]
    report = {
        "protocol": "5-fold GroupKFold by cell (whole cells held out); same data as the production simulator",
        "rows": int(len(df)), "cells": int(df.cell_id.nunique()),
        "device_for_deep_learning": str(DEVICE),
        "selection_rule": "lowest held-out RMSE among models whose curves never rise with cycles",
        "best_overall": results[0]["name"], "best_monotone": eligible[0]["name"] if eligible else None,
        # Models within TIE_RMSE of the best monotone model are statistically tied; the production
        # simulator keeps LightGBM in that case (fastest to train, already integrated with the band).
        "tie_tolerance_rmse": TIE_RMSE,
        "tied_with_best_monotone": [r["name"] for r in eligible if eligible and r["rmse"] - eligible[0]["rmse"] <= TIE_RMSE],
        "in_production": PRODUCTION,
        "results": results,
    }
    Path(out_json).write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("best overall:", report["best_overall"], "| best monotone:", report["best_monotone"])


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else Path(__file__).parent / "app" / "models" / "soh_model_benchmark.json")
