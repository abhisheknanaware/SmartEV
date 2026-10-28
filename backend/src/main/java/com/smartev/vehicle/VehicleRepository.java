package com.smartev.vehicle;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface VehicleRepository extends JpaRepository<Vehicle, Long> {
    @Query("SELECT v FROM Vehicle v WHERE v.user.id = :userId ORDER BY v.createdAt DESC")
    List<Vehicle> findByUserIdOrderByCreatedAtDesc(@Param("userId") Long userId);
}
