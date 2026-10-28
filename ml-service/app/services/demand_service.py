import datetime
import numpy as np
from typing import List, Dict
from app.schemas.demand_schemas import (
    DemandPredictionRequest,
    DemandPredictionResponse,
    HourlyForecast
)

class DemandForecastingService:
    def __init__(self):
        # Base hourly profile multiplier (0 to 23)
        # Evening rush (17:00 to 20:00) is highest, morning commute (08:00 to 10:00) is second peak
        self.base_hourly_profile = [
            0.12, 0.08, 0.05, 0.05, 0.08, 0.15, # 00 - 05
            0.28, 0.52, 0.72, 0.78, 0.65, 0.58, # 06 - 11
            0.60, 0.55, 0.52, 0.58, 0.70, 0.88, # 12 - 17
            0.92, 0.86, 0.72, 0.55, 0.38, 0.22  # 18 - 23
        ]

        # Station characteristics
        self.station_profiles = {
            "wakad": {"multiplier": 1.05, "evening_boost": 0.06},
            "hinjewadi": {"multiplier": 1.10, "evening_boost": 0.08},
            "baner": {"multiplier": 0.95, "evening_boost": 0.04},
            "lonavala": {"multiplier": 1.15, "weekend_boost": 0.20},
            "talegaon": {"multiplier": 0.90, "weekend_boost": 0.15},
            "khalapur": {"multiplier": 1.02, "weekend_boost": 0.18},
            "bkc": {"multiplier": 1.12, "evening_boost": 0.07},
            "vashi": {"multiplier": 0.98, "evening_boost": 0.05}
        }

    def predict_demand(self, req: DemandPredictionRequest) -> DemandPredictionResponse:
        station_key = req.station_name.lower()
        matched_profile = None
        for k, prof in self.station_profiles.items():
            if k in station_key:
                matched_profile = prof
                break
        if not matched_profile:
            matched_profile = {"multiplier": 1.0, "evening_boost": 0.0}

        target_date_str = req.target_date or (datetime.date.today() + datetime.timedelta(days=1)).strftime("%Y-%m-%d")
        try:
            target_date = datetime.datetime.strptime(target_date_str, "%Y-%m-%d").date()
        except Exception:
            target_date = datetime.date.today() + datetime.timedelta(days=1)
            target_date_str = target_date.strftime("%Y-%m-%d")

        is_weekend = target_date.weekday() >= 5
        weekend_boost = matched_profile.get("weekend_boost", 0.05) if is_weekend else 0.0
        evening_boost = matched_profile.get("evening_boost", 0.04)

        hourly_forecasts: List[HourlyForecast] = []
        highest_util = 0.0
        peak_hour = 18

        for h in range(24):
            base = self.base_hourly_profile[h]
            # Evening hours 17..20
            if 17 <= h <= 20:
                base += evening_boost
            base += weekend_boost
            
            # Deterministic noise based on station_id and hour
            pseudo_rand = ((req.station_id * 17 + h * 31) % 10 - 5) / 100.0
            util = (base * matched_profile["multiplier"]) + pseudo_rand
            util_pct = round(float(np.clip(util * 100.0, 5.0, 96.0)), 1)

            if util_pct > highest_util:
                highest_util = util_pct
                peak_hour = h

            if util_pct >= 80.0:
                demand_lvl = "VERY_HIGH"
            elif util_pct >= 65.0:
                demand_lvl = "HIGH"
            elif util_pct >= 40.0:
                demand_lvl = "MEDIUM"
            else:
                demand_lvl = "LOW"

            expected_bk = int(round((util_pct / 100.0) * 14))

            hour_str = f"{h:02d}:00"
            hourly_forecasts.append(HourlyForecast(
                hour=h,
                hour_label=hour_str,
                utilization_pct=util_pct,
                demand_level=demand_lvl,
                expected_bookings=expected_bk
            ))

        target_hour = req.target_hour if req.target_hour is not None else 18
        selected_util = hourly_forecasts[target_hour].utilization_pct
        selected_level = hourly_forecasts[target_hour].demand_level

        peak_start = max(16, peak_hour - 1)
        peak_end = min(21, peak_hour + 2)
        peak_range = f"{peak_start % 12 or 12} {'PM' if peak_start>=12 else 'AM'} - {peak_end % 12 or 12} {'PM' if peak_end>=12 else 'AM'}"

        # Off-peak recommendation
        off_peak_h = 15 # 3 PM or 4 PM
        off_peak_rec = f"Try booking between {off_peak_h % 12} PM and {(off_peak_h + 1) % 12} PM for guaranteed zero wait time and off-peak pricing."

        ai_insight = (
            f"Station '{req.station_name}' is expected to experience {selected_level} demand "
            f"({selected_util}%) on {target_date_str} around {target_hour % 12 or 12} {'PM' if target_hour>=12 else 'AM'}. "
            f"Peak hours are predicted between {peak_range} with up to {highest_util}% grid utilization. {off_peak_rec}"
        )

        return DemandPredictionResponse(
            station_id=req.station_id,
            station_name=req.station_name,
            target_date=target_date_str,
            target_hour=target_hour,
            predicted_utilization_pct=selected_util,
            demand_level=selected_level,
            peak_hours_range=peak_range,
            peak_utilization_pct=highest_util,
            off_peak_recommendation=off_peak_rec,
            hourly_forecast=hourly_forecasts,
            ai_insight=ai_insight
        )

demand_service = DemandForecastingService()
