package com.smartev.station;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "stations")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Station {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false, length = 500)
    private String address;

    private String city;

    @Column(nullable = false)
    private Double latitude;

    @Column(nullable = false)
    private Double longitude;

    @Column(nullable = false)
    private Double parkingPricePerHour;

    @Column(nullable = false)
    private Double chargingPricePerKwh;

    @Column(nullable = false)
    private Double maxChargingSpeedKw;

    @Column(nullable = false)
    private String chargerTypes; // e.g. "CCS2, Type 2, CHAdeMO"

    @Column(nullable = false)
    private Integer totalSlots;

    @Builder.Default
    private Double rating = 4.5;

    @Builder.Default
    private Integer reviewCount = 0;

    @Column(length = 1000)
    private String imageUrl;

    @Builder.Default
    private String openingHours = "24/7";

    @Column(length = 500)
    private String amenities; // e.g. "Restroom, Cafe, Free Wi-Fi, Lounge"

    @Builder.Default
    private Boolean active = true;

    @CreationTimestamp
    @Column(updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    private LocalDateTime updatedAt;
}
