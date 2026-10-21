package com.cyberbook.repository;

import com.cyberbook.entity.Review;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ReviewRepository extends JpaRepository<Review, Long> {

    List<Review> findByClubIdOrderByCreatedAtDesc(Long clubId);

    Optional<Review> findByUserIdAndClubId(Long userId, Long clubId);

    long countByClubId(Long clubId);

    @Query("SELECT COALESCE(AVG(r.rating), 0) FROM Review r WHERE r.clubId = :clubId")
    Double averageRating(@Param("clubId") Long clubId);
}
