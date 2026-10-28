"""Round-3: validation-selected fixes for the models round 2 did not improve (M1, M6, M5).

All selection uses validation cells/vehicles only; test sets are the same as in rounds 1-2.
  M1  choose among {plain, monotone, monotone + sqrt cell weights, round-2 tuned} by validation RMSE
  M6  shrinkage blend  prev + alpha * model, alpha per source chosen on validation (alpha = 0 is persistence)
  M5  per-vehicle calibration: a multiplicative bias learned from each test vehicle's first 30 % of trips

Usage: python -I train_round3.py DATASETS_DIR OUT_DIR
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import train_all as r1  # noqa: E402
import train_round2 as r2  # noqa: E402


def rmse(e, w=None):
    return float(np.sqrt(np.average(e ** 2, weights=w)))


def run_m1(df, variant, tuned):
    cols = r1.FEATURES[variant]
    d = df.dropna(subset=["target_soh"]).reset_index(drop=True)
    X, y = d[cols], d["target_soh"].to_numpy()
    rows = d.groupby("cell_id")["cell_id"].transform("size").to_numpy()
    mono = {"monotone_constraints": [-1 if c in r2.MONO_DOWN else 0 for c in cols], "monotone_constraints_method": "advanced"}
    configs = {"plain": (np.ones(len(d)), {}), "monotone": (np.ones(len(d)), mono),
               "monotone_sqrtw": (1 / np.sqrt(rows), mono), "round2_tuned": (1 / rows, tuned)}
    res = []
    for seed in r1.SEEDS:
        tr, va, te = r1.split(d, seed)
        scores, models = {}, {}
        for name, (w, params) in configs.items():
            m = r2.fit_w(X, y, w, tr, va, seed, params)
            models[name] = m
            scores[name] = rmse(m.predict(X.iloc[va]) - y[va])
        best = min(scores, key=scores.get)
        p = models[best].predict(X.iloc[te])
        res.append({"seed": seed, "selected": best, "val_rmse": {k: v * 100 for k, v in scores.items()},
                    **r1.reg_metrics(y[te], p, 100), "by_source_rmse": r1.by_source(d, te, y[te], p, 100),
                    "test_rmse_all_configs": {k: rmse(mm.predict(X.iloc[te]) - y[te]) * 100 for k, mm in models.items()}})
        print(f"  {variant} seed {seed}: selected {best}  val {scores[best] * 100:.2f}  test {res[-1]['rmse']:.2f}", flush=True)
    return res


def run_m6(df):
    cols = r1.FEATURES["M6"]
    d = df.dropna(subset=["charge_time_s", "prev_charge_time_s"]).reset_index(drop=True)
    X, y = d[cols], d["charge_time_s"].to_numpy() / 60.0
    prev = d["prev_charge_time_s"].to_numpy() / 60.0
    w = r2.cell_weights(d)
    src = d["source"].to_numpy()
    res = []
    for seed in r1.SEEDS:
        tr, va, te = r1.split(d, seed)
        m = r2.fit_w(X, y - prev, w, tr, va, seed, {})
        dv, dt_ = m.predict(X.iloc[va]), m.predict(X.iloc[te])
        alpha = {}
        for s in np.unique(src):
            mv = src[va] == s
            if not mv.any():
                alpha[s] = 0.0
                continue
            errs = {a: np.mean(np.abs(prev[va][mv] + a * dv[mv] - y[va][mv])) for a in (0.0, 0.25, 0.5, 0.75, 1.0)}
            alpha[s] = min(errs, key=errs.get)
        a_te = np.array([alpha.get(s, 0.0) for s in src[te]])
        p = prev[te] + a_te * dt_
        res.append({"seed": seed, **r1.reg_metrics(y[te], p), "alpha_by_source": alpha,
                    "baseline_mae_persistence": r1.reg_metrics(y[te], prev[te])["mae"],
                    "by_source_mae": {s: float(np.mean(np.abs(p - y[te])[src[te] == s])) for s in np.unique(src[te])}})
    return res


def run_m5(root, warm_frac=0.3):
    t = pd.read_parquet(root / "master" / "ved_ev_trips.parquet")
    t = t[t["electric_only"] & t["wh_per_km"].between(20, 600) & (t["distance_km"] >= 2)].reset_index(drop=True)
    t = t.merge(r2.physics_features(root), on=["veh_id", "trip"], how="left")
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
        m = r2.fit_w(X, y, w, tr, va, seed, {"min_child_samples": 20})
        p = m.predict(X.iloc[te])
        tt = t.loc[te].assign(p=p, y=y[te], w=w[te]).sort_values(["veh_id", "trip"])
        warm = tt.groupby("veh_id").cumcount() < (tt.groupby("veh_id")["trip"].transform("size") * warm_frac).round()
        bias = (tt[warm].groupby("veh_id")["y"].sum() / tt[warm].groupby("veh_id")["p"].sum())
        personal_mean = tt[warm].groupby("veh_id").apply(lambda g: np.average(g["y"], weights=g["w"]), include_groups=False)
        ev = tt[~warm & tt["veh_id"].isin(bias.index)]
        p_cal = ev["p"] * ev["veh_id"].map(bias)
        p_mean = ev["veh_id"].map(personal_mean)
        ape = lambda q: float(np.average(np.abs(q - ev["y"]) / ev["y"], weights=ev["w"]) * 100)
        res.append({"seed": seed, "eval_trips": int(len(ev)), "dw_mape_global_model": ape(ev["p"]),
                    "dw_mape_personal_mean_baseline": ape(p_mean), "dw_mape_model_plus_vehicle_calibration": ape(p_cal)})
    return res


def main(root: Path, out: Path):
    df = r1.load_cycles(root)
    tuned = json.loads((out / "results_round2.json").read_text())
    results = {}
    for variant in ("M1_field", "M1_lab"):
        params = tuned[variant][0]["params"]
        params = {k: v for k, v in params.items()} if isinstance(params, dict) else {}
        results[variant] = run_m1(df, variant, params)
        (out / "results_round3.json").write_text(json.dumps(results, indent=1, default=str))
    results["M6"] = run_m6(df)
    print("[round3] M6", json.dumps(r1.summarise(results["M6"]))[:300], flush=True)
    results["M5"] = run_m5(root)
    print("[round3] M5", json.dumps(r1.summarise(results["M5"]))[:400], flush=True)
    (out / "results_round3.json").write_text(json.dumps(results, indent=1, default=str))
    print("ROUND3 DONE", flush=True)


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
