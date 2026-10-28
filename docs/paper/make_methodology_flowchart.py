"""Single-column (3.5 in) methodology flowchart for the partial-charging SOH study.

Only steps implemented in experiments/partial_charge_soh are shown (Ridge and LightGBM in the feature branch;
supervised CNN with masked-curve pre-training in the sequence branch).

Usage: python -I make_methodology_flowchart.py OUT_DIR
"""
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.patches import FancyArrowPatch, FancyBboxPatch  # noqa: E402

W, H = 3.5, 8.62
EDGE, SEC_FILL, TXT = "#1f3b63", "#eaf2fb", "#111111"
FS, FS_SEC = 5.4, 6.0
plt.rcParams.update({"font.family": "DejaVu Sans", "savefig.dpi": 600, "figure.facecolor": "white"})

fig = plt.figure(figsize=(W, H))
ax = fig.add_axes([0, 0, 1, 1])
ax.set_xlim(0, W)
ax.set_ylim(0, H)
ax.axis("off")

X0, X1 = 0.05, 3.45          # section container extent
PAD = 0.08


def Y(top):                  # top-based coordinate -> axes y
    return H - top


def section(top, height, label):
    ax.add_patch(FancyBboxPatch((X0, Y(top + height)), X1 - X0, height, boxstyle="square,pad=0", fc=SEC_FILL, ec=EDGE, lw=0.6))
    ax.text(X0 + 0.06, Y(top + 0.09), label, fontsize=FS_SEC, fontweight="bold", color=EDGE, va="center", ha="left")


def block(x, top, w, h, text, dashed=False, bold=False):
    ax.add_patch(FancyBboxPatch((x, Y(top + h)), w, h, boxstyle="square,pad=0", fc="white", ec=EDGE, lw=0.5,
                                ls=(0, (2, 1.2)) if dashed else "-"))
    ax.text(x + w / 2, Y(top + h / 2), text, fontsize=FS, color=TXT, ha="center", va="center", linespacing=1.15,
            fontweight="bold" if bold else "normal")
    return {"l": x, "r": x + w, "t": top, "b": top + h, "cx": x + w / 2, "cy": top + h / 2}


def arrow(p0, p1):
    ax.add_patch(FancyArrowPatch((p0[0], Y(p0[1])), (p1[0], Y(p1[1])), arrowstyle="-|>", mutation_scale=5,
                                 lw=0.55, color=EDGE, shrinkA=0, shrinkB=0))


def path(points):
    for a, b in zip(points[:-2], points[1:-1]):
        ax.plot([a[0], b[0]], [Y(a[1]), Y(b[1])], color=EDGE, lw=0.55, solid_capstyle="butt")
    arrow(points[-2], points[-1])


def row(top, h, labels, gap=0.2, arrows=True):
    n = len(labels)
    w = (X1 - X0 - 2 * PAD - (n - 1) * gap) / n
    blocks = [block(X0 + PAD + i * (w + gap), top, w, h, t) for i, t in enumerate(labels)]
    for a, b in zip(blocks[:-1], blocks[1:]):
        if arrows:
            arrow((a["r"], a["cy"]), (b["l"], b["cy"]))
    return blocks


def two_rows(top, labels, h=0.26, row_gap=0.12):
    r1 = row(top, h, labels[:3])
    r2 = row(top + h + row_gap, h, labels[3:])
    mid = r1[-1]["b"] + row_gap / 2
    path([(r1[-1]["cx"], r1[-1]["b"]), (r1[-1]["cx"], mid), (r2[0]["cx"], mid), (r2[0]["cx"], r2[0]["t"])])
    return r1, r2


def link(top_sec_bottom, next_top):
    arrow((W / 2, top_sec_bottom), (W / 2, next_top))


# 1. Data sources ---------------------------------------------------------------------------------
t = 0.05
section(t, 0.80, "1  Data sources")
srcs = row(t + 0.19, 0.20, ["CALCE", "SNL", "HUST", "MATR", "NASA", "Oxford"], gap=0.05, arrows=False)
raw = block(0.30, t + 0.52, 2.90, 0.21, "Raw charging measurements · cell IDs · source metadata · SOH labels")
for s in srcs:
    ax.plot([s["cx"], s["cx"]], [Y(s["b"]), Y(t + 0.455)], color=EDGE, lw=0.5)
ax.plot([srcs[0]["cx"], srcs[-1]["cx"]], [Y(t + 0.455), Y(t + 0.455)], color=EDGE, lw=0.5)
arrow((W / 2, t + 0.455), (W / 2, raw["t"]))
link(t + 0.80, t + 0.92)

# 2. Validation and preprocessing ------------------------------------------------------------------
t = 0.97
section(t, 0.92, "2  Data validation and preprocessing")
two_rows(t + 0.20, ["Integrity checks\n(schema, ranges)", "Duplicate cells and\ninvalid records", "Missing-value\nhandling",
                    "SI-unit\nconsistency", "Signal resampling\nto fixed grids", "Normalization fitted\non training cells"])
link(t + 0.92, t + 1.04)

# 3. Partial-session generation ---------------------------------------------------------------------
t = 2.01
section(t, 0.92, "3  Partial charging session generation")
two_rows(t + 0.20, ["Identify charging\nsegment per cycle", "Extract V and\naccumulated ΔQ", "Random session bounds\n(start s, width w)",
                    "Resample to grids\n(48 / 64 points + mask)", "Validate length\n(≥ 3 observed bins)", "Assign cycle\nSOH label"])
link(t + 0.92, t + 1.04)

# 4. Cell-level partitioning ------------------------------------------------------------------------
t = 3.05
section(t, 0.56, "4  Cell-level data partitioning")
row(t + 0.20, 0.27, ["Group sessions\nby physical cell", "Train / validation /\ncalibration / test cells", "Verify no shared\ncells across splits"])
link(t + 0.56, t + 0.68)

# 5. Parallel model development ---------------------------------------------------------------------
t = 3.73
section(t, 1.60, "5  Parallel model development")
colw = (X1 - X0 - 2 * PAD - 0.20) / 2
xa, xb = X0 + PAD, X0 + PAD + colw + 0.20
ax.text(xa + colw / 2, Y(t + 0.24), "Branch A: feature-based", fontsize=FS, fontstyle="italic", ha="center", va="center", color=EDGE)
ax.text(xb + colw / 2, Y(t + 0.24), "Branch B: sequence-based", fontsize=FS, fontstyle="italic", ha="center", va="center", color=EDGE)
a1 = block(xa, t + 0.33, colw, 0.24, "Handcrafted session features\n(9) + context (5)")
a2 = block(xa, t + 0.67, colw, 0.24, "Feature matrix\n(train-fitted scaling)")
a3 = block(xa, t + 1.01, colw, 0.24, "Ridge regression\nLightGBM")
b1 = block(xb, t + 0.33, colw, 0.24, "V–ΔQ sequences\n(two masked views)")
b2 = block(xb, t + 0.67, colw, 0.24, "Masked-curve self-supervised\npre-training (train cells)")
b3 = block(xb, t + 1.01, colw, 0.24, "Supervised dual-view CNN\n(scratch / fine-tuned)")
for p, q in ((a1, a2), (a2, a3), (b1, b2), (b2, b3)):
    arrow((p["cx"], p["b"]), (q["cx"], q["t"]))
sel = block(0.85, t + 1.33, 1.80, 0.19, "Validation-based model selection", bold=True)
path([(a3["cx"], a3["b"]), (a3["cx"], t + 1.29), (sel["l"] + 0.35, t + 1.29), (sel["l"] + 0.35, sel["t"])])
path([(b3["cx"], b3["b"]), (b3["cx"], t + 1.29), (sel["r"] - 0.35, t + 1.29), (sel["r"] - 0.35, sel["t"])])
link(t + 1.60, t + 1.72)

# 6. Prediction and uncertainty ----------------------------------------------------------------------
t = 5.45
section(t, 1.30, "6  SOH prediction and uncertainty")
lw_ = 1.25
p1 = block(X0 + PAD, t + 0.20, lw_, 0.20, "Selected model")
p2 = block(X0 + PAD, t + 0.54, lw_, 0.24, "SOH point estimate\n" + r"(median, $q_{0.50}$)")
arrow((p1["cx"], p1["b"]), (p2["cx"], p2["t"]))
xr = X0 + PAD + lw_ + 0.22
rw = X1 - PAD - xr
u1 = block(xr, t + 0.20, rw, 0.20, r"Quantile outputs $q_{0.05}$, $q_{0.95}$")
u2 = block(xr, t + 0.48, rw, 0.20, "Conformity scores on calibration cells")
u3 = block(xr, t + 0.76, rw, 0.20, r"Split-CQR correction $\hat{Q}$ ($\alpha$ = 0.1)")
u4 = block(xr, t + 1.04, rw, 0.20, r"Prediction bounds $[q_{0.05}-\hat{Q},\ q_{0.95}+\hat{Q}]$")
for p, q in ((u1, u2), (u2, u3), (u3, u4)):
    arrow((p["cx"], p["b"]), (q["cx"], q["t"]))
arrow((p1["r"], p1["cy"]), (u1["l"], u1["cy"]))
link(t + 1.30, t + 1.42)

# 7. Evaluation -----------------------------------------------------------------------------------------
t = 6.87
section(t, 0.92, "7  Evaluation (test cells used once)")
two_rows(t + 0.20, ["Unseen-cell test\n(3 seeds)", "RMSE · MAE · R²\n(% SOH)", "Held-out-dataset test\n(MATR, HUST, SNL)",
                    "Coverage and\ninterval width", "Window robustness\n(start, width)", "Ablation: label budget,\nSSL on / off"])
link(t + 0.92, t + 1.04)

# 8. Outputs ----------------------------------------------------------------------------------------------
t = 7.91
section(t, 0.66, "8  Experimental outputs")
n, gap = 5, 0.05
w5 = (X1 - X0 - 2 * PAD - (n - 1) * gap) / n
for i, lab in enumerate(["Model +\nconfig", "Saved\npredictions", "Metrics\n(CSV)", "Figures", "Scripts +\nseeds"]):
    block(X0 + PAD + i * (w5 + gap), t + 0.22, w5, 0.30, lab)

out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
for ext in ("png", "pdf", "svg"):
    fig.savefig(out / f"fig_methodology_flowchart.{ext}", facecolor="white")
print("FLOWCHART DONE")
