import os
import sys
import json
import pandas as pd
import numpy as np

print("=== STARTING COMPREHENSIVE GROUND-TRUTH AUDIT ===", flush=True)

ROOT_DIR = r"d:\EVFINAL"
OUTPUT_DIR = os.path.join(ROOT_DIR, "ml-service")

# 1. EV FLEET DATASET AUDIT
print("\n[1/3] Auditing ev_battery_health.csv...", flush=True)
fleet_path = os.path.join(ROOT_DIR, "ev_battery_health.csv")
fleet_size = os.path.getsize(fleet_path)
fleet_df = pd.read_csv(fleet_path)

fleet_audit = {
    "file_name": "ev_battery_health.csv",
    "file_size_bytes": fleet_size,
    "file_size_mb": round(fleet_size / (1024 * 1024), 2),
    "total_rows": len(fleet_df),
    "total_columns": len(fleet_df.columns),
    "columns": fleet_df.columns.tolist(),
    "chemistry_distribution": fleet_df['chemistry'].value_counts(dropna=False).to_dict() if 'chemistry' in fleet_df.columns else {},
    "failure_risk_distribution": fleet_df['failure_risk_label'].value_counts(dropna=False).to_dict() if 'failure_risk_label' in fleet_df.columns else {},
    "missing_counts": {k: int(v) for k, v in fleet_df.isnull().sum().items()},
    "missing_percentages": {k: float(round(v * 100, 2)) for k, v in fleet_df.isnull().mean().items()},
    "numeric_stats": {}
}

for col in ['state_of_health_pct', 'remaining_useful_life_cycles', 'cycle_count', 'internal_resistance_mohm', 'total_energy_throughput_kwh', 'voltage_avg_v', 'current_avg_a']:
    if col in fleet_df.columns:
        s = fleet_df[col].dropna()
        fleet_audit["numeric_stats"][col] = {
            "count": int(len(s)),
            "mean": float(round(s.mean(), 4)),
            "std": float(round(s.std(), 4)),
            "min": float(round(s.min(), 4)),
            "p25": float(round(s.quantile(0.25), 4)),
            "median": float(round(s.median(), 4)),
            "p75": float(round(s.quantile(0.75), 4)),
            "max": float(round(s.max(), 4))
        }

print(f"  Fleet rows: {len(fleet_df):,}, cols: {len(fleet_df.columns)}")
print(f"  Chemistries: {fleet_audit['chemistry_distribution']}")
print(f"  SOH mean: {fleet_audit['numeric_stats']['state_of_health_pct']['mean']}%, min: {fleet_audit['numeric_stats']['state_of_health_pct']['min']}%, max: {fleet_audit['numeric_stats']['state_of_health_pct']['max']}%", flush=True)

# 2. MASTER DATASET AUDIT (CALCE VALID TEXT PORTION)
print("\n[2/3] Auditing master_dataset.csv...", flush=True)
master_path = os.path.join(ROOT_DIR, "master_dataset.csv")
master_size = os.path.getsize(master_path)
master_df = pd.read_csv(master_path, nrows=10600, engine='python')

master_audit = {
    "file_name": "master_dataset.csv",
    "file_size_bytes": master_size,
    "file_size_mb": round(master_size / (1024 * 1024), 2),
    "valid_text_rows": len(master_df),
    "total_columns": len(master_df.columns),
    "columns": master_df.columns.tolist(),
    "sources": master_df['source'].value_counts(dropna=False).to_dict() if 'source' in master_df.columns else {},
    "chemistries": master_df['chemistry'].value_counts(dropna=False).to_dict() if 'chemistry' in master_df.columns else {},
    "form_factors": master_df['form_factor'].value_counts(dropna=False).to_dict() if 'form_factor' in master_df.columns else {},
    "unique_cells_count": int(master_df['cell_id'].nunique()) if 'cell_id' in master_df.columns else 0,
    "cells": master_df['cell_id'].unique().tolist() if 'cell_id' in master_df.columns else [],
    "records_per_cell": {str(k): int(v) for k, v in master_df['cell_id'].value_counts().items()} if 'cell_id' in master_df.columns else {},
    "missing_counts": {k: int(v) for k, v in master_df.isnull().sum().items()},
    "missing_percentages": {k: float(round(v * 100, 2)) for k, v in master_df.isnull().mean().items()},
    "numeric_stats": {}
}

# Per-cell details
cell_details = {}
for cell_id, group in master_df.groupby('cell_id'):
    cell_details[str(cell_id)] = {
        "records": int(len(group)),
        "min_cycle": int(group['cycle_number'].min()),
        "max_cycle": int(group['cycle_number'].max()),
        "nominal_capacity_Ah": float(group['nominal_capacity_Ah'].iloc[0]) if 'nominal_capacity_Ah' in group.columns else None,
        "initial_soh": float(round(group['target_soh'].iloc[0] * 100, 2)) if 'target_soh' in group.columns else None,
        "final_soh": float(round(group['target_soh'].iloc[-1] * 100, 2)) if 'target_soh' in group.columns else None,
        "min_soh": float(round(group['target_soh'].min() * 100, 2)) if 'target_soh' in group.columns else None,
        "max_soh": float(round(group['target_soh'].max() * 100, 2)) if 'target_soh' in group.columns else None,
    }
master_audit["cell_details"] = cell_details

for col in ['target_soh', 'target_soh_vs_initial', 'target_rul_cycles', 'target_cycles_to_knee',
            'cycle_number', 'nominal_capacity_Ah', 'discharge_capacity_Ah', 'charge_capacity_Ah',
            'ambient_temp_C', 'c_rate_charge', 'c_rate_discharge', 'ir_ohm', 'v_mean_discharge']:
    if col in master_df.columns:
        s = master_df[col].dropna()
        if len(s) > 0:
            master_audit["numeric_stats"][col] = {
                "count": int(len(s)),
                "nulls": int(master_df[col].isnull().sum()),
                "null_pct": float(round(master_df[col].isnull().mean() * 100, 2)),
                "mean": float(round(s.mean(), 5)),
                "std": float(round(s.std(), 5)),
                "min": float(round(s.min(), 5)),
                "p25": float(round(s.quantile(0.25), 5)),
                "median": float(round(s.median(), 5)),
                "p75": float(round(s.quantile(0.75), 5)),
                "max": float(round(s.max(), 5))
            }
        else:
            master_audit["numeric_stats"][col] = {
                "count": 0,
                "nulls": int(len(master_df)),
                "null_pct": 100.0,
                "note": "100% missing values"
            }

# Negative targets check
if 'target_rul_cycles' in master_df.columns:
    neg_rul = master_df[master_df['target_rul_cycles'] < 0]
    master_audit["negative_rul_count"] = int(len(neg_rul))
    master_audit["negative_rul_min"] = float(neg_rul['target_rul_cycles'].min()) if len(neg_rul) > 0 else 0

if 'target_cycles_to_knee' in master_df.columns:
    neg_knee = master_df[master_df['target_cycles_to_knee'] < 0]
    master_audit["negative_knee_count"] = int(len(neg_knee))
    master_audit["negative_knee_min"] = float(neg_knee['target_cycles_to_knee'].min()) if len(neg_knee) > 0 else 0

print(f"  Master valid rows: {len(master_df):,}, cols: {len(master_df.columns)}")
print(f"  Sources: {master_audit['sources']}")
print(f"  Chemistries: {master_audit['chemistries']}")
print(f"  Unique cells: {master_audit['unique_cells_count']} -> {list(cell_details.keys())}")
print(f"  IR_OHM null count: {master_audit['missing_counts'].get('ir_ohm', 'N/A')} ({master_audit['missing_percentages'].get('ir_ohm', 'N/A')}%)")
print(f"  Negative RUL records: {master_audit.get('negative_rul_count', 0)}")
print(f"  Negative Knee records: {master_audit.get('negative_knee_count', 0)}", flush=True)

# 3. SAVE CONSOLIDATED AUDIT JSON
audit_summary = {
    "audit_timestamp": "2026-10-14",
    "fleet_dataset": fleet_audit,
    "master_dataset": master_audit
}

with open(os.path.join(OUTPUT_DIR, "rigorous_data_audit_summary.json"), "w", encoding="utf-8") as f:
    json.dump(audit_summary, f, indent=2)

print(f"\n[3/3] Successfully saved rigorous_data_audit_summary.json to {OUTPUT_DIR}", flush=True)
print("=== AUDIT COMPLETE ===", flush=True)
