from pydantic import BaseModel, Field
from typing import List, Dict, Optional

class DemandPredictionRequest(BaseModel):
    station_id: int
    station_name: str
    target_date: Optional[str] = None # YYYY-MM-DD
    target_hour: Optional[int] = Field(None, ge=0, le=23)

class HourlyForecast(BaseModel):
    hour: int
    hour_label: str
    utilization_pct: float
    demand_level: str # LOW, MEDIUM, HIGH, VERY_HIGH
    expected_bookings: int

class DemandPredictionResponse(BaseModel):
    station_id: int
    station_name: str
    target_date: str
    target_hour: Optional[int]
    predicted_utilization_pct: float
    demand_level: str
    peak_hours_range: str
    peak_utilization_pct: float
    off_peak_recommendation: str
    hourly_forecast: List[HourlyForecast]
    ai_insight: str
