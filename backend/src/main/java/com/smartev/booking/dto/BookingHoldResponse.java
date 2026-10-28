package com.smartev.booking.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BookingHoldResponse {
    private Long bookingId;
    private String bookingReference;
    private String stationName;
    private String slotNumber;
    private Double totalAmount;
    private String razorpayOrderId;
    private String razorpayKeyId;
    private Integer holdExpiresInSeconds; // 600
    private LocalDateTime holdExpiresAt;
    private String status;
    private String message;
}
