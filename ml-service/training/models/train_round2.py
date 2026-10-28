"""Round-2 training: fixes for the problems diagnosed in round 1 (same splits, seeds and test cells).

  M1  cell-balanced weights + monotone constraints + Optuna-tuned LightGBM
  M2  log-RUL target + cell-balanced weights; fair fade-extrapolation baseline (slope floor, clipped)
  M3  AFT scale tuned on validation cells, cell-balanced weights, calibration (ECE) of P(EOL <= 200 cycles)
  M4  digital-twin residuals: per-cell rolling-median / MAD z-scores of the previous 20 cycles
  M5  grey-box physics features from the VED time series, trips >= 2 km, distance-weighted loss
  M6  residual learning on top of persistence (predict the change from the previous charge time)
  M8  equal-energy comparison, dwell-time feasibility, time-of-day temperature in the wear model

Usage: python -I train_round2.py DATASETS_DIR OUT_DIR
"""
import json
import sys
import time
from pathlib import Path

import lightgbm as lgb
import numpy as np
import optuna
import pandas as pd
import xgboost as xgb
from scipy.stats import norm
from sklearn.ensemble import IsolationForest
from sklearn.metrics import roc_auc_score

sys.path.insert(0, str(Path(__file__).parent))
import train_all as r1  # noqa: E402

optuna.logging.set_verbosity(optuna.logging.WARNING)
MONO_DOWN = {"efc_prev", "sqrt_cycle", "cum_arrhenius_efc_prev", "cum_plating_stress"}


def cell_weights(d):
    return (1.0 / d.groupby("cell_id")["cell_id"].transform("size")).to_numpy()


def fit_w(X, y, w, tr, va, seed, params):
    m = lgb.LGBMRegressor(random_state=seed, **{**r1.LGB, **params})
    m.fit(X.iloc[tr], y[tr], sample_weight=w[tr], eval_set=[(X.iloc[va], y[va])], eval_sample_weight=[w[va]],
          callbacks=[lgb.early_stopping(100, verbose=False)])
    return m


def tune(X, y, w, tr, va, extra, n_trials=25):
    sub = tr[::3]

    def objective(trial):
        p = dict(num_leaves=trial.suggest_int("num_leaves", 15, 127, log=True),
                 min_child_samples=trial.suggest_int("min_child_samples", 20, 300, log=True),
                 learning_rate=trial.suggest_float("learning_rate", 0.01, 0.1, log=True),
                 colsample_bytree=trial.suggest_float("colsample_bytree", 0.5, 1.0),
                 reg_lambda=trial.suggest_float("reg_lambda", 1e-3, 10, log=True), **extra)
        m = fit_w(X, y, w, sub, va, 0, p)
        e = m.predict(X.iloc[va]) - y[va]
        return float(np.sqrt(np.average(e ** 2, weights=w[va])))

    st = optuna.create_study(direction="minimize", sampler=optuna.samplers.TPESampler(seed=0))
    st.optimize(objective, n_trials=n_trials)
    return {**st.best_params, **extra}


# ----------------------------------------------------------------------------- M1
def run_m1(df, variant):
    cols = r1.FEATURES[variant]
    d = df.dropna(subset=["target_soh"]).reset_index(drop=True)
    X, y, w = d[cols], d["target_soh"].to_numpy(), cell_weights(d)
    mono = {"monotone_constraints": [-1 if c in MONO_DOWN else 0 for c in cols], "monotone_constraints_method": "advanced"}
    tr0, va0, _ = r1.split(d, 0)
    params = tune(X, y, w, tr0, va0, mono)
    res = []
    for seed in r1.SEEDS:
        tr, va, te = r1.split(d, seed)
        m = fit_w(X, y, w, tr, va, seed, params)
        p = m.predict(X.iloc[te])
        res.append({"seed": seed, **r1.reg_metrics(y[te], p, 100), "by_source_rmse": r1.by_source(d, te, y[te], p, 100),
                    "cell_balanced_rmse": float(np.sqrt(np.average((p - y[te]) ** 2, weights=w[te])) * 100),
                    "best_iter": int(m.best_iteration_), "params": params, "top_features": r1.top_imp(m, cols)})
    return res, m, d, params


# ----------------------------------------------------------------------------- M2
def fair_naive(d, tr):
    slope = d["hist_soh_slope_50"].fillna(d["hist_soh_slope_10"]).to_numpy()
    soh = d["hist_soh_prev"].to_numpy()
    med = float(np.median(d.loc[tr, "target_rul_cycles"]))
    cap = float(np.quantile(d.loc[tr, "target_rul_cycles"], 0.99))
    ok = slope < -2e-5
    return np.where(ok, np.clip((soh - 0.8) / np.where(ok, -slope, 1), 0, cap), med)


def run_m2(df):
    cols = r1.FEATURES["M2"]
    d = df[(df.target_is_censored == False) & (df.target_rul_cycles >= 0)].dropna(subset=["target_rul_cycles"]).reset_index(drop=True)  # noqa: E712
    X, y, w = d[cols], d["target_rul_cycles"].to_numpy(), cell_weights(d)
    ylog = np.log1p(y)
    res = []
    for seed in r1.SEEDS:
        tr, va, te = r1.split(d, seed)
        m = fit_w(X, ylog, w, tr, va, seed, {})
        p = np.expm1(m.predict(X.iloc[te]))
        nv = fair_naive(d, tr)[te]
        yt = y[te]
        big = yt > 50
        res.append({"seed": seed, **r1.reg_metrics(yt, p), "baseline_mae_fair": r1.reg_metrics(yt, nv)["mae"],
                    "mape_rul_gt50": float(np.mean(np.abs(p[big] - yt[big]) / yt[big]) * 100),
                    "baseline_mape_fair": float(np.mean(np.abs(nv[big] - yt[big]) / yt[big]) * 100),
                    "by_source_mape": {s: float(np.mean((np.abs(p - yt) / np.maximum(yt, 1))[((d.loc[te, "source"] == s).to_numpy()) & big]) * 100)
                                       for s in np.unique(d.loc[te, "source"])}})
    return res


# ----------------------------------------------------------------------------- M3
def run_m3(df, horizon=200):
    cols = r1.FEATURES["M2"]
    d = df[(df["target_rul_cycles"] >= 0) | df["target_is_censored"].astype(bool)].reset_index(drop=True)
    event = ((~d["target_is_censored"].astype(bool)) & (d["target_rul_cycles"] >= 0)).to_numpy()
    t = np.clip(np.where(event, d["target_rul_cycles"], d["target_rul_lower_bound"]).astype(float), 0.5, None)
    X, w = d[cols], cell_weights(d)
    lo, hi = t.copy(), np.where(event, t, np.inf)

    def dm(ix):
        m = xgb.DMatrix(X.iloc[ix], missing=np.nan, weight=w[ix] * len(ix) / w[ix].sum())
        m.set_float_info("label_lower_bound", lo[ix])
        m.set_float_info("label_upper_bound", hi[ix])
        return m

    base = {"objective": "survival:aft", "eval_metric": "aft-nloglik", "aft_loss_distribution": "normal",
            "tree_method": "hist", "learning_rate": 0.05, "max_depth": 6, "min_child_weight": 10, "subsample": 0.8,
            "colsample_bytree": 0.8}
    tr0, va0, _ = r1.split(d, 0)
    best = None
    for scale in (0.3, 0.5, 0.8, 1.2):
        b = xgb.train({**base, "aft_loss_distribution_scale": scale, "seed": 0}, dm(tr0), 3000, evals=[(dm(va0), "val")],
                      early_stopping_rounds=100, verbose_eval=False)
        if best is None or b.best_score < best[1]:
            best = (scale, b.best_score)
    scale = best[0]
    res = []
    for seed in r1.SEEDS:
        tr, va, te = r1.split(d, seed)
        bst = xgb.train({**base, "aft_loss_distribution_scale": scale, "seed": seed}, dm(tr), 3000,
                        evals=[(dm(va), "val")], early_stopping_rounds=100, verbose_eval=False)
        pt = bst.predict(xgb.DMatrix(X.iloc[te], missing=np.nan), iteration_range=(0, bst.best_iteration + 1))
        p_h = norm.cdf((np.log(horizon) - np.log(pt)) / scale)          # P(T <= horizon)
        known = event[te] | (t[te] >= horizon)
        y_h = (event[te] & (t[te] <= horizon))[known].astype(float)
        ph = p_h[known]
        bins = np.clip((ph * 10).astype(int), 0, 9)
        ece = float(sum(abs(ph[bins == b].mean() - y_h[bins == b].mean()) * (bins == b).mean() for b in range(10) if (bins == b).any()))
        res.append({"seed": seed, "c_index": r1.concordance(t[te], event[te], pt, seed=seed),
                    f"auc_eol_within_{horizon}": float(roc_auc_score(y_h, ph)), "ece": ece, "aft_scale": scale})
    return res


# ----------------------------------------------------------------------------- M4
TWIN = ["temp_rise_C", "coulombic_eff", "energy_eff", "cc_fraction", "v_at_q50", "ir_growth", "charge_time_s"]


def twin_stats(d):
    g = d.groupby("cell_id", sort=False)
    for c in TWIN:
        prev = g[c].shift(1)
        med = prev.groupby(d["cell_id"]).transform(lambda s: s.rolling(20, min_periods=5).median())
        mad = (prev - med).abs().groupby(d["cell_id"]).transform(lambda s: s.rolling(20, min_periods=5).median()) * 1.4826
        d[f"{c}_med"], d[f"{c}_mad"] = med, mad
    return d


def twin_z(d, floors):
    return pd.DataFrame({c: (d[c] - d[f"{c}_med"]) / np.maximum(d[f"{c}_mad"].fillna(floors[c]), floors[c]) for c in TWIN}
                        | {"soh_residual_z": d["soh_residual"] / floors["soh_residual"]})


def run_m4(df, m1_model, m1_cols):
    d = df.dropna(subset=["target_soh"]).reset_index(drop=True)
    d["soh_residual"] = m1_model.predict(d[m1_cols]) - d["hist_soh_prev"]
    d = twin_stats(d)
    tr, va, te = r1.split(d, 0)
    floors = {c: float(np.nanmedian(d.loc[tr, f"{c}_mad"])) * 0.5 + 1e-6 for c in TWIN}
    floors["soh_residual"] = float(np.nanstd(d.loc[tr, "soh_residual"])) + 1e-6
    rng = np.random.default_rng(0)
    Ztr, Zva, Zte = (twin_z(d.loc[ix], floors).fillna(0).abs() for ix in (tr, va, te))
    faulty, kind = r1.inject_faults(d.loc[te, TWIN + ["soh_residual"] + [f"{c}_{s}" for c in TWIN for s in ("med", "mad")]].copy(), rng)
    Zf = twin_z(faulty, floors).fillna(0).abs()
    out = {}
    iso = IsolationForest(n_estimators=300, max_samples=4096, random_state=0).fit(Ztr)
    for name, score in (("isolation_forest_on_twin_z", lambda Z: -iso.score_samples(Z)), ("max_abs_z", lambda Z: Z.max(axis=1).to_numpy())):
        thr = np.quantile(score(Zva), 0.99)
        sn, sf = score(Zte), score(Zf)
        out[name] = {"auroc": float(roc_auc_score(np.r_[np.zeros(len(sn)), np.ones(len(sf))], np.r_[sn, sf])),
                     "false_alarm_rate": float(np.mean(sn > thr)), "recall_at_1pct_far": float(np.mean(sf > thr)),
                     "recall_by_fault": {n: float(np.mean(sf[kind == k] > thr)) for k, n in
                                         enumerate(["thermal", "resistance", "side_reaction", "voltage_shift"])}}
    return [{"seed": 0, **out}]


# ----------------------------------------------------------------------------- M5
def physics_features(root):
    ts = pd.read_parquet(root / "master" / "ved_ev_timeseries.parquet", columns=["veh_id", "trip", "t_ms", "speed_kmh"])
    ts = ts.sort_values(["veh_id", "trip", "t_ms"])
    v = ts["speed_kmh"].fillna(0).to_numpy() / 3.6
    dt = np.clip(np.diff(ts["t_ms"].to_numpy(), prepend=ts["t_ms"].iloc[0]) / 1000.0, 0, 5)
    new = (ts[["veh_id", "trip"]].shift() != ts[["veh_id", "trip"]]).any(axis=1).to_numpy()
    dt[new] = 0
    dv2 = np.diff(v ** 2, prepend=v[0]) / 2
    dv2[new] = 0
    ts = ts.assign(dist=v * dt, v3dt=v ** 3 * dt, kin=np.clip(dv2, 0, None), dt=dt,
                   stop=((v < 0.3) & (np.roll(v, 1) >= 0.3) & ~new).astype(float))
    g = ts.groupby(["veh_id", "trip"]).agg(dist=("dist", "sum"), v3dt=("v3dt", "sum"), kin=("kin", "sum"),
                                           stops=("stop", "sum"), dur=("dt", "sum"))
    km = g["dist"] / 1000
    feat = pd.DataFrame({"aero_v3_per_km": g["v3dt"] / g["dist"].clip(lower=1), "kinetic_per_km": g["kin"] / km.clip(lower=0.1),
                         "stops_per_km": g["stops"] / km.clip(lower=0.1)}).reset_index()
    return feat


def run_m5(root):
    t = pd.read_parquet(root / "master" / "ved_ev_trips.parquet")
    t = t[t["electric_only"] & t["wh_per_km"].between(20, 600) & (t["distance_km"] >= 2)].reset_index(drop=True)
    t = t.merge(physics_features(root), on=["veh_id", "trip"], how="left")
    t["is_ev"] = (t["engine_type"] == "EV").astype(float)
    t["hvac_kw"] = t["ac_power_kw_mean"].fillna(0) + t["heater_power_kw_mean"].fillna(0)
    t["hvac_wh_per_km"] = t["hvac_kw"] * 1000 * (t["duration_s"] / 3600) / t["distance_km"]
    t["source"] = "VED"
    cols = ["mean_speed_kmh", "max_speed_kmh", "idle_fraction", "outside_temp_C", "hvac_kw", "hvac_wh_per_km", "weight_lb",
            "is_ev", "aero_v3_per_km", "kinetic_per_km", "stops_per_km", "distance_km"]
    X, y, w = t[cols], t["wh_per_km"].to_numpy(), t["distance_km"].to_numpy()
    res = []
    for seed in r1.SEEDS:
        tr, va, te = r1.split(t, seed, group="veh_id")
        m = fit_w(X, y, w, tr, va, seed, {"min_child_samples": 20})
        p = m.predict(X.iloc[te])
        base = np.full(len(te), np.average(y[tr], weights=w[tr]))
        ape = np.abs(p - y[te]) / y[te]
        res.append({"seed": seed, **r1.reg_metrics(y[te], p), "mape": float(ape.mean() * 100),
                    "distance_weighted_mape": float(np.average(ape, weights=w[te]) * 100),
                    "baseline_distance_weighted_mape": float(np.average(np.abs(base - y[te]) / y[te], weights=w[te]) * 100),
                    "n_test_trips": int(len(te)), "top_features": r1.top_imp(m, cols)})
    return res


# ----------------------------------------------------------------------------- M6
def run_m6(df):
    cols = r1.FEATURES["M6"]
    d = df.dropna(subset=["charge_time_s", "prev_charge_time_s"]).reset_index(drop=True)
    X = d[cols]
    y = d["charge_time_s"].to_numpy() / 60.0
    prev = d["prev_charge_time_s"].to_numpy() / 60.0
    w = cell_weights(d)
    res = []
    for seed in r1.SEEDS:
        tr, va, te = r1.split(d, seed)
        m = fit_w(X, y - prev, w, tr, va, seed, {})
        p = prev[te] + m.predict(X.iloc[te])
        res.append({"seed": seed, **r1.reg_metrics(y[te], p), "baseline_mae_persistence": r1.reg_metrics(y[te], prev[te])["mae"],
                    "by_source_mae": {s: float(np.mean(np.abs(p - y[te])[(d.loc[te, "source"] == s).to_numpy()]))
                                      for s in np.unique(d.loc[te, "source"])},
                    "by_source_mae_persistence": {s: float(np.mean(np.abs(prev[te] - y[te])[(d.loc[te, "source"] == s).to_numpy()]))
                                                  for s in np.unique(d.loc[te, "source"])}})
    return res


# ----------------------------------------------------------------------------- M8
def run_m8(seed=0, n=1000, lam=0.5):
    rng = np.random.default_rng(seed)
    slots = 96
    hour = (np.arange(slots) * 0.25) % 24
    tariff = np.where((hour >= 22) | (hour < 6), 0.8, np.where((hour >= 18) & (hour < 22), 1.25, 1.0))
    out = []
    for _ in range(n):
        start, dwell = rng.integers(0, slots), rng.integers(16, 48)
        soc0, need = rng.uniform(0.15, 0.5), rng.uniform(0.6, 0.9)
        t_mean = rng.uniform(26, 36)
        idx = (start + np.arange(dwell)) % slots
        temp = t_mean + 6 * np.sin((hour[idx] - 9) / 24 * 2 * np.pi)       # hottest mid-afternoon
        step = 0.25 * 0.3
        k = min(int(np.ceil(max(0.0, need - soc0) / step)), dwell)          # identical energy for both strategies

        def wear(slots_used):
            s = np.sort(slots_used)
            socs = soc0 + step * np.arange(len(s))
            return float(np.sum(np.exp(0.06 * (temp[s] - 25)) * (1 + 2.0 * np.clip(socs - 0.8, 0, None))))

        naive = np.arange(k)
        score = tariff[idx] + lam * np.exp(0.06 * (temp - 25))
        plan = np.argsort(score + 1e-9 * np.arange(dwell))[:k]
        out.append((tariff[idx][naive].sum() * step, tariff[idx][plan].sum() * step, wear(naive), wear(plan)))
    a = np.array(out)
    return [{"seed": seed, "sessions": n, "cost_saving_pct": float((1 - a[:, 1].sum() / a[:, 0].sum()) * 100),
             "wear_reduction_pct": float((1 - a[:, 3].sum() / a[:, 2].sum()) * 100), "energy_equal": True,
             "note": "simulation with assumed tariff, temperature and wear model; equal delivered energy"}]


def main(root: Path, out: Path):
    df = r1.load_cycles(root)
    results, t0 = {}, time.time()
    for name, fn in [("M1_field", lambda: run_m1(df, "M1_field")), ("M1_lab", lambda: run_m1(df, "M1_lab"))]:
        s = time.time()
        res, model, d, params = fn()
        results[name] = res
        if name == "M1_field":
            m1_model, m1_cols = model, r1.FEATURES["M1_field"]
        print(f"[round2] {name}: {json.dumps(r1.summarise(res))[:300]}  ({time.time() - s:.0f}s)", flush=True)
        (out / "results_round2.json").write_text(json.dumps(results, indent=1, default=str))
    for name, fn in [("M2", lambda: run_m2(df)), ("M3", lambda: run_m3(df)), ("M6", lambda: run_m6(df)),
                     ("M5", lambda: run_m5(root)), ("M8", lambda: run_m8())]:
        s = time.time()
        results[name] = fn()
        print(f"[round2] {name}: {json.dumps(r1.summarise(results[name]))[:300]}  ({time.time() - s:.0f}s)", flush=True)
        (out / "results_round2.json").write_text(json.dumps(results, indent=1, default=str))
    # M4 needs an M1 model trained on seed-0 training cells only
    d = df.dropna(subset=["target_soh"]).reset_index(drop=True)
    tr, va, _ = r1.split(d, 0)
    m1_seed0 = fit_w(d[m1_cols], d["target_soh"].to_numpy(), cell_weights(d), tr, va, 0, results["M1_field"][0]["params"])
    results["M4"] = run_m4(df, m1_seed0, m1_cols)
    print(f"[round2] M4: {json.dumps(results['M4'])[:500]}", flush=True)
    (out / "results_round2.json").write_text(json.dumps(results, indent=1, default=str))
    print(f"ALL DONE in {time.time() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
