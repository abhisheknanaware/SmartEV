package com.smartev.booking;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.smartev.slot.ParkingSlot;
import com.smartev.station.Station;
import com.smartev.user.User;
import com.smartev.vehicle.Vehicle;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

@Entity
@Table(name = "bookings")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Booking {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 64)
    private String bookingReference; // e.g. SEV-20261008-ABCD

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler", "password"})
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "station_id", nullable = false)
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private Station station;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "slot_id", nullable = false)
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private ParkingSlot slot;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "vehicle_id")
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private Vehicle vehicle;

    @Column(nullable = false)
    private LocalDate bookingDate;

    @Column(nullable = false)
    private LocalTime startTime;

    @Column(nullable = false)
    private LocalTime endTime;

    @Builder.Default
    private Double totalHours = 2.0;

    @Builder.Default
    private Double chargingKwh = 25.0;

    @Column(nullable = false)
    private Double totalAmount; // INR

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private BookingStatus status = BookingStatus.HELD;

    private String razorpayOrderId;
    private String razorpayPaymentId;

    @Lob
    @Column(columnDefinition = "TEXT")
    private String qrCodeBase64;

    private LocalDateTime holdExpiresAt;

    @CreationTimestamp
    @Column(updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    private LocalDateTime updatedAt;
}
