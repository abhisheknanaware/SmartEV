package com.smartev.health;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ChargingSessionRepository extends JpaRepository<ChargingSession, Long> {

    List<ChargingSession> findByVehicleIdOrderBySessionDateAscIdAsc(Long vehicleId);

    boolean existsByBookingId(Long bookingId);

    void deleteByVehicleId(Long vehicleId);
}
