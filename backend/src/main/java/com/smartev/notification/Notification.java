package com.smartev.notification;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.smartev.user.User;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "notifications")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Notification {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler", "password"})
    private User user;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false, length = 1000)
    private String message;

    @Builder.Default
    private String type = "INFO"; // BOOKING_CONFIRMED, PAYMENT_SUCCESS, REMINDER, WARNING

    @Builder.Default
    private Boolean isRead = false;

    @CreationTimestamp
    @Column(updatable = false)
    private LocalDateTime createdAt;
}
