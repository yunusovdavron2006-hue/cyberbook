package com.cyberbook.repository;

import com.cyberbook.entity.Club;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;

public interface ClubRepository extends JpaRepository<Club, Long> {

    List<Club> findByOwnerId(Long ownerId);

    long countByActiveTrue();

    @Query("""
            SELECT c FROM Club c
            WHERE (:search IS NULL OR LOWER(c.name) LIKE LOWER(CONCAT('%', :search, '%'))
                   OR LOWER(c.address) LIKE LOWER(CONCAT('%', :search, '%')))
              AND (:minPrice IS NULL OR c.minPricePerHour >= :minPrice)
              AND (:maxPrice IS NULL OR c.minPricePerHour <= :maxPrice)
              AND (:minRating IS NULL OR c.rating >= :minRating)
              AND (:vip IS NULL OR c.vip = :vip)
              AND (:activeOnly = false OR c.active = true)
            """)
    Page<Club> search(@Param("search") String search,
                      @Param("minPrice") BigDecimal minPrice,
                      @Param("maxPrice") BigDecimal maxPrice,
                      @Param("minRating") BigDecimal minRating,
                      @Param("vip") Boolean vip,
                      @Param("activeOnly") boolean activeOnly,
                      Pageable pageable);

    @Query("SELECT DISTINCT c FROM Club c JOIN Computer comp ON comp.clubId = c.id JOIN comp.games g "
            + "WHERE LOWER(g) LIKE LOWER(CONCAT('%', :game, '%')) "
            + "AND (:activeOnly = false OR c.active = true)")
    Page<Club> findByGame(@Param("game") String game, @Param("activeOnly") boolean activeOnly, Pageable pageable);
}
