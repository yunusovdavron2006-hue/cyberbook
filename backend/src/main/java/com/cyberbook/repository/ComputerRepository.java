package com.cyberbook.repository;

import com.cyberbook.entity.Computer;
import com.cyberbook.entity.ComputerStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

public interface ComputerRepository extends JpaRepository<Computer, Long> {

    List<Computer> findByClubIdOrderByComputerNumberAsc(Long clubId);

    Optional<Computer> findByIdAndClubId(Long id, Long clubId);

    long countByClubId(Long clubId);

    long countByClubIdAndStatus(Long clubId, ComputerStatus status);

    void deleteByClubId(Long clubId);

    List<Computer> findByClubIdAndPricePerHourLessThanEqualOrderByPricePerHourAsc(Long clubId, BigDecimal price);
}
