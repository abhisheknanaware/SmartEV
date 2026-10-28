package com.smartev.booking;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface BookingRepository extends JpaRepository<Booking, Long> {

    @org.springframework.data.jpa.repository.EntityGraph(attributePaths = {"station", "slot", "vehicle", "user"})
    List<Booking> findByUserIdOrderByCreatedAtDesc(Long userId);

    boolean existsByStationId(Long stationId);

    boolean existsByVehicleId(Long vehicleId);

    @org.springframework.data.jpa.repository.EntityGraph(attributePaths = {"station", "slot", "vehicle", "user"})
    List<Booking> findAllByOrderByCreatedAtDesc();

    @org.springframework.data.jpa.repository.EntityGraph(attributePaths = {"station", "slot", "vehicle", "user"})
    Optional<Booking> findByBookingReference(String bookingReference);

    Optional<Booking> findByRazorpayOrderId(String razorpayOrderId);

    @Query("SELECT b FROM Booking b WHERE b.station.id = :stationId " +
           "AND b.slot.id = :slotId " +
           "AND b.bookingDate = :date " +
           "AND b.status IN (com.smartev.booking.BookingStatus.HELD, com.smartev.booking.BookingStatus.CONFIRMED, com.smartev.booking.BookingStatus.OCCUPIED) " +
           "AND ((b.startTime < :endTime AND b.endTime > :startTime))")
    List<Booking> findConflictingBookings(@Param("stationId") Long stationId,
                                         @Param("slotId") Long slotId,
                                         @Param("date") LocalDate date,
                                         @Param("startTime") LocalTime startTime,
                                         @Param("endTime") LocalTime endTime);

    @Query("SELECT b FROM Booking b WHERE b.station.id = :stationId " +
           "AND b.bookingDate = :date " +
           "AND b.status IN (com.smartev.booking.BookingStatus.HELD, com.smartev.booking.BookingStatus.CONFIRMED, com.smartev.booking.BookingStatus.OCCUPIED) " +
           "AND ((b.startTime < :endTime AND b.endTime > :startTime))")
    List<Booking> findActiveBookingsForStationInWindow(@Param("stationId") Long stationId,
                                                      @Param("date") LocalDate date,
                                                      @Param("startTime") LocalTime startTime,
                                                      @Param("endTime") LocalTime endTime);
}
