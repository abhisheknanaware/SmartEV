package com.smartev.review;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ReviewRepository extends JpaRepository<Review, Long> {
    // Load the author and station eagerly: open-in-view is off, so lazy proxies would fail during JSON rendering.
    @EntityGraph(attributePaths = {"user", "station"})
    List<Review> findByStationIdOrderByCreatedAtDesc(Long stationId);

    boolean existsByStationId(Long stationId);
}
