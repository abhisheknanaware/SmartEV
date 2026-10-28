package com.smartev.booking.dto;

import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BookingHoldRequest {

    @NotNull(message = "Station ID is required")
    private Long stationId;

    @NotNull(message = "Slot ID is required")
    private Long slotId;

    private Long vehicleId;

    @NotNull(message = "Booking date is required")
    private LocalDate bookingDate;

    @NotNull(message = "Start time is required")
    private LocalTime startTime;

    @NotNull(message = "End time is required")
    private LocalTime endTime;

    @Builder.Default
    private Double chargingKwh = 25.0;
}
