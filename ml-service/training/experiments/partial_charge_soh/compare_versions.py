"""Compare original (v1, CPU, no checkpoints) and rerun (v2, CUDA CNNs, with checkpoints) metrics run by run.

Usage: python -I compare_versions.py RESULTS_V1 RESULTS_V2
Writes RESULTS_V2/comparison_v1_v2.csv and .md
"""
import sys
from pathlib import Path

import pandas as pd

KEYS = ["exp", "seed", "label_frac", "holdout", "model"]


def load(d):
    parts = []
    for exp in ("main", "xdata"):
        m = pd.read_csv(Path(d) / f"metrics_{exp}.csv")
        m["holdout"] = m["holdout"].fillna("")
        parts.append(m[m.scope == "all"])
    return pd.concat(parts)


def main(v1, v2):
    a, b = load(v1), load(v2)
    cols = ["rmse_pct", "mae_pct", "r2", "coverage", "width_pct", "cqr_qhat_pct"]
    m = a[KEYS + cols].merge(b[KEYS + cols], on=KEYS, suffixes=("_v1", "_v2"))
    for c in cols:
        m[f"d_{c}"] = m[f"{c}_v2"] - m[f"{c}_v1"]
    m["identical_rmse"] = m["d_rmse_pct"].abs() < 1e-9
    m.to_csv(Path(v2) / "comparison_v1_v2.csv", index=False)
    summ = m.assign(family=m.model.map(lambda x: "CNN (GPU in v2)" if x.startswith("cnn") else "Ridge / LightGBM (CPU)")) \
        .groupby(["exp", "family"]).agg(runs=("model", "size"), identical=("identical_rmse", "sum"),
                                         max_abs_d_rmse=("d_rmse_pct", lambda s: s.abs().max()),
                                         mean_d_rmse=("d_rmse_pct", "mean"),
                                         max_abs_d_coverage=("d_coverage", lambda s: s.abs().max())).reset_index()
    lines = ["# v1 (original) vs v2 (rerun with checkpoints)", "",
             "v1: CPU for all models, no checkpoints saved. v2: identical code path and splits; CNNs trained on CUDA; all models saved.", "",
             "| Experiment | Family | Runs | Identical RMSE | Max abs ΔRMSE (pp) | Mean ΔRMSE (pp) | Max abs Δcoverage |",
             "|---|---|---|---|---|---|---|"]
    for r in summ.itertuples(index=False):
        lines.append(f"| {r.exp} | {r.family} | {r.runs} | {r.identical} | {r.max_abs_d_rmse:.3f} | {r.mean_d_rmse:+.3f} | "
                     f"{0 if pd.isna(r.max_abs_d_coverage) else r.max_abs_d_coverage:.3f} |")
    lines += ["", "## Per run", "", "| exp | seed | labels | holdout | model | RMSE v1 | RMSE v2 | Δ | cov v1 | cov v2 |", "|---|---|---|---|---|---|---|---|---|---|"]
    for r in m.itertuples(index=False):
        lines.append(f"| {r.exp} | {r.seed} | {r.label_frac} | {r.holdout or '-'} | {r.model} | {r.rmse_pct_v1:.2f} | {r.rmse_pct_v2:.2f} | "
                     f"{r.d_rmse_pct:+.2f} | {'' if pd.isna(r.coverage_v1) else f'{r.coverage_v1:.3f}'} | {'' if pd.isna(r.coverage_v2) else f'{r.coverage_v2:.3f}'} |")
    (Path(v2) / "comparison_v1_v2.md").write_text("\n".join(lines), encoding="utf-8")
    print(summ.to_string(index=False))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
