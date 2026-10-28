package com.smartev.navigation.dto;

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
public class RoutePlanRequest {
    private String origin;
    private String destination;
    private Double startLat;
    private Double startLng;
    private Double destLat;
    private Double destLng;
    private Double currentBatteryPct;
    private Double batteryCapacityKwh;
    private String vehicleModel;
    private String connectorType;
}
