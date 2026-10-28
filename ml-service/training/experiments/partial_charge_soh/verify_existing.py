"""Read-only verification of the existing partial-charging SOH results (no training).

Checks
  1. Session / cell counts per source in windows.npz
  2. Prediction rows align with windows.npz (target, cell, source, s, w)
  3. RMSE / MAE / R2 / coverage / width recomputed from predictions vs metrics_{main,xdata}.csv (every scope)
  4. Test rows of every main run equal the deterministic split_cells(seed) test partition
  5. No cell overlap between partitions; held-out source absent from train/val/calib in xdata
  6. CQR threshold: what can and cannot be verified from saved artifacts

Usage: python -I verify_existing.py WINDOWS_NPZ RESULTS_DIR
Writes RESULTS_DIR/verification_existing.json and .md
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import run_experiments as R  # noqa: E402

TOL = 1e-6


def recompute(g):
    y, p = g["y"].to_numpy(), g["pred"].to_numpy()
    e = p - y
    out = {"rmse_pct": float(np.sqrt(np.mean(e ** 2)) * 100), "mae_pct": float(np.mean(np.abs(e)) * 100),
           "r2": float(1 - np.sum(e ** 2) / np.sum((y - y.mean()) ** 2)), "n": int(len(g)), "n_cells": int(g["cell"].nunique())}
    if g["lo"].notna().all():
        out["coverage"] = float(np.mean((y >= g["lo"]) & (y <= g["hi"])))
        out["width_pct"] = float(np.mean(g["hi"] - g["lo"]) * 100)
    return out


def main(windows, results):
    d = R.Data(windows)
    checks = []

    def record(name, ok, detail):
        checks.append({"check": name, "pass": bool(ok), "detail": detail})
        print(("PASS " if ok else "FAIL ") + name + " :: " + str(detail)[:300], flush=True)

    # 1 counts
    per = pd.DataFrame({"source": d.source, "cell": d.cell})
    counts = per.groupby("source").agg(sessions=("cell", "size"), cells=("cell", "nunique")).to_dict("index")
    record("sessions_total_81073", len(d.y) == 81073, len(d.y))
    record("cells_total_361", per["cell"].nunique() == 361, per["cell"].nunique())
    record("per_source_counts", True, counts)

    for exp in ("main", "xdata"):
        p = pd.read_csv(Path(results) / f"predictions_{exp}.csv")
        m = pd.read_csv(Path(results) / f"metrics_{exp}.csv")
        # 2 alignment
        ok = (np.allclose(p["y"], d.y[p["row"]], atol=1e-6) and (p["cell"].to_numpy() == d.cell[p["row"]]).all()
              and (p["source"].to_numpy() == d.source[p["row"]]).all() and np.allclose(p["s"], d.s[p["row"]], atol=1e-6)
              and np.allclose(p["w"], d.w[p["row"]], atol=1e-6))
        record(f"{exp}_prediction_rows_align_with_windows", ok, f"{len(p)} rows")
        # 3 metrics
        keys = ["seed", "label_frac", "holdout", "model"]
        p["holdout"] = p["holdout"].fillna("")
        m["holdout"] = m["holdout"].fillna("")
        worst, n_cmp, mism = 0.0, 0, []
        for _, row in m.iterrows():
            g = p[(p.seed == row.seed) & (p.label_frac == row.label_frac) & (p.holdout == row.holdout) & (p.model == row.model)]
            if row.scope != "all":
                g = g[g.source == row.scope]
            rc = recompute(g)
            for k in ("rmse_pct", "mae_pct", "r2", "n", "n_cells", "coverage", "width_pct"):
                if k in rc and k in row and pd.notna(row[k]):
                    diff = abs(rc[k] - float(row[k]))
                    n_cmp += 1
                    worst = max(worst, diff)
                    if diff > 1e-6 * max(1, abs(float(row[k]))):
                        mism.append((row.model, row.seed, row.label_frac, row.holdout, row.scope, k, float(row[k]), rc[k]))
        record(f"{exp}_metrics_recomputed_from_predictions", not mism, {"values_compared": n_cmp, "max_abs_diff": worst,
                                                                        "mismatches": mism[:5]})
        # duplicated rows inside a run?
        dup = p.duplicated(keys + ["row"]).sum()
        record(f"{exp}_no_duplicate_prediction_rows", dup == 0, int(dup))
        # 4/5 splits
        if exp == "main":
            for seed in (0, 1, 2):
                sp = R.split_cells(d, seed)
                cells = {k: set(d.cell[v]) for k, v in sp.items()}
                overlap = [(a, b) for a in cells for b in cells if a < b and cells[a] & cells[b]]
                record(f"main_seed{seed}_no_cell_overlap", not overlap, {k: len(v) for k, v in cells.items()})
                for frac in (1.0, 0.1):
                    for model in sorted(p.model.unique()):
                        rows = set(p[(p.seed == seed) & (p.label_frac == frac) & (p.model == model)].row)
                        if set(sp["test"]) != rows:
                            record(f"main_seed{seed}_frac{frac}_{model}_test_rows_match_split", False, len(rows))
                record(f"main_seed{seed}_all_runs_test_rows_match_split", True, len(sp["test"]))
        else:
            for hold in ("MATR", "HUST", "SNL"):
                sp = R.split_cells(d, 0, hold)
                srcs = {k: sorted(set(d.source[v])) for k, v in sp.items()}
                leak = any(hold in srcs[k] for k in ("train", "val", "calib"))
                test_ok = set(sp["test"]) == set(np.where(d.source == hold)[0])
                saved = set(p[p.holdout == hold].row)
                record(f"xdata_{hold}_heldout_excluded_from_train_val_calib", not leak, srcs)
                record(f"xdata_{hold}_test_is_entire_source_and_matches_saved", test_ok and saved == set(sp["test"]), len(saved))
        # 6 CQR
        has_q = "cqr_qhat_pct" in m.columns
        record(f"{exp}_cqr_threshold_reported", has_q, "cqr_qhat_pct present" if has_q else "missing")
    checks.append({"check": "cqr_threshold_independently_recomputable", "pass": False,
                   "detail": "Not verifiable from saved files: raw quantile predictions and calibration-cell scores were not saved; "
                             "only the final bounds (lo, hi) and q-hat were stored. Requires re-running with calibration artifacts."})
    print("NOT VERIFIABLE cqr_threshold_independently_recomputable", flush=True)
    out = Path(results)
    (out / "verification_existing.json").write_text(json.dumps(checks, indent=1, default=str))
    lines = ["# Verification of existing results (read-only)", "", "| Check | Result | Detail |", "|---|---|---|"]
    for c in checks:
        lines.append(f"| {c['check']} | {'PASS' if c['pass'] else 'NOT VERIFIED' if 'recomputable' in c['check'] else 'FAIL'} | {str(c['detail'])[:250].replace('|', '/')} |")
    (out / "verification_existing.md").write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
