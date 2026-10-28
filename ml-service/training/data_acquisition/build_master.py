"""Build the SmartEV master battery dataset from all lab sources.

Merges CALCE, SNL, HUST, MATR (BatteryLife format), NASA PCoE and Oxford into
one harmonised schema:

  master/cells.parquet         one row per cell: chemistry, conditions, life labels
  master/cycles.parquet        one row per cell x cycle: capacity, SOH, energy, timing,
                               temperature, resistance, RUL, outlier flag
  master/curves/<source>.npz   compact per-cycle curves for feature extraction:
                               discharge Q(V) on 100 voltage points, charge V(q) on 64 points

Usage: python -I build_master.py "C:/Users/abhis/Documents/Ai ev/datasets" [workers]
"""
import json
import re
import sys
import zipfile
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd
import scipy.io as sio

sys.path.insert(0, str(Path(__file__).parent))
from safe_pickle import safe_load  # noqa: E402

EOL_FRACTION = 0.8
N_V_POINTS, N_Q_POINTS = 100, 64
Q_GRID = np.linspace(0.0, 1.0, N_Q_POINTS)

BATTERYLIFE_AMBIENT = {"CALCE": 25.0, "HUST": 30.0, "MATR": 30.0}
CHEMISTRY = {"LiCoO2": "LCO", "LCO": "LCO", "LFP": "LFP", "LiFePO4": "LFP", "NMC": "NMC", "NCA": "NCA"}
CITATIONS = {
    "CALCE": "CALCE Battery Data, Univ. of Maryland (+3 CALCE articles); via BatteryLife (CC BY 4.0)",
    "SNL": "Preger et al., J. Electrochem. Soc. 2020; via BatteryLife (CC BY 4.0)",
    "HUST": "Ma et al., Energy Environ. Sci. 2022 (CC BY 4.0); via BatteryLife",
    "MATR": "Severson et al., Nature Energy 2019 / Attia et al., Nature 2020; via BatteryLife (CC BY 4.0)",
    "NASA": "Saha & Goebel, NASA Ames Prognostics Data Repository 2007",
    "OXFORD": "Birkl, PhD thesis, Univ. of Oxford 2017; Oxford Battery Degradation Dataset 1 (ODbL)",
}


# ----------------------------------------------------------------------------- cycle maths
def _segment_energy(t, v, i, mask):
    if mask.sum() < 2:
        return np.nan
    return float(np.trapezoid(np.abs(v[mask] * i[mask]), t[mask]) / 3600.0)


def discharge_curve(v, qd, mask, v_lo, v_hi):
    """Discharged capacity at fixed voltages (high -> low), NaN outside the measured range."""
    if mask.sum() < 5:
        return np.full(N_V_POINTS, np.nan, np.float32)
    vv, qq = v[mask], qd[mask]
    vv = np.minimum.accumulate(vv)
    grid = np.linspace(v_hi, v_lo, N_V_POINTS)
    out = np.interp(grid[::-1], vv[::-1], qq[::-1], left=np.nan, right=np.nan)[::-1]
    return out.astype(np.float32)


def charge_curve(v, qc, mask):
    """Voltage at fixed fractions of the charged capacity (0..1)."""
    if mask.sum() < 5 or qc[mask].max() <= 0:
        return np.full(N_Q_POINTS, np.nan, np.float32)
    qq = np.maximum.accumulate(qc[mask])
    return np.interp(Q_GRID, qq / qq[-1], v[mask]).astype(np.float32)


def summarise_cycle(t, v, i, qc, qd, temp, v_hi):
    ch, dc = i > 1e-4, i < -1e-4
    row = {
        "charge_capacity_Ah": float(np.nanmax(qc)) if qc.size else np.nan,
        "discharge_capacity_Ah": float(np.nanmax(qd)) if qd.size else np.nan,
        "charge_energy_Wh": _segment_energy(t, v, i, ch),
        "discharge_energy_Wh": _segment_energy(t, v, i, dc),
        "v_min": float(np.nanmin(v)), "v_max": float(np.nanmax(v)),
        "v_mean_discharge": float(np.nanmean(v[dc])) if dc.any() else np.nan,
        "i_max_charge_A": float(i[ch].max()) if ch.any() else np.nan,
        "i_max_discharge_A": float(-i[dc].min()) if dc.any() else np.nan,
        "charge_time_s": float(t[ch].max() - t[ch].min()) if ch.sum() > 1 else np.nan,
        "discharge_time_s": float(t[dc].max() - t[dc].min()) if dc.sum() > 1 else np.nan,
        "cc_charge_time_s": np.nan,
        "temp_mean_C": np.nan, "temp_max_C": np.nan, "temp_min_C": np.nan,
    }
    if ch.sum() > 1:
        reached = np.where(ch & (v >= v_hi - 0.01))[0]
        start = t[ch].min()
        row["cc_charge_time_s"] = float(t[reached[0]] - start) if reached.size else row["charge_time_s"]
    if temp is not None and np.size(temp) == np.size(v) and np.isfinite(temp).any():
        row.update(temp_mean_C=float(np.nanmean(temp)), temp_max_C=float(np.nanmax(temp)),
                   temp_min_C=float(np.nanmin(temp)))
    return row


# ----------------------------------------------------------------------------- loaders
def load_batterylife(path, source, life_labels):
    d = safe_load(Path(path).read_bytes())
    cell_id = d["cell_id"]
    v_lo, v_hi = d["min_voltage_limit_in_V"], d["max_voltage_limit_in_V"]
    ambient = BATTERYLIFE_AMBIENT.get(source)
    if source == "SNL":
        ambient = float(re.search(r"_(\d+)C_", cell_id).group(1))
    rows, dcurves, ccurves = [], [], []
    for c in d["cycle_data"]:
        t = np.asarray(c["time_in_s"], float)
        v = np.asarray(c["voltage_in_V"], float)
        i = np.asarray(c["current_in_A"], float)
        qc = np.asarray(c["charge_capacity_in_Ah"], float)
        qd = np.asarray(c["discharge_capacity_in_Ah"], float)
        if v.size < 5:
            continue
        temp = None if c.get("temperature_in_C") is None else np.asarray(c["temperature_in_C"], float)
        row = summarise_cycle(t, v, i, qc, qd, temp, v_hi)
        ir = c.get("internal_resistance_in_ohm")
        row.update(cycle_number=int(c["cycle_number"]), ambient_temp_C=ambient,
                   internal_resistance_ohm=float(ir) if ir is not None and np.isscalar(ir) else np.nan)
        rows.append(row)
        dcurves.append(discharge_curve(v, qd, i < -1e-4, v_lo, v_hi))
        ccurves.append(charge_curve(v, qc, i > 1e-4))
    charge_rates = [p["rate_in_C"] for p in d["charge_protocol"] if p.get("rate_in_C")]
    discharge_rates = [p["rate_in_C"] for p in d["discharge_protocol"] if p.get("rate_in_C")]
    meta = {
        "cell_id": cell_id, "source": source,
        "chemistry": CHEMISTRY.get(d["cathode_material"], d["cathode_material"]),
        "cathode": d["cathode_material"], "anode": d["anode_material"], "form_factor": d["form_factor"],
        "nominal_capacity_Ah": float(d["nominal_capacity_in_Ah"]),
        "v_min_limit": v_lo, "v_max_limit": v_hi, "ambient_temp_C": ambient,
        "max_charge_rate_C": max(charge_rates) if charge_rates else np.nan,
        "max_discharge_rate_C": max(discharge_rates) if discharge_rates else np.nan,
        "soc_min": float(d["SOC_interval"][0]), "soc_max": float(d["SOC_interval"][1]),
        "load_profile": "constant/multi-step lab cycling",
        "batterylife_life_cycles": life_labels.get(f"{cell_id}.pkl", np.nan),
    }
    return meta, rows, np.array(dcurves), np.array(ccurves)


def _nasa_impedance(cycles):
    """Re + Rct for each impedance test, keyed by order in the cycle list."""
    out = {}
    for idx, c in enumerate(cycles):
        if c.type == "impedance":
            re_, rct = np.real(c.data.Re), np.real(c.data.Rct)
            if np.isfinite(re_) and np.isfinite(rct):
                out[idx] = float(re_ + rct)
    return out


def load_nasa(path):
    name = Path(path).stem
    cycles = sio.loadmat(path, squeeze_me=True, struct_as_record=False)[name].cycle
    imp = _nasa_impedance(cycles)
    v_lo, v_hi, nominal = 2.0, 4.2, 2.0
    rows, dcurves, ccurves = [], [], []
    last_charge, last_ir, n = None, np.nan, 0
    for idx, c in enumerate(cycles):
        if idx in imp:
            last_ir = imp[idx]
        if c.type == "charge":
            last_charge = c
            continue
        if c.type != "discharge":
            continue
        n += 1
        dd = c.data
        t, v, i = (np.atleast_1d(np.asarray(x, float)) for x in (dd.Time, dd.Voltage_measured, dd.Current_measured))
        temp = np.atleast_1d(np.asarray(dd.Temperature_measured, float))
        qd = np.concatenate([[0.0], np.cumsum(-i[1:] * np.diff(t)) / 3600.0]).clip(min=0)
        if last_charge is not None:
            cd = last_charge.data
            tc, vc, ic = (np.atleast_1d(np.asarray(x, float)) for x in (cd.Time, cd.Voltage_measured, cd.Current_measured))
            tcc = np.atleast_1d(np.asarray(cd.Temperature_measured, float))
            qc = np.concatenate([[0.0], np.cumsum(ic[1:].clip(min=0) * np.diff(tc)) / 3600.0])
        else:
            tc = vc = ic = tcc = qc = np.array([])
        offset = tc.max() + 1 if tc.size else 0.0
        T = np.concatenate([tc, t + offset]); V = np.concatenate([vc, v]); I = np.concatenate([ic, i])
        QC = np.concatenate([qc, np.full(t.size, qc.max() if qc.size else 0.0)])
        QD = np.concatenate([np.zeros(tc.size), qd]); TEMP = np.concatenate([tcc, temp])
        row = summarise_cycle(T, V, I, QC, QD, TEMP, v_hi)
        cap = float(np.real(dd.Capacity)) if np.size(dd.Capacity) else np.nan
        row.update(discharge_capacity_Ah=cap, cycle_number=n, ambient_temp_C=float(c.ambient_temperature),
                   internal_resistance_ohm=last_ir)
        rows.append(row)
        dcurves.append(discharge_curve(v, qd, i < -1e-4, v_lo, v_hi))
        ccurves.append(charge_curve(vc, qc, ic > 1e-4) if qc.size else np.full(N_Q_POINTS, np.nan, np.float32))
    ambients = [r["ambient_temp_C"] for r in rows]
    meta = {
        "cell_id": f"NASA_{name}", "source": "NASA", "chemistry": "unknown", "cathode": "undisclosed",
        "anode": "graphite (assumed)", "form_factor": "cylindrical_18650", "nominal_capacity_Ah": nominal,
        "v_min_limit": v_lo, "v_max_limit": v_hi, "ambient_temp_C": float(np.median(ambients)) if ambients else np.nan,
        "max_charge_rate_C": 1.5 / nominal,
        "max_discharge_rate_C": float(np.nanmax([r["i_max_discharge_A"] for r in rows]) / nominal) if rows else np.nan,
        "soc_min": 0.0, "soc_max": 1.0, "load_profile": "CC or square-wave discharge",
        "batterylife_life_cycles": np.nan,
    }
    return meta, rows, np.array(dcurves), np.array(ccurves)


def load_oxford(path):
    mat = sio.loadmat(path, squeeze_me=True, struct_as_record=False)
    v_lo, v_hi, nominal = 2.7, 4.2, 0.74
    results = []
    for cell in [k for k in mat if k.startswith("Cell")]:
        obj = mat[cell]
        rows, dcurves, ccurves = [], [], []
        for key in obj._fieldnames:
            cyc = getattr(obj, key)
            dc, ch = cyc.C1dc, cyc.C1ch
            td, vd, qd = (np.asarray(x, float) for x in (dc.t, dc.v, dc.q))
            tc, vc, qc = (np.asarray(x, float) for x in (ch.t, ch.v, ch.q))
            td, tc = (td - td[0]) * 86400.0, (tc - tc[0]) * 86400.0  # stored in days
            qd_ah = np.abs(qd - qd[0]) / 1000.0
            qc_ah = np.abs(qc - qc[0]) / 1000.0
            i_d = -np.gradient(qd_ah, td) * 3600.0
            i_c = np.gradient(qc_ah, tc) * 3600.0
            T = np.concatenate([tc, td + tc.max() + 1]); V = np.concatenate([vc, vd]); I = np.concatenate([i_c, i_d])
            QC = np.concatenate([qc_ah, np.full(td.size, qc_ah.max())]); QD = np.concatenate([np.zeros(tc.size), qd_ah])
            TEMP = np.concatenate([np.asarray(ch.T, float), np.asarray(dc.T, float)])
            row = summarise_cycle(T, V, I, QC, QD, TEMP, v_hi)
            row.update(cycle_number=int(key[3:]), ambient_temp_C=40.0, internal_resistance_ohm=np.nan)
            rows.append(row)
            dcurves.append(discharge_curve(vd, qd_ah, np.ones(vd.size, bool), v_lo, v_hi))
            ccurves.append(charge_curve(vc, qc_ah, np.ones(vc.size, bool)))
        meta = {
            "cell_id": f"OXFORD_{cell}", "source": "OXFORD", "chemistry": "LCO/NCO",
            "cathode": "LiCoO2/LiNiCoO2 (Kokam SLPB533459H4)", "anode": "graphite", "form_factor": "pouch",
            "nominal_capacity_Ah": nominal, "v_min_limit": v_lo, "v_max_limit": v_hi, "ambient_temp_C": 40.0,
            "max_charge_rate_C": 2.0, "max_discharge_rate_C": np.nan, "soc_min": 0.0, "soc_max": 1.0,
            "load_profile": "Artemis urban drive cycle (characterised every 100 cycles)",
            "batterylife_life_cycles": np.nan,
        }
        results.append((meta, rows, np.array(dcurves), np.array(ccurves)))
    return results


# ----------------------------------------------------------------------------- labels
def hampel_flags(x, window=21, n_sigma=3.0, noise_floor=0.005):
    """Hampel filter; the MAD is floored at the sensor noise level (0.5 % SOH) so smooth curves are not over-flagged."""
    s = pd.Series(x)
    med = s.rolling(window, center=True, min_periods=1).median()
    dev = (s - med).abs()
    mad = dev.rolling(window, center=True, min_periods=1).median() * 1.4826
    return (dev > n_sigma * np.maximum(mad, noise_floor)).to_numpy()


def knee_cycle(cycle, soh):
    """Kneedle: point of maximum distance above the chord of the (decreasing) SOH curve."""
    if len(cycle) < 20 or soh[0] - soh[-1] < 0.03:
        return np.nan
    x = (cycle - cycle[0]) / (cycle[-1] - cycle[0])
    y = (soh - soh[-1]) / (soh[0] - soh[-1])
    gap = y - (1.0 - x)
    k = int(np.argmax(gap))
    return float(cycle[k]) if gap[k] > 0.05 else np.nan


def add_labels(meta, df):
    df = df.sort_values("cycle_number").reset_index(drop=True)
    df["soh"] = df["discharge_capacity_Ah"] / meta["nominal_capacity_Ah"]
    valid = df["discharge_capacity_Ah"] > 0.05 * meta["nominal_capacity_Ah"]
    df["is_outlier"] = ~valid
    df.loc[valid, "is_outlier"] = hampel_flags(df.loc[valid, "soh"].to_numpy())
    clean = df[~df["is_outlier"]]
    q0 = clean["discharge_capacity_Ah"].head(5).median() if len(clean) else np.nan
    df["soh_vs_initial"] = df["discharge_capacity_Ah"] / q0
    basis = "nominal" if q0 / meta["nominal_capacity_Ah"] >= 0.85 else "initial"
    col = "soh" if basis == "nominal" else "soh_vs_initial"
    clean = df[~df["is_outlier"]]
    smooth = clean.set_index("cycle_number")[col].rolling(5, center=True, min_periods=1).median()
    below = smooth[smooth < EOL_FRACTION]
    eol = float(below.index[0]) if len(below) else np.nan
    eol_source = "measured" if len(below) else "not reached"
    last = float(df["cycle_number"].max())
    label = meta.get("batterylife_life_cycles", np.nan)
    # Cells stopped just above the threshold: adopt BatteryLife's life label (slightly beyond the last cycle).
    if np.isnan(eol) and np.isfinite(label) and len(smooth) and smooth.iloc[-1] < EOL_FRACTION + 0.03:
        eol, eol_source = float(label), "batterylife label (test stopped near 80%)"
    censored = np.isnan(eol)
    df["rul_cycles"] = (eol - df["cycle_number"]) if not censored else np.nan
    df["rul_lower_bound_cycles"] = last - df["cycle_number"]
    df["is_censored"] = censored
    upto = smooth if censored else smooth[smooth.index <= eol]
    meta.update(
        n_cycles=int(len(df)), first_cycle=int(df["cycle_number"].min()), last_cycle=int(last),
        initial_capacity_Ah=float(q0), initial_soh=float(q0 / meta["nominal_capacity_Ah"]),
        final_soh=float(smooth.iloc[-1]) if len(smooth) else np.nan,
        eol_threshold_soh=EOL_FRACTION, eol_basis=basis, eol_cycle=eol, eol_source=eol_source,
        is_censored=bool(censored),
        knee_cycle=knee_cycle(upto.index.to_numpy(float), upto.to_numpy()),
        outlier_fraction=float(df["is_outlier"].mean()), citation=CITATIONS[meta["source"]],
    )
    return meta, df


# ----------------------------------------------------------------------------- driver
def _job(task):
    kind, path, source, labels = task
    if kind == "batterylife":
        return [load_batterylife(path, source, labels)]
    if kind == "nasa":
        return [load_nasa(path)]
    return load_oxford(path)


def build_tasks(root: Path):
    ex = root / "extracted"
    labels_zip = zipfile.ZipFile(root / "raw" / "batterylife_docs" / "Life labels.zip")
    tasks = []
    for source, folder in [("CALCE", "calce/CALCE"), ("SNL", "snl/SNL"), ("HUST", "hust/HUST"), ("MATR", "matr/MATR")]:
        labels = json.loads(labels_zip.read(f"Life labels/{source}_labels.json"))
        for p in sorted((ex / folder).glob("*.pkl")):
            tasks.append(("batterylife", str(p), source, labels))
    seen = set()
    for p in sorted((ex / "nasa").rglob("B*.mat"), key=lambda p: (-len(p.parts), str(p))):
        if p.stem not in seen:
            seen.add(p.stem)
            tasks.append(("nasa", str(p), "NASA", {}))
    tasks.append(("oxford", str(ex / "oxford" / "Oxford_Battery_Degradation_Dataset_1.mat"), "OXFORD", {}))
    return tasks


def main(root: Path, workers: int):
    out = root / "master"
    (out / "curves").mkdir(parents=True, exist_ok=True)
    tasks = build_tasks(root)
    print(f"{len(tasks)} files to process with {workers} workers", flush=True)
    cells, cycles = [], []
    curves = {}
    with ProcessPoolExecutor(max_workers=workers) as pool:
        for k, results in enumerate(pool.map(_job, tasks), 1):
            for meta, rows, dcur, ccur in results:
                if not rows:
                    print(f"  skip {meta['cell_id']} (no cycles)", flush=True)
                    continue
                df = pd.DataFrame(rows)
                order = np.argsort(df["cycle_number"].to_numpy(), kind="stable")
                meta, df = add_labels(meta, df)
                df.insert(0, "cell_id", meta["cell_id"])
                df.insert(1, "source", meta["source"])
                cells.append(meta)
                cycles.append(df)
                bucket = curves.setdefault(meta["source"], {"cell_id": [], "cycle_number": [], "dq_v": [], "v_q": []})
                bucket["cell_id"] += [meta["cell_id"]] * len(df)
                bucket["cycle_number"].append(df["cycle_number"].to_numpy())
                bucket["dq_v"].append(dcur[order])
                bucket["v_q"].append(ccur[order])
            print(f"[{k}/{len(tasks)}] {Path(tasks[k - 1][1]).name}", flush=True)

    write_outputs(out, pd.DataFrame(cells), pd.concat(cycles, ignore_index=True))
    for source, b in curves.items():
        np.savez_compressed(
            out / "curves" / f"{source}.npz",
            cell_id=np.array(b["cell_id"]), cycle_number=np.concatenate(b["cycle_number"]),
            discharge_q_at_v=np.concatenate(b["dq_v"]).astype(np.float32),
            charge_v_at_q=np.concatenate(b["v_q"]).astype(np.float32),
            q_grid=Q_GRID.astype(np.float32),
        )
    print("MASTER DONE", flush=True)


LABEL_COLUMNS = ["soh", "is_outlier", "soh_vs_initial", "rul_cycles", "rul_lower_bound_cycles", "is_censored"]
META_LABELS = ["n_cycles", "first_cycle", "last_cycle", "initial_capacity_Ah", "initial_soh", "final_soh",
               "eol_threshold_soh", "eol_basis", "eol_cycle", "eol_source", "is_censored", "knee_cycle",
               "outlier_fraction", "citation"]


def relabel(root: Path):
    """Recompute life labels from the saved master tables (seconds, no raw re-read)."""
    out = root / "master"
    cells_df = pd.read_parquet(out / "cells.parquet")
    cycles_df = pd.read_parquet(out / "cycles.parquet")
    cells, cycles = [], []
    for meta in cells_df.drop(columns=[c for c in META_LABELS if c in cells_df]).to_dict("records"):
        df = cycles_df[cycles_df["cell_id"] == meta["cell_id"]].drop(columns=LABEL_COLUMNS + ["cell_id", "source"])
        meta, df = add_labels(meta, df)
        df.insert(0, "cell_id", meta["cell_id"])
        df.insert(1, "source", meta["source"])
        cells.append(meta)
        cycles.append(df)
    write_outputs(out, pd.DataFrame(cells), pd.concat(cycles, ignore_index=True))
    print("RELABEL DONE", flush=True)


def write_outputs(out: Path, cells_df: pd.DataFrame, cycles_df: pd.DataFrame):
    cells_df.to_parquet(out / "cells.parquet", index=False)
    cycles_df.to_parquet(out / "cycles.parquet", index=False)
    cells_df.to_csv(out / "cells.csv", index=False)
    summary = cells_df.groupby("source").agg(
        cells=("cell_id", "count"), chemistries=("chemistry", lambda s: ", ".join(sorted(set(s)))),
        cycles=("n_cycles", "sum"), censored=("is_censored", "sum"),
        median_eol=("eol_cycle", "median"), with_knee=("knee_cycle", lambda s: int(s.notna().sum())),
    )
    print("\n" + summary.to_string(), flush=True)
    print(f"\nTOTAL cells={len(cells_df)} cycles={len(cycles_df)}", flush=True)


if __name__ == "__main__":
    if "--relabel" in sys.argv:
        relabel(Path(sys.argv[1]))
    else:
        main(Path(sys.argv[1]), int(sys.argv[2]) if len(sys.argv) > 2 else 2)
