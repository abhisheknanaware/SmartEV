from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any

class StationCandidate(BaseModel):
    id: int
    name: str
    latitude: float
    longitude: float
    address: str
    distance_from_route_km: float = 0.0
    distance_along_route_km: float = 0.0
    total_slots: int = 10
    available_slots: int = 5
    charger_types: List[str] = ["CCS2", "Type 2"]
    max_charging_speed_kw: float = 120.0
    price_per_kwh: float = 14.0
    parking_price_per_hour: float = 50.0
    rating: float = 4.5
    review_count: int = 42
    historical_utilization_pct: float = 65.0
    predicted_demand_pct: float = 70.0
    amenities: List[str] = ["Restrooms", "Cafe", "Wi-Fi"]

class RouteRecommendationRequest(BaseModel):
    start_latitude: float
    start_longitude: float
    destination_latitude: float
    destination_longitude: float
    start_address: Optional[str] = "Pune, Maharashtra"
    destination_address: Optional[str] = "Mumbai, Maharashtra"
    battery_level: float = Field(..., ge=0, le=100, description="Current EV battery percentage")
    battery_soh: Optional[float] = Field(92.0, ge=0, le=100)
    battery_capacity_kwh: Optional[float] = Field(60.0, ge=10, le=200)
    vehicle_model: Optional[str] = "Tata Nexon EV Max"
    connector_type: Optional[str] = "CCS2"
    stations: List[StationCandidate]

class StationScoreBreakdown(BaseModel):
    proximity_score: float
    charging_speed_score: float
    availability_score: float
    price_score: float
    rating_score: float
    compatibility_score: float
    demand_penalty: float
    overall_score: float

class RecommendedStationResult(BaseModel):
    station: StationCandidate
    score: float
    is_top_recommendation: bool
    ai_badge: Optional[str] = None
    reason: str
    score_breakdown: StationScoreBreakdown
    estimated_charging_time_min: int
    charge_needed_kwh: float

class RouteRecommendationResponse(BaseModel):
    route_distance_km: float
    estimated_duration_min: int
    charge_status: str # "CHARGING_REQUIRED", "CHARGING_RECOMMENDED", "SAFE_RANGE"
    status_explanation: str
    recommended_station_id: int
    recommended_station_name: str
    primary_reason: str
    top_recommendation: RecommendedStationResult
    all_ranked_stations: List[RecommendedStationResult]
