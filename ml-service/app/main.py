import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from app.schemas.battery_schemas import (
    BatteryTelemetryInput,
    MasterCellTelemetryInput,
    SOHPredictionResponse,
    RULPredictionResponse,
    ModelEvaluationResponse,
    BatteryFullDiagnosticsResponse,
    MasterCellPredictionResponse,
    ResearchPaperDataResponse
)
from app.schemas.demand_schemas import (
    DemandPredictionRequest,
    DemandPredictionResponse
)
from app.schemas.recommendation_schemas import (
    RouteRecommendationRequest,
    RouteRecommendationResponse
)
from app.schemas.ai_assistant_schemas import (
    ChatRequest,
    ChatResponse
)
from app.services.battery_service import battery_ml_service
from app.services.demand_service import demand_service
from app.services.recommendation_service import recommendation_service
from app.services.ai_assistant_service import ai_assistant_service
from app.services.soh_simulator import soh_simulator, SimulationInput, SimulationResult

app = FastAPI(
    title="SmartEV AI & Machine Learning Microservice",
    description="High-performance AI engine for EV Battery SOH/RUL, Intelligent Route Recommendation, Station Demand Forecasting & Conversational Copilot",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {
        "service": "SmartEV Machine Learning Engine",
        "status": "ONLINE",
        "version": "1.0.0",
        "docs_url": "/docs"
    }

@app.get("/health")
def health():
    return {
        "status": "UP",
        "battery_models": "READY",
        "demand_forecaster": "READY",
        "recommendation_engine": "READY",
        "ai_assistant": "READY",
        "soh_simulator": "READY" if soh_simulator.ready else "MISSING"
    }


@app.get("/simulate/soh/info")
def simulate_soh_info():
    """Training data, held-out-cell evaluation and supported ranges of the SOH simulator."""
    try:
        return soh_simulator.info()
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="SOH simulator model not found; run train_soh_simulator.py")


@app.post("/simulate/soh", response_model=SimulationResult)
def simulate_soh(inp: SimulationInput):
    """What-if SOH from usage conditions, using the model trained on real laboratory cycling data."""
    try:
        return soh_simulator.simulate(inp)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="SOH simulator model not found; run train_soh_simulator.py")

# ==================== BATTERY SOH & RUL ML ====================

@app.post("/predict/soh", response_model=SOHPredictionResponse)
def predict_battery_soh(telemetry: BatteryTelemetryInput):
    """
    Predicts Lithium-Ion Battery State of Health (SOH %) using Gradient Boosted Ensemble (Trained on 50k EV Fleet Records)
    """
    try:
        return battery_ml_service.predict_soh(telemetry)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"SOH prediction failed: {str(e)}")

@app.post("/predict/rul", response_model=RULPredictionResponse)
def predict_battery_rul(telemetry: BatteryTelemetryInput):
    """
    Predicts Remaining Useful Life (RUL in cycles & km) to standard 70% EOL threshold
    """
    try:
        return battery_ml_service.predict_rul(telemetry)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"RUL prediction failed: {str(e)}")

@app.post("/predict/battery-diagnostics", response_model=BatteryFullDiagnosticsResponse)
def predict_battery_diagnostics(telemetry: BatteryTelemetryInput):
    """
    Full AI Diagnostics Engine: SOH, RUL, Thermal Failure Risk, Cell Anomalies, Longevity Prescriptions
    """
    try:
        return battery_ml_service.predict_full_diagnostics(telemetry)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Diagnostics failed: {str(e)}")

@app.get("/battery/chemistry-insights")
def get_chemistry_insights():
    """
    Returns empirical degradation benchmarks across LFP, NMC, NCA, and LMO chemistries from 50,000 dataset.
    """
    try:
        eval_data = battery_ml_service.get_evaluation()
        return {
            "insights": eval_data.chemistry_insights,
            "curves": eval_data.chemistry_curves
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chemistry insights fetch failed: {str(e)}")

@app.get("/models/evaluation", response_model=ModelEvaluationResponse)
def get_model_evaluation():
    """
    Returns comparative evaluation metrics (MAE, RMSE, R²) for:
    - Linear Regression
    - Random Forest Regressor
    - Gradient Boosted Trees (Champion)
    Along with feature importance distribution and dataset statistics.
    """
    try:
        return battery_ml_service.get_evaluation()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Evaluation fetch failed: {str(e)}")

@app.post("/predict/master-cell", response_model=MasterCellPredictionResponse)
def predict_master_cell(cell_data: MasterCellTelemetryInput):
    """
    Predicts cell-level SOH, RUL, and Knee-Point cycles using the LightGBM Master Electrochemical Laboratory Model (CALCE).
    """
    try:
        return battery_ml_service.predict_master_cell(cell_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Master cell prediction failed: {str(e)}")

@app.get("/research/paper-data", response_model=ResearchPaperDataResponse)
def get_research_paper_data():
    """
    Returns full research paper content: title, abstract, methodology, equations, dataset specs, benchmark comparison, and figure URLs.
    """
    try:
        return battery_ml_service.get_research_paper_data()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Research paper data fetch failed: {str(e)}")

# ==================== DEMAND PREDICTION ML ====================

@app.post("/predict/demand", response_model=DemandPredictionResponse)
def predict_station_demand(request: DemandPredictionRequest):
    """
    Predicts 24-hour station grid utilization and peak hours using historical demand profiling.
    """
    try:
        return demand_service.predict_demand(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Demand forecasting failed: {str(e)}")

# ==================== INTELLIGENT STATION RECOMMENDATION ====================

@app.post("/recommend/stations", response_model=RouteRecommendationResponse)
def recommend_stations(request: RouteRecommendationRequest):
    """
    Multi-objective AI recommendation scoring:
    - Route proximity & deviation
    - Charging speed (kW)
    - Real-time slot availability
    - Tariff / price
    - Driver ratings
    - Connector compatibility (CCS2)
    - Grid congestion penalty
    - Battery buffer & journey energy requirement
    """
    try:
        return recommendation_service.recommend(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Station recommendation failed: {str(e)}")

# ==================== AI CONVERSATIONAL COPILOT ====================

@app.post("/ai/chat", response_model=ChatResponse)
def chat_copilot(request: ChatRequest):
    """
    Intelligent EV Travel Assistant with tool and function calling integration.
    """
    try:
        return ai_assistant_service.process_chat(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat processing failed: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
