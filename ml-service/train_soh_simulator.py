"""Train the what-if SOH simulator on real laboratory cycling data.

Data: the harmonised master dataset (cells.parquet + cycles.parquet) built from public
CALCE, Sandia (SNL), HUST, MATR and Oxford/NASA releases. Each row is one clean cycle of
one cell; usage conditions come from the cell's test protocol.

Model: LightGBM regressor of SOH (% of the cell's initial capacity) from
    cycle number, chemistry, ambient temperature, max charge C-rate, max discharge C-rate,
with a monotone constraint so SOH never increases with cycle count. The 10-90 % band comes
from held-out residual quantiles per cycle-age bin (split-conformal style), so its width
reflects real error on unseen cells and grows with age.

Evaluation: 5-fold GroupKFold by cell (whole cells held out), against a cycles+chemistry
baseline, so the reported error reflects batteries the model has never seen.

Usage: python -I train_soh_simulator.py MASTER_DIR [OUT_DIR]
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import GroupKFold

CHEMS = ["LFP", "NMC", "NCA", "LCO"]
FEATURES = ["cycle_number", "chem_LFP", "chem_NMC", "chem_NCA", "chem_LCO",
            "ambient_temp_C", "max_charge_rate_C", "max_discharge_rate_C"]
MONOTONE = [-1, 0, 0, 0, 0, 0, 0, 0]  # SOH can only fall as cycles increase
MAX_ROWS_PER_CELL = 160               # keeps long-lived cells from dominating
AGE_BINS = [0, 100, 300, 700, 1500, 1e9]  # cycle-number bins for the uncertainty band
SEED = 20261023
PARAMS = dict(n_estimators=900, learning_rate=0.03, num_leaves=31, min_child_samples=60,
              subsample=0.8, subsample_freq=1, colsample_bytree=0.9, reg_lambda=1.0,
              random_state=SEED, verbose=-1)


def load(master: Path) -> pd.DataFrame:
    cells = pd.read_parquet(master / "cells.parquet")
    cycles = pd.read_parquet(master / "cycles.parquet",
                             columns=["cell_id", "cycle_number", "soh_vs_initial", "is_outlier"])
    cells = cells[cells.chemistry.isin(CHEMS)].copy()
    df = cycles[~cycles.is_outlier].merge(
        cells[["cell_id", "source", "chemistry", "ambient_temp_C", "max_charge_rate_C", "max_discharge_rate_C"]],
        on="cell_id")
    df = df.dropna(subset=["soh_vs_initial", "ambient_temp_C", "max_charge_rate_C", "max_discharge_rate_C"])
    df["soh"] = df.soh_vs_initial * 100.0
    df = df[(df.soh >= 40) & (df.soh <= 105)]
    # Evenly thin each cell's life to at most MAX_ROWS_PER_CELL cycles.
    parts = []
    for _, g in df.sort_values("cycle_number").groupby("cell_id"):
        idx = np.unique(np.linspace(0, len(g) - 1, min(len(g), MAX_ROWS_PER_CELL)).round().astype(int))
        parts.append(g.iloc[idx])
    df = pd.concat(parts, ignore_index=True)
    for c in CHEMS:
        df[f"chem_{c}"] = (df.chemistry == c).astype(int)
    return df


def fit(X, y):
    return lgb.LGBMRegressor(**dict(PARAMS, monotone_constraints=MONOTONE)).fit(X, y)


def metrics(y, p):
    return {"rmse": float(np.sqrt(mean_squared_error(y, p))), "mae": float(mean_absolute_error(y, p)), "r2": float(r2_score(y, p))}


def main(master, out):
    master, out = Path(master), Path(out)
    df = load(master)
    X, y, groups = df[FEATURES], df.soh.values, df.cell_id.values
    print(f"rows {len(df):,} cells {df.cell_id.nunique()} by chemistry {df.groupby('chemistry').cell_id.nunique().to_dict()}")

    # Cross-validation on held-out cells.
    oof = np.zeros(len(df)); base = np.zeros(len(df))
    base_feats = ["cycle_number", "chem_LFP", "chem_NMC", "chem_NCA", "chem_LCO"]
    for k, (tr, te) in enumerate(GroupKFold(n_splits=5).split(X, y, groups)):
        oof[te] = fit(X.iloc[tr], y[tr]).predict(X.iloc[te])
        b = lgb.LGBMRegressor(**dict(PARAMS, monotone_constraints=[-1, 0, 0, 0, 0])).fit(X.iloc[tr][base_feats], y[tr])
        base[te] = b.predict(X.iloc[te][base_feats])
        print(f"fold {k}: rmse {np.sqrt(mean_squared_error(y[te], oof[te])):.2f}")

    cv = metrics(y, oof)
    cv_base = metrics(y, base)
    # Residual quantiles on held-out cells, per age bin -> band offsets.
    resid = y - oof
    age_bin = np.digitize(df.cycle_number.values, AGE_BINS[1:-1])
    band = [{"max_cycle": AGE_BINS[i + 1], "lo": float(np.quantile(resid[age_bin == i], 0.1)), "hi": float(np.quantile(resid[age_bin == i], 0.9))}
            for i in range(len(AGE_BINS) - 1)]
    lo = oof + np.array([band[b]["lo"] for b in age_bin]); hi = oof + np.array([band[b]["hi"] for b in age_bin])
    coverage = float(np.mean((y >= lo) & (y <= hi)))  # in-sample for the band; it is calibrated on these residuals
    by_chem = {c: metrics(y[df.chemistry == c], oof[df.chemistry == c]) for c in CHEMS}
    print("CV (held-out cells):", {k: round(v, 3) for k, v in cv.items()}, "baseline:", {k: round(v, 3) for k, v in cv_base.items()},
          "10-90 coverage:", round(coverage, 3))

    # Final models on all cells.
    model = fit(X, y)

    # Where the data actually supports a prediction, per chemistry.
    cells = df.drop_duplicates("cell_id")
    support = {c: {
        "cells": int((cells.chemistry == c).sum()),
        "ambient_temp_C": sorted(cells[cells.chemistry == c].ambient_temp_C.unique().round(1).tolist()),
        "max_charge_rate_C": [float(cells[cells.chemistry == c].max_charge_rate_C.min()), float(cells[cells.chemistry == c].max_charge_rate_C.max())],
        "max_discharge_rate_C": [float(cells[cells.chemistry == c].max_discharge_rate_C.min()), float(cells[cells.chemistry == c].max_discharge_rate_C.max())],
        "max_cycles": int(df[df.chemistry == c].cycle_number.max()),
    } for c in CHEMS}

    out.mkdir(parents=True, exist_ok=True)
    joblib.dump({"model": model, "features": FEATURES, "band": band}, out / "soh_simulator.joblib")
    meta = {
        "created": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "target": "SOH, % of the cell's initial capacity",
        "features": FEATURES,
        "monotone_constraints": dict(zip(FEATURES, MONOTONE)),
        "training": {"rows": int(len(df)), "cells": int(df.cell_id.nunique()),
                     "cells_by_source": df.drop_duplicates("cell_id").groupby("source").size().to_dict(),
                     "cells_by_chemistry": df.drop_duplicates("cell_id").groupby("chemistry").size().to_dict()},
        "evaluation": {"protocol": "5-fold GroupKFold by cell (held-out cells)", "model": cv, "baseline_cycles_chemistry_only": cv_base,
                       "band_10_90": band, "band_coverage_on_heldout_residuals": coverage, "by_chemistry": by_chem},
        "support": support,
        "lightgbm": lgb.__version__,
        "seed": SEED,
    }
    (out / "soh_simulator_metadata.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print("saved", out / "soh_simulator.joblib")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else Path(__file__).parent / "app" / "models")
