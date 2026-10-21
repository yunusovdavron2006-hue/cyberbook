package com.cyberbook.repository;

import com.cyberbook.entity.Favorite;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface FavoriteRepository extends JpaRepository<Favorite, Long> {

    List<Favorite> findByUserId(Long userId);

    Optional<Favorite> findByUserIdAndClubId(Long userId, Long clubId);

    boolean existsByUserIdAndClubId(Long userId, Long clubId);

    long countByClubId(Long clubId);

    void deleteByUserIdAndClubId(Long userId, Long clubId);
}
