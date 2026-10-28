package com.smartev.vehicle;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.smartev.user.User;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "vehicles")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Vehicle {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    @JsonIgnore
    private User user;

    @JsonProperty("userId")
    public Long getUserId() {
        return user != null ? user.getId() : null;
    }

    // The web UI uses licensePlate / currentSocPercent / year; both spellings are accepted.
    @Column(nullable = false, length = 30)
    @JsonAlias({"licensePlate", "registrationNumber"})
    private String vehicleNumber; // e.g. MH 12 AB 1234

    @Column(nullable = false)
    private String model; // e.g. Tata Nexon EV Max

    @Column(nullable = false)
    private Double batteryCapacityKwh; // e.g. 40.5

    @Column(nullable = false)
    private String connectorType; // e.g. CCS2

    /** Cell chemistry (LFP, NMC, NCA, LCO); drives charging advice. Null means unknown. */
    @Column(length = 8)
    private String chemistry;

    @JsonAlias("year")
    private Integer manufacturingYear;

    @Builder.Default
    @JsonAlias("currentSocPercent")
    private Double currentBatteryPct = 68.0;

    private Double maxChargingPowerKw;

    // Unknown until a battery diagnosis is run; never defaulted to a made-up value.
    private Double currentSoh;

    @CreationTimestamp
    @Column(updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    private LocalDateTime updatedAt;

    @JsonProperty(value = "licensePlate", access = JsonProperty.Access.READ_ONLY)
    public String getLicensePlate() {
        return vehicleNumber;
    }

    @JsonProperty(value = "currentSocPercent", access = JsonProperty.Access.READ_ONLY)
    public Double getCurrentSocPercent() {
        return currentBatteryPct;
    }

    @JsonProperty(value = "year", access = JsonProperty.Access.READ_ONLY)
    public Integer getYear() {
        return manufacturingYear;
    }
}
