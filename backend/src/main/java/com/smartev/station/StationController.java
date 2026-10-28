package com.smartev.station;

import com.smartev.station.dto.StationResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

@RestController
@RequestMapping("/api/stations")
@RequiredArgsConstructor
@Tag(name = "Stations", description = "Station discovery, slots, and geographic querying")
public class StationController {

    private final StationService stationService;

    @GetMapping
    @Operation(summary = "Get all active charging stations with slot availability for a specified date/time")
    public ResponseEntity<List<StationResponse>> getAllStations(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.TIME) LocalTime startTime,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.TIME) LocalTime endTime) {
        return ResponseEntity.ok(stationService.getAllStations(date, startTime, endTime));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get station details with physical slot statuses for a specified date/time window")
    public ResponseEntity<StationResponse> getStationById(
            @PathVariable Long id,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.TIME) LocalTime startTime,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.TIME) LocalTime endTime) {
        return ResponseEntity.ok(stationService.getStationById(id, date, startTime, endTime));
    }

    @GetMapping("/nearby")
    @Operation(summary = "Search nearest stations around latitude/longitude coordinates")
    public ResponseEntity<List<StationResponse>> getNearby(
            @RequestParam Double lat,
            @RequestParam Double lng,
            @RequestParam(defaultValue = "25.0") Double radius) {
        return ResponseEntity.ok(stationService.getNearbyStations(lat, lng, radius));
    }

    @PostMapping
    @Operation(summary = "Add a new charging station (Admin)")
    public ResponseEntity<Station> createStation(@RequestBody Station station) {
        return ResponseEntity.status(HttpStatus.CREATED).body(stationService.createStation(station));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update an existing charging station (Admin)")
    public ResponseEntity<Station> updateStation(@PathVariable Long id, @RequestBody Station station) {
        return ResponseEntity.ok(stationService.updateStation(id, station));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete or deactivate a station (Admin)")
    public ResponseEntity<Void> deleteStation(@PathVariable Long id) {
        stationService.deleteStation(id);
        return ResponseEntity.noContent().build();
    }
}
