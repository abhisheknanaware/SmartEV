package com.smartev.health;

import com.smartev.security.JwtUtils;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/vehicles/{vehicleId}")
@RequiredArgsConstructor
@Tag(name = "Battery health", description = "Personal battery health estimated from logged charging sessions")
public class BatteryHealthController {

    private final BatteryHealthService service;
    private final JwtUtils jwtUtils;

    private Long userId(String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            throw new org.springframework.security.authentication.AuthenticationCredentialsNotFoundException("Please log in to continue.");
        }
        Long id;
        try {
            id = jwtUtils.extractUserId(authHeader.substring(7));
        } catch (Exception e) {
            id = null;
        }
        if (id == null) {
            throw new org.springframework.security.authentication.BadCredentialsException("Your session is invalid. Please log in again.");
        }
        return id;
    }

    @GetMapping("/health")
    @Operation(summary = "Health estimate and logged charges for one of your vehicles")
    public ResponseEntity<Map<String, Object>> health(@PathVariable Long vehicleId, @RequestHeader(value = "Authorization", required = false) String auth) {
        return ResponseEntity.ok(service.health(vehicleId, userId(auth)));
    }

    @PostMapping("/sessions")
    @Operation(summary = "Log a charge (battery % before/after and kWh) and update the health estimate")
    public ResponseEntity<Map<String, Object>> log(@PathVariable Long vehicleId, @RequestBody Map<String, Object> body,
                                                   @RequestHeader(value = "Authorization", required = false) String auth) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.logSession(vehicleId, userId(auth), body));
    }

    @DeleteMapping("/sessions/{sessionId}")
    @Operation(summary = "Remove a logged charge")
    public ResponseEntity<Map<String, Object>> delete(@PathVariable Long vehicleId, @PathVariable Long sessionId,
                                                      @RequestHeader(value = "Authorization", required = false) String auth) {
        return ResponseEntity.ok(service.deleteSession(vehicleId, sessionId, userId(auth)));
    }
}
