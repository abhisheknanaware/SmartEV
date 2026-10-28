package com.smartev.slot;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.smartev.station.Station;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "parking_slots",
       uniqueConstraints = {@UniqueConstraint(columnNames = {"station_id", "slot_number"})})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ParkingSlot {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "station_id", nullable = false)
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private Station station;

    @Column(nullable = false, length = 20)
    private String slotNumber; // e.g. A1, A2, A3...

    @Column(nullable = false)
    private String chargerType; // CCS2, Type 2, etc.

    @Column(nullable = false)
    private Double maxKw; // e.g. 120.0

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private SlotStatus status = SlotStatus.AVAILABLE;
}
