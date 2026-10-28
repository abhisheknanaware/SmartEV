from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

class BatteryTelemetryInput(BaseModel):
    voltage: float = Field(395.4, description="Battery terminal voltage in Volts (e.g. 395.4)")
    current: float = Field(45.2, description="Charge/discharge current in Amperes (e.g. 45.2)")
    temperature: float = Field(31.5, description="Battery pack temperature in Celsius (e.g. 31.5)")
    capacity: float = Field(68.5, description="Current measured capacity in Ah (e.g. 68.5)")
    internal_resistance: float = Field(18.2, description="Internal resistance in mOhm (e.g. 18.2)")
    charge_cycles: int = Field(340, description="Total completed charge cycles (e.g. 340)")
    charging_time: float = Field(65.0, description="Average charging duration in minutes")
    discharging_time: float = Field(210.0, description="Average discharging duration in minutes")
    energy_throughput: float = Field(2450.0, description="Cumulative energy throughput in kWh")
    chemistry: Optional[str] = Field("NMC", description="Cell chemistry: LFP, NMC, NCA, LMO, LCO")
    fast_charge_ratio: Optional[float] = Field(0.35, description="Ratio of DC fast charging sessions 0.0 - 1.0")
    depth_of_discharge: Optional[float] = Field(65.0, description="Average depth of discharge (DoD %)")
    ambient_temp: Optional[float] = Field(28.0, description="Ambient operating temperature in °C")
    peak_fast_charge_temp: Optional[float] = Field(32.0, description="Peak temperature recorded during DC fast charging in °C")

class MasterCellTelemetryInput(BaseModel):
    cycle_number: int = Field(450, description="Cycle index")
    c_rate_charge: float = Field(0.5, description="Charge C-rate (e.g. 0.5C)")
    c_rate_discharge: float = Field(1.0, description="Discharge C-rate (e.g. 1.0C)")
    ambient_temp_C: float = Field(25.0, description="Lab ambient temperature in °C")
    dod: float = Field(1.0, description="Depth of discharge ratio (0.0 - 1.0)")
    coulombic_eff: float = Field(0.9985, description="Coulombic efficiency (e.g. 0.9985)")
    energy_eff: float = Field(0.915, description="Energy efficiency ratio")
    v_mean_discharge: float = Field(3.72, description="Mean discharge voltage in Volts")
    temp_rise_C: float = Field(3.2, description="Temperature rise during cycling in °C")
    cum_throughput_Ah: float = Field(520.0, description="Cumulative throughput in Amp-hours")
    nominal_capacity_Ah: float = Field(1.1, description="Cell nominal capacity in Ah")
    arrhenius_factor: Optional[float] = Field(1.05, description="Arrhenius thermal acceleration factor")
    cum_plating_stress: Optional[float] = Field(0.08, description="Cumulative lithium plating stress index")

class SOHPredictionResponse(BaseModel):
    soh: float = Field(..., description="Predicted State of Health percentage (e.g. 91.4)")
    status: str = Field(..., description="Battery condition status: EXCELLENT, GOOD, MODERATE, CRITICAL")
    health_score: float = Field(..., description="Normalized health score 0.0 - 1.0")
    model_name: str
    model_version: str
    confidence: float
    failure_risk: str
    factors: Dict[str, Any]

class DegradationPoint(BaseModel):
    cycle: int
    predicted_soh: float
    actual_baseline: Optional[float] = None

class RULPredictionResponse(BaseModel):
    estimated_remaining_cycles: int
    estimated_remaining_km: int
    end_of_life_threshold_soh: float = 70.0
    current_soh: float
    degradation_curve: List[DegradationPoint]
    status: str
    failure_risk: str
    recommendation: str

class BatteryFullDiagnosticsResponse(BaseModel):
    soh: float
    rul_cycles: int
    estimated_remaining_km: int
    status: str
    health_score: float
    failure_risk: str
    failure_risk_score: float
    model_name: str
    degradation_trajectory: List[DegradationPoint]
    chemistry: str
    chemistry_profile: Dict[str, Any]
    anomalies: List[str]
    longevity_recommendations: List[str]
    pack_vitals: Dict[str, Any]
    physics_telemetry: Optional[Dict[str, Any]] = None

class MasterCellPredictionResponse(BaseModel):
    soh: float
    rul_cycles: int
    cycles_to_knee: int
    status: str
    model_name: str
    lithium_plating_risk: str
    arrhenius_acceleration: float
    sei_growth_factor: float
    knee_point_cycle: int
    degradation_curve: List[DegradationPoint]
    cell_diagnostics: Dict[str, Any]
    cqr_lower_soh: Optional[float] = None
    cqr_upper_soh: Optional[float] = None
    conformal_interval_width: Optional[float] = None

class ModelEvaluationResponse(BaseModel):
    dataset_info: Dict[str, Any]
    models_comparison: Dict[str, Any]
    best_model: str
    feature_importances: Dict[str, float]
    top_factors_explained: List[Dict[str, Any]]
    chemistry_insights: Dict[str, Any]
    chemistry_curves: List[Dict[str, Any]]
    master_dataset_metrics: Optional[Dict[str, Any]] = None
    rul_model_metrics: Optional[Dict[str, Any]] = None
    risk_classifier_metrics: Optional[Dict[str, Any]] = None

class ResearchPaperDataResponse(BaseModel):
    title: str
    authors: str
    abstract: str
    equations: List[Dict[str, str]]
    datasets: List[Dict[str, Any]]
    models_comparison: Dict[str, Any]
    master_dataset_metrics: Dict[str, Any]
    feature_importances: Dict[str, float]
    figures: List[Dict[str, str]]
    bibtex: str
