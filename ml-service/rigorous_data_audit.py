import os
import json
import pandas as pd
import numpy as np

OUTPUT_DIR = r"d:\EVFINAL\ml-service"

# ==========================================
# 1. AUDIT MASTER_DATASET_CLEAN.CSV
# ==========================================
print("--- AUDITING MASTER_DATASET_CLEAN.CSV ---", flush=True)
master_df = pd.read_csv(r"d:\EVFINAL\master_dataset_clean.csv")
print(f"Master rows: {len(master_df):,}, columns: {len(master_df.columns)}", flush=True)

master_audit = {
    "file": "master_dataset.csv (clean valid portion)",
    "total_rows": int(len(master_df)),
    "total_columns": int(len(master_df.columns)),
    "columns": master_df.columns.tolist(),
    "sources": master_df['source'].value_counts(dropna=False).to_dict() if 'source' in master_df.columns else {},
    "chemistries": master_df['chemistry'].value_counts(dropna=False).to_dict() if 'chemistry' in master_df.columns else {},
    "form_factors": master_df['form_factor'].value_counts(dropna=False).to_dict() if 'form_factor' in master_df.columns else {},
    "unique_cells": int(master_df['cell_id'].nunique()) if 'cell_id' in master_df.columns else 0,
    "cells_list": master_df['cell_id'].unique().tolist() if 'cell_id' in master_df.columns else [],
    "records_per_cell": master_df['cell_id'].value_counts().to_dict() if 'cell_id' in master_df.columns else {},
    "missing_counts": master_df.isnull().sum().to_dict(),
    "missing_percentages": (master_df.isnull().mean() * 100).round(2).to_dict(),
}

# Key column statistics
key_cols = [
    'target_soh', 'target_soh_vs_initial', 'target_rul_cycles', 'target_cycles_to_knee',
    'cycle_number', 'nominal_capacity_Ah', 'discharge_capacity_Ah', 'charge_capacity_Ah',
    'ambient_temp_C', 'c_rate_charge', 'c_rate_discharge', 'ir_ohm', 'ir_growth', 'v_mean_discharge'
]
col_stats = {}
for c in key_cols:
    if c in master_df.columns:
        s = master_df[c]
        col_stats[c] = {
            "count": int(s.count()),
            "nulls": int(s.isnull().sum()),
            "mean": float(round(s.mean(), 5)) if s.count() > 0 else None,
            "std": float(round(s.std(), 5)) if s.count() > 0 else None,
            "min": float(round(s.min(), 5)) if s.count() > 0 else None,
            "p25": float(round(s.quantile(0.25), 5)) if s.count() > 0 else None,
            "median": float(round(s.median(), 5)) if s.count() > 0 else None,
            "p75": float(round(s.quantile(0.75), 5)) if s.count() > 0 else None,
            "max": float(round(s.max(), 5)) if s.count() > 0 else None,
        }
master_audit["key_column_stats"] = col_stats

# Check negative RUL or Knee values
if 'target_rul_cycles' in master_df.columns:
    neg_rul = master_df[master_df['target_rul_cycles'] < 0]
    master_audit["negative_rul_count"] = int(len(neg_rul))
    master_audit["negative_rul_min"] = float(neg_rul['target_rul_cycles'].min()) if len(neg_rul) > 0 else None

if 'target_cycles_to_knee' in master_df.columns:
    neg_knee = master_df[master_df['target_cycles_to_knee'] < 0]
    master_audit["negative_knee_count"] = int(len(neg_knee))
    master_audit["negative_knee_min"] = float(neg_knee['target_cycles_to_knee'].min()) if len(neg_knee) > 0 else None

# Save master audit JSON
with open(os.path.join(OUTPUT_DIR, "master_dataset_audit.json"), "w", encoding="utf-8") as f:
    json.dump(master_audit, f, indent=2)

print("Saved master_dataset_audit.json", flush=True)

# ==========================================
# 2. AUDIT EV_BATTERY_HEALTH.CSV
# ==========================================
print("\n--- AUDITING EV_BATTERY_HEALTH.CSV ---", flush=True)
fleet_df = pd.read_csv(r"d:\EVFINAL\ev_battery_health.csv")
print(f"Fleet rows: {len(fleet_df):,}, columns: {len(fleet_df.columns)}", flush=True)

fleet_audit = {
    "file": "ev_battery_health.csv",
    "total_rows": int(len(fleet_df)),
    "total_columns": int(len(fleet_df.columns)),
    "columns": fleet_df.columns.tolist(),
    "chemistries": fleet_df['chemistry'].value_counts(dropna=False).to_dict() if 'chemistry' in fleet_df.columns else {},
    "failure_risk_counts": fleet_df['failure_risk_label'].value_counts(dropna=False).to_dict() if 'failure_risk_label' in fleet_df.columns else {},
    "missing_counts": fleet_df.isnull().sum().to_dict(),
    "missing_percentages": (fleet_df.isnull().mean() * 100).round(2).to_dict(),
}

fleet_key_cols = [
    'state_of_health_pct', 'remaining_useful_life_cycles', 'cycle_count',
    'internal_resistance_mohm', 'total_energy_throughput_kwh', 'battery_age_days',
    'pack_capacity_kwh', 'avg_charging_power_kw', 'fast_charge_ratio',
    'voltage_avg_v', 'current_avg_a'
]
fleet_stats = {}
for c in fleet_key_cols:
    if c in fleet_df.columns:
        s = fleet_df[c]
        fleet_stats[c] = {
            "count": int(s.count()),
            "nulls": int(s.isnull().sum()),
            "mean": float(round(s.mean(), 4)) if s.count() > 0 else None,
            "std": float(round(s.std(), 4)) if s.count() > 0 else None,
            "min": float(round(s.min(), 4)) if s.count() > 0 else None,
            "median": float(round(s.median(), 4)) if s.count() > 0 else None,
            "max": float(round(s.max(), 4)) if s.count() > 0 else None,
        }
fleet_audit["key_column_stats"] = fleet_stats

with open(os.path.join(OUTPUT_DIR, "fleet_dataset_audit.json"), "w", encoding="utf-8") as f:
    json.dump(fleet_audit, f, indent=2)

print("Saved fleet_dataset_audit.json", flush=True)
print("Data audit complete!", flush=True)
