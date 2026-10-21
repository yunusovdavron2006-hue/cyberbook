package com.cyberbook.service;

import com.cyberbook.dto.CommonDtos.ApiResponse;
import com.cyberbook.dto.CommonDtos.OwnerStatistics;
import com.cyberbook.dto.UserDtos.UserResponse;
import com.cyberbook.entity.*;
import com.cyberbook.exception.ForbiddenException;
import com.cyberbook.exception.NotFoundException;
import com.cyberbook.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;

@Service
@RequiredArgsConstructor
public class OwnerService {

    private final ClubRepository clubRepository;
    private final ComputerRepository computerRepository;
    private final BookingRepository bookingRepository;
    private final ReviewRepository reviewRepository;
    private final UserRepository userRepository;

    @Transactional(readOnly = true)
    public ApiResponse<OwnerStatistics> statistics(Long clubId, Long userId) {
        Club club = requireOwnedClub(clubId, userId);

        LocalDate today = LocalDate.now();
        long totalComputers = computerRepository.countByClubId(clubId);
        long activeComputers = computerRepository.countByClubIdAndStatus(clubId, ComputerStatus.ACTIVE);
        long bookingsToday = bookingRepository.countByClubIdAndBookingDate(clubId, today);
        long totalBookings = bookingRepository.countByClubId(clubId);
        long upcomingBookings = bookingRepository.findByClubIdOrderByBookingDateDescStartTimeDesc(clubId).stream()
                .filter(b -> b.getStatus() != BookingStatus.CANCELLED)
                .filter(b -> b.getBookingDate().isAfter(today)
                        || (b.getBookingDate().equals(today) && b.getEndTime().isAfter(java.time.LocalTime.now())))
                .count();
        BigDecimal revenue = nvl(bookingRepository.revenueByClub(clubId, BookingStatus.CANCELLED));
        BigDecimal revenueToday = nvl(bookingRepository.revenueByClubBetween(clubId, today, today, BookingStatus.CANCELLED));

        double occupancy = 0;
        if (totalComputers > 0) {
            LocalDate from = today.minusDays(6);
            long busyHours = bookingRepository.findClubDayBookings(clubId, today, BookingStatus.CANCELLED).size();
            long capacity = totalComputers * 10L;
            occupancy = capacity == 0 ? 0 : Math.min(100, Math.round((busyHours * 100.0 / capacity) * 10.0) / 10.0);
        }

        Double avg = reviewRepository.averageRating(clubId);
        long reviewCount = reviewRepository.countByClubId(clubId);
        double rating = avg == null ? 0 : Math.round(avg * 10.0) / 10.0;

        return ApiResponse.ok(new OwnerStatistics(
                totalComputers,
                activeComputers,
                bookingsToday,
                totalBookings,
                upcomingBookings,
                revenue,
                revenueToday,
                occupancy,
                rating,
                reviewCount));
    }

    @Transactional(readOnly = true)
    public ApiResponse<UserResponse> clubOwner(Long clubId, Long userId) {
        Club club = requireOwnedClub(clubId, userId);
        User owner = userRepository.findById(club.getOwnerId())
                .orElseThrow(() -> new NotFoundException("Owner not found"));
        return ApiResponse.ok(UserResponse.from(owner));
    }

    @Transactional(readOnly = true)
    public ApiResponse<List<Club>> myClubs(Long userId) {
        return ApiResponse.ok(clubRepository.findByOwnerId(userId));
    }

    public Club requireOwnedClub(Long clubId, Long userId) {
        Club club = clubRepository.findById(clubId)
                .orElseThrow(() -> new NotFoundException("Club not found"));
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ForbiddenException("You do not have permission"));
        if (!club.getOwnerId().equals(userId) && user.getRole() != Role.ADMIN) {
            throw new ForbiddenException("You do not have access to this club");
        }
        return club;
    }

    private BigDecimal nvl(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value.setScale(0, RoundingMode.HALF_UP);
    }
}
