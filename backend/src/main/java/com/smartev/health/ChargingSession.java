package com.smartev.health;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.smartev.vehicle.Vehicle;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * One charge a driver logged: battery % before and after plus the energy on the receipt.
 * From these we estimate the pack's real usable capacity for that session.
 */
@Entity
@Table(name = "charging_sessions", indexes = @Index(name = "idx_session_vehicle", columnList = "vehicle_id"))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ChargingSession {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "vehicle_id")
    @JsonIgnore
    private Vehicle vehicle;

    /** Set when the session was a ChargeMate booking; null for home/other charging. */
    private Long bookingId;

    @Column(nullable = false)
    private LocalDate sessionDate;

    @Column(nullable = false)
    private Double socStartPct;

    @Column(nullable = false)
    private Double socEndPct;

    /** Energy drawn from the charger, as shown on the receipt or charger screen. */
    @Column(nullable = false)
    private Double energyKwh;

    /** AC or DC, which sets the charger-to-battery efficiency used in the estimate. */
    @Column(nullable = false, length = 4)
    private String chargerType;

    /** Derived: usable capacity implied by this session (kWh). */
    private Double estimatedCapacityKwh;

    /** Derived: estimatedCapacityKwh / vehicle nominal capacity, in %. */
    private Double sohPct;

    @CreationTimestamp
    @Column(updatable = false)
    private LocalDateTime createdAt;
}
