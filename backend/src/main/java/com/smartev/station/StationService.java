package com.smartev.station;

import com.smartev.booking.Booking;
import com.smartev.booking.BookingRepository;
import com.smartev.exception.ResourceNotFoundException;
import com.smartev.slot.ParkingSlot;
import com.smartev.slot.SlotRepository;
import com.smartev.slot.SlotStatus;
import com.smartev.station.dto.StationResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class StationService {

    private final StationRepository stationRepository;
    private final SlotRepository slotRepository;
    private final BookingRepository bookingRepository;
    private final com.smartev.review.ReviewRepository reviewRepository;
    private final StringRedisTemplate redisTemplate;

    public List<StationResponse> getAllStations(LocalDate date, LocalTime startTime, LocalTime endTime) {
        LocalDate queryDate = date != null ? date : LocalDate.now();
        LocalTime queryStart = startTime != null ? startTime : LocalTime.now();
        LocalTime queryEnd = endTime != null ? endTime : LocalTime.now().plusHours(2);

        List<Station> stations = stationRepository.findByActiveTrue();
        return stations.stream()
                .map(st -> buildStationResponse(st, queryDate, queryStart, queryEnd))
                .collect(Collectors.toList());
    }

    public StationResponse getStationById(Long id, LocalDate date, LocalTime startTime, LocalTime endTime) {
        Station station = stationRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Station not found: " + id));

        LocalDate queryDate = date != null ? date : LocalDate.now();
        LocalTime queryStart = startTime != null ? startTime : LocalTime.now();
        LocalTime queryEnd = endTime != null ? endTime : LocalTime.now().plusHours(2);

        return buildStationResponse(station, queryDate, queryStart, queryEnd);
    }

    public StationResponse buildStationResponse(Station station, LocalDate date, LocalTime startTime, LocalTime endTime) {
        List<ParkingSlot> physicalSlots = slotRepository.findByStationIdOrderBySlotNumberAsc(station.getId());

        // Find active bookings in this time window
        List<Booking> activeBookings = bookingRepository.findActiveBookingsForStationInWindow(
                station.getId(), date, startTime, endTime
        );

        Set<Long> bookedSlotIds = activeBookings.stream()
                .map(b -> b.getSlot().getId())
                .collect(Collectors.toSet());

        List<StationResponse.SlotDto> slotDtos = new ArrayList<>();
        int availableCount = 0;

        for (ParkingSlot s : physicalSlots) {
            SlotStatus effectiveStatus = s.getStatus();

            if (effectiveStatus == SlotStatus.MAINTENANCE || effectiveStatus == SlotStatus.DISABLED) {
                // Keep as is
            } else if (bookedSlotIds.contains(s.getId()) || effectiveStatus == SlotStatus.BOOKED) {
                effectiveStatus = SlotStatus.BOOKED;
            } else if (effectiveStatus == SlotStatus.HELD) {
                // Currently held
            } else {
                // Check if held in Redis
                boolean isHeld = false;
                try {
                    String redisKey = String.format("booking:hold:%d:%d:%s:%s",
                            station.getId(), s.getId(), date, startTime);
                    isHeld = Boolean.TRUE.equals(redisTemplate.hasKey(redisKey));
                } catch (Exception e) {
                    log.debug("Redis hold check bypassed: {}", e.getMessage());
                }

                if (isHeld) {
                    effectiveStatus = SlotStatus.HELD;
                } else {
                    effectiveStatus = SlotStatus.AVAILABLE;
                    availableCount++;
                }
            }

            slotDtos.add(StationResponse.SlotDto.builder()
                    .id(s.getId())
                    .slotNumber(s.getSlotNumber())
                    .chargerType(s.getChargerType())
                    .maxKw(s.getMaxKw())
                    .status(effectiveStatus)
                    .isAvailable(effectiveStatus == SlotStatus.AVAILABLE)
                    .build());
        }

        return StationResponse.builder()
                .id(station.getId())
                .name(station.getName())
                .address(station.getAddress())
                .city(station.getCity())
                .latitude(station.getLatitude())
                .longitude(station.getLongitude())
                .parkingPricePerHour(station.getParkingPricePerHour())
                .chargingPricePerKwh(station.getChargingPricePerKwh())
                .maxChargingSpeedKw(station.getMaxChargingSpeedKw())
                .chargerTypes(station.getChargerTypes())
                .totalSlots(physicalSlots.isEmpty() ? station.getTotalSlots() : physicalSlots.size())
                .availableSlots(availableCount)
                .rating(station.getRating())
                .reviewCount(station.getReviewCount())
                .imageUrl(station.getImageUrl())
                .openingHours(station.getOpeningHours())
                .amenities(station.getAmenities())
                .active(station.getActive())
                .slots(slotDtos)
                .build();
    }

    public List<StationResponse> getNearbyStations(Double lat, Double lng, Double radiusKm) {
        List<Station> stations = stationRepository.findNearestStations(lat, lng, 10);
        return stations.stream().map(st -> {
            StationResponse resp = buildStationResponse(st, LocalDate.now(), LocalTime.now(), LocalTime.now().plusHours(2));
            double dist = haversine(lat, lng, st.getLatitude(), st.getLongitude());
            resp.setDistanceFromRouteKm(Math.round(dist * 10.0) / 10.0);
            return resp;
        }).collect(Collectors.toList());
    }

    @Transactional
    public Station createStation(Station station) {
        requireText(station.getName(), "Station name");
        requireText(station.getAddress(), "Address");
        if (station.getLatitude() == null || station.getLongitude() == null
                || Math.abs(station.getLatitude()) > 90 || Math.abs(station.getLongitude()) > 180) {
            throw new IllegalArgumentException("Valid latitude and longitude are required");
        }
        if (station.getParkingPricePerHour() == null) station.setParkingPricePerHour(0.0);
        if (station.getChargingPricePerKwh() == null) throw new IllegalArgumentException("Charging price per kWh is required");
        if (station.getMaxChargingSpeedKw() == null) throw new IllegalArgumentException("Max charging speed (kW) is required");
        requireText(station.getChargerTypes(), "Charger types");
        if (station.getTotalSlots() == null || station.getTotalSlots() <= 0) {
            station.setTotalSlots(8);
        }
        if (station.getActive() == null) {
            station.setActive(true);
        }
        if (station.getRating() == null) {
            station.setRating(4.8);
        }
        if (station.getReviewCount() == null) {
            station.setReviewCount(0);
        }
        if (station.getOpeningHours() == null || station.getOpeningHours().isEmpty()) {
            station.setOpeningHours("24/7 Open");
        }
        if (station.getImageUrl() == null || station.getImageUrl().isEmpty()) {
            station.setImageUrl("https://images.unsplash.com/photo-1593941707882-a5bba14938c7?auto=format&fit=crop&w=800&q=80");
        }
        Station saved = stationRepository.save(station);
        int slotCount = saved.getTotalSlots();
        for (int i = 1; i <= slotCount; i++) {
            ParkingSlot slot = ParkingSlot.builder()
                    .station(saved)
                    .slotNumber("A" + i)
                    .chargerType(i <= Math.max(1, (int)(slotCount * 0.7)) ? "CCS2" : "Type 2")
                    .maxKw(i <= 2 ? saved.getMaxChargingSpeedKw() : Math.min(60.0, saved.getMaxChargingSpeedKw()))
                    .status(SlotStatus.AVAILABLE)
                    .build();
            slotRepository.save(slot);
        }
        return saved;
    }

    @Transactional
    public Station updateStation(Long id, Station updated) {
        Station station = stationRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Station not found: " + id));

        station.setName(updated.getName());
        station.setAddress(updated.getAddress());
        station.setCity(updated.getCity());
        station.setLatitude(updated.getLatitude());
        station.setLongitude(updated.getLongitude());
        station.setParkingPricePerHour(updated.getParkingPricePerHour());
        station.setChargingPricePerKwh(updated.getChargingPricePerKwh());
        station.setMaxChargingSpeedKw(updated.getMaxChargingSpeedKw());
        station.setChargerTypes(updated.getChargerTypes());
        station.setAmenities(updated.getAmenities());
        station.setOpeningHours(updated.getOpeningHours());
        station.setImageUrl(updated.getImageUrl());
        station.setActive(updated.getActive());

        return stationRepository.save(station);
    }

    @Transactional
    // Stations with booking or review history are deactivated so payments and receipts stay intact;
    // stations without history are removed together with their slots.
    public void deleteStation(Long id) {
        Station station = stationRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Station not found: " + id));
        if (bookingRepository.existsByStationId(id) || reviewRepository.existsByStationId(id)) {
            station.setActive(false);
            stationRepository.save(station);
            return;
        }
        slotRepository.deleteAll(slotRepository.findByStationIdOrderBySlotNumberAsc(id));
        stationRepository.delete(station);
    }

    private double haversine(double lat1, double lon1, double lat2, double lon2) {
        double R = 6371; // Earth radius in km
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) *
                        Math.sin(dLon / 2) * Math.sin(dLon / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    private static void requireText(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " is required");
        }
    }
}
