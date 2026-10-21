package com.cyberbook.repository;

import com.cyberbook.entity.Booking;
import com.cyberbook.entity.BookingStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

public interface BookingRepository extends JpaRepository<Booking, Long> {

    List<Booking> findByUserIdOrderByBookingDateDescStartTimeDesc(Long userId);

    List<Booking> findByClubIdOrderByBookingDateDescStartTimeDesc(Long clubId);

    List<Booking> findByUserIdAndBookingDateOrderByStartTime(Long userId, LocalDate date);

    List<Booking> findByClubIdAndBookingDateOrderByStartTime(Long clubId, LocalDate date);

    List<Booking> findAllByOrderByCreatedAtDesc();

    long countByClubIdAndBookingDate(Long clubId, LocalDate date);

    long countByClubId(Long clubId);

    long countByUserId(Long userId);

    long countByStatus(BookingStatus status);

    @Query("""
            SELECT b FROM Booking b
            WHERE b.computerId = :computerId
              AND b.bookingDate = :date
              AND b.status <> :cancelled
              AND b.startTime < :endTime
              AND b.endTime > :startTime
            """)
    List<Booking> findOverlapping(@Param("computerId") Long computerId,
                                  @Param("date") LocalDate date,
                                  @Param("startTime") LocalTime startTime,
                                  @Param("endTime") LocalTime endTime,
                                  @Param("cancelled") BookingStatus cancelled);

    @Query("SELECT b FROM Booking b WHERE b.clubId = :clubId AND b.bookingDate = :date AND b.status <> :cancelled")
    List<Booking> findClubDayBookings(@Param("clubId") Long clubId,
                                      @Param("date") LocalDate date,
                                      @Param("cancelled") BookingStatus cancelled);

    @Query("SELECT COALESCE(SUM(b.totalPrice), 0) FROM Booking b WHERE b.clubId = :clubId AND b.status <> :cancelled")
    BigDecimal revenueByClub(@Param("clubId") Long clubId, @Param("cancelled") BookingStatus cancelled);

    @Query("SELECT COALESCE(SUM(b.totalPrice), 0) FROM Booking b WHERE b.status <> :cancelled")
    BigDecimal totalRevenue(@Param("cancelled") BookingStatus cancelled);

    @Query("SELECT COALESCE(SUM(b.totalPrice), 0) FROM Booking b WHERE b.clubId = :clubId AND b.status <> :cancelled AND b.bookingDate BETWEEN :from AND :to")
    BigDecimal revenueByClubBetween(@Param("clubId") Long clubId,
                                    @Param("from") LocalDate from,
                                    @Param("to") LocalDate to,
                                    @Param("cancelled") BookingStatus cancelled);
}
