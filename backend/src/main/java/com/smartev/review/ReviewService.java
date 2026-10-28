package com.smartev.review;

import com.smartev.exception.ResourceNotFoundException;
import com.smartev.station.Station;
import com.smartev.station.StationRepository;
import com.smartev.user.User;
import com.smartev.user.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class ReviewService {

    private final ReviewRepository reviewRepository;
    private final StationRepository stationRepository;
    private final UserRepository userRepository;

    public List<Review> getStationReviews(Long stationId) {
        return reviewRepository.findByStationIdOrderByCreatedAtDesc(stationId);
    }

    @Transactional
    public Review addReview(Long stationId, Long userId, Double rating, String comment) {
        Station station = stationRepository.findById(stationId)
                .orElseThrow(() -> new ResourceNotFoundException("Station not found: " + stationId));

        if (rating == null || rating < 1 || rating > 5) {
            throw new IllegalArgumentException("Rating must be between 1 and 5 stars.");
        }
        if (comment != null && comment.length() > 1000) {
            throw new IllegalArgumentException("Keep the review under 1000 characters.");
        }
        comment = comment == null || comment.isBlank() ? null : comment;

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found: " + userId));

        String sentiment = rating >= 4.0 ? "POSITIVE" : (rating >= 3.0 ? "NEUTRAL" : "NEGATIVE");

        Review review = Review.builder()
                .station(station)
                .user(user)
                .rating(rating)
                .comment(comment)
                .aiSentiment(sentiment)
                .build();

        Review saved = reviewRepository.save(review);

        // Update station aggregated rating
        List<Review> all = reviewRepository.findByStationIdOrderByCreatedAtDesc(stationId);
        double avg = all.stream().mapToDouble(Review::getRating).average().orElse(4.5);
        station.setRating(Math.round(avg * 10.0) / 10.0);
        station.setReviewCount(all.size());
        stationRepository.save(station);

        return saved;
    }

    public Map<String, Object> getAiReviewSummary(Long stationId) {
        Station station = stationRepository.findById(stationId)
                .orElseThrow(() -> new ResourceNotFoundException("Station not found: " + stationId));

        List<Review> reviews = reviewRepository.findByStationIdOrderByCreatedAtDesc(stationId);

        // Computed from the written reviews only, so the numbers match what drivers can read.
        int[] stars = new int[5];
        reviews.forEach(r -> stars[(int) Math.max(1, Math.min(5, Math.round(r.getRating()))) - 1]++);
        long positive = reviews.stream().filter(r -> r.getRating() >= 4.0).count();

        Map<String, Object> summary = new HashMap<>();
        summary.put("stationId", stationId);
        summary.put("stationName", station.getName());
        summary.put("totalReviews", reviews.size());
        summary.put("averageRating", reviews.isEmpty() ? null
                : Math.round(reviews.stream().mapToDouble(Review::getRating).average().orElse(0) * 10.0) / 10.0);
        summary.put("positivePct", reviews.isEmpty() ? null : Math.round(100.0 * positive / reviews.size()));
        summary.put("starCounts", stars);
        return summary;
    }
}
