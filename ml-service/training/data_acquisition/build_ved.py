"""Build the VED EV/PHEV trip-energy tables for the range model (M5).

  master/ved_ev_timeseries.parquet  samples from the 27 EV/PHEV vehicles only
  master/ved_ev_trips.parquet       one row per trip: distance, energy, Wh/km, climate, AC/heater

Usage: python -I build_ved.py "C:/Users/abhis/Documents/Ai ev/datasets"
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

COLUMNS = {
    "DayNum": "day_num", "VehId": "veh_id", "Trip": "trip", "Timestamp(ms)": "t_ms",
    "Latitude[deg]": "lat", "Longitude[deg]": "lon", "Vehicle Speed[km/h]": "speed_kmh",
    "OAT[DegC]": "outside_temp_C", "Fuel Rate[L/hr]": "fuel_rate_lph",
    "Air Conditioning Power[kW]": "ac_power_kw", "Air Conditioning Power[Watts]": "ac_power_w",
    "Heater Power[Watts]": "heater_power_w", "HV Battery Current[A]": "hv_current_A",
    "HV Battery SOC[%]": "hv_soc_pct", "HV Battery Voltage[V]": "hv_voltage_V",
}


def summarise_trip(g: pd.DataFrame) -> pd.Series:
    g = g.sort_values("t_ms")
    dt = np.diff(g["t_ms"].to_numpy(), prepend=g["t_ms"].iloc[0]) / 1000.0
    dt = np.clip(dt, 0, 5)
    speed = g["speed_kmh"].fillna(0).to_numpy()
    power_kw = -(g["hv_voltage_V"] * g["hv_current_A"]).to_numpy() / 1000.0  # VED: discharge current < 0
    have_hv = np.isfinite(power_kw)
    p = np.where(have_hv, power_kw, 0.0)
    distance_km = float(np.sum(speed * dt) / 3600.0)
    energy_out = float(np.sum(np.clip(p, 0, None) * dt) / 3600.0)
    energy_regen = float(np.sum(np.clip(-p, 0, None) * dt) / 3600.0)
    fuel_l = float(np.nansum(g["fuel_rate_lph"].fillna(0).to_numpy() * dt) / 3600.0)
    soc = g["hv_soc_pct"].dropna()
    ac_kw = g["ac_power_kw"].fillna(g["ac_power_w"] / 1000.0)
    net = energy_out - energy_regen
    return pd.Series({
        "duration_s": float(dt.sum()), "distance_km": distance_km,
        "mean_speed_kmh": float(speed.mean()), "max_speed_kmh": float(speed.max()),
        "idle_fraction": float((speed < 1).mean()),
        "outside_temp_C": float(g["outside_temp_C"].mean()),
        "ac_power_kw_mean": float(ac_kw.mean()), "heater_power_kw_mean": float(g["heater_power_w"].mean() / 1000.0),
        "hv_energy_out_kwh": energy_out, "hv_energy_regen_kwh": energy_regen, "hv_energy_net_kwh": net,
        "wh_per_km": net * 1000.0 / distance_km if distance_km > 0.5 else np.nan,
        "soc_start_pct": float(soc.iloc[0]) if len(soc) else np.nan,
        "soc_end_pct": float(soc.iloc[-1]) if len(soc) else np.nan,
        "fuel_used_l": fuel_l, "electric_only": bool(fuel_l < 0.01),
        "hv_coverage": float(have_hv.mean()), "n_samples": int(len(g)),
    })


def main(root: Path) -> None:
    src, out = root / "extracted" / "ved", root / "master"
    out.mkdir(parents=True, exist_ok=True)
    static = pd.read_excel(src / "VED_Static_Data_PHEV&EV.xlsx").rename(columns={
        "VehId": "veh_id", "EngineType": "engine_type", "Vehicle Class": "vehicle_class",
        "Generalized_Weight": "weight_lb"})[["veh_id", "engine_type", "vehicle_class", "weight_lb"]]
    ev_ids = set(static["veh_id"])
    parts = []
    files = sorted(src.glob("VED_*_week.csv"))
    for k, f in enumerate(files, 1):
        df = pd.read_csv(f, usecols=list(COLUMNS)).rename(columns=COLUMNS)
        df = df[df["veh_id"].isin(ev_ids)]
        parts.append(df)
        print(f"[{k}/{len(files)}] {f.name}: {len(df):,} EV/PHEV rows", flush=True)
    ts = pd.concat(parts, ignore_index=True)
    ts.to_parquet(out / "ved_ev_timeseries.parquet", index=False)
    trips = ts.groupby(["veh_id", "trip"]).apply(summarise_trip, include_groups=False).reset_index()
    trips = trips.merge(static, on="veh_id", how="left")
    trips.to_parquet(out / "ved_ev_trips.parquet", index=False)
    ok = trips[trips["wh_per_km"].between(20, 600)]
    print(f"\nEV/PHEV samples={len(ts):,} trips={len(trips):,} usable trips (20-600 Wh/km)={len(ok):,}")
    print(ok.groupby("engine_type")[["distance_km", "wh_per_km", "outside_temp_C"]].median().round(1).to_string())
    print("VED DONE", flush=True)


if __name__ == "__main__":
    main(Path(sys.argv[1]))
