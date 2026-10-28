package com.smartev.battery;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/battery")
@RequiredArgsConstructor
@Tag(name = "Battery Intelligence", description = "Machine learning SOH and RUL telemetry analysis and model evaluation")
public class BatteryController {

    private final BatteryService batteryService;

    @PostMapping("/telemetry/{vehicleId}")
    @Operation(summary = "Submit new battery pack telemetry and calculate XGBoost SOH and RUL predictions")
    public ResponseEntity<Map<String, Object>> submitTelemetry(
            @PathVariable Long vehicleId,
            @RequestBody BatteryTelemetry telemetry) {
        return ResponseEntity.ok(batteryService.recordTelemetryAndPredict(vehicleId, telemetry));
    }

    @GetMapping("/latest/{vehicleId}")
    @Operation(summary = "Retrieve latest predicted SOH, RUL, and operational health telemetry")
    public ResponseEntity<Map<String, Object>> getLatest(@PathVariable Long vehicleId) {
        return ResponseEntity.ok(batteryService.getLatestTelemetry(vehicleId));
    }

    @GetMapping("/history/{vehicleId}")
    @Operation(summary = "Get historical degradation progression data for battery charts")
    public ResponseEntity<List<BatteryTelemetry>> getHistory(@PathVariable Long vehicleId) {
        return ResponseEntity.ok(batteryService.getTelemetryHistory(vehicleId));
    }

    @GetMapping("/model-evaluation")
    @Operation(summary = "Get comparative machine learning model evaluation metrics (MAE, RMSE, R²) for SOH")
    public ResponseEntity<Map<String, Object>> getModelEvaluation() {
        return ResponseEntity.ok(batteryService.getModelEvaluation());
    }

    @PostMapping("/diagnostics")
    @Operation(summary = "Run comprehensive multi-objective battery diagnostics including thermal failure risk")
    public ResponseEntity<Map<String, Object>> runDiagnostics(@RequestBody Map<String, Object> input) {
        return ResponseEntity.ok(batteryService.runDiagnostics(input));
    }

    @GetMapping("/simulator-info")
    @Operation(summary = "Training data, held-out evaluation and supported ranges of the SOH simulator model")
    public ResponseEntity<Map<String, Object>> simulatorInfo() {
        return ResponseEntity.ok(batteryService.simulatorInfo());
    }

    @PostMapping("/simulate")
    @Operation(summary = "What-if SOH simulation from chemistry, cycles, temperature and C-rates (model trained on lab cycling data)")
    public ResponseEntity<Map<String, Object>> simulate(@RequestBody Map<String, Object> input) {
        return ResponseEntity.ok(batteryService.simulateSoh(input));
    }

    @GetMapping("/chemistry-insights")
    @Operation(summary = "Get empirical degradation benchmarks and trajectories across LFP, NMC, NCA, and LMO chemistries")
    public ResponseEntity<Map<String, Object>> getChemistryInsights() {
        return ResponseEntity.ok(batteryService.getChemistryInsights());
    }
}
