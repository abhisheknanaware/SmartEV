package com.smartev.vehicle;

import com.smartev.security.JwtUtils;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/vehicles")
@RequiredArgsConstructor
@Tag(name = "Vehicles", description = "EV fleet and vehicle management")
public class VehicleController {

    private final VehicleService vehicleService;
    private final JwtUtils jwtUtils;

    private Long getUserIdFromHeader(String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            throw new org.springframework.security.authentication.AuthenticationCredentialsNotFoundException("Please log in to continue.");
        }
        Long userId;
        try {
            userId = jwtUtils.extractUserId(authHeader.substring(7));
        } catch (Exception e) {
            userId = null;
        }
        if (userId == null) {
            throw new org.springframework.security.authentication.BadCredentialsException("Your session is invalid. Please log in again.");
        }
        return userId;
    }

    @GetMapping
    @Operation(summary = "Get all vehicles registered by the logged-in user")
    public ResponseEntity<List<Vehicle>> getUserVehicles(@RequestHeader(value = "Authorization", required = false) String authHeader) {
        Long userId = getUserIdFromHeader(authHeader);
        return ResponseEntity.ok(vehicleService.getUserVehicles(userId));
    }

    @PostMapping
    @Operation(summary = "Register a new EV in the user garage")
    public ResponseEntity<Vehicle> addVehicle(@RequestBody Vehicle vehicle,
                                              @RequestHeader(value = "Authorization", required = false) String authHeader) {
        Long userId = getUserIdFromHeader(authHeader);
        return ResponseEntity.status(HttpStatus.CREATED).body(vehicleService.addVehicle(vehicle, userId));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update vehicle battery capacity or connector type")
    public ResponseEntity<Vehicle> updateVehicle(@PathVariable Long id,
                                                 @RequestBody Vehicle vehicle,
                                                 @RequestHeader(value = "Authorization", required = false) String authHeader) {
        Long userId = getUserIdFromHeader(authHeader);
        return ResponseEntity.ok(vehicleService.updateVehicle(id, vehicle, userId));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete vehicle profile")
    public ResponseEntity<Void> deleteVehicle(@PathVariable Long id,
                                              @RequestHeader(value = "Authorization", required = false) String authHeader) {
        Long userId = getUserIdFromHeader(authHeader);
        vehicleService.deleteVehicle(id, userId);
        return ResponseEntity.noContent().build();
    }
}
