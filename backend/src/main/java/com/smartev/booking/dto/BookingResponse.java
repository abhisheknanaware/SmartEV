package com.smartev.booking.dto;

import com.smartev.booking.BookingStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BookingResponse {
    private Long id;
    private String bookingReference;
    private Long stationId;
    private String stationName;
    private String stationAddress;
    private Double stationLat;
    private Double stationLng;
    private Long slotId;
    private String slotNumber;
    private String chargerType;
    private String vehicleModel;
    private String vehicleNumber;
    private LocalDate bookingDate;
    private LocalTime startTime;
    private LocalTime endTime;
    private Double totalHours;
    private Double chargingKwh;
    private Double totalAmount;
    private BookingStatus status;
    private String qrCodeBase64;
    private Long userId;
    private String userName;
    private String userEmail;
    private String userPhone;
    private String razorpayOrderId;
    private String razorpayPaymentId;
    private LocalDateTime createdAt;
}
