package com.smartev.navigation;

import com.smartev.navigation.dto.RoutePlanRequest;
import com.smartev.navigation.dto.RoutePlanResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/navigation")
@RequiredArgsConstructor
@Tag(name = "Navigation", description = "EV Navigation route planning and intelligent station recommendation")
public class NavigationController {

    private final NavigationService navigationService;

    @PostMapping("/plan-route")
    @Operation(summary = "Calculate route, detect stations along corridor, and generate AI station recommendations")
    public ResponseEntity<RoutePlanResponse> planRoute(@RequestBody RoutePlanRequest request) {
        return ResponseEntity.ok(navigationService.planRoute(request));
    }
}
