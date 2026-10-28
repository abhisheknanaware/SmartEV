"""Stage 3: build the cycle-level feature table from the master dataset.

Every feature uses only the current and earlier cycles of the same cell (causal), so it can be used
for real-time prediction without leaking the future. History features of SOH are lagged by one cycle,
so the current SOH (the M1 target) never appears in its own inputs. Targets are prefixed `target_`.

  master/features.parquet           one row per clean cell x cycle (outliers removed)
  master/feature_dictionary.csv     name, group, description

Usage: python -I build_features.py "C:/Users/abhis/Documents/Ai ev/datasets"
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.signal import savgol_filter

EA_J_PER_MOL = 31_500.0          # capacity-fade activation energy (Wang et al., J. Power Sources 2011)
R_GAS, T_REF_K = 8.314, 298.15
PARTIAL_WINDOW_V = {"LFP": (3.35, 3.55)}   # LFP charge plateau; all other chemistries use 3.8-4.1 V
DEFAULT_WINDOW_V = (3.80, 4.10)
DQ_REF_CYCLE_INDEX = 9           # Severson-style reference: the 10th clean cycle

DICTIONARY = [
    ("cycle_number", "F1 operational", "Cycle index"),
    ("sqrt_cycle", "F6 physics", "sqrt(cycle): calendar/SEI-growth time scale"),
    ("efc", "F1 operational", "Equivalent full cycles = cumulative discharged Ah / rated Ah"),
    ("cum_throughput_Ah", "F1 operational", "Cumulative discharged Ah"),
    ("cum_energy_kWh", "F1 operational", "Cumulative discharged energy"),
    ("ambient_temp_C", "F1 operational", "Chamber / ambient temperature"),
    ("dod", "F1 operational", "Depth-of-discharge window (soc_max - soc_min)"),
    ("c_rate_charge", "F1 operational", "Observed peak charge current / rated Ah"),
    ("c_rate_discharge", "F1 operational", "Observed peak discharge current / rated Ah"),
    ("coulombic_eff", "F1 operational", "Discharged Ah / charged Ah"),
    ("energy_eff", "F1 operational", "Discharged Wh / charged Wh"),
    ("v_mean_discharge", "F1 operational", "Mean discharge voltage"),
    ("charge_time_s", "F1 operational", "Charge duration"),
    ("cc_fraction", "Field", "Constant-current share of charge time (falls as the taper starts earlier)"),
    ("discharge_time_s", "F1 operational", "Discharge duration"),
    ("temp_mean_C", "F1 operational", "Mean cell temperature in the cycle"),
    ("temp_rise_C", "F1 operational", "Peak cell temperature minus ambient"),
    ("ir_ohm", "Field", "Internal resistance (MATR per cycle, NASA Re+Rct from EIS)"),
    ("ir_growth", "Field", "Internal resistance relative to the cell's first value"),
    ("pc_window_Ah", "F2 partial charge", "Ah charged inside the chemistry voltage window (LFP 3.35-3.55 V, else 3.8-4.1 V)"),
    ("pc_window_frac", "F2 partial charge", "Share of the charge delivered inside that window"),
    ("v_at_q10", "F2 partial charge", "Charge voltage at 10 % of charged capacity"),
    ("v_at_q50", "F2 partial charge", "Charge voltage at 50 % of charged capacity"),
    ("v_at_q90", "F2 partial charge", "Charge voltage at 90 % of charged capacity"),
    ("ic_peak_height", "F3 IC/DV", "Max incremental capacity -dQ/dV on discharge (Ah/V)"),
    ("ic_peak_voltage", "F3 IC/DV", "Voltage of that IC peak"),
    ("ic_peak_shift", "F3 IC/DV", "IC peak voltage minus its value at the reference cycle"),
    ("dq_var_log", "F4 dQ(V)", "log10 variance of Q(V) - Q_ref(V) vs the 10th clean cycle (Severson 2019)"),
    ("dq_min", "F4 dQ(V)", "Minimum of Q(V) - Q_ref(V)"),
    ("dq_mean", "F4 dQ(V)", "Mean of Q(V) - Q_ref(V)"),
    ("hist_soh_prev", "F5 trends", "SOH of the previous clean cycle"),
    ("hist_soh_slope_10", "F5 trends", "SOH slope per cycle over the previous 10 clean cycles"),
    ("hist_soh_slope_50", "F5 trends", "SOH slope per cycle over the previous 50 clean cycles"),
    ("hist_soh_ewm", "F5 trends", "Exponentially weighted SOH of previous cycles (alpha 0.1)"),
    ("hist_soh_drop", "F5 trends", "Initial SOH minus previous-cycle SOH"),
    ("ir_slope_20", "F5 trends", "Internal-resistance slope over the last 20 cycles"),
    ("charge_time_slope_20", "F5 trends", "Charge-time slope over the last 20 cycles"),
    ("arrhenius_factor", "F6 physics", "exp(Ea/R (1/Tref - 1/T)) with Ea = 31.5 kJ/mol"),
    ("cum_arrhenius_efc", "F6 physics", "Temperature-weighted equivalent full cycles"),
    ("cum_plating_stress", "F6 physics", "Cumulative lithium-plating stress: max(0, C_charge - 1) x exp((15 - T)/10)"),
    ("ir_x_temp", "F7 interactions", "Internal resistance x cell temperature"),
    ("crate_x_dod", "F7 interactions", "Charge C-rate x depth of discharge"),
    ("fastcharge_x_temp", "F7 interactions", "Charge C-rate x peak cell temperature"),
]


def rolling_slope(y: pd.Series, x: pd.Series, window: int) -> pd.Series:
    cov = x.rolling(window, min_periods=max(3, window // 2)).cov(y)
    var = x.rolling(window, min_periods=max(3, window // 2)).var()
    return cov / var


def fill_rows(a: np.ndarray) -> np.ndarray:
    return pd.DataFrame(a).ffill(axis=1).bfill(axis=1).to_numpy()


def ic_features(dq_v: np.ndarray, v_hi: float, v_lo: float):
    grid = np.linspace(v_hi, v_lo, dq_v.shape[1])
    valid = np.isfinite(dq_v)
    smooth = savgol_filter(np.nan_to_num(fill_rows(dq_v)), 9, 3, axis=1)
    ic = -np.gradient(smooth, grid, axis=1)
    ic[~valid] = np.nan
    ok = valid.sum(axis=1) >= 10
    height = np.where(ok, np.nanmax(np.where(np.isfinite(ic), ic, -np.inf), axis=1), np.nan)
    idx = np.argmax(np.where(np.isfinite(ic), ic, -np.inf), axis=1)
    return height, np.where(ok, grid[idx], np.nan)


def dq_features(dq_v: np.ndarray):
    n = dq_v.shape[0]
    out = np.full((n, 3), np.nan)
    if n <= DQ_REF_CYCLE_INDEX:
        return out, DQ_REF_CYCLE_INDEX
    diff = dq_v - dq_v[DQ_REF_CYCLE_INDEX]
    diff[: DQ_REF_CYCLE_INDEX] = np.nan
    finite = np.isfinite(diff).sum(axis=1) >= 10
    with np.errstate(all="ignore"):
        out[:, 0] = np.where(finite, np.log10(np.nanvar(diff, axis=1) + 1e-12), np.nan)
        out[:, 1] = np.where(finite, np.nanmin(diff, axis=1), np.nan)
        out[:, 2] = np.where(finite, np.nanmean(diff, axis=1), np.nan)
    return out, DQ_REF_CYCLE_INDEX


def partial_charge(v_q: np.ndarray, q_grid: np.ndarray, qc: np.ndarray, window):
    lo, hi = window
    n = v_q.shape[0]
    frac = np.full(n, np.nan)
    for k in range(n):
        v = v_q[k]
        if not np.isfinite(v).all():
            continue
        v = np.maximum.accumulate(v)
        if v[0] > lo or v[-1] < hi:
            continue
        frac[k] = np.interp(hi, v, q_grid) - np.interp(lo, v, q_grid)
    return frac * qc, frac


def cell_features(meta: pd.Series, cyc: pd.DataFrame, dq_v: np.ndarray, v_q: np.ndarray, q_grid: np.ndarray):
    nominal = meta["nominal_capacity_Ah"]
    f = pd.DataFrame({"cell_id": meta["cell_id"], "source": meta["source"], "chemistry": meta["chemistry"],
                      "cycle_number": cyc["cycle_number"].to_numpy()})
    x = cyc["cycle_number"].astype(float).reset_index(drop=True)
    qd = cyc["discharge_capacity_Ah"].reset_index(drop=True)
    temp = cyc["temp_mean_C"].fillna(cyc["ambient_temp_C"]).reset_index(drop=True)
    temp_max = cyc["temp_max_C"].fillna(cyc["ambient_temp_C"]).reset_index(drop=True)
    ir = cyc["internal_resistance_ohm"].reset_index(drop=True)
    ir = ir.where(ir > 0)  # MATR stores 0 as a placeholder in early cycles
    soh = cyc["soh"].reset_index(drop=True)

    f["sqrt_cycle"] = np.sqrt(x)
    f["cum_throughput_Ah"] = qd.cumsum()
    f["efc"] = f["cum_throughput_Ah"] / nominal
    f["cum_energy_kWh"] = cyc["discharge_energy_Wh"].fillna(0).cumsum().to_numpy() / 1000.0
    f["ambient_temp_C"] = cyc["ambient_temp_C"].to_numpy()
    f["dod"] = meta["soc_max"] - meta["soc_min"]
    f["c_rate_charge"] = cyc["i_max_charge_A"].to_numpy() / nominal
    f["c_rate_discharge"] = cyc["i_max_discharge_A"].to_numpy() / nominal
    f["coulombic_eff"] = (cyc["discharge_capacity_Ah"] / cyc["charge_capacity_Ah"]).clip(0, 1.2).to_numpy()
    f["energy_eff"] = (cyc["discharge_energy_Wh"] / cyc["charge_energy_Wh"]).clip(0, 1.2).to_numpy()
    f["v_mean_discharge"] = cyc["v_mean_discharge"].to_numpy()
    f["charge_time_s"] = cyc["charge_time_s"].to_numpy()
    f["cc_fraction"] = (cyc["cc_charge_time_s"] / cyc["charge_time_s"]).clip(0, 1).to_numpy()
    f["discharge_time_s"] = cyc["discharge_time_s"].to_numpy()
    f["temp_mean_C"] = temp.to_numpy()
    f["temp_rise_C"] = (temp_max - cyc["ambient_temp_C"].reset_index(drop=True)).to_numpy()
    f["ir_ohm"] = ir.to_numpy()
    first_ir = ir.dropna().iloc[0] if ir.notna().any() else np.nan
    f["ir_growth"] = (ir / first_ir).to_numpy()

    window = PARTIAL_WINDOW_V.get(meta["chemistry"], DEFAULT_WINDOW_V)
    f["pc_window_Ah"], f["pc_window_frac"] = partial_charge(v_q, q_grid, cyc["charge_capacity_Ah"].to_numpy(), window)
    for name, q in (("v_at_q10", 0.1), ("v_at_q50", 0.5), ("v_at_q90", 0.9)):
        f[name] = v_q[:, int(round(q * (len(q_grid) - 1)))]

    height, peak_v = ic_features(dq_v, meta["v_max_limit"], meta["v_min_limit"])
    f["ic_peak_height"], f["ic_peak_voltage"] = height, peak_v
    dq, ref = dq_features(dq_v)
    f["ic_peak_shift"] = peak_v - peak_v[ref] if len(peak_v) > ref else np.nan
    f["dq_var_log"], f["dq_min"], f["dq_mean"] = dq[:, 0], dq[:, 1], dq[:, 2]

    prev = soh.shift(1)
    f["hist_soh_prev"] = prev.to_numpy()
    f["hist_soh_slope_10"] = rolling_slope(prev, x, 10).to_numpy()
    f["hist_soh_slope_50"] = rolling_slope(prev, x, 50).to_numpy()
    f["hist_soh_ewm"] = prev.ewm(alpha=0.1).mean().to_numpy()
    f["hist_soh_drop"] = (soh.iloc[0] - prev).to_numpy()
    f["ir_slope_20"] = rolling_slope(ir.ffill(), x, 20).to_numpy()
    f["charge_time_slope_20"] = rolling_slope(cyc["charge_time_s"].reset_index(drop=True), x, 20).to_numpy()

    t_k = temp + 273.15
    f["arrhenius_factor"] = np.exp(EA_J_PER_MOL / R_GAS * (1.0 / T_REF_K - 1.0 / t_k)).to_numpy()
    f["cum_arrhenius_efc"] = (f["arrhenius_factor"] * qd / nominal).cumsum()
    plating = np.clip(f["c_rate_charge"] - 1.0, 0, None) * np.exp((15.0 - temp) / 10.0)
    f["cum_plating_stress"] = plating.fillna(0).cumsum()
    f["ir_x_temp"] = f["ir_ohm"] * f["temp_mean_C"]
    f["crate_x_dod"] = f["c_rate_charge"] * f["dod"]
    f["fastcharge_x_temp"] = f["c_rate_charge"] * temp_max.to_numpy()

    f["target_soh"] = soh.to_numpy()
    f["target_soh_vs_initial"] = cyc["soh_vs_initial"].to_numpy()
    f["target_rul_cycles"] = cyc["rul_cycles"].to_numpy()
    f["target_rul_lower_bound"] = cyc["rul_lower_bound_cycles"].to_numpy()
    f["target_is_censored"] = cyc["is_censored"].to_numpy()
    f["target_cycles_to_knee"] = meta["knee_cycle"] - x.to_numpy()
    f["target_past_knee"] = (x >= meta["knee_cycle"]).to_numpy() if np.isfinite(meta["knee_cycle"]) else False
    return f


def main(root: Path) -> None:
    out = root / "master"
    cells = pd.read_parquet(out / "cells.parquet").set_index("cell_id")
    cycles = pd.read_parquet(out / "cycles.parquet")
    parts = []
    for source in sorted(cycles["source"].unique()):
        z = np.load(out / "curves" / f"{source}.npz")
        key = pd.DataFrame({"cell_id": z["cell_id"], "cycle_number": z["cycle_number"]})
        key["row"] = np.arange(len(key))
        src = cycles[(cycles["source"] == source) & ~cycles["is_outlier"]].merge(key, on=["cell_id", "cycle_number"])
        for cell_id, cyc in src.groupby("cell_id", sort=False):
            cyc = cyc.sort_values("cycle_number")
            rows = cyc["row"].to_numpy()
            meta = cells.loc[cell_id].copy()
            meta["cell_id"] = cell_id
            parts.append(cell_features(meta, cyc, z["discharge_q_at_v"][rows], z["charge_v_at_q"][rows], z["q_grid"]))
        print(f"{source}: {src['cell_id'].nunique()} cells, {len(src):,} clean cycles", flush=True)
    feats = pd.concat(parts, ignore_index=True)
    feats.to_parquet(out / "features.parquet", index=False)
    pd.DataFrame(DICTIONARY, columns=["feature", "group", "description"]).to_csv(out / "feature_dictionary.csv", index=False)
    cover = feats[[d[0] for d in DICTIONARY]].notna().mean().mul(100).round(1)
    print(f"\nfeatures.parquet: {len(feats):,} rows x {feats.shape[1]} columns")
    print("feature coverage (% non-missing):\n" + cover.to_string())
    print("FEATURES DONE", flush=True)


if __name__ == "__main__":
    main(Path(sys.argv[1]))
