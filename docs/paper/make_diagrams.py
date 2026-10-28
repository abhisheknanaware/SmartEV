"""Conceptual diagrams (Figs. 1, 2, 4, 5) and the data-derived partial-charging illustration (Fig. 3).

Usage: python -I make_diagrams.py DATASETS_DIR OUT_DIR
"""
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch  # noqa: E402

plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 9, "savefig.dpi": 300, "figure.facecolor": "white"})
IMPL, PROP, DATA, OUT = "#dbe9f6", "#fde9d9", "#e8f3e1", "#eeeeee"


def box(ax, x, y, w, h, text, fc, dashed=False, fs=8.5):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.01,rounding_size=0.015", fc=fc, ec="#333333",
                                lw=0.8, ls="--" if dashed else "-"))
    ax.text(x + w / 2, y + h / 2, text, ha="center", va="center", fontsize=fs)


def arrow(ax, x0, y0, x1, y1):
    ax.add_patch(FancyArrowPatch((x0, y0), (x1, y1), arrowstyle="-|>", mutation_scale=9, lw=0.8, color="#333333"))


def canvas(w, h):
    fig, ax = plt.subplots(figsize=(w, h))
    ax.set_xlim(-0.01, 1.02)
    ax.set_ylim(-0.01, 1.01)
    ax.axis("off")
    return fig, ax


def save(fig, out, name):
    for ext in ("png", "svg"):
        fig.savefig(out / f"{name}.{ext}", bbox_inches="tight")
    plt.close(fig)


def legend_key(ax, x, y, fc, dashed, label):
    ax.add_patch(FancyBboxPatch((x, y), 0.03, 0.035, boxstyle="square,pad=0", fc=fc, ec="#333", ls="--" if dashed else "-"))
    ax.text(x + 0.04, y + 0.017, label, va="center", fontsize=7.5)


def fig1_system(out):
    fig, ax = canvas(7.2, 4.4)
    box(ax, 0.28, 0.86, 0.44, 0.11, "React web client\n(map, booking, battery dashboard)", IMPL, fs=7.8)
    box(ax, 0.20, 0.61, 0.60, 0.15, "Spring Boot API: auth (JWT), stations, slots, bookings,\npayments (HMAC verification), QR passes",
        IMPL, fs=7.6)
    box(ax, 0.00, 0.37, 0.23, 0.13, "PostgreSQL\nusers, stations,\nbookings", IMPL, fs=7.4)
    box(ax, 0.25, 0.37, 0.21, 0.13, "Redis\n10-min slot holds", IMPL, fs=7.4)
    box(ax, 0.48, 0.37, 0.29, 0.13, "FastAPI ML service\nrecommendation, demand,\ncopilot (heuristic)", IMPL, fs=7.4)
    box(ax, 0.79, 0.37, 0.21, 0.13, "Razorpay\n(test mode)", IMPL, fs=7.4)
    box(ax, 0.40, 0.04, 0.60, 0.20, "Battery-health module (this paper)\nSOH from a partial charging session + calibrated 90 % interval\n"
        "(offline evaluation; application integration proposed)", PROP, dashed=True, fs=7.4)
    arrow(ax, 0.50, 0.86, 0.50, 0.76)
    for x in (0.115, 0.355, 0.625, 0.895):
        arrow(ax, 0.50, 0.61, x, 0.50)
    arrow(ax, 0.625, 0.37, 0.625, 0.24)
    legend_key(ax, 0.01, 0.17, IMPL, False, "implemented")
    legend_key(ax, 0.01, 0.10, PROP, True, "proposed / evaluated offline")
    save(fig, out, "fig1_system_architecture")


def fig2_framework(out):
    fig, ax = canvas(7.2, 1.9)
    steps = [("Six public\nlab datasets", DATA), ("Harmonise,\nlabel SOH,\nflag outliers", DATA),
             ("Sample arbitrary\npartial charging\nsessions", DATA), ("Self-supervised\nmasked-curve\npre-training", PROP),
             ("Quantile SOH\nhead (fine-tune)", PROP), ("Split CQR\ncalibration", PROP), ("Cell-separated &\ncross-dataset\nevaluation", OUT)]
    w, gap = 0.125, 0.018
    for i, (t, c) in enumerate(steps):
        x = 0.005 + i * (w + gap)
        box(ax, x, 0.25, w, 0.5, t, c, fs=7.4)
        if i:
            arrow(ax, x - gap, 0.5, x, 0.5)
    save(fig, out, "fig2_research_framework")


def fig4_model(out):
    fig, ax = canvas(7.2, 3.8)
    box(ax, 0.00, 0.50, 0.21, 0.18, "Charge-domain view\nV at fixed ΔQ steps\n(3 × 48)", DATA, fs=7.4)
    box(ax, 0.00, 0.24, 0.21, 0.18, "Voltage-domain view\nΔQ at fixed V\n(3 × 64)", DATA, fs=7.4)
    box(ax, 0.26, 0.50, 0.22, 0.18, "Encoder A\n3 dilated convs\n(d = 1, 2, 4), 48 ch", PROP, fs=7.4)
    box(ax, 0.26, 0.24, 0.22, 0.18, "Encoder B\n3 dilated convs\n(d = 1, 2, 4), 48 ch", PROP, fs=7.4)
    box(ax, 0.53, 0.34, 0.18, 0.24, "Masked mean\n+ max pooling\n(192-d)", PROP, fs=7.4)
    box(ax, 0.77, 0.34, 0.23, 0.24, "MLP head\n3 ordered quantiles\nq0.05, q0.50, q0.95", PROP, fs=7.4)
    box(ax, 0.77, 0.03, 0.23, 0.17, "Context: chemistry,\nambient T, C-rate", DATA, fs=7.4)
    box(ax, 0.20, 0.78, 0.56, 0.19, "Pre-training only: 1×1-conv decoder per encoder reconstructs\n"
        "a hidden contiguous block (30 %) of the observed window\n(MSE on hidden bins; no SOH labels)", OUT, dashed=True, fs=7.2)
    arrow(ax, 0.21, 0.59, 0.26, 0.59)
    arrow(ax, 0.21, 0.33, 0.26, 0.33)
    arrow(ax, 0.48, 0.59, 0.53, 0.50)
    arrow(ax, 0.48, 0.33, 0.53, 0.42)
    arrow(ax, 0.71, 0.46, 0.77, 0.46)
    arrow(ax, 0.885, 0.20, 0.885, 0.34)
    arrow(ax, 0.37, 0.68, 0.37, 0.78)
    save(fig, out, "fig4_model_architecture")


def fig5_workflow(out):
    fig, ax = canvas(7.0, 2.8)
    box(ax, 0.01, 0.62, 0.18, 0.28, "361 cells\n(6 sources)", DATA)
    box(ax, 0.25, 0.62, 0.20, 0.28, "Group by cell_id;\nstratify by source", DATA)
    parts = [("Test 20 %\n(untouched)", 0.80), ("Calibration 15 %\n(CQR only)", 0.58), ("Validation 15 %\n(early stop)", 0.36),
             ("Train\n(SSL + fit)", 0.14)]
    for t, y in parts:
        box(ax, 0.52, y - 0.08, 0.20, 0.16, t, PROP if "Train" in t else OUT, fs=7.8)
        arrow(ax, 0.45, 0.76, 0.52, y)
    box(ax, 0.78, 0.40, 0.21, 0.40, "Leakage controls\n• no cell in two splits\n• scalers fit on train\n• SSL uses train cells only\n"
        "• q̂ from calibration cells\n• test used once", OUT, fs=7.4)
    arrow(ax, 0.19, 0.76, 0.25, 0.76)
    save(fig, out, "fig5_data_workflow")


def fig3_partial_curves(root: Path, out):
    """Measured charge curves; the highlighted partial session is an illustrative window choice."""
    m = root / "master"
    cells = pd.read_parquet(m / "cells.parquet").set_index("cell_id")
    cyc = pd.read_parquet(m / "cycles.parquet", columns=["cell_id", "cycle_number", "charge_capacity_Ah", "soh", "is_outlier"])
    fig, axes = plt.subplots(2, 1, figsize=(3.5, 5.0))
    for ax, (source, cell_id, lo, hi) in zip(axes, [("SNL", "SNL_18650_NMC_25C_0-100_0.5-1C_a", 0.30, 0.62),
                                                     ("MATR", "MATR_b1c0", 0.20, 0.55)]):
        z = np.load(m / "curves" / f"{source}.npz")
        rows = np.where(z["cell_id"] == cell_id)[0]
        cc = cyc[(cyc.cell_id == cell_id) & ~cyc.is_outlier].set_index("cycle_number")
        nom = cells.loc[cell_id, "nominal_capacity_Ah"]
        picks = np.linspace(0, len(rows) - 1, 3).round().astype(int)
        for k, r in enumerate(rows[picks]):
            cn = z["cycle_number"][r]
            if cn not in cc.index:
                continue
            q = z["q_grid"] * cc.loc[cn, "charge_capacity_Ah"] / nom
            v = z["charge_v_at_q"][r]
            ax.plot(q, v, lw=1.0, color=plt.cm.viridis(k / 2.5), label=f"cycle {cn} (SOH {cc.loc[cn, 'soh']:.2f})")
            if k == 0:
                sel = (z["q_grid"] >= lo) & (z["q_grid"] <= hi)
                ax.plot(q[sel], v[sel], lw=4, alpha=0.35, color="#d62728", label="example partial session")
        ax.set_xlabel("Charge since empty / rated capacity")
        ax.set_ylabel("Terminal voltage (V)")
        ax.set_title(f"{source} {cells.loc[cell_id, 'chemistry']} cell", fontsize=8)
        ax.legend(fontsize=6.5, frameon=False)
        ax.grid(alpha=0.25)
    fig.tight_layout()
    save(fig, out, "fig3_partial_charging_curves")


def fig_dataset(root: Path, out):
    cells = pd.read_parquet(root / "master" / "cells.parquet")
    feats = pd.read_parquet(root / "master" / "features.parquet", columns=["source", "target_soh"])
    fig, axes = plt.subplots(2, 1, figsize=(3.5, 4.6))
    tab = cells.groupby(["source", "chemistry"]).size().unstack(fill_value=0)
    tab.plot.bar(stacked=True, ax=axes[0], width=0.7, colormap="tab20c", edgecolor="#333", lw=0.4)
    axes[0].set_ylabel("Cells")
    axes[0].set_xlabel("")
    axes[0].legend(fontsize=6.5, frameon=False, title="chemistry", title_fontsize=7)
    axes[0].tick_params(axis="x", rotation=0)
    for src, g in feats.groupby("source"):
        axes[1].hist(g["target_soh"].clip(0.4, 1.15), bins=60, histtype="step", density=True, lw=1, label=src)
    axes[1].set_xlabel("SOH (discharge capacity / rated)")
    axes[1].set_ylabel("Density (cycles)")
    axes[1].legend(fontsize=6.5, frameon=False)
    fig.tight_layout()
    save(fig, out, "figA_dataset_overview")


if __name__ == "__main__":
    root, out = Path(sys.argv[1]), Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    fig1_system(out)
    fig2_framework(out)
    fig3_partial_curves(root, out)
    fig4_model(out)
    fig5_workflow(out)
    fig_dataset(root, out)
    print("DIAGRAMS DONE")
