package com.smartev.review;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.smartev.station.Station;
import com.smartev.user.User;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "reviews")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Review {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    // Reviews are public: expose the reviewer's name only, never their contact details.
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler", "password", "email", "phone", "role", "createdAt", "updatedAt"})
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "station_id", nullable = false)
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private Station station;

    @Column(nullable = false)
    private Double rating; // 1.0 to 5.0

    @Column(length = 1000)
    private String comment;

    @Builder.Default
    private String aiSentiment = "POSITIVE"; // POSITIVE, NEUTRAL, NEGATIVE

    @CreationTimestamp
    @Column(updatable = false)
    private LocalDateTime createdAt;
}
