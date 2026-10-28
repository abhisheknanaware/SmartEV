package com.smartev.health;

import com.smartev.booking.Booking;
import com.smartev.booking.BookingRepository;
import com.smartev.booking.BookingStatus;
import com.smartev.exception.ResourceNotFoundException;
import com.smartev.vehicle.Vehicle;
import com.smartev.vehicle.VehicleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * Personal battery health from logged charging sessions.
 *
 * Each session implies a usable capacity: energy into the battery / fraction of the pack charged,
 * where energy into the battery = energy on the receipt x charger-to-battery efficiency.
 * The vehicle's health is a weighted median over recent sessions, weighting wider charge
 * windows more because a narrow window amplifies reading errors.
 */
@Service
@RequiredArgsConstructor
public class BatteryHealthService {

    static final double EFFICIENCY_DC = 0.93;
    static final double EFFICIENCY_AC = 0.90;
    static final double MIN_WINDOW_PCT = 10.0;
    static final int RECENT_SESSIONS = 8;

    private final ChargingSessionRepository sessionRepository;
    private final VehicleRepository vehicleRepository;
    private final BookingRepository bookingRepository;

    private Vehicle ownedVehicle(Long vehicleId, Long userId) {
        Vehicle v = vehicleRepository.findById(vehicleId)
                .orElseThrow(() -> new ResourceNotFoundException("Vehicle not found: " + vehicleId));
        if (v.getUser() == null || !v.getUser().getId().equals(userId)) {
            throw new AccessDeniedException("You can only view or log charges for your own vehicles");
        }
        return v;
    }

    @Transactional
    public Map<String, Object> logSession(Long vehicleId, Long userId, Map<String, Object> body) {
        Vehicle vehicle = ownedVehicle(vehicleId, userId);
        double start = number(body, "socStartPct");
        double end = number(body, "socEndPct");
        double energy = number(body, "energyKwh");
        String type = String.valueOf(body.getOrDefault("chargerType", "DC")).toUpperCase(Locale.ROOT);
        if (!type.equals("AC") && !type.equals("DC")) {
            throw new IllegalArgumentException("chargerType must be AC or DC");
        }
        if (start < 0 || end > 100 || start >= end) {
            throw new IllegalArgumentException("Battery % after charging must be higher than before, between 0 and 100.");
        }
        if (end - start < MIN_WINDOW_PCT) {
            throw new IllegalArgumentException("Log a charge of at least 10 percentage points; smaller charges are too imprecise to estimate health.");
        }
        double nominal = vehicle.getBatteryCapacityKwh();
        if (energy <= 0 || energy > nominal * 1.5) {
            throw new IllegalArgumentException("Energy delivered must be between 0 and " + Math.round(nominal * 1.5) + " kWh for this vehicle.");
        }

        double eff = type.equals("AC") ? EFFICIENCY_AC : EFFICIENCY_DC;
        double capacity = energy * eff / ((end - start) / 100.0);
        double soh = capacity / nominal * 100.0;
        if (soh < 40 || soh > 115) {
            throw new IllegalArgumentException(String.format(Locale.ROOT,
                    "These readings imply %.0f%% of the rated %.1f kWh, which isn't physically plausible. Please check the kWh and battery %% values.", soh, nominal));
        }

        Long bookingId = body.get("bookingId") == null ? null : Long.valueOf(String.valueOf(body.get("bookingId")));
        if (bookingId != null) {
            Booking booking = bookingRepository.findById(bookingId)
                    .orElseThrow(() -> new ResourceNotFoundException("Booking not found: " + bookingId));
            if (!booking.getUser().getId().equals(userId)) {
                throw new AccessDeniedException("This booking belongs to another user");
            }
            if (!EnumSet.of(BookingStatus.CONFIRMED, BookingStatus.OCCUPIED, BookingStatus.COMPLETED).contains(booking.getStatus())) {
                throw new IllegalArgumentException("Only paid bookings can have a charge logged.");
            }
            if (sessionRepository.existsByBookingId(bookingId)) {
                throw new IllegalArgumentException("A charge has already been logged for this booking.");
            }
            booking.setStatus(BookingStatus.COMPLETED);
            bookingRepository.save(booking);
        }

        LocalDate date = body.get("sessionDate") == null ? LocalDate.now() : LocalDate.parse(String.valueOf(body.get("sessionDate")));
        if (date.isAfter(LocalDate.now())) {
            throw new IllegalArgumentException("The charge date can't be in the future.");
        }
        sessionRepository.save(ChargingSession.builder()
                .vehicle(vehicle).bookingId(bookingId).sessionDate(date)
                .socStartPct(start).socEndPct(end).energyKwh(energy).chargerType(type)
                .estimatedCapacityKwh(round(capacity, 2)).sohPct(round(soh, 1))
                .build());
        return refresh(vehicle);
    }

    @Transactional
    public Map<String, Object> deleteSession(Long vehicleId, Long sessionId, Long userId) {
        Vehicle vehicle = ownedVehicle(vehicleId, userId);
        ChargingSession s = sessionRepository.findById(sessionId)
                .filter(x -> x.getVehicle().getId().equals(vehicleId))
                .orElseThrow(() -> new ResourceNotFoundException("Charge not found: " + sessionId));
        sessionRepository.delete(s);
        return refresh(vehicle);
    }

    @Transactional(readOnly = true)
    public Map<String, Object> health(Long vehicleId, Long userId) {
        return summary(ownedVehicle(vehicleId, userId));
    }

    private Map<String, Object> refresh(Vehicle vehicle) {
        Map<String, Object> out = summary(vehicle);
        @SuppressWarnings("unchecked")
        Map<String, Object> est = (Map<String, Object>) out.get("estimate");
        vehicle.setCurrentSoh(est == null ? null : (Double) est.get("sohPct"));
        vehicleRepository.save(vehicle);
        return out;
    }

    private Map<String, Object> summary(Vehicle vehicle) {
        List<ChargingSession> sessions = sessionRepository.findByVehicleIdOrderBySessionDateAscIdAsc(vehicle.getId());
        List<Map<String, Object>> rows = new ArrayList<>();
        for (ChargingSession s : sessions) {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("id", s.getId());
            r.put("sessionDate", s.getSessionDate().toString());
            r.put("socStartPct", s.getSocStartPct());
            r.put("socEndPct", s.getSocEndPct());
            r.put("windowPct", round(s.getSocEndPct() - s.getSocStartPct(), 1));
            r.put("energyKwh", s.getEnergyKwh());
            r.put("chargerType", s.getChargerType());
            r.put("estimatedCapacityKwh", s.getEstimatedCapacityKwh());
            r.put("sohPct", s.getSohPct());
            r.put("bookingId", s.getBookingId());
            rows.add(r);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("vehicleId", vehicle.getId());
        out.put("model", vehicle.getModel());
        out.put("nominalCapacityKwh", vehicle.getBatteryCapacityKwh());
        out.put("sessions", rows);
        out.put("estimate", estimate(sessions, vehicle.getBatteryCapacityKwh()));
        out.put("method", "Usable capacity per charge = kWh on receipt x efficiency (DC 93%, AC 90%) / fraction of battery charged. "
                + "Health = ΔSOC-weighted median of the last " + RECENT_SESSIONS + " charges, divided by rated capacity.");
        return out;
    }

    private Map<String, Object> estimate(List<ChargingSession> all, double nominal) {
        if (all.isEmpty()) return null;
        List<ChargingSession> recent = all.subList(Math.max(0, all.size() - RECENT_SESSIONS), all.size());
        double[][] pts = recent.stream()
                .map(s -> new double[]{s.getSohPct(), s.getSocEndPct() - s.getSocStartPct()})
                .sorted(Comparator.comparingDouble(p -> p[0]))
                .toArray(double[][]::new);
        double soh = weightedQuantile(pts, 0.5);
        double lo = weightedQuantile(pts, 0.25);
        double hi = weightedQuantile(pts, 0.75);
        long wide = recent.stream().filter(s -> s.getSocEndPct() - s.getSocStartPct() >= 30).count();
        String confidence = recent.size() >= 3 && wide >= 2 ? "high" : recent.size() >= 2 ? "medium" : "low";

        Map<String, Object> e = new LinkedHashMap<>();
        e.put("sohPct", round(soh, 1));
        e.put("capacityKwh", round(soh / 100.0 * nominal, 1));
        e.put("rangePct", List.of(round(lo, 1), round(hi, 1)));
        e.put("sessionsUsed", recent.size());
        e.put("confidence", confidence);
        e.put("trendPerYearPct", trendPerYear(all));
        return e;
    }

    // Least-squares slope of SOH against date, per year; only with enough history to mean anything.
    private Double trendPerYear(List<ChargingSession> s) {
        if (s.size() < 4) return null;
        LocalDate first = s.get(0).getSessionDate();
        long spanDays = ChronoUnit.DAYS.between(first, s.get(s.size() - 1).getSessionDate());
        if (spanDays < 60) return null;
        double n = s.size(), sx = 0, sy = 0, sxx = 0, sxy = 0;
        for (ChargingSession c : s) {
            double x = ChronoUnit.DAYS.between(first, c.getSessionDate()), y = c.getSohPct();
            sx += x; sy += y; sxx += x * x; sxy += x * y;
        }
        double denom = n * sxx - sx * sx;
        return denom == 0 ? null : round((n * sxy - sx * sy) / denom * 365.0, 2);
    }

    private static double weightedQuantile(double[][] sortedValueWeight, double q) {
        double total = Arrays.stream(sortedValueWeight).mapToDouble(p -> p[1]).sum(), acc = 0;
        for (double[] p : sortedValueWeight) {
            acc += p[1];
            if (acc >= q * total) return p[0];
        }
        return sortedValueWeight[sortedValueWeight.length - 1][0];
    }

    private static double number(Map<String, Object> body, String key) {
        Object v = body.get(key);
        if (v == null) throw new IllegalArgumentException(key + " is required");
        try {
            return Double.parseDouble(String.valueOf(v));
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException(key + " must be a number");
        }
    }

    private static double round(double v, int digits) {
        double f = Math.pow(10, digits);
        return Math.round(v * f) / f;
    }
}
