package com.smartev.notification;

import com.smartev.security.JwtUtils;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/notifications")
@RequiredArgsConstructor
@Tag(name = "Notifications", description = "User real-time notifications and alerts")
public class NotificationController {

    private final NotificationService notificationService;
    private final JwtUtils jwtUtils;

    private Long getUserIdFromHeader(String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            throw new org.springframework.security.authentication.AuthenticationCredentialsNotFoundException("Please log in to continue.");
        }
        Long userId;
        try {
            userId = jwtUtils.extractUserId(authHeader.substring(7));
        } catch (Exception e) {
            userId = null;
        }
        if (userId == null) {
            throw new org.springframework.security.authentication.BadCredentialsException("Your session is invalid. Please log in again.");
        }
        return userId;
    }

    @GetMapping
    @Operation(summary = "Get list of notifications for the logged in user")
    public ResponseEntity<List<Notification>> getNotifications(@RequestHeader(value = "Authorization", required = false) String authHeader) {
        Long userId = getUserIdFromHeader(authHeader);
        return ResponseEntity.ok(notificationService.getUserNotifications(userId));
    }

    @GetMapping("/unread-count")
    @Operation(summary = "Get count of unread notifications")
    public ResponseEntity<Map<String, Long>> getUnreadCount(@RequestHeader(value = "Authorization", required = false) String authHeader) {
        Long userId = getUserIdFromHeader(authHeader);
        return ResponseEntity.ok(Map.of("unreadCount", notificationService.getUnreadCount(userId)));
    }

    @PostMapping("/mark-all-read")
    @Operation(summary = "Mark all notifications as read")
    public ResponseEntity<Void> markAllRead(@RequestHeader(value = "Authorization", required = false) String authHeader) {
        Long userId = getUserIdFromHeader(authHeader);
        notificationService.markAllRead(userId);
        return ResponseEntity.ok().build();
    }
}
