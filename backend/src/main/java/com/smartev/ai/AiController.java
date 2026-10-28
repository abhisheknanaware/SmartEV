package com.smartev.ai;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/ai")
@RequiredArgsConstructor
@Tag(name = "AI Engine", description = "AI Assistant copilot and machine learning demand predictions")
public class AiController {

    private final AiService aiService;

    @PostMapping("/chat")
    @Operation(summary = "Converse with SmartEV AI Travel Assistant with automated tool execution")
    public ResponseEntity<Map<String, Object>> chat(@RequestBody Map<String, Object> request) {
        return ResponseEntity.ok(aiService.processChat(request));
    }

    @GetMapping("/demand/{stationId}")
    @Operation(summary = "Predict future charging demand, utilization percentages, and off-peak recommendations")
    public ResponseEntity<Map<String, Object>> predictDemand(
            @PathVariable Long stationId,
            @RequestParam(required = false) String date,
            @RequestParam(required = false) Integer hour) {
        return ResponseEntity.ok(aiService.predictDemand(stationId, date, hour));
    }
}
