package com.smartev.slot;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface SlotRepository extends JpaRepository<ParkingSlot, Long> {
    List<ParkingSlot> findByStationIdOrderBySlotNumberAsc(Long stationId);
    Optional<ParkingSlot> findByStationIdAndSlotNumber(Long stationId, String slotNumber);
}
