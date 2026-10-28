package com.smartev.battery;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.smartev.vehicle.Vehicle;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "battery_telemetry")
@Getter
@Setter
public class BatteryTelemetry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "vehicle_id", nullable = false)
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler", "user"})
    private Vehicle vehicle;

    private Double voltage; // V
    private Double current; // A
    private Double temperature; // °C
    private Double capacity; // Ah
    private Double internalResistance; // mOhm
    private Integer chargeCycles;
    private Double chargingTime; // min
    private Double dischargingTime; // min
    private Double energyThroughput; // kWh

    private Double predictedSoh; // %
    private Integer predictedRulCycles;
    private String healthStatus; // EXCELLENT, GOOD, MODERATE, CRITICAL

    @CreationTimestamp
    @Column(updatable = false)
    private LocalDateTime recordedAt;

    public BatteryTelemetry() {
    }

    public BatteryTelemetry(Long id, Vehicle vehicle, Double voltage, Double current, Double temperature,
                            Double capacity, Double internalResistance, Integer chargeCycles,
                            Double chargingTime, Double dischargingTime, Double energyThroughput,
                            Double predictedSoh, Integer predictedRulCycles, String healthStatus,
                            LocalDateTime recordedAt) {
        this.id = id;
        this.vehicle = vehicle;
        this.voltage = voltage;
        this.current = current;
        this.temperature = temperature;
        this.capacity = capacity;
        this.internalResistance = internalResistance;
        this.chargeCycles = chargeCycles;
        this.chargingTime = chargingTime;
        this.dischargingTime = dischargingTime;
        this.energyThroughput = energyThroughput;
        this.predictedSoh = predictedSoh;
        this.predictedRulCycles = predictedRulCycles;
        this.healthStatus = healthStatus;
        this.recordedAt = recordedAt;
    }

    public static BatteryTelemetryBuilder builder() {
        return new BatteryTelemetryBuilder();
    }

    public static class BatteryTelemetryBuilder {
        private Long id;
        private Vehicle vehicle;
        private Double voltage;
        private Double current;
        private Double temperature;
        private Double capacity;
        private Double internalResistance;
        private Integer chargeCycles;
        private Double chargingTime;
        private Double dischargingTime;
        private Double energyThroughput;
        private Double predictedSoh;
        private Integer predictedRulCycles;
        private String healthStatus;
        private LocalDateTime recordedAt;

        public BatteryTelemetryBuilder id(Long id) { this.id = id; return this; }
        public BatteryTelemetryBuilder vehicle(Vehicle vehicle) { this.vehicle = vehicle; return this; }
        public BatteryTelemetryBuilder voltage(Double voltage) { this.voltage = voltage; return this; }
        public BatteryTelemetryBuilder current(Double current) { this.current = current; return this; }
        public BatteryTelemetryBuilder temperature(Double temperature) { this.temperature = temperature; return this; }
        public BatteryTelemetryBuilder capacity(Double capacity) { this.capacity = capacity; return this; }
        public BatteryTelemetryBuilder internalResistance(Double internalResistance) { this.internalResistance = internalResistance; return this; }
        public BatteryTelemetryBuilder chargeCycles(Integer chargeCycles) { this.chargeCycles = chargeCycles; return this; }
        public BatteryTelemetryBuilder chargingTime(Double chargingTime) { this.chargingTime = chargingTime; return this; }
        public BatteryTelemetryBuilder dischargingTime(Double dischargingTime) { this.dischargingTime = dischargingTime; return this; }
        public BatteryTelemetryBuilder energyThroughput(Double energyThroughput) { this.energyThroughput = energyThroughput; return this; }
        public BatteryTelemetryBuilder predictedSoh(Double predictedSoh) { this.predictedSoh = predictedSoh; return this; }
        public BatteryTelemetryBuilder predictedRulCycles(Integer predictedRulCycles) { this.predictedRulCycles = predictedRulCycles; return this; }
        public BatteryTelemetryBuilder healthStatus(String healthStatus) { this.healthStatus = healthStatus; return this; }
        public BatteryTelemetryBuilder recordedAt(LocalDateTime recordedAt) { this.recordedAt = recordedAt; return this; }

        public BatteryTelemetry build() {
            return new BatteryTelemetry(id, vehicle, voltage, current, temperature, capacity, internalResistance,
                    chargeCycles, chargingTime, dischargingTime, energyThroughput, predictedSoh,
                    predictedRulCycles, healthStatus, recordedAt);
        }
    }
}
