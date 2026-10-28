"""Round-1 training of the SmartEV battery models (M1-M6, M8) with leakage-safe, cell-separated evaluation.

Every model is compared with a simple baseline so the result can be judged:
  M1  health now (SOH)            vs. predicting the training-set mean
  M2  forecast (RUL, cycles)      vs. linear extrapolation of the recent SOH fade rate
  M3  risk (time to EOL, AFT)     vs. ranking by equivalent full cycles only
  M4  safety (anomaly)            evaluated with injected faults on normal test cycles
  M5  range (Wh/km, VED trips)    vs. predicting the training-set mean
  M6  charge time                 vs. persistence (previous cycle's charge time)
  M8  smart charging (optimiser)  vs. "charge now to 100 %" on simulated sessions

Splits are by cell (by vehicle for M5), stratified by source, 3 seeds.

Usage: python -I train_all.py DATASETS_DIR OUT_DIR [round_tag]
"""
import json
import sys
import time
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.ensemble import IsolationForest
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import GroupShuffleSplit

SEEDS = (0, 1, 2)
CHEMS = ["LFP", "LCO", "LCO/NCO", "NMC", "NCA", "unknown"]
LGB = dict(n_estimators=3000, learning_rate=0.03, num_leaves=31, min_child_samples=50, subsample=0.8,
           subsample_freq=1, colsample_bytree=0.8, verbose=-1)

# Feature sets (see the feature-to-model table). Cumulative counters are lagged one cycle (*_prev) so the
# current cycle's discharge capacity never enters its own inputs.
CONTEXT = ["nominal_capacity_Ah", "ambient_temp_C", "dod", "c_rate_charge"] + [f"chem_{c}" for c in CHEMS]
STRESS = ["efc_prev", "sqrt_cycle", "cum_arrhenius_efc_prev", "cum_plating_stress", "arrhenius_factor",
          "crate_x_dod", "fastcharge_x_temp", "temp_mean_C", "temp_rise_C"]
IR = ["ir_ohm", "ir_growth", "ir_slope_20", "ir_x_temp"]
CHARGE_FULL = ["charge_time_s", "cc_fraction", "v_at_q10", "v_at_q50", "v_at_q90", "pc_window_frac"]
FEATURES = {
    "M1_field": CONTEXT + STRESS + IR + ["pc_window_norm"],
    "M1_lab": CONTEXT + STRESS + IR + ["pc_window_norm"] + CHARGE_FULL,
    "M2": CONTEXT + STRESS + IR + ["hist_soh_prev", "hist_soh_slope_10", "hist_soh_slope_50", "hist_soh_ewm",
                                   "hist_soh_drop", "charge_time_slope_20", "dq_var_log", "dq_min", "ic_peak_shift"],
    "M6": CONTEXT + ["hist_soh_prev", "ir_ohm", "temp_mean_C", "prev_charge_time_s", "prev_cc_fraction",
                     "prev_v_at_q50", "prev_pc_window_frac", "efc_prev"],
}
M4_FEATURES = ["temp_rise_C", "coulombic_eff", "energy_eff", "cc_fraction", "v_at_q50", "ir_growth", "soh_residual"]


# ----------------------------------------------------------------------------- data
def load_cycles(root: Path) -> pd.DataFrame:
    f = pd.read_parquet(root / "master" / "features.parquet")
    cells = pd.read_parquet(root / "master" / "cells.parquet", columns=["cell_id", "nominal_capacity_Ah", "eol_cycle", "is_censored"])
    f = f.merge(cells, on="cell_id", how="left")
    num = f.select_dtypes("float64").columns
    f[num] = f[num].astype(np.float32)
    f = f.sort_values(["cell_id", "cycle_number"]).reset_index(drop=True)
    g = f.groupby("cell_id", sort=False)
    for col in ("efc", "cum_arrhenius_efc"):
        f[f"{col}_prev"] = g[col].shift(1)
    for col in ("charge_time_s", "cc_fraction", "v_at_q50", "pc_window_frac"):
        f[f"prev_{col}"] = g[col].shift(1)
    f["pc_window_norm"] = f["pc_window_Ah"] / f["nominal_capacity_Ah"]
    for c in CHEMS:
        f[f"chem_{c}"] = (f["chemistry"] == c).astype(np.float32)
    return f


def split(df, seed, group="cell_id", strat="source", test=0.2, val=0.15):
    tr, va, te = [], [], []
    for _, rows in df.groupby(strat).groups.items():
        rows = np.asarray(rows)
        grp = df.loc[rows, group].to_numpy()
        if len(np.unique(grp)) < 3:
            tr.append(rows)
            continue
        a, b = next(GroupShuffleSplit(1, test_size=test, random_state=seed).split(rows, groups=grp))
        te.append(rows[b])
        rows, grp = rows[a], grp[a]
        a, b = next(GroupShuffleSplit(1, test_size=val, random_state=seed + 1).split(rows, groups=grp))
        tr.append(rows[a])
        va.append(rows[b])
    return np.concatenate(tr), np.concatenate(va), np.concatenate(te)


def reg_metrics(y, p, scale=1.0):
    e = (p - y) * scale
    return {"rmse": float(np.sqrt(np.mean(e ** 2))), "mae": float(np.mean(np.abs(e))),
            "r2": float(1 - np.sum((p - y) ** 2) / np.sum((y - y.mean()) ** 2)), "n": int(len(y))}


def fit_lgb(X, y, tr, va, seed, **extra):
    m = lgb.LGBMRegressor(random_state=seed, **{**LGB, **extra})
    m.fit(X.iloc[tr], y[tr], eval_set=[(X.iloc[va], y[va])], callbacks=[lgb.early_stopping(100, verbose=False)])
    return m


def by_source(df, idx, y, p, scale):
    out = {}
    for s in np.unique(df.loc[idx, "source"]):
        m = (df.loc[idx, "source"] == s).to_numpy()
        out[s] = reg_metrics(y[m], p[m], scale)["rmse"]
    return out


# ----------------------------------------------------------------------------- models
def run_m1(df, variant):
    cols = FEATURES[variant]
    d = df.dropna(subset=["target_soh"]).reset_index(drop=True)
    X, y = d[cols], d["target_soh"].to_numpy()
    res = []
    for seed in SEEDS:
        tr, va, te = split(d, seed)
        m = fit_lgb(X, y, tr, va, seed)
        p = m.predict(X.iloc[te])
        base = np.full(len(te), y[tr].mean())
        res.append({"seed": seed, **reg_metrics(y[te], p, 100), "baseline_rmse": reg_metrics(y[te], base, 100)["rmse"],
                    "by_source_rmse": by_source(d, te, y[te], p, 100), "best_iter": int(m.best_iteration_),
                    "top_features": top_imp(m, cols)})
    return res


def run_m2(df):
    cols = FEATURES["M2"]
    d = df[(df.target_is_censored == False) & (df.target_rul_cycles >= 0)].dropna(subset=["target_rul_cycles"]).reset_index(drop=True)  # noqa: E712
    X, y = d[cols], d["target_rul_cycles"].to_numpy()
    slope = d["hist_soh_slope_50"].fillna(d["hist_soh_slope_10"]).to_numpy()
    naive = np.where(slope < -1e-6, (d["hist_soh_prev"].to_numpy() - 0.8) / -slope, np.nan)
    res = []
    for seed in SEEDS:
        tr, va, te = split(d, seed)
        m = fit_lgb(X, y, tr, va, seed)
        p = np.clip(m.predict(X.iloc[te]), 0, None)
        nv = np.nan_to_num(np.clip(naive[te], 0, 10_000), nan=float(np.median(y[tr])))
        yt = y[te]
        big = yt > 50
        res.append({"seed": seed, **reg_metrics(yt, p), "baseline_rmse": reg_metrics(yt, nv)["rmse"],
                    "baseline_mae": reg_metrics(yt, nv)["mae"],
                    "mape_rul_gt50": float(np.mean(np.abs(p[big] - yt[big]) / yt[big]) * 100),
                    "baseline_mape_rul_gt50": float(np.mean(np.abs(nv[big] - yt[big]) / yt[big]) * 100),
                    "by_source_mae": {s: float(np.mean(np.abs(p - yt)[(d.loc[te, "source"] == s).to_numpy()]))
                                      for s in np.unique(d.loc[te, "source"])},
                    "top_features": top_imp(m, cols)})
    return res


def concordance(t, event, risk_time, n_pairs=300_000, seed=0):
    """Harrell's C on random comparable pairs: shorter observed event should have shorter predicted time."""
    rng = np.random.default_rng(seed)
    i = rng.integers(0, len(t), n_pairs)
    j = rng.integers(0, len(t), n_pairs)
    ok = event[i] & (t[i] < t[j])
    if ok.sum() == 0:
        return float("nan")
    a, b = risk_time[i][ok], risk_time[j][ok]
    return float(np.mean((a < b) + 0.5 * (a == b)))


def run_m3(df, horizon=200):
    cols = FEATURES["M2"]
    d = df.copy()
    event = (~d["target_is_censored"].astype(bool)) & (d["target_rul_cycles"] >= 0)
    d = d[(d["target_rul_cycles"] >= 0) | d["target_is_censored"].astype(bool)].reset_index(drop=True)
    event = ((~d["target_is_censored"].astype(bool)) & (d["target_rul_cycles"] >= 0)).to_numpy()
    t = np.where(event, d["target_rul_cycles"], d["target_rul_lower_bound"]).astype(float)
    t = np.clip(t, 0.5, None)
    X = d[cols]
    res = []
    for seed in SEEDS:
        tr, va, te = split(d, seed)
        lo, hi = t.copy(), np.where(event, t, np.inf)

        def dm(ix):
            m = xgb.DMatrix(X.iloc[ix], missing=np.nan)
            m.set_float_info("label_lower_bound", lo[ix])
            m.set_float_info("label_upper_bound", hi[ix])
            return m

        params = {"objective": "survival:aft", "eval_metric": "aft-nloglik", "aft_loss_distribution": "normal",
                  "aft_loss_distribution_scale": 1.0, "tree_method": "hist", "learning_rate": 0.05, "max_depth": 6,
                  "min_child_weight": 10, "subsample": 0.8, "colsample_bytree": 0.8, "seed": seed}
        bst = xgb.train(params, dm(tr), 3000, evals=[(dm(va), "val")], early_stopping_rounds=100, verbose_eval=False)
        pred_t = bst.predict(xgb.DMatrix(X.iloc[te], missing=np.nan), iteration_range=(0, bst.best_iteration + 1))
        c = concordance(t[te], event[te], pred_t, seed=seed)
        c_base = concordance(t[te], event[te], -d.loc[te, "efc_prev"].fillna(0).to_numpy(), seed=seed)
        known = event[te] | (t[te] >= horizon)
        y_h = (event[te] & (t[te] <= horizon))[known]
        auc = roc_auc_score(y_h, -pred_t[known]) if 0 < y_h.mean() < 1 else float("nan")
        res.append({"seed": seed, "c_index": c, "baseline_c_index_efc": c_base, f"auc_eol_within_{horizon}": float(auc),
                    "n_test": int(len(te)), "event_rate_test": float(event[te].mean())})
    return res


def inject_faults(X: pd.DataFrame, rng):
    """Synthetic faults on normal cycles: thermal, internal resistance, side reaction, voltage shift."""
    Xf = X.copy()
    kind = rng.integers(0, 4, len(X))
    Xf.loc[kind == 0, "temp_rise_C"] += rng.uniform(6, 12, (kind == 0).sum())
    Xf.loc[kind == 1, "ir_growth"] *= rng.uniform(1.3, 1.6, (kind == 1).sum())
    Xf.loc[kind == 2, "coulombic_eff"] -= rng.uniform(0.02, 0.05, (kind == 2).sum())
    Xf.loc[kind == 3, "v_at_q50"] += rng.uniform(0.03, 0.06, (kind == 3).sum())
    return Xf, kind


def run_m4(df, m1_preds):
    d = df.reset_index(drop=True).copy()
    d["soh_residual"] = m1_preds.reindex(d.index).to_numpy() - d["hist_soh_prev"].to_numpy()
    X = d[M4_FEATURES]
    res = []
    for seed in (0,):  # same split as the M1 model that supplies the residual (no test-cell leakage)
        rng = np.random.default_rng(seed)
        tr, va, te = split(d, seed)
        med = X.iloc[tr].median()
        Xtr, Xva, Xte = (X.iloc[ix].fillna(med) for ix in (tr, va, te))
        iso = IsolationForest(n_estimators=300, max_samples=4096, random_state=seed).fit(Xtr)
        thr = np.quantile(-iso.score_samples(Xva), 0.99)          # 1 % false-alarm target on normal validation cells
        s_norm = -iso.score_samples(Xte)
        Xf, kind = inject_faults(Xte, rng)
        s_fault = -iso.score_samples(Xf)
        y = np.r_[np.zeros(len(s_norm)), np.ones(len(s_fault))]
        s = np.r_[s_norm, s_fault]
        res.append({"seed": seed, "auroc": float(roc_auc_score(y, s)), "false_alarm_rate": float(np.mean(s_norm > thr)),
                    "recall_at_1pct_far": float(np.mean(s_fault > thr)),
                    "recall_by_fault": {n: float(np.mean(s_fault[kind == k] > thr)) for k, n in
                                        enumerate(["thermal", "resistance", "side_reaction", "voltage_shift"])}})
    return res


def run_m5(root):
    t = pd.read_parquet(root / "master" / "ved_ev_trips.parquet")
    t = t[t["electric_only"] & t["wh_per_km"].between(20, 600) & (t["distance_km"] > 1)].reset_index(drop=True)
    t["is_ev"] = (t["engine_type"] == "EV").astype(float)
    cols = ["distance_km", "duration_s", "mean_speed_kmh", "max_speed_kmh", "idle_fraction", "outside_temp_C",
            "ac_power_kw_mean", "heater_power_kw_mean", "weight_lb", "is_ev"]
    X, y = t[cols], t["wh_per_km"].to_numpy()
    t["source"] = "VED"
    res = []
    for seed in SEEDS:
        tr, va, te = split(t, seed, group="veh_id")
        m = fit_lgb(X, y, tr, va, seed, min_child_samples=20)
        p = m.predict(X.iloc[te])
        base = np.full(len(te), y[tr].mean())
        res.append({"seed": seed, **reg_metrics(y[te], p), "mape": float(np.mean(np.abs(p - y[te]) / y[te]) * 100),
                    "baseline_mape": float(np.mean(np.abs(base - y[te]) / y[te]) * 100),
                    "n_test_vehicles": int(t.loc[te, "veh_id"].nunique()), "top_features": top_imp(m, cols)})
    return res


def run_m6(df):
    cols = FEATURES["M6"]
    d = df.dropna(subset=["charge_time_s", "prev_charge_time_s"]).reset_index(drop=True)
    X, y = d[cols], d["charge_time_s"].to_numpy() / 60.0
    res = []
    for seed in SEEDS:
        tr, va, te = split(d, seed)
        m = fit_lgb(X, y, tr, va, seed)
        p = m.predict(X.iloc[te])
        persist = d.loc[te, "prev_charge_time_s"].to_numpy() / 60.0
        res.append({"seed": seed, **reg_metrics(y[te], p), "baseline_mae_persistence": reg_metrics(y[te], persist)["mae"],
                    "by_source_mae": {s: float(np.mean(np.abs(p - y[te])[(d.loc[te, "source"] == s).to_numpy()]))
                                      for s in np.unique(d.loc[te, "source"])}})
    return res


def run_m8(seed=0, n=500):
    """Wear- and tariff-aware charging plan (dynamic programming over 15-min slots) vs. 'charge now to 100 %'.

    Wear per Ah charged follows an empirical stress model: grows with C-rate, cell temperature (Arrhenius) and SOC level.
    Tariff: MSEDCL-style time-of-day bands (relative units). This is a simulation, not a trained model."""
    rng = np.random.default_rng(seed)
    slots = 96
    hour = (np.arange(slots) * 0.25) % 24
    tariff = np.where((hour >= 22) | (hour < 6), 0.8, np.where((hour >= 18) & (hour < 22), 1.25, 1.0))
    out = []
    for _ in range(n):
        start = rng.integers(0, slots)
        dwell = rng.integers(16, 48)                   # 4-12 h plugged in
        soc0, need = rng.uniform(0.15, 0.5), rng.uniform(0.6, 0.85)
        temp = rng.uniform(25, 42)
        step = 0.25 * 0.3                             # 0.3 C for one 15-min slot

        def wear(soc, c):
            return c * np.exp(0.06 * (temp - 25)) * (1 + 2.0 * max(0.0, soc - 0.8))

        idx = (start + np.arange(dwell)) % slots
        n_steps = int(np.ceil((1.0 - soc0) / step))
        naive_cost = sum(tariff[idx[k]] * step for k in range(min(n_steps, dwell)))
        naive_wear = sum(wear(min(1, soc0 + k * step), 0.3) for k in range(min(n_steps, dwell)))
        k_need = int(np.ceil(max(0.0, need - soc0) / step))
        order = np.argsort(tariff[idx] + 1e-6 * np.arange(dwell))[:k_need]   # cheapest slots, stop at target SOC
        plan_cost = float(sum(tariff[idx[k]] * step for k in order))
        plan_wear = float(sum(wear(min(1, soc0 + j * step), 0.3) for j in range(k_need)))
        out.append((naive_cost, plan_cost, naive_wear, plan_wear))
    a = np.array(out)
    return [{"seed": seed, "sessions": n, "cost_saving_pct": float((1 - a[:, 1].sum() / a[:, 0].sum()) * 100),
             "wear_reduction_pct": float((1 - a[:, 3].sum() / a[:, 2].sum()) * 100),
             "note": "simulation with assumed tariff and wear model; not a learned model"}]


def top_imp(m, cols, k=6):
    imp = pd.Series(m.booster_.feature_importance("gain"), index=cols)
    return (imp / imp.sum()).sort_values(ascending=False).head(k).round(3).to_dict()


def summarise(res):
    keys = [k for k, v in res[0].items() if isinstance(v, (int, float)) and k not in ("seed",)]
    return {k: {"mean": float(np.nanmean([r[k] for r in res])), "std": float(np.nanstd([r[k] for r in res]))} for k in keys}


def main(root: Path, out: Path, tag: str):
    out.mkdir(parents=True, exist_ok=True)
    df = load_cycles(root)
    results = {}
    t0 = time.time()
    for name, fn in [("M1_field", lambda: run_m1(df, "M1_field")), ("M1_lab", lambda: run_m1(df, "M1_lab")),
                     ("M2", lambda: run_m2(df)), ("M3", lambda: run_m3(df)), ("M6", lambda: run_m6(df)),
                     ("M5", lambda: run_m5(root)), ("M8", lambda: run_m8())]:
        s = time.time()
        results[name] = fn()
        print(f"[{tag}] {name}: {json.dumps(summarise(results[name]))[:400]}  ({time.time() - s:.0f}s)", flush=True)
        (out / f"results_{tag}.json").write_text(json.dumps(results, indent=1))
    # M4 uses an M1-field estimate as its digital-twin expectation (fit on seed-0 training cells)
    d = df.dropna(subset=["target_soh"]).reset_index(drop=True)
    tr, va, te = split(d, 0)
    m1 = fit_lgb(d[FEATURES["M1_field"]], d["target_soh"].to_numpy(), tr, va, 0)
    preds = pd.Series(m1.predict(d[FEATURES["M1_field"]]), index=d.index)
    results["M4"] = run_m4(d, preds)
    print(f"[{tag}] M4: {json.dumps(summarise(results['M4']))[:400]}", flush=True)
    (out / f"results_{tag}.json").write_text(json.dumps(results, indent=1))
    print(f"ALL DONE in {time.time() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3] if len(sys.argv) > 3 else "round1")
