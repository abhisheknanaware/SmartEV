package com.smartev.station.dto;

import com.smartev.slot.SlotStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StationResponse {
    private Long id;
    private String name;
    private String address;
    private String city;
    private Double latitude;
    private Double longitude;
    private Double parkingPricePerHour;
    private Double chargingPricePerKwh;
    private Double maxChargingSpeedKw;
    private String chargerTypes;
    private Integer totalSlots;
    private Integer availableSlots;
    private Double rating;
    private Integer reviewCount;
    private String imageUrl;
    private String openingHours;
    private String amenities;
    private Boolean active;
    private Double distanceFromRouteKm;
    private Double distanceAlongRouteKm;
    private List<SlotDto> slots;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class SlotDto {
        private Long id;
        private String slotNumber;
        private String chargerType;
        private Double maxKw;
        private SlotStatus status;
        private Boolean isAvailable;
    }
}
