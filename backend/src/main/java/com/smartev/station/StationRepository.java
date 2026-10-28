package com.smartev.station;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface StationRepository extends JpaRepository<Station, Long> {
    List<Station> findByActiveTrue();

    @Query(value = "SELECT s.* " +
            "FROM stations s " +
            "WHERE s.active = true " +
            "ORDER BY (6371 * acos(least(1.0, greatest(-1.0, cos(radians(:lat)) * cos(radians(s.latitude)) * cos(radians(s.longitude) - radians(:lng)) + sin(radians(:lat)) * sin(radians(s.latitude)))))) ASC LIMIT :limit", nativeQuery = true)
    List<Station> findNearestStations(Double lat, Double lng, int limit);

    boolean existsByName(String name);
}
