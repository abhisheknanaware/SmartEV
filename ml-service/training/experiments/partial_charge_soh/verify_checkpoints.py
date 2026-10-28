"""Reload every saved checkpoint, re-predict its test sessions, and verify predictions, CQR threshold and coverage.

For each run in checkpoint_manifest_<exp>.csv:
  * file hashes match the manifest
  * reloaded model reproduces the saved median predictions (predictions_<exp>.csv and calibration.npz)
  * q-hat recomputed from calibration.npz conformity scores equals the stored q-hat
  * coverage / width recomputed from the saved bounds equal metrics_<exp>.csv

Usage: python -I verify_checkpoints.py WINDOWS_NPZ RESULTS_DIR EXP
"""
import json
import sys
from pathlib import Path

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd
import torch

sys.path.insert(0, str(Path(__file__).parent))
import artifacts as A  # noqa: E402
import run_experiments as R  # noqa: E402


def reload_predict(data, ck, model, rows):
    if model == "ridge":
        obj = joblib.load(ck / "model.joblib")
        return obj["model"].predict(obj["scaler"].transform(np.nan_to_num(data.hand[rows])))
    if model.startswith("lgbm"):
        X = data.hand if model == "lgbm_hand" else np.hstack([data.hand, data.xa.reshape(len(data.y), -1), data.xv.reshape(len(data.y), -1)])
        return lgb.Booster(model_file=str(ck / "booster_mid.txt")).predict(X[rows])
    arch = json.loads((ck / "arch.json").read_text())
    prep = json.loads((ck / "prep.json").read_text())
    net = R.PartialCurveNet(arch["n_ctx"], arch["channels"]).to(R.DEVICE)
    net.load_state_dict(torch.load(ck / "model_state.pt", map_location=R.DEVICE, weights_only=True))
    p = R.Prep.__new__(R.Prep)
    p.stats = {k: tuple(v) for k, v in prep.items()}
    T = {"xa": p.tensor(data, rows, "xa"), "xv": p.tensor(data, rows, "xv"), "ctx": torch.from_numpy(data.ctx[rows])}
    T = {k: v.to(R.DEVICE) for k, v in T.items()}
    return R.predict(net, T, np.arange(len(rows)))[0]


def main(windows, results, exp):
    data = R.Data(windows)
    out = Path(results)
    man = pd.read_csv(out / f"checkpoint_manifest_{exp}.csv")
    preds = pd.read_csv(out / f"predictions_{exp}.csv")
    preds["holdout"] = preds["holdout"].fillna("")
    met = pd.read_csv(out / f"metrics_{exp}.csv")
    met["holdout"] = met["holdout"].fillna("")
    report = []
    for r in man.itertuples(index=False):
        ck = out / r.path
        hashes_ok = all(A.sha256(ck / f) == h for f, h in zip(r.files.split(";"), r.sha256.split(";")))
        cal = np.load(ck / "calibration.npz")
        rows = cal["test_rows"]
        p_new = reload_predict(data, ck, r.model, rows)
        hold = "" if pd.isna(r.holdout) else r.holdout
        sel = preds[(preds.seed == r.seed) & (preds.label_frac == r.label_frac) & (preds.holdout == hold) & (preds.model == r.model)]
        sel = sel.set_index("row").loc[rows]
        tol = 1e-4 if r.model.startswith("cnn") else 1e-9
        pred_ok = np.allclose(p_new, sel["pred"].to_numpy(), atol=tol) and np.allclose(p_new, cal["test_mid"], atol=tol)
        entry = {"run_id": r.run_id, "hashes_ok": bool(hashes_ok), "reload_reproduces_predictions": bool(pred_ok),
                 "max_abs_pred_diff": float(np.max(np.abs(p_new - sel["pred"].to_numpy())))}
        if "qhat" in cal.files:
            s = np.sort(cal["calib_scores"])
            n = len(s)
            q = float(np.quantile(s, min(1.0, np.ceil((n + 1) * (1 - float(cal["alpha"]))) / n), method="higher"))
            y = data.y[rows]
            m = met[(met.seed == r.seed) & (met.label_frac == r.label_frac) & (met.holdout == hold) & (met.model == r.model) & (met.scope == "all")].iloc[0]
            cov = float(np.mean((y >= cal["test_lo"]) & (y <= cal["test_hi"])))
            entry.update(qhat_recomputed_equals_stored=bool(abs(q - float(cal["qhat"])) < 1e-12),
                         bounds_equal_raw_plus_minus_qhat=bool(np.allclose(cal["test_lo"], cal["test_lo_raw"] - q) and np.allclose(cal["test_hi"], cal["test_hi_raw"] + q)),
                         coverage_matches_metrics=bool(abs(cov - m.coverage) < 1e-9),
                         width_matches_metrics=bool(abs(np.mean(cal["test_hi"] - cal["test_lo"]) * 100 - m.width_pct) < 1e-6 * max(1.0, abs(m.width_pct))),
                         calib_cells_disjoint_from_test=bool(not set(data.cell[cal["calib_rows"]]) & set(data.cell[rows])))
        report.append(entry)
        bad = [k for k, v in entry.items() if isinstance(v, bool) and not v]
        print(("OK   " if not bad else "FAIL ") + r.run_id + (f"  failed: {bad}" if bad else "") + f"  maxdiff={entry['max_abs_pred_diff']:.2e}", flush=True)
    (out / f"verification_checkpoints_{exp}.json").write_text(json.dumps(report, indent=1))
    n_bad = sum(any(isinstance(v, bool) and not v for v in e.values()) for e in report)
    print(f"{len(report)} runs checked, {n_bad} with failures", flush=True)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3])
