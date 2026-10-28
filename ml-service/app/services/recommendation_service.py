import math
from typing import List
from app.schemas.recommendation_schemas import (
    RouteRecommendationRequest,
    RouteRecommendationResponse,
    RecommendedStationResult,
    StationCandidate,
    StationScoreBreakdown
)

class IntelligentRecommendationService:
    def __init__(self):
        # Weights for multi-criteria optimization function
        self.w_proximity = 0.28
        self.w_speed = 0.22
        self.w_availability = 0.20
        self.w_price = 0.12
        self.w_rating = 0.10
        self.w_compatibility = 0.08

    def _haversine_distance(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Great-circle distance between two points in km"""
        R = 6371.0
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)
        a = (math.sin(dlat / 2) ** 2 +
             math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return R * c

    def recommend(self, req: RouteRecommendationRequest) -> RouteRecommendationResponse:
        direct_dist = self._haversine_distance(
            req.start_latitude, req.start_longitude,
            req.destination_latitude, req.destination_longitude
        )
        # Approximate road distance multiplier
        road_distance_km = round(direct_dist * 1.25, 1)
        if road_distance_km < 10:
            road_distance_km = 148.0 # fallback Pune -> Mumbai standard distance
        
        duration_min = int(round((road_distance_km / 65.0) * 60))

        # Battery analysis
        capacity_kwh = req.battery_capacity_kwh or 60.0
        current_energy_kwh = capacity_kwh * (req.battery_level / 100.0)
        # Avg consumption 0.16 kWh per km
        energy_needed_kwh = road_distance_km * 0.165
        remaining_at_dest = current_energy_kwh - energy_needed_kwh

        if remaining_at_dest < 5.0 or req.battery_level < 35.0:
            charge_status = "CHARGING_REQUIRED"
            status_explanation = (
                f"Your battery is at {req.battery_level}% ({round(current_energy_kwh, 1)} kWh). "
                f"The planned journey requires ~{round(energy_needed_kwh, 1)} kWh. "
                "En-route charging is required to prevent depletion."
            )
        elif remaining_at_dest < 12.0 or req.battery_level < 55.0:
            charge_status = "CHARGING_RECOMMENDED"
            status_explanation = (
                f"Your battery is at {req.battery_level}%. Safe buffer upon arrival is low (~{round(max(0, remaining_at_dest), 1)} kWh). "
                "We recommend a short top-up along your route."
            )
        else:
            charge_status = "SAFE_RANGE"
            status_explanation = (
                f"Your battery is at {req.battery_level}%. You have sufficient range for this trip, "
                "but backup stations are listed below."
            )

        charge_needed_kwh = round(max(15.0, (capacity_kwh * 0.8) - current_energy_kwh), 1)

        ranked_results: List[RecommendedStationResult] = []

        for st in req.stations:
            # 1. Proximity score: closer to route = higher score (exponential decay over 15km)
            dev_km = max(0.1, st.distance_from_route_km)
            prox_score = max(0.0, 1.0 - (dev_km / 12.0))

            # 2. Speed score: normalized to 150 kW max
            speed_score = min(1.0, st.max_charging_speed_kw / 150.0)

            # 3. Availability score: available ratio
            avail_ratio = st.available_slots / max(1, st.total_slots)
            # Penalize heavily if 0 slots available
            avail_score = 0.0 if st.available_slots == 0 else min(1.0, 0.3 + (avail_ratio * 0.7))

            # 4. Price score: ₹10/kWh is ideal (1.0), ₹25/kWh is lowest (0.2)
            price_score = max(0.2, min(1.0, 1.0 - ((st.price_per_kwh - 10.0) / 20.0)))

            # 5. Rating score: normalized (5.0 = 1.0)
            rating_score = min(1.0, st.rating / 5.0)

            # 6. Compatibility score
            user_conn = (req.connector_type or "CCS2").upper()
            is_compat = any(user_conn in ct.upper() for ct in st.charger_types)
            compat_score = 1.0 if is_compat else 0.2

            # 7. Demand penalty (if high demand, slight penalty)
            demand_penalty = (st.predicted_demand_pct / 100.0) * 0.12

            # Composite weighted formula
            overall = (
                (prox_score * self.w_proximity) +
                (speed_score * self.w_speed) +
                (avail_score * self.w_availability) +
                (price_score * self.w_price) +
                (rating_score * self.w_rating) +
                (compat_score * self.w_compatibility) -
                demand_penalty
            )
            overall = round(max(0.05, min(0.99, overall)), 3)

            # Estimate charging time
            effective_speed = min(st.max_charging_speed_kw, 100.0)
            est_charge_min = int(round((charge_needed_kwh / effective_speed) * 60))

            # Score breakdown
            breakdown = StationScoreBreakdown(
                proximity_score=round(prox_score, 2),
                charging_speed_score=round(speed_score, 2),
                availability_score=round(avail_score, 2),
                price_score=round(price_score, 2),
                rating_score=round(rating_score, 2),
                compatibility_score=round(compat_score, 2),
                demand_penalty=round(demand_penalty, 2),
                overall_score=overall
            )

            # Justification generator
            reasons = []
            if st.max_charging_speed_kw >= 100:
                reasons.append(f"high-speed {int(st.max_charging_speed_kw)} kW fast charging")
            if st.available_slots >= 4:
                reasons.append(f"{st.available_slots} currently available slots")
            if dev_km <= 2.5:
                reasons.append(f"only {round(dev_km, 1)} km detour from your highway route")
            if st.rating >= 4.5:
                reasons.append(f"stellar {st.rating}driver rating")
            if st.price_per_kwh <= 14:
                reasons.append(f"competitive ₹{st.price_per_kwh}/kWh pricing")

            reason_text = f"{st.name} is recommended because it features " + ", ".join(reasons[:3]) + "."

            ranked_results.append(RecommendedStationResult(
                station=st,
                score=overall,
                is_top_recommendation=False,
                ai_badge=None,
                reason=reason_text,
                score_breakdown=breakdown,
                estimated_charging_time_min=est_charge_min,
                charge_needed_kwh=charge_needed_kwh
            ))

        # Sort descending by score
        ranked_results.sort(key=lambda x: x.score, reverse=True)

        if ranked_results:
            ranked_results[0].is_top_recommendation = True
            ranked_results[0].ai_badge = "AI Recommended "
            
            # Additional badge for secondary standout
            if len(ranked_results) > 1:
                fastest = max(ranked_results[1:], key=lambda x: x.station.max_charging_speed_kw)
                fastest.ai_badge = "Ultra-Fast "
            if len(ranked_results) > 2:
                cheapest = min(ranked_results[2:], key=lambda x: x.station.price_per_kwh)
                cheapest.ai_badge = "Best Value "

            top = ranked_results[0]
            top_id = top.station.id
            top_name = top.station.name
            top_reason = top.reason
        else:
            raise ValueError("No candidate stations provided for recommendation.")

        return RouteRecommendationResponse(
            route_distance_km=road_distance_km,
            estimated_duration_min=duration_min,
            charge_status=charge_status,
            status_explanation=status_explanation,
            recommended_station_id=top_id,
            recommended_station_name=top_name,
            primary_reason=top_reason,
            top_recommendation=top,
            all_ranked_stations=ranked_results
        )

recommendation_service = IntelligentRecommendationService()
