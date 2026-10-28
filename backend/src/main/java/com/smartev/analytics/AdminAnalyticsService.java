package com.smartev.analytics;

import com.smartev.booking.Booking;
import com.smartev.booking.BookingRepository;
import com.smartev.booking.BookingStatus;
import com.smartev.station.Station;
import com.smartev.station.StationRepository;
import com.smartev.user.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class AdminAnalyticsService {

    private final UserRepository userRepository;
    private final StationRepository stationRepository;
    private final BookingRepository bookingRepository;

    public Map<String, Object> getAdminDashboardStats() {
        long totalUsers = userRepository.count();
        long totalStations = stationRepository.count();
        List<Booking> allBookings = bookingRepository.findAll();

        long todayBookingsCount = allBookings.stream()
                .filter(b -> b.getBookingDate() != null && b.getBookingDate().equals(LocalDate.now()))
                .count();

        long activeBookingsCount = allBookings.stream()
                .filter(b -> b.getStatus() == BookingStatus.CONFIRMED || b.getStatus() == BookingStatus.HELD || b.getStatus() == BookingStatus.OCCUPIED)
                .count();

        double totalRevenue = allBookings.stream()
                .filter(b -> b.getStatus() == BookingStatus.CONFIRMED || b.getStatus() == BookingStatus.COMPLETED)
                .mapToDouble(b -> b.getTotalAmount() == null ? 0.0 : b.getTotalAmount())
                .sum();

        // 7-day bookings and revenue trend
        List<Map<String, Object>> trendData = new ArrayList<>();
        LocalDate today = LocalDate.now();
        for (int i = 6; i >= 0; i--) {
            LocalDate d = today.minusDays(i);
            long count = allBookings.stream()
                    .filter(b -> b.getBookingDate() != null && b.getBookingDate().equals(d))
                    .count();
            double rev = allBookings.stream()
                    .filter(b -> b.getBookingDate() != null && b.getBookingDate().equals(d) && (b.getStatus() == BookingStatus.CONFIRMED || b.getStatus() == BookingStatus.COMPLETED))
                    .mapToDouble(b -> b.getTotalAmount() == null ? 0.0 : b.getTotalAmount())
                    .sum();

            Map<String, Object> dayMap = new HashMap<>();
            dayMap.put("date", d.getDayOfWeek().name().substring(0, 3) + " " + d.getDayOfMonth());
            dayMap.put("bookings", count);
            dayMap.put("revenue", Math.round(rev * 100.0) / 100.0);
            trendData.add(dayMap);
        }

        // Utilisation today per station: booked bay-hours / available bay-hours (24 h).
        Map<Long, Double> bookedHours = new HashMap<>();
        allBookings.stream()
                .filter(b -> b.getBookingDate() != null && b.getBookingDate().equals(today) && PAID_OR_ACTIVE.contains(b.getStatus()))
                .forEach(b -> bookedHours.merge(b.getStation().getId(), hours(b), Double::sum));
        List<Map<String, Object>> stationDemand = stationRepository.findByActiveTrue().stream()
                .map(st -> {
                    int slots = st.getTotalSlots() == null || st.getTotalSlots() == 0 ? 1 : st.getTotalSlots();
                    int util = (int) Math.min(100, Math.round(100.0 * bookedHours.getOrDefault(st.getId(), 0.0) / (slots * 24.0)));
                    Map<String, Object> m = new HashMap<>();
                    m.put("station", st.getName());
                    m.put("utilization", util);
                    m.put("status", util >= 70 ? "HIGH" : util >= 35 ? "MEDIUM" : "LOW");
                    return m;
                })
                .sorted((a, b) -> Integer.compare((Integer) b.get("utilization"), (Integer) a.get("utilization")))
                .limit(6)
                .collect(Collectors.toList());

        // Peak hour from actual booking start times.
        Map<Integer, Long> byHour = allBookings.stream()
                .filter(b -> b.getStartTime() != null && b.getStatus() != BookingStatus.CANCELLED)
                .collect(Collectors.groupingBy(b -> b.getStartTime().getHour(), Collectors.counting()));
        String peak = byHour.isEmpty() ? "Not enough data yet"
                : byHour.entrySet().stream().max(Map.Entry.comparingByValue())
                        .map(e -> String.format("%02d:00 - %02d:00", e.getKey(), (e.getKey() + 1) % 24)).get();

        long cancelled = allBookings.stream().filter(b -> b.getStatus() == BookingStatus.CANCELLED).count();
        long held = allBookings.stream().filter(b -> b.getStatus() == BookingStatus.HELD).count();
        double weekAvg = trendData.stream().mapToLong(m -> (Long) m.get("bookings")).average().orElse(0);

        // Insights derived from the data above (no fixed copy).
        List<Map<String, Object>> aiInsights = new ArrayList<>();
        if (!stationDemand.isEmpty() && (Integer) stationDemand.get(0).get("utilization") > 0) {
            Map<String, Object> top = stationDemand.get(0);
            aiInsights.add(Map.of("id", 1, "title", "Busiest station today: " + top.get("station"),
                    "description", top.get("utilization") + "% of its bay-hours are booked today.",
                    "action", "Consider an off-peak discount to spread demand if it stays above 70%.",
                    "severity", (Integer) top.get("utilization") >= 70 ? "HIGH" : "MEDIUM"));
        }
        if (!allBookings.isEmpty()) {
            long pct = Math.round(100.0 * cancelled / allBookings.size());
            aiInsights.add(Map.of("id", 2, "title", "Cancellation rate " + pct + "%",
                    "description", cancelled + " of " + allBookings.size() + " bookings were cancelled or failed payment.",
                    "action", pct > 20 ? "Review payment failures and hold expiry; a high rate usually means checkout friction." : "Within a normal range.",
                    "severity", pct > 20 ? "MEDIUM" : "INFO"));
        }
        if (held > 0) {
            aiInsights.add(Map.of("id", 3, "title", held + " bay hold" + (held > 1 ? "s" : "") + " awaiting payment",
                    "description", "These bays are locked for up to 10 minutes and are released automatically if unpaid.",
                    "action", "No action needed unless holds keep expiring at the same station.",
                    "severity", "INFO"));
        }

        Map<String, Object> stats = new HashMap<>();
        stats.put("totalUsers", totalUsers);
        stats.put("totalStations", totalStations);
        stats.put("todayBookings", todayBookingsCount);
        stats.put("predictedTomorrowBookings", Math.round(weekAvg)); // 7-day average, not a model forecast
        stats.put("activeBookings", activeBookingsCount);
        stats.put("totalRevenue", Math.round(totalRevenue * 100.0) / 100.0);
        stats.put("peakBookingHours", peak);
        stats.put("trends", trendData);
        stats.put("stationDemand", stationDemand);
        stats.put("aiInsights", aiInsights);

        return stats;
    }

    private static final Set<BookingStatus> PAID_OR_ACTIVE =
            EnumSet.of(BookingStatus.CONFIRMED, BookingStatus.OCCUPIED, BookingStatus.COMPLETED, BookingStatus.HELD);

    private static double hours(Booking b) {
        if (b.getTotalHours() != null) return b.getTotalHours();
        if (b.getStartTime() != null && b.getEndTime() != null) {
            return Math.max(0, java.time.Duration.between(b.getStartTime(), b.getEndTime()).toMinutes() / 60.0);
        }
        return 1.0;
    }
}
