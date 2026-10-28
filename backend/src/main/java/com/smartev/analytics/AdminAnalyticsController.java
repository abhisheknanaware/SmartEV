package com.smartev.analytics;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/analytics")
@RequiredArgsConstructor
@Tag(name = "Analytics", description = "Admin analytics and AI utilization insights")
public class AdminAnalyticsController {

    private final AdminAnalyticsService analyticsService;

    @GetMapping("/admin-dashboard")
    @Operation(summary = "Get high-level admin metrics, historical & predicted utilization, and AI insights")
    public ResponseEntity<Map<String, Object>> getAdminStats() {
        return ResponseEntity.ok(analyticsService.getAdminDashboardStats());
    }
}
