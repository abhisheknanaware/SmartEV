package com.smartev.vehicle;

import com.smartev.exception.ResourceNotFoundException;
import com.smartev.user.User;
import com.smartev.user.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class VehicleService {

    private final VehicleRepository vehicleRepository;
    private final UserRepository userRepository;
    private final com.smartev.booking.BookingRepository bookingRepository;
    private final com.smartev.health.ChargingSessionRepository sessionRepository;

    @Transactional(readOnly = true)
    public List<Vehicle> getUserVehicles(Long userId) {
        return vehicleRepository.findByUserIdOrderByCreatedAtDesc(userId);
    }

    @Transactional(readOnly = true)
    public Vehicle getVehicleById(Long id) {
        return vehicleRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Vehicle not found: " + id));
    }

    @Transactional
    public Vehicle addVehicle(Vehicle vehicle, Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found: " + userId));
        validate(vehicle);
        vehicle.setUser(user);
        return vehicleRepository.save(vehicle);
    }

    private static void validate(Vehicle v) {
        if (v.getVehicleNumber() == null || v.getVehicleNumber().isBlank()) {
            throw new IllegalArgumentException("Vehicle registration number is required");
        }
        if (v.getModel() == null || v.getModel().isBlank()) {
            throw new IllegalArgumentException("Vehicle model is required");
        }
        if (v.getBatteryCapacityKwh() == null || v.getBatteryCapacityKwh() <= 0) {
            throw new IllegalArgumentException("Battery capacity must be a positive number of kWh");
        }
        if (v.getConnectorType() == null || v.getConnectorType().isBlank()) {
            throw new IllegalArgumentException("Connector type is required");
        }
        if (v.getChemistry() != null) {
            String c = v.getChemistry().trim().toUpperCase();
            if (!java.util.Set.of("LFP", "NMC", "NCA", "LCO").contains(c)) {
                throw new IllegalArgumentException("Chemistry must be LFP, NMC, NCA or LCO");
            }
            v.setChemistry(c);
        }
    }

    @Transactional
    public Vehicle updateVehicle(Long id, Vehicle updated, Long userId) {
        Vehicle existing = getVehicleById(id);
        if (!existing.getUser().getId().equals(userId)) {
            throw new org.springframework.security.access.AccessDeniedException("You can only edit your own vehicles");
        }
        validate(updated);
        existing.setVehicleNumber(updated.getVehicleNumber());
        existing.setModel(updated.getModel());
        existing.setBatteryCapacityKwh(updated.getBatteryCapacityKwh());
        existing.setConnectorType(updated.getConnectorType());
        existing.setManufacturingYear(updated.getManufacturingYear());
        if (updated.getChemistry() != null) {
            existing.setChemistry(updated.getChemistry());
        }
        if (updated.getCurrentBatteryPct() != null) {
            existing.setCurrentBatteryPct(updated.getCurrentBatteryPct());
        }
        if (updated.getMaxChargingPowerKw() != null) {
            existing.setMaxChargingPowerKw(updated.getMaxChargingPowerKw());
        }
        if (updated.getCurrentSoh() != null) {
            existing.setCurrentSoh(updated.getCurrentSoh());
        }
        return vehicleRepository.save(existing);
    }

    @Transactional
    public void deleteVehicle(Long id, Long userId) {
        Vehicle existing = getVehicleById(id);
        if (!existing.getUser().getId().equals(userId)) {
            throw new org.springframework.security.access.AccessDeniedException("You can only delete your own vehicles");
        }
        if (bookingRepository.existsByVehicleId(id)) {
            throw new IllegalArgumentException("This vehicle has bookings on record, so it can't be removed. Edit it instead.");
        }
        sessionRepository.deleteByVehicleId(id);
        vehicleRepository.delete(existing);
    }
}
