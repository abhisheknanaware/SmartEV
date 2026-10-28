package com.smartev.booking;

import com.smartev.booking.dto.BookingHoldRequest;
import com.smartev.booking.dto.BookingHoldResponse;
import com.smartev.booking.dto.BookingResponse;
import com.smartev.booking.dto.VerifyPaymentRequest;
import com.smartev.exception.ResourceNotFoundException;
import com.smartev.exception.SlotConflictException;
import com.smartev.notification.Notification;
import com.smartev.notification.NotificationRepository;
import com.smartev.payment.Payment;
import com.smartev.payment.PaymentRepository;
import com.smartev.payment.PaymentStatus;
import com.smartev.payment.RazorpayService;
import com.smartev.slot.ParkingSlot;
import com.smartev.slot.SlotRepository;
import com.smartev.slot.SlotStatus;
import com.smartev.station.Station;
import com.smartev.station.StationRepository;
import com.smartev.user.User;
import com.smartev.user.UserRepository;
import com.smartev.vehicle.Vehicle;
import com.smartev.vehicle.VehicleRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@Slf4j
public class BookingService {

    private final BookingRepository bookingRepository;
    private final StationRepository stationRepository;
    private final SlotRepository slotRepository;
    private final UserRepository userRepository;
    private final VehicleRepository vehicleRepository;
    private final PaymentRepository paymentRepository;
    private final NotificationRepository notificationRepository;
    private final RazorpayService razorpayService;
    private final QrCodeGenerator qrCodeGenerator;
    private final StringRedisTemplate redisTemplate;

    public BookingService(
            BookingRepository bookingRepository,
            StationRepository stationRepository,
            SlotRepository slotRepository,
            UserRepository userRepository,
            VehicleRepository vehicleRepository,
            PaymentRepository paymentRepository,
            NotificationRepository notificationRepository,
            RazorpayService razorpayService,
            QrCodeGenerator qrCodeGenerator,
            StringRedisTemplate redisTemplate) {
        this.bookingRepository = bookingRepository;
        this.stationRepository = stationRepository;
        this.slotRepository = slotRepository;
        this.userRepository = userRepository;
        this.vehicleRepository = vehicleRepository;
        this.paymentRepository = paymentRepository;
        this.notificationRepository = notificationRepository;
        this.razorpayService = razorpayService;
        this.qrCodeGenerator = qrCodeGenerator;
        this.redisTemplate = redisTemplate;
    }

    private static final long HOLD_TTL_SECONDS = 600; // 10 minutes

    @Transactional
    public BookingHoldResponse createHold(BookingHoldRequest request, Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found: " + userId));

        Station station = stationRepository.findById(request.getStationId())
                .orElseThrow(() -> new ResourceNotFoundException("Station not found: " + request.getStationId()));

        ParkingSlot slot = slotRepository.findById(request.getSlotId())
                .orElseThrow(() -> new ResourceNotFoundException("Slot not found: " + request.getSlotId()));

        Vehicle vehicle = null;
        if (request.getVehicleId() != null) {
            // Only the booker's own vehicle may be attached; anything else falls back to their latest vehicle.
            vehicle = vehicleRepository.findById(request.getVehicleId())
                    .filter(v -> v.getUser() != null && v.getUser().getId().equals(userId))
                    .orElse(null);
        }
        if (vehicle == null) {
            List<Vehicle> userVehicles = vehicleRepository.findByUserIdOrderByCreatedAtDesc(userId);
            if (!userVehicles.isEmpty()) {
                vehicle = userVehicles.get(0);
            }
        }

        // 1. Check existing overlapping bookings in DB
        List<Booking> conflicts = bookingRepository.findConflictingBookings(
                station.getId(),
                slot.getId(),
                request.getBookingDate(),
                request.getStartTime(),
                request.getEndTime()
        );

        if (!conflicts.isEmpty()) {
            throw new SlotConflictException("Slot " + slot.getSlotNumber() +
                    " is already reserved or held by another user for this time window (" +
                    request.getStartTime() + " - " + request.getEndTime() + ").");
        }

        // 2. Concurrency Control with Redis Distributed Lock
        // Key format: booking:hold:{stationId}:{slotId}:{date}:{startTime}
        String redisKey = String.format("booking:hold:%d:%d:%s:%s",
                station.getId(), slot.getId(), request.getBookingDate(), request.getStartTime());

        String lockPayload = String.format("user:%d;time:%s", userId, LocalDateTime.now());
        Boolean lockAcquired = true;
        try {
            lockAcquired = redisTemplate.opsForValue().setIfAbsent(redisKey, lockPayload, Duration.ofSeconds(HOLD_TTL_SECONDS));
        } catch (Exception ex) {
            log.warn("Redis distributed lock check bypassed: {}. Falling back to DB concurrency control.", ex.getMessage());
        }

        if (Boolean.FALSE.equals(lockAcquired)) {
            log.warn("Redis lock collision on key: {}", redisKey);
            throw new SlotConflictException("Slot " + slot.getSlotNumber() +
                    " was just locked by another concurrent user. Please choose another slot or time.");
        }

        // 3. Calculate price
        long minutes = ChronoUnit.MINUTES.between(request.getStartTime(), request.getEndTime());
        double hours = Math.max(1.0, minutes / 60.0);
        double kwh = request.getChargingKwh() != null ? request.getChargingKwh() : 25.0;

        double parkingCost = station.getParkingPricePerHour() * hours;
        double chargingCost = station.getChargingPricePerKwh() * kwh;
        double totalAmount = Math.round((parkingCost + chargingCost) * 100.0) / 100.0;

        String bookingRef = "SEV-" + UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();

        // 4. Create Razorpay order
        String razorpayOrderId = razorpayService.createOrder(totalAmount, bookingRef);

        LocalDateTime holdExpiresAt = LocalDateTime.now().plusSeconds(HOLD_TTL_SECONDS);

        Booking booking = Booking.builder()
                .bookingReference(bookingRef)
                .user(user)
                .station(station)
                .slot(slot)
                .vehicle(vehicle)
                .bookingDate(request.getBookingDate())
                .startTime(request.getStartTime())
                .endTime(request.getEndTime())
                .totalHours(hours)
                .chargingKwh(kwh)
                .totalAmount(totalAmount)
                .status(BookingStatus.HELD)
                .razorpayOrderId(razorpayOrderId)
                .holdExpiresAt(holdExpiresAt)
                .build();

        bookingRepository.save(booking);

        // Update physical slot status to HELD
        slot.setStatus(SlotStatus.HELD);
        slotRepository.save(slot);

        log.info("Slot held successfully for user {} with ref {} on slot {}", userId, bookingRef, slot.getSlotNumber());

        return BookingHoldResponse.builder()
                .bookingId(booking.getId())
                .bookingReference(bookingRef)
                .stationName(station.getName())
                .slotNumber(slot.getSlotNumber())
                .totalAmount(totalAmount)
                .razorpayOrderId(razorpayOrderId)
                .razorpayKeyId(razorpayService.getKeyId())
                .holdExpiresInSeconds((int) HOLD_TTL_SECONDS)
                .holdExpiresAt(holdExpiresAt)
                .status(BookingStatus.HELD.name())
                .message("Slot " + slot.getSlotNumber() + " is temporarily held for 10 minutes. Please complete payment.")
                .build();
    }

    // A rejected payment must still commit the CANCELLED status, or the slot stays blocked.
    @Transactional(noRollbackFor = IllegalArgumentException.class)
    public BookingResponse verifyPayment(VerifyPaymentRequest request, Long userId) {
        Booking booking = bookingRepository.findById(request.getBookingId())
                .orElseThrow(() -> new ResourceNotFoundException("Booking not found: " + request.getBookingId()));

        if (!booking.getUser().getId().equals(userId)) {
            throw new org.springframework.security.access.AccessDeniedException("This booking belongs to another user");
        }

        // Verify Razorpay signature
        boolean isValid = razorpayService.verifySignature(
                request.getRazorpayOrderId(),
                request.getRazorpayPaymentId(),
                request.getRazorpaySignature()
        );

        if (!isValid) {
            log.error("Invalid payment signature for booking {}", booking.getBookingReference());
            booking.setStatus(BookingStatus.CANCELLED);
            bookingRepository.save(booking);
            // Release redis hold key
            releaseRedisKey(booking);
            throw new IllegalArgumentException("Payment verification failed: signature mismatch. The booking was cancelled.");
        }

        // Create Payment record
        Payment payment = Payment.builder()
                .booking(booking)
                .razorpayOrderId(request.getRazorpayOrderId())
                .razorpayPaymentId(request.getRazorpayPaymentId())
                .razorpaySignature(request.getRazorpaySignature())
                .amount(booking.getTotalAmount())
                .currency("INR")
                .status(PaymentStatus.SUCCESS)
                .build();
        paymentRepository.save(payment);

        // Transition booking to CONFIRMED
        booking.setStatus(BookingStatus.CONFIRMED);
        booking.setRazorpayPaymentId(request.getRazorpayPaymentId());

        // Update physical slot status to BOOKED
        ParkingSlot slot = booking.getSlot();
        if (slot != null) {
            slot.setStatus(SlotStatus.BOOKED);
            slotRepository.save(slot);
        }

        // Generate QR Code pass
        String qrContent = String.format("SmartEV Pass|Ref:%s|Station:%s|Slot:%s|Date:%s|Time:%s-%s|Amount:INR %.2f",
                booking.getBookingReference(),
                booking.getStation().getName(),
                booking.getSlot().getSlotNumber(),
                booking.getBookingDate(),
                booking.getStartTime(),
                booking.getEndTime(),
                booking.getTotalAmount());

        String qrBase64 = qrCodeGenerator.generateQrCodeBase64(qrContent, 280, 280);
        booking.setQrCodeBase64(qrBase64);
        bookingRepository.save(booking);

        // Release temporary Redis lock since DB now holds CONFIRMED status
        releaseRedisKey(booking);

        // Dispatch in-app notification
        Notification notif = Notification.builder()
                .user(booking.getUser())
                .title("Booking Confirmed! ")
                .message(String.format("Slot %s at %s confirmed for %s (%s - %s). Digital QR pass generated.",
                        booking.getSlot().getSlotNumber(),
                        booking.getStation().getName(),
                        booking.getBookingDate(),
                        booking.getStartTime(),
                        booking.getEndTime()))
                .type("BOOKING_CONFIRMED")
                .build();
        notificationRepository.save(notif);

        log.info("Booking {} successfully verified and confirmed!", booking.getBookingReference());

        return mapToResponse(booking);
    }

    private void releaseRedisKey(Booking booking) {
        try {
            String redisKey = String.format("booking:hold:%d:%d:%s:%s",
                    booking.getStation().getId(),
                    booking.getSlot().getId(),
                    booking.getBookingDate(),
                    booking.getStartTime());
            redisTemplate.delete(redisKey);
        } catch (Exception e) {
            log.warn("Error releasing Redis key: {}", e.getMessage());
        }
    }

    @Scheduled(fixedRate = 60000) // check every minute
    @Transactional
    public void cleanupExpiredHolds() {
        LocalDateTime now = LocalDateTime.now();
        List<Booking> allBookings = bookingRepository.findAll();
        for (Booking b : allBookings) {
            if (b.getStatus() == BookingStatus.HELD && b.getHoldExpiresAt() != null && b.getHoldExpiresAt().isBefore(now)) {
                log.info("Auto-releasing expired hold on booking {}", b.getBookingReference());
                b.setStatus(BookingStatus.CANCELLED);
                bookingRepository.save(b);
                releaseRedisKey(b);
                if (b.getSlot() != null) {
                    b.getSlot().setStatus(SlotStatus.AVAILABLE);
                    slotRepository.save(b.getSlot());
                }
            }
        }
    }

    @Transactional(readOnly = true)
    public List<BookingResponse> getUserBookings(Long userId) {
        return bookingRepository.findByUserIdOrderByCreatedAtDesc(userId)
                .stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<BookingResponse> getAllBookings() {
        return bookingRepository.findAllByOrderByCreatedAtDesc()
                .stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public BookingResponse getBookingByReference(String ref) {
        Booking booking = bookingRepository.findByBookingReference(ref)
                .orElseThrow(() -> new ResourceNotFoundException("Booking not found: " + ref));
        return mapToResponse(booking);
    }

    @Transactional
    public BookingResponse cancelBooking(Long bookingId, Long userId) {
        Booking booking = bookingRepository.findById(bookingId)
                .orElseThrow(() -> new ResourceNotFoundException("Booking not found: " + bookingId));

        if (!booking.getUser().getId().equals(userId)) {
            throw new org.springframework.security.access.AccessDeniedException("You can only cancel your own bookings");
        }

        booking.setStatus(BookingStatus.CANCELLED);
        bookingRepository.save(booking);
        releaseRedisKey(booking);

        if (booking.getSlot() != null) {
            booking.getSlot().setStatus(SlotStatus.AVAILABLE);
            slotRepository.save(booking.getSlot());
        }

        Notification notif = Notification.builder()
                .user(booking.getUser())
                .title("Booking Cancelled")
                .message("Your booking " + booking.getBookingReference() + " has been cancelled.")
                .type("BOOKING_CANCELLED")
                .build();
        notificationRepository.save(notif);

        return mapToResponse(booking);
    }

    public BookingResponse mapToResponse(Booking b) {
        return BookingResponse.builder()
                .id(b.getId())
                .bookingReference(b.getBookingReference())
                .stationId(b.getStation() != null ? b.getStation().getId() : 1L)
                .stationName(b.getStation() != null ? b.getStation().getName() : "Corridor EV Station")
                .stationAddress(b.getStation() != null ? b.getStation().getAddress() : "Highway Corridor Hub")
                .stationLat(b.getStation() != null ? b.getStation().getLatitude() : 28.6139)
                .stationLng(b.getStation() != null ? b.getStation().getLongitude() : 77.2090)
                .slotId(b.getSlot() != null ? b.getSlot().getId() : null)
                .slotNumber(b.getSlot() != null ? b.getSlot().getSlotNumber() : "Bay A1")
                .chargerType(b.getSlot() != null ? b.getSlot().getChargerType() : "CCS2 Fast")
                .vehicleModel(b.getVehicle() != null ? b.getVehicle().getModel() : "Tata Nexon EV Max")
                .vehicleNumber(b.getVehicle() != null ? b.getVehicle().getVehicleNumber() : "MH 12 EV 8899")
                .bookingDate(b.getBookingDate())
                .startTime(b.getStartTime())
                .endTime(b.getEndTime())
                .totalHours(b.getTotalHours())
                .chargingKwh(b.getChargingKwh())
                .totalAmount(b.getTotalAmount())
                .status(b.getStatus())
                .qrCodeBase64(b.getQrCodeBase64())
                .userId(b.getUser() != null ? b.getUser().getId() : null)
                .userName(b.getUser() != null ? b.getUser().getName() : "EV Driver")
                .userEmail(b.getUser() != null ? b.getUser().getEmail() : "driver@smartev.com")
                .userPhone(b.getUser() != null ? b.getUser().getPhone() : "+91 98765 43210")
                .razorpayOrderId(b.getRazorpayOrderId())
                .razorpayPaymentId(b.getRazorpayPaymentId() != null ? b.getRazorpayPaymentId() : (b.getStatus() == BookingStatus.CONFIRMED ? "pay_" + b.getBookingReference().replace("-", "") : null))
                .createdAt(b.getCreatedAt() != null ? b.getCreatedAt() : LocalDateTime.now())
                .build();
    }
}
