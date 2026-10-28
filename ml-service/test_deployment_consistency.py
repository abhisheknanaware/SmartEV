import os
import sys
import json
import joblib
import numpy as np
import pandas as pd

print("=== DEPLOYMENT CONSISTENCY & INTEGRITY AUDIT ===", flush=True)

ROOT_DIR = r"d:\EVFINAL"
MODEL_DIR = os.path.join(ROOT_DIR, "ml-service", "app", "models")
SERVICE_DIR = os.path.join(ROOT_DIR, "ml-service")
sys.path.insert(0, SERVICE_DIR)

from app.schemas.battery_schemas import BatteryTelemetryInput, MasterCellTelemetryInput
from app.services.battery_service import battery_ml_service

tests_passed = 0
tests_failed = 0
test_log = []

def run_test(test_name, condition, details=""):
    global tests_passed, tests_failed
    if condition:
        tests_passed += 1
        print(f"  [PASS] {test_name}", flush=True)
        test_log.append({"test": test_name, "status": "PASS", "details": details})
    else:
        tests_failed += 1
        print(f"  [FAIL] {test_name} - {details}", flush=True)
        test_log.append({"test": test_name, "status": "FAIL", "details": details})

# Test 1: Model Loading & Artifact Existence
soh_model_path = os.path.join(MODEL_DIR, "lgbm_soh_model.joblib")
master_model_path = os.path.join(MODEL_DIR, "master_lgbm_soh_model.joblib")
run_test("Fleet SOH model exists on disk", os.path.exists(soh_model_path), f"Path: {soh_model_path}")
run_test("Master SOH model exists on disk", os.path.exists(master_model_path), f"Path: {master_model_path}")

fleet_model = battery_ml_service.lgbm_soh
run_test("Fleet SOH model successfully loaded into service", fleet_model is not None)

# Test 2: Feature Order & Dimensionality
metadata_path = os.path.join(MODEL_DIR, "battery_model_metadata.json")
with open(metadata_path, "r", encoding="utf-8") as f:
    metadata = json.load(f)

expected_fleet_features = metadata.get("feature_names", [])
model_n_features = fleet_model.n_features_in_
run_test("Model feature count matches metadata schema", len(expected_fleet_features) == model_n_features,
         f"Metadata: {len(expected_fleet_features)}, Model: {model_n_features}")

# Test 3: API Input Construction Matches Model Features
sample_input = BatteryTelemetryInput(
    voltage=385.0,
    current=50.0,
    temperature=28.0,
    capacity=65.0,
    internal_resistance=22.0,
    charge_cycles=400,
    charging_time=60.0,
    discharging_time=180.0,
    energy_throughput=3000.0,
    chemistry="NMC"
)
constructed_df = battery_ml_service._build_feature_row(sample_input)
run_test("Constructed feature columns match model expectation exactly",
         list(constructed_df.columns) == expected_fleet_features,
         f"Constructed: {list(constructed_df.columns)}")

# Test 4: Offline vs Online Prediction Parity
direct_pred = float(fleet_model.predict(constructed_df)[0])
service_response = battery_ml_service.predict_soh(sample_input)
pred_parity = abs(round(direct_pred, 1) - service_response.soh) < 1e-4
run_test("Direct offline prediction matches API service prediction", pred_parity,
         f"Direct (rounded): {round(direct_pred, 1):.1f}, Service: {service_response.soh:.1f}")

# Test 5: SOH Range Validity (0% - 100%)
run_test("Predicted SOH within valid physical range [0%, 100%]",
         0.0 <= service_response.soh <= 100.0,
         f"SOH: {service_response.soh}%")

# Test 6: Robustness to Out-of-Bounds & Missing Inputs
extreme_input = BatteryTelemetryInput(
    voltage=100.0, # extremely low voltage
    current=-500.0,
    temperature=-40.0, # deep freeze
    capacity=1.0,
    internal_resistance=500.0, # massive degradation
    charge_cycles=10000,
    charging_time=10.0,
    discharging_time=10.0,
    energy_throughput=100000.0,
    chemistry="UNKNOWN" # unknown chemistry
)
try:
    extreme_resp = battery_ml_service.predict_soh(extreme_input)
    run_test("Service gracefully handles extreme/out-of-bounds inputs without crashing",
             0.0 <= extreme_resp.soh <= 100.0,
             f"SOH under extreme conditions: {extreme_resp.soh}%")
except Exception as e:
    run_test("Service gracefully handles extreme/out-of-bounds inputs", False, str(e))

# Test 7: Master Lab Cell Prediction Parity
master_input = MasterCellTelemetryInput(
    cycle_number=350,
    c_rate_charge=0.5,
    c_rate_discharge=1.0,
    ambient_temp_C=25.0,
    dod=1.0,
    coulombic_eff=0.998,
    energy_eff=0.92,
    v_mean_discharge=3.65,
    temp_rise_C=2.5,
    cum_throughput_Ah=400.0,
    nominal_capacity_Ah=1.1
)
try:
    master_resp = battery_ml_service.predict_master_cell(master_input)
    run_test("Master CALCE lab cell prediction executes and returns valid SOH & knee cycles",
             0.0 <= master_resp.soh <= 100.0 and master_resp.cycles_to_knee is not None,
             f"Master SOH: {master_resp.soh}%, Cycles to knee: {master_resp.cycles_to_knee}")
except Exception as e:
    run_test("Master CALCE lab cell prediction executes", False, str(e))

print(f"\nAudit Summary: {tests_passed} Passed, {tests_failed} Failed", flush=True)

deployment_audit_summary = {
    "total_tests": tests_passed + tests_failed,
    "tests_passed": tests_passed,
    "tests_failed": tests_failed,
    "all_passed": (tests_failed == 0),
    "test_details": test_log
}

with open(os.path.join(ROOT_DIR, "ml-service", "deployment_consistency_audit.json"), "w", encoding="utf-8") as f:
    json.dump(deployment_audit_summary, f, indent=2)

print("Saved deployment_consistency_audit.json", flush=True)
