"""Build the arbitrary-partial-charging-window dataset for the SOH study.

For each sampled clean cycle, a charging session is simulated that starts and stops at random
points of the full charge (start fraction s ~ U(0.05, 0.60), width w ~ U(0.15, 0.40)). The model
never sees s, w or the cell's capacity: it only sees what a BMS could measure during that session,
i.e. the charge accumulated since the session started (Ah) as a function of terminal voltage.

The observation is resampled onto a fixed per-chemistry voltage grid (64 points) with a mask:
  x[0] = accumulated charge since session start / rated capacity   (0 outside the window)
  x[1] = mask (1 inside the observed voltage window)
A second, charge-domain view is stored as xa: terminal voltage at fixed accumulated-charge steps
(0 to 0.40 x rated capacity, 48 points) since session start, with a mask after the session ends.

Output: windows.npz with curves, context, handcrafted window features, SOH target and metadata.

Usage: python -I make_windows.py "C:/Users/abhis/Documents/Ai ev/datasets" OUT_DIR [cycles_per_cell] [windows_per_cycle]
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

GRID_POINTS = 64
GRIDS = {"LFP": np.linspace(3.20, 3.60, GRID_POINTS), "other": np.linspace(3.50, 4.20, GRID_POINTS)}
CHEMS = ["LFP", "LCO", "LCO/NCO", "NMC", "NCA", "unknown"]
SEED = 20261012


def grid_for(chem):
    return GRIDS["LFP"] if chem == "LFP" else GRIDS["other"]


def observe_window(v_q, q_grid, qc, nominal, s, e, grid):
    q_fine = np.linspace(s, e, 256)
    v_fine = np.maximum.accumulate(np.interp(q_fine, q_grid, v_q))
    ah = (q_fine - s) * qc / nominal
    v_u, idx = np.unique(v_fine[::-1], return_index=True)   # last occurrence of each voltage
    ah_u = ah[::-1][idx]
    inside = (grid >= v_fine[0]) & (grid <= v_fine[-1])
    x = np.zeros((2, len(grid)), np.float32)
    if inside.sum() >= 3 and len(v_u) >= 2:
        x[0, inside] = np.interp(grid[inside], v_u, ah_u)
        x[1, inside] = 1.0
    return x, float(v_fine[0]), float(v_fine[-1]), float(ah[-1])


AH_GRID = np.linspace(0.0, 0.40, 48)   # accumulated charge since session start, fraction of rated capacity


def observe_window_ah(v_q, q_grid, qc, nominal, s, e):
    """Charge-domain view: terminal voltage at fixed accumulated-charge steps since session start."""
    q = s + AH_GRID * nominal / qc
    x = np.zeros((2, len(AH_GRID)), np.float32)
    inside = q <= e
    x[0, inside] = np.interp(q[inside], q_grid, v_q)
    x[1, inside] = 1.0
    return x


def window_features(x, grid, v_start, v_end, ah_total):
    m = x[1] > 0
    q = x[0][m]
    g = grid[m]
    ic = np.diff(q) / np.diff(g) if m.sum() >= 2 else np.array([np.nan])
    mid = np.interp((v_start + v_end) / 2, g, q) if m.sum() >= 2 else np.nan
    return [v_start, v_end, v_end - v_start, ah_total, ah_total / max(v_end - v_start, 1e-3),
            float(np.nanmax(ic)), float(g[1:][np.nanargmax(ic)]) if np.isfinite(ic).any() else np.nan,
            mid, int(m.sum())]


FEATURE_NAMES = ["v_start", "v_end", "dv", "dah_norm", "dah_per_v", "ic_max", "v_at_ic_max", "dah_at_vmid", "n_bins"]


def main(root: Path, out_dir: Path, per_cell: int, per_cycle: int):
    rng = np.random.default_rng(SEED)
    m = root / "master"
    cells = pd.read_parquet(m / "cells.parquet").set_index("cell_id")
    feats = pd.read_parquet(m / "features.parquet", columns=["cell_id", "cycle_number", "c_rate_charge", "ambient_temp_C",
                                                             "target_soh", "efc"])
    cyc = pd.read_parquet(m / "cycles.parquet", columns=["cell_id", "cycle_number", "charge_capacity_Ah"])
    feats = feats.merge(cyc, on=["cell_id", "cycle_number"])
    out = {k: [] for k in ["x", "xa", "ctx", "hand", "y", "cell", "source", "chem", "cycle", "s", "w", "efc"]}
    for source in sorted(cells["source"].unique()):
        z = np.load(m / "curves" / f"{source}.npz")
        key = pd.DataFrame({"cell_id": z["cell_id"], "cycle_number": z["cycle_number"], "row": np.arange(len(z["cell_id"]))})
        src = feats[feats["cell_id"].isin(cells.index[cells["source"] == source])].merge(key, on=["cell_id", "cycle_number"])
        vq_all, q_grid = z["charge_v_at_q"], z["q_grid"]
        for cell_id, g in src.groupby("cell_id"):
            meta = cells.loc[cell_id]
            g = g[np.isfinite(vq_all[g["row"].to_numpy()]).all(axis=1) & g["target_soh"].between(0.5, 1.2)]
            if len(g) == 0:
                continue
            pick = g.iloc[np.unique(np.linspace(0, len(g) - 1, min(per_cell, len(g))).round().astype(int))]
            grid = grid_for(meta["chemistry"])
            chem_vec = [float(meta["chemistry"] == c) for c in CHEMS]
            for r in pick.itertuples():
                for _ in range(per_cycle):
                    for _attempt in range(10):
                        s = rng.uniform(0.05, 0.60)
                        w = rng.uniform(0.15, 0.40)
                        e = min(s + w, 0.98)
                        x, v0, v1, ah = observe_window(vq_all[r.row], q_grid, r.charge_capacity_Ah,
                                                       meta["nominal_capacity_Ah"], s, e, grid)
                        if x[1].sum() >= 3:
                            break
                    else:
                        continue
                    out["x"].append(x)
                    out["xa"].append(observe_window_ah(vq_all[r.row], q_grid, r.charge_capacity_Ah,
                                                       meta["nominal_capacity_Ah"], s, e))
                    out["ctx"].append(chem_vec + [r.ambient_temp_C / 50.0, min(r.c_rate_charge, 10.0) / 10.0])
                    out["hand"].append(window_features(x, grid, v0, v1, ah))
                    out["y"].append(r.target_soh)
                    out["cell"].append(cell_id)
                    out["source"].append(source)
                    out["chem"].append(meta["chemistry"])
                    out["cycle"].append(r.cycle_number)
                    out["s"].append(s)
                    out["w"].append(e - s)
                    out["efc"].append(r.efc)
        print(f"{source}: {sum(1 for x in out['source'] if x == source):,} windows", flush=True)
    out_dir.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        out_dir / "windows.npz",
        x=np.stack(out["x"]).astype(np.float32), xa=np.stack(out["xa"]).astype(np.float32), ah_grid=AH_GRID, ctx=np.array(out["ctx"], np.float32),
        hand=np.array(out["hand"], np.float32), y=np.array(out["y"], np.float32),
        cell=np.array(out["cell"]), source=np.array(out["source"]), chem=np.array(out["chem"]),
        cycle=np.array(out["cycle"]), s=np.array(out["s"], np.float32), w=np.array(out["w"], np.float32),
        efc=np.array(out["efc"], np.float32), hand_names=np.array(FEATURE_NAMES), ctx_names=np.array(CHEMS + ["ambient_temp/50", "c_rate/10"]),
        grid_lfp=GRIDS["LFP"], grid_other=GRIDS["other"],
    )
    print(f"TOTAL windows={len(out['y']):,} cells={len(set(out['cell']))}", flush=True)


if __name__ == "__main__":
    a = sys.argv
    main(Path(a[1]), Path(a[2]), int(a[3]) if len(a) > 3 else 120, int(a[4]) if len(a) > 4 else 2)
