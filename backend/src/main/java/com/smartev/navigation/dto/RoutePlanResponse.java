package com.smartev.navigation.dto;

import com.smartev.station.dto.StationResponse;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RoutePlanResponse {
    private String originName;
    private String destinationName;
    private Double startLat;
    private Double startLng;
    private Double destLat;
    private Double destLng;
    private Double distanceKm;
    private Integer durationMinutes;
    private List<List<Double>> routeCoordinates; // [[lat, lng], [lat, lng], ...]
    private String chargeStatus;
    private String statusExplanation;
    private Long recommendedStationId;
    private String recommendedStationName;
    private String primaryReason;
    private Map<String, Object> topRecommendation;
    private List<Map<String, Object>> allStationsAlongRoute;
}
