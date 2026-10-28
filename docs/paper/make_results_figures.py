"""Experimental figures and tables, generated only from saved experiment outputs.

Reads RESULTS_DIR/{metrics,predictions,train_log}_{main,xdata}.* and writes:
  fig6_training_curves, fig7_pred_vs_measured, fig8_window_sensitivity, fig9_calibration,
  fig10_model_comparison, fig11_cross_dataset (+ tables/*.csv and tables/*.md)

Usage: python -I make_results_figures.py RESULTS_DIR OUT_DIR
"""
import json
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 8, "savefig.dpi": 300, "figure.facecolor": "white"})
NAMES = {"ridge": "Ridge (hand)", "lgbm_hand": "LightGBM (hand)", "lgbm_all": "LightGBM (hand+curves)",
         "cnn_sup": "CNN (supervised)", "cnn_ssl": "CNN (SSL + fine-tune)"}
ORDER = ["ridge", "lgbm_hand", "lgbm_all", "cnn_sup", "cnn_ssl"]


def save(fig, out, name):
    for ext in ("png", "svg"):
        fig.savefig(out / f"{name}.{ext}", bbox_inches="tight")
    plt.close(fig)


def table_md(df: pd.DataFrame) -> str:
    cols = list(df.columns)
    lines = ["| " + " | ".join(cols) + " |", "|" + "---|" * len(cols)]
    lines += ["| " + " | ".join(str(v) for v in row) + " |" for row in df.itertuples(index=False)]
    return "\n".join(lines)


def main_table(m: pd.DataFrame, tables: Path):
    a = m[m.scope == "all"]
    g = a.groupby(["label_frac", "model"])
    t = g.agg(rmse_mean=("rmse_pct", "mean"), rmse_std=("rmse_pct", "std"), mae_mean=("mae_pct", "mean"),
              r2_mean=("r2", "mean"), cov_mean=("coverage", "mean"), width_mean=("width_pct", "mean"),
              n_seeds=("seed", "nunique"), train_cells=("n_train_cells", "mean")).reset_index()
    t["model"] = pd.Categorical(t["model"], ORDER, ordered=True)
    t = t.sort_values(["label_frac", "model"], ascending=[False, True])
    t.to_csv(tables / "table5_soh_main.csv", index=False)
    pretty = pd.DataFrame({
        "Labels": [f"{int(f * 100)} % of train cells" for f in t.label_frac],
        "Model": [NAMES[str(x)] for x in t.model],
        "RMSE (% SOH)": [f"{a:.2f} ± {b:.2f}" for a, b in zip(t.rmse_mean, t.rmse_std)],
        "MAE (% SOH)": [f"{x:.2f}" for x in t.mae_mean],
        "R²": [f"{x:.3f}" for x in t.r2_mean],
        "90 % PI coverage": ["—" if np.isnan(x) else f"{x:.3f}" for x in t.cov_mean],
        "PI width (% SOH)": ["—" if np.isnan(x) else f"{x:.2f}" for x in t.width_mean],
    })
    (tables / "table5_soh_main.md").write_text(table_md(pretty), encoding="utf-8")
    src = m[m.scope != "all"].groupby(["label_frac", "model", "scope"]).rmse_pct.mean().unstack("scope").round(2).reset_index()
    src.to_csv(tables / "table5b_rmse_by_source.csv", index=False)
    src["model"] = src["model"].map(NAMES)
    (tables / "table5b_rmse_by_source.md").write_text(table_md(src), encoding="utf-8")
    return t


def fig10(t, out):
    fig, ax = plt.subplots(figsize=(3.5, 2.7))
    width = 0.38
    for k, frac in enumerate((1.0, 0.1)):
        s = t[t.label_frac == frac].set_index("model").reindex(ORDER)
        x = np.arange(len(ORDER)) + (k - 0.5) * width
        ax.bar(x, s.rmse_mean, width, yerr=s.rmse_std, capsize=2, label=f"{int(frac * 100)} % labelled train cells",
               color=["#4c72b0", "#dd8452"][k], edgecolor="#333", lw=0.4)
    short = {"ridge": "Ridge", "lgbm_hand": "LGBM\n(hand)", "lgbm_all": "LGBM\n(hand+\ncurves)",
             "cnn_sup": "CNN\n(sup.)", "cnn_ssl": "CNN\n(SSL)"}
    ax.set_xticks(np.arange(len(ORDER)), [short[m] for m in ORDER], fontsize=7)
    ax.set_ylabel("Test RMSE (% SOH)")
    ax.legend(frameon=False, fontsize=7)
    ax.grid(axis="y", alpha=0.25)
    fig.tight_layout()
    save(fig, out, "fig10_model_comparison")


def fig7(p, out, model):
    s = p[(p.seed == 0) & (p.label_frac == 1.0) & (p.model == model)]
    fig, ax = plt.subplots(figsize=(3.5, 3.3))
    for src, g in s.groupby("source"):
        ax.scatter(g.y, g.pred, s=2, alpha=0.25, label=src, rasterized=True)
    lim = [0.5, 1.15]
    ax.plot(lim, lim, "k--", lw=0.8)
    ax.set_xlim(lim)
    ax.set_ylim(lim)
    ax.set_xlabel("Measured SOH")
    ax.set_ylabel("Predicted SOH")
    ax.set_title(f"{NAMES[model]}, seed 0 test cells", fontsize=8)
    ax.legend(markerscale=4, fontsize=6.5, frameon=False)
    save(fig, out, "fig7_pred_vs_measured")


def fig8(p, out, tables):
    s = p[(p.label_frac == 1.0) & p.model.isin(["lgbm_hand", "cnn_sup", "cnn_ssl"])].copy()
    s["sq"] = (s.pred - s.y) ** 2
    s["width_bin"] = pd.cut(s.w, [0.14, 0.20, 0.25, 0.30, 0.35, 0.41])
    s["start_bin"] = pd.cut(s.s, [0.04, 0.15, 0.25, 0.35, 0.45, 0.61])
    fig, axes = plt.subplots(2, 1, figsize=(3.5, 4.4))
    rows = []
    for ax, col, lab in ((axes[0], "width_bin", "Session width (fraction of full charge)"),
                         (axes[1], "start_bin", "Session start (fraction of full charge)")):
        for model, g in s.groupby("model"):
            r = g.groupby(col, observed=True).sq.mean().pow(0.5) * 100
            ax.plot([iv.mid for iv in r.index], r.values, marker="o", ms=3, lw=1, label=NAMES[model])
            rows += [{"axis": col, "bin": str(iv), "model": model, "rmse_pct": round(v, 3)} for iv, v in r.items()]
        ax.set_xlabel(lab)
        ax.grid(alpha=0.25)
    axes[0].set_ylabel("Test RMSE (% SOH)")
    axes[1].set_ylabel("Test RMSE (% SOH)")
    axes[0].legend(frameon=False, fontsize=6.5)
    fig.tight_layout()
    pd.DataFrame(rows).to_csv(tables / "window_sensitivity.csv", index=False)
    save(fig, out, "fig8_window_sensitivity")


def fig9(m, p, out, model):
    a = m[(m.scope != "all") & (m.label_frac == 1.0) & (m.model == model)]
    cov = p[(p.label_frac == 1.0) & (p.model == model)].assign(inside=lambda d: (d.y >= d.lo) & (d.y <= d.hi))
    by_src = cov.groupby(["seed", "source"]).inside.mean().groupby("source").agg(["mean", "std"])
    fig, axes = plt.subplots(2, 1, figsize=(3.5, 4.8))
    axes[0].bar(by_src.index, by_src["mean"], yerr=by_src["std"], capsize=2, color="#4c72b0", edgecolor="#333", lw=0.4)
    axes[0].axhline(0.9, color="k", ls="--", lw=0.8)
    axes[0].tick_params(axis="x", rotation=35, labelsize=7.5)
    axes[0].set_ylim(0.5, 1.02)
    axes[0].set_ylabel("Empirical coverage (90 % target)")
    axes[0].set_title(f"{NAMES[model]}: coverage on test cells", fontsize=8)
    s = cov[cov.seed == 0]
    cell = s.groupby("cell").size().idxmax()
    c = s[s.cell == cell].sort_values("row")
    xi = np.arange(len(c))
    axes[1].fill_between(xi, c.lo, c.hi, color="#4c72b0", alpha=0.25, label="90 % CQR interval")
    axes[1].plot(xi, c.y, "k.", ms=2, label="measured SOH")
    axes[1].plot(xi, c.pred, ".", color="#dd8452", ms=2, label="predicted (median)")
    axes[1].set_xlabel("Test sessions, ordered by cycle")
    axes[1].set_title(f"Example test cell {cell}", fontsize=8)
    axes[1].set_ylabel("SOH")
    axes[1].legend(frameon=False, fontsize=6.5, markerscale=3)
    fig.tight_layout()
    save(fig, out, "fig9_calibration")
    return by_src


def fig_by_dataset(m, out):
    a = m[(m.scope != "all") & (m.label_frac == 1.0) & m.model.isin(["lgbm_all", "cnn_sup", "cnn_ssl"])]
    g = a.groupby(["scope", "model"]).rmse_pct.agg(["mean", "std"]).reset_index()
    srcs = sorted(g.scope.unique())
    fig, ax = plt.subplots(figsize=(3.5, 2.6))
    width = 0.27
    for k, model in enumerate(["lgbm_all", "cnn_sup", "cnn_ssl"]):
        s = g[g.model == model].set_index("scope").reindex(srcs)
        ax.bar(np.arange(len(srcs)) + (k - 1) * width, s["mean"], width, yerr=s["std"], capsize=1.5, label=NAMES[model],
               edgecolor="#333", lw=0.3)
    ax.set_xticks(np.arange(len(srcs)), [x.title() if x == "OXFORD" else x for x in srcs], fontsize=7)
    ax.set_ylabel("Test RMSE (% SOH)")
    ax.legend(frameon=False, fontsize=6.5)
    ax.grid(axis="y", alpha=0.25)
    fig.tight_layout()
    save(fig, out, "fig_rmse_by_dataset")


def fig_residuals(p, out, model):
    s = p[(p.label_frac == 1.0) & (p.model == model)]
    r = (s.pred - s.y) * 100
    fig, ax = plt.subplots(figsize=(3.5, 2.5))
    bins = np.linspace(-20, 20, 81)
    for src, g in s.assign(r=r).groupby("source"):
        ax.hist(g.r.clip(-20, 20), bins=bins, histtype="step", density=True, lw=0.9, label=src.title() if src == "OXFORD" else src)
    ax.axvline(0, color="k", lw=0.6)
    ax.set_xlabel("Residual, predicted − measured (% SOH)")
    ax.set_ylabel("Density (test sessions)")
    ax.legend(frameon=False, fontsize=6.5)
    fig.tight_layout()
    save(fig, out, "fig_residuals")


def fig6(log, out):
    lg = pd.DataFrame(log)
    if lg.empty:
        return
    s = lg[(lg.seed == 0) & (lg.label_frac == 1.0)]
    fig, axes = plt.subplots(2, 1, figsize=(3.5, 4.2))
    ssl = s[s.phase == "ssl"]
    axes[0].plot(ssl.epoch, ssl.train_loss, marker="o", ms=3, lw=1)
    axes[0].set_xlabel("Pre-training epoch")
    axes[0].set_ylabel("Masked reconstruction MSE")
    axes[0].grid(alpha=0.25)
    for model in ("cnn_sup", "cnn_ssl"):
        g = s[s.phase == model]
        axes[1].plot(g.epoch, g.val_rmse * 100, marker="o", ms=3, lw=1, label=NAMES[model])
    axes[1].set_xlabel("Fine-tuning epoch")
    axes[1].set_ylabel("Validation RMSE (% SOH)")
    axes[1].legend(frameon=False, fontsize=7)
    axes[1].grid(alpha=0.25)
    fig.tight_layout()
    save(fig, out, "fig6_training_curves")


def fig11(mx, out, tables):
    a = mx[mx.scope == "all"].copy()
    a.to_csv(tables / "table6_cross_dataset.csv", index=False)
    pretty = a.assign(Model=a.model.map(NAMES))[["holdout", "Model", "n_train_cells", "n_cells", "rmse_pct", "mae_pct", "coverage", "width_pct"]]
    pretty = pretty.rename(columns={"holdout": "Held-out source", "n_train_cells": "Train cells", "n_cells": "Test cells",
                                    "rmse_pct": "RMSE (% SOH)", "mae_pct": "MAE (% SOH)", "coverage": "90 % PI coverage",
                                    "width_pct": "PI width (% SOH)"}).round(3)
    (tables / "table6_cross_dataset.md").write_text(table_md(pretty), encoding="utf-8")
    fig, axes = plt.subplots(2, 1, figsize=(3.5, 4.4))
    keep = [m for m in ("lgbm_hand", "cnn_sup", "cnn_ssl") if m in set(a.model)]
    piv = a.pivot(index="holdout", columns="model", values="rmse_pct")[keep]
    piv.rename(columns=NAMES).plot.bar(ax=axes[0], rot=0, edgecolor="#333", lw=0.4)
    axes[0].set_ylabel("RMSE on held-out source (% SOH)")
    axes[0].set_xlabel("")
    axes[0].legend(frameon=False, fontsize=6.5)
    pc = a.pivot(index="holdout", columns="model", values="coverage")[keep]
    pc.rename(columns=NAMES).plot.bar(ax=axes[1], rot=0, edgecolor="#333", lw=0.4, legend=False)
    axes[1].axhline(0.9, color="k", ls="--", lw=0.8)
    axes[1].set_ylim(0, 1.02)
    axes[1].set_ylabel("90 % PI coverage")
    axes[1].set_xlabel("")
    axes[0].legend(frameon=False, fontsize=6.5, loc="upper left")
    fig.tight_layout()
    save(fig, out, "fig11_cross_dataset")


if __name__ == "__main__":
    res, out = Path(sys.argv[1]), Path(sys.argv[2])
    tables = out.parent / "tables"
    out.mkdir(parents=True, exist_ok=True)
    tables.mkdir(parents=True, exist_ok=True)
    m = pd.read_csv(res / "metrics_main.csv")
    p = pd.read_csv(res / "predictions_main.csv")
    t = main_table(m, tables)
    best = t[t.label_frac == 1.0].sort_values("rmse_mean").iloc[0]["model"]
    print("best full-label model:", best)
    fig10(t, out)
    fig7(p, out, str(best))
    fig8(p, out, tables)
    fig_by_dataset(m, out)
    fig_residuals(p, out, str(best))
    cov = fig9(m, p, out, str(best))
    cov.round(3).to_csv(tables / "coverage_by_source_best.csv")
    fig6(json.loads((res / "train_log_main.json").read_text()), out)
    if (res / "metrics_xdata.csv").exists():
        fig11(pd.read_csv(res / "metrics_xdata.csv"), out, tables)
    print("RESULT FIGURES DONE")
