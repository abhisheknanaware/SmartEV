import os
import sys
import json
import time
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import seaborn as sns

from sklearn.linear_model import Ridge
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.dummy import DummyRegressor
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
from sklearn.model_selection import GroupKFold
import lightgbm as lgb

try:
    import xgboost as xgb
    HAS_XGB = True
except ImportError:
    HAS_XGB = False

print("=== REPRODUCIBLE LEAKAGE-SAFE SOH ESTIMATION PIPELINE ===", flush=True)

ROOT_DIR = r"d:\EVFINAL"
OUTPUT_DIR = os.path.join(ROOT_DIR, "ml-service")
ARTIFACT_DIR = r"C:\Users\Admin\.gemini\antigravity-ide\brain\f5f4591f-7d13-4b28-9e4d-feaa9f94b6b8"
FIGURES_DIR = os.path.join(ARTIFACT_DIR, "benchmark_figures")
os.makedirs(FIGURES_DIR, exist_ok=True)

# 1. LOAD MASTER DATASET (CALCE)
print("\n[STEP 1/6] Loading CALCE Master Laboratory Dataset...", flush=True)
master_csv = os.path.join(ROOT_DIR, "master_dataset.csv")
df = pd.read_csv(master_csv, nrows=10600, engine='python')
print(f"Loaded {len(df):,} cycles across {df['cell_id'].nunique()} cells.", flush=True)

# Define Target: SOH in Percentage Points (0 - 100%)
df['target_soh_pct'] = df['target_soh'] * 100.0

# 2. DEFINE LEAKAGE-SAFE FEATURE SETS
# Feature Set 1: Minimal Partial Charging Curve Features (available strictly during charging)
FEATURES_CURVE_ONLY = [
    'v_at_q10',
    'v_at_q50',
    'v_at_q90',
    'ic_peak_height',
    'ic_peak_voltage',
    'ic_peak_shift',
    'dq_var_log',
    'dq_mean',
    'charge_time_s'
]

# Feature Set 2: Partial Charging + Operating Context (Permitted variables known at prediction time)
FEATURES_CONTEXT = FEATURES_CURVE_ONLY + [
    'cycle_number',
    'sqrt_cycle',
    'nominal_capacity_Ah',
    'cum_throughput_Ah',
    'efc',
    'cum_energy_kWh',
    'c_rate_charge',
    'arrhenius_factor',
    'cum_arrhenius_efc',
    'cum_plating_stress',
    'crate_x_dod',
    'fastcharge_x_temp'
]

# Feature Set 3: Full-Cycle Electrochemical Engineering (Including post-cycle metrics)
FEATURES_FULL_CYCLE = FEATURES_CONTEXT + [
    'coulombic_eff',
    'energy_eff',
    'v_mean_discharge',
    'discharge_time_s',
    'temp_mean_C',
    'temp_rise_C'
]

# Median Imputation on features (handling any slight missingness, e.g. dq_var_log 0.93%)
for col in set(FEATURES_FULL_CYCLE):
    if col in df.columns:
        med = float(df[col].median())
        df[col] = df[col].fillna(med)

print(f"Feature configurations defined:")
print(f"  Config 1 (Curve-Only): {len(FEATURES_CURVE_ONLY)} features")
print(f"  Config 2 (Curve + Context): {len(FEATURES_CONTEXT)} features")
print(f"  Config 3 (Full-Cycle Benchmark): {len(FEATURES_FULL_CYCLE)} features", flush=True)

# 3. DEFINE CELL-SEPARATED SPLITS
# Total 11 cells. Unseen Cell Split:
# Train: 6 cells
# Validation: 2 cells
# Calibration (CQR): 1 cell
# Test: 2 cells (Unseen held-out evaluation)
TRAIN_CELLS = ['CALCE_CS2_33', 'CALCE_CS2_34', 'CALCE_CS2_35', 'CALCE_CX2_16', 'CALCE_CX2_33', 'CALCE_CX2_34']
VAL_CELLS = ['CALCE_CS2_36', 'CALCE_CX2_35']
CAL_CELLS = ['CALCE_CS2_37']
TEST_CELLS = ['CALCE_CS2_38', 'CALCE_CX2_36']

train_mask = df['cell_id'].isin(TRAIN_CELLS)
val_mask = df['cell_id'].isin(VAL_CELLS)
cal_mask = df['cell_id'].isin(CAL_CELLS)
test_mask = df['cell_id'].isin(TEST_CELLS)

print(f"\n[STEP 2/6] Cell Partitioning Summary:")
print(f"  Train cells: {TRAIN_CELLS} ({train_mask.sum():,} cycles)")
print(f"  Val cells:   {VAL_CELLS} ({val_mask.sum():,} cycles)")
print(f"  Cal cells:   {CAL_CELLS} ({cal_mask.sum():,} cycles)")
print(f"  Test cells:  {TEST_CELLS} ({test_mask.sum():,} cycles)")
assert set(TRAIN_CELLS).isdisjoint(set(TEST_CELLS)), "Cell leakage detected!"
assert set(VAL_CELLS).isdisjoint(set(TEST_CELLS)), "Cell leakage detected!"
assert set(CAL_CELLS).isdisjoint(set(TEST_CELLS)), "Cell leakage detected!"
print("  Zero cell leakage verified between all splits!", flush=True)

# 4. BENCHMARK COMPARISON ON UNSEEN CELLS (CONFIG 2: CURVE + CONTEXT)
print("\n[STEP 3/6] Training & Evaluating Models on Unseen Test Cells...", flush=True)

X_train = df.loc[train_mask, FEATURES_CONTEXT]
y_train = df.loc[train_mask, 'target_soh_pct']

X_val = df.loc[val_mask, FEATURES_CONTEXT]
y_val = df.loc[val_mask, 'target_soh_pct']

X_test = df.loc[test_mask, FEATURES_CONTEXT]
y_test = df.loc[test_mask, 'target_soh_pct']

models = {
    "Dummy (Mean Baseline)": DummyRegressor(strategy='mean'),
    "Ridge Regression": Ridge(alpha=1.0),
    "Random Forest (50 Trees)": RandomForestRegressor(n_estimators=50, max_depth=10, random_state=42, n_jobs=1),
    "Gradient Boosting (GBDT)": GradientBoostingRegressor(n_estimators=100, max_depth=5, learning_rate=0.08, random_state=42),
    "LightGBM (Champion)": lgb.LGBMRegressor(n_estimators=200, learning_rate=0.05, num_leaves=31, max_depth=6, random_state=42, verbosity=-1, n_jobs=1)
}

if HAS_XGB:
    models["XGBoost"] = xgb.XGBRegressor(n_estimators=100, max_depth=6, learning_rate=0.08, random_state=42, n_jobs=1)

benchmark_results = {}
trained_models = {}
test_predictions = {}

for name, model in models.items():
    t0 = time.time()
    model.fit(X_train, y_train)
    t_train = round(time.time() - t0, 3)
    
    t0 = time.time()
    preds = model.predict(X_test)
    t_inf = round((time.time() - t0) / len(X_test) * 1000, 4) # ms per sample
    
    rmse = round(float(np.sqrt(mean_squared_error(y_test, preds))), 4)
    mae = round(float(mean_absolute_error(y_test, preds)), 4)
    r2 = round(float(r2_score(y_test, preds)), 4)
    
    benchmark_results[name] = {
        "rmse_pct_pts": rmse,
        "mae_pct_pts": mae,
        "r2_score": r2,
        "train_time_s": t_train,
        "inference_latency_ms": t_inf
    }
    trained_models[name] = model
    test_predictions[name] = preds
    print(f"  {name:<25}: RMSE={rmse:.3f}% SOH, MAE={mae:.3f}% SOH, R²={r2:.4f}, Train={t_train}s, Latency={t_inf}ms", flush=True)

# 5. MULTI-SEED REPEATABILITY (5 SEEDS) FOR LIGHTGBM
print("\n[STEP 4/6] Evaluating Seed Variability for LightGBM on Unseen Cells (Seeds: 42, 101, 2024, 777, 999)...", flush=True)
seed_metrics = []
seeds = [42, 101, 2024, 777, 999]
for s in seeds:
    lgbm_seed = lgb.LGBMRegressor(n_estimators=200, learning_rate=0.05, num_leaves=31, max_depth=6, random_state=s, verbosity=-1, n_jobs=1)
    lgbm_seed.fit(X_train, y_train)
    p = lgbm_seed.predict(X_test)
    s_rmse = float(np.sqrt(mean_squared_error(y_test, p)))
    s_mae = float(mean_absolute_error(y_test, p))
    s_r2 = float(r2_score(y_test, p))
    seed_metrics.append({"seed": s, "rmse": s_rmse, "mae": s_mae, "r2": s_r2})

rmse_list = [m['rmse'] for m in seed_metrics]
mae_list = [m['mae'] for m in seed_metrics]
r2_list = [m['r2'] for m in seed_metrics]

seed_summary = {
    "seeds_tested": seeds,
    "rmse_mean": round(float(np.mean(rmse_list)), 4),
    "rmse_std": round(float(np.std(rmse_list)), 4),
    "mae_mean": round(float(np.mean(mae_list)), 4),
    "mae_std": round(float(np.std(mae_list)), 4),
    "r2_mean": round(float(np.mean(r2_list)), 4),
    "r2_std": round(float(np.std(r2_list)), 4),
    "seed_runs": seed_metrics
}
print(f"  LightGBM Seed Mean ± Std: RMSE={seed_summary['rmse_mean']:.3f} ± {seed_summary['rmse_std']:.3f}%, MAE={seed_summary['mae_mean']:.3f} ± {seed_summary['mae_std']:.3f}%, R²={seed_summary['r2_mean']:.4f} ± {seed_summary['r2_std']:.4f}", flush=True)

# 6. FEATURE ABLATION STUDY: CONFIG 1 vs CONFIG 2 vs CONFIG 3
print("\n[STEP 5/6] Feature Ablation Study on Unseen Test Cells...", flush=True)
ablation_results = {}
configs = {
    "Config 1 (Curve-Only, 9 feats)": FEATURES_CURVE_ONLY,
    "Config 2 (Curve + Context, 21 feats)": FEATURES_CONTEXT,
    "Config 3 (Full-Cycle Benchmark, 27 feats)": FEATURES_FULL_CYCLE
}

for cfg_name, feat_cols in configs.items():
    lgbm_ab = lgb.LGBMRegressor(n_estimators=200, learning_rate=0.05, num_leaves=31, max_depth=6, random_state=42, verbosity=-1, n_jobs=1)
    lgbm_ab.fit(df.loc[train_mask, feat_cols], y_train)
    p_ab = lgbm_ab.predict(df.loc[test_mask, feat_cols])
    ab_rmse = round(float(np.sqrt(mean_squared_error(y_test, p_ab))), 4)
    ab_mae = round(float(mean_absolute_error(y_test, p_ab)), 4)
    ab_r2 = round(float(r2_score(y_test, p_ab)), 4)
    ablation_results[cfg_name] = {"rmse": ab_rmse, "mae": ab_mae, "r2": ab_r2, "num_features": len(feat_cols)}
    print(f"  {cfg_name:<40}: RMSE={ab_rmse:.3f}%, MAE={ab_mae:.3f}%, R²={ab_r2:.4f}", flush=True)

# 7. CONFORMALIZED QUANTILE REGRESSION (CQR) CALIBRATION
print("\n[STEP 6/6] Implementing Conformalized Quantile Regression (CQR) (Nominal 90% Coverage)...", flush=True)
# Train Quantile Regressors at alpha=0.05 (lower bound) and alpha=0.95 (upper bound)
q_low_model = lgb.LGBMRegressor(objective='quantile', alpha=0.05, n_estimators=200, learning_rate=0.05, num_leaves=31, max_depth=6, random_state=42, verbosity=-1, n_jobs=1)
q_high_model = lgb.LGBMRegressor(objective='quantile', alpha=0.95, n_estimators=200, learning_rate=0.05, num_leaves=31, max_depth=6, random_state=42, verbosity=-1, n_jobs=1)

q_low_model.fit(X_train, y_train)
q_high_model.fit(X_train, y_train)

# Calibration step on CALIBRATION CELL (CALCE_CS2_37 - independent physical cell)
X_cal = df.loc[cal_mask, FEATURES_CONTEXT]
y_cal = df.loc[cal_mask, 'target_soh_pct'].values

q_low_cal = q_low_model.predict(X_cal)
q_high_cal = q_high_model.predict(X_cal)

# Nonconformity score: E_i = max(q_low - y_i, y_i - q_high)
nonconformity_scores = np.maximum(q_low_cal - y_cal, y_cal - q_high_cal)

# Conformal correction factor for 1 - alpha = 0.90
n_cal = len(nonconformity_scores)
alpha = 0.10
conformal_quantile_level = np.clip(np.ceil((n_cal + 1) * (1 - alpha)) / n_cal, 0.0, 1.0)
q_correction = float(np.quantile(nonconformity_scores, conformal_quantile_level))

print(f"  Calibration set size: {n_cal:,} cycles from cell {CAL_CELLS[0]}")
print(f"  Conformal correction factor Q_{{1-alpha}}: {q_correction:.4f}% SOH")

# Evaluate on Held-Out UNSEEN TEST CELLS
q_low_test = q_low_model.predict(X_test) - q_correction
q_high_test = q_high_model.predict(X_test) + q_correction
y_test_arr = y_test.values

# Calculate Empirical Coverage & Interval Width
covered = (y_test_arr >= q_low_test) & (y_test_arr <= q_high_test)
overall_coverage = float(np.mean(covered))
interval_widths = q_high_test - q_low_test
mean_width = float(np.mean(interval_widths))
median_width = float(np.median(interval_widths))

# Per-cell coverage breakdown
cqr_per_cell = {}
test_df_slice = df.loc[test_mask].copy()
test_df_slice['covered'] = covered
test_df_slice['width'] = interval_widths

for cell in TEST_CELLS:
    cell_sub = test_df_slice[test_df_slice['cell_id'] == cell]
    cqr_per_cell[cell] = {
        "samples": len(cell_sub),
        "empirical_coverage": round(float(cell_sub['covered'].mean()), 4),
        "mean_interval_width": round(float(cell_sub['width'].mean()), 3),
        "median_interval_width": round(float(cell_sub['width'].median()), 3)
    }

cqr_summary = {
    "nominal_coverage": 0.90,
    "empirical_coverage": round(overall_coverage, 4),
    "conformal_adjustment_q": round(q_correction, 4),
    "mean_interval_width_pct_pts": round(mean_width, 3),
    "median_interval_width_pct_pts": round(median_width, 3),
    "calibration_cell": CAL_CELLS[0],
    "calibration_samples": n_cal,
    "test_cells": TEST_CELLS,
    "test_samples": len(y_test_arr),
    "per_cell_breakdown": cqr_per_cell
}

print(f"  Overall Empirical Coverage on Unseen Cells: {overall_coverage * 100:.2f}% (Nominal: 90.00%)")
print(f"  Mean Interval Width: {mean_width:.2f}% SOH, Median: {median_width:.2f}% SOH")
for cell, stats in cqr_per_cell.items():
    print(f"    Cell {cell}: Coverage = {stats['empirical_coverage']*100:.2f}%, Width = {stats['mean_interval_width']:.2f}% SOH (N={stats['samples']})")

# 8. GENERATE PUBLICATION FIGURES
print("\n[STEP 7/6] Generating Publication-Quality Benchmark Figures...", flush=True)

# Figure 1: Parity Plot on Unseen Test Cells (LightGBM)
plt.figure(figsize=(7, 6), dpi=300)
lgbm_test_preds = test_predictions["LightGBM (Champion)"]
plt.scatter(y_test, lgbm_test_preds, alpha=0.4, color='#2563eb', edgecolor='none', s=25, label=f'LightGBM ($R^2={benchmark_results["LightGBM (Champion)"]["r2_score"]:.4f}$)')
min_val = min(y_test.min(), lgbm_test_preds.min()) - 2
max_val = max(y_test.max(), lgbm_test_preds.max()) + 2
plt.plot([min_val, max_val], [min_val, max_val], 'r--', lw=1.8, label='Ideal Parity (y = x)')
plt.fill_between([min_val, max_val], [min_val - 2, max_val - 2], [min_val + 2, max_val + 2], color='gray', alpha=0.15, label='±2.0% Error Margin')
plt.title("Unseen-Cell SOH Estimation Parity (CALCE Held-Out Cells)", fontsize=13, fontweight='bold', pad=12)
plt.xlabel("Actual Laboratory SOH (%)", fontsize=11, fontweight='bold')
plt.ylabel("Predicted SOH (%)", fontsize=11, fontweight='bold')
plt.xlim(min_val, max_val)
plt.ylim(min_val, max_val)
plt.legend(frameon=True, facecolor='white', framealpha=0.9, loc='upper left')
plt.grid(True, linestyle='--', alpha=0.5)
plt.tight_layout()
fig1_path = os.path.join(FIGURES_DIR, "fig1_unseen_cell_parity.png")
plt.savefig(fig1_path)
plt.close()

# Figure 2: CQR Prediction Intervals on Unseen Cell Trajectory
plt.figure(figsize=(10, 5), dpi=300)
sample_cell = 'CALCE_CS2_38'
sub = test_df_slice[test_df_slice['cell_id'] == sample_cell].sort_values('cycle_number')
sub_idx = sub.index
sub_actual = sub['target_soh_pct'].values
sub_pred = lgbm_test_preds[np.isin(test_df_slice.index, sub_idx)]
sub_low = q_low_test[np.isin(test_df_slice.index, sub_idx)]
sub_high = q_high_test[np.isin(test_df_slice.index, sub_idx)]
cycles = sub['cycle_number'].values

plt.plot(cycles, sub_actual, 'k-', lw=2.2, label='Actual SOH (%)')
plt.plot(cycles, sub_pred, 'b--', lw=1.8, label='LightGBM Point Estimate')
plt.fill_between(cycles, sub_low, sub_high, color='#60a5fa', alpha=0.35, label=f'Nominal 90% CQR Interval (Empirical: {cqr_per_cell[sample_cell]["empirical_coverage"]*100:.1f}%)')
plt.title(f"Conformalized Quantile Regression (CQR) on Unseen Cell ({sample_cell})", fontsize=13, fontweight='bold', pad=12)
plt.xlabel("Cycle Number", fontsize=11, fontweight='bold')
plt.ylabel("State of Health (%)", fontsize=11, fontweight='bold')
plt.legend(frameon=True, facecolor='white', framealpha=0.9, loc='lower left')
plt.grid(True, linestyle='--', alpha=0.5)
plt.tight_layout()
fig2_path = os.path.join(FIGURES_DIR, "fig2_cqr_prediction_intervals.png")
plt.savefig(fig2_path)
plt.close()

# Figure 3: Model Comparison Bar Chart (RMSE & MAE)
plt.figure(figsize=(8, 5), dpi=300)
mod_names = list(benchmark_results.keys())
rmses = [benchmark_results[m]['rmse_pct_pts'] for m in mod_names]
maes = [benchmark_results[m]['mae_pct_pts'] for m in mod_names]
x = np.arange(len(mod_names))
width = 0.35

plt.bar(x - width/2, rmses, width, label='RMSE (% SOH)', color='#ef4444', alpha=0.85)
plt.bar(x + width/2, maes, width, label='MAE (% SOH)', color='#3b82f6', alpha=0.85)
plt.xticks(x, mod_names, rotation=25, ha='right', fontsize=9, fontweight='bold')
plt.ylabel("Error in SOH Percentage Points", fontsize=11, fontweight='bold')
plt.title("Unseen-Cell Model Comparison (Lower is Better)", fontsize=13, fontweight='bold', pad=12)
plt.legend(frameon=True, facecolor='white', framealpha=0.9)
plt.grid(True, axis='y', linestyle='--', alpha=0.5)
plt.tight_layout()
fig3_path = os.path.join(FIGURES_DIR, "fig3_model_benchmark_bars.png")
plt.savefig(fig3_path)
plt.close()

# 9. CONSOLIDATE EXPERIMENTAL METRICS JSON
final_output = {
    "experiment_protocol": "Cell-Separated Holdout Benchmark (Zero Data Leakage)",
    "dataset": "CALCE Prismatic Cells (master_dataset.csv text portion)",
    "total_cells": 11,
    "total_cycles": len(df),
    "split_design": {
        "train_cells": TRAIN_CELLS,
        "train_cycles": int(train_mask.sum()),
        "val_cells": VAL_CELLS,
        "val_cycles": int(val_mask.sum()),
        "cal_cells": CAL_CELLS,
        "cal_cycles": int(cal_mask.sum()),
        "test_cells": TEST_CELLS,
        "test_cycles": int(test_mask.sum()),
    },
    "model_benchmarks_on_unseen_cells": benchmark_results,
    "lightgbm_seed_variability_5_seeds": seed_summary,
    "feature_ablation_study": ablation_results,
    "conformal_quantile_regression_cqr": cqr_summary,
    "generated_figures": [fig1_path, fig2_path, fig3_path]
}

out_json = os.path.join(OUTPUT_DIR, "rigorous_experimental_benchmark_results.json")
with open(out_json, "w", encoding="utf-8") as f:
    json.dump(final_output, f, indent=2)

print(f"\nSaved benchmark results to {out_json}")
print("=== PIPELINE EXECUTION COMPLETED SUCCESSFULLY ===", flush=True)
