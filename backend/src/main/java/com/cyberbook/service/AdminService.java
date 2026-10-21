package com.cyberbook.service;

import com.cyberbook.dto.BookingDtos.BookingResponse;
import com.cyberbook.dto.ClubDtos.ClubResponse;
import com.cyberbook.dto.CommonDtos.ApiResponse;
import com.cyberbook.dto.CommonDtos.PageResponse;
import com.cyberbook.dto.CommonDtos.PlatformStatistics;
import com.cyberbook.dto.UserDtos.UserResponse;
import com.cyberbook.entity.*;
import com.cyberbook.exception.ApiException;
import com.cyberbook.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class AdminService {

    private final UserRepository userRepository;
    private final ClubRepository clubRepository;
    private final ComputerRepository computerRepository;
    private final BookingRepository bookingRepository;
    private final ReviewRepository reviewRepository;
    private final FavoriteRepository favoriteRepository;
    private final BookingService bookingService;
    private final ClubService clubService;

    @Transactional(readOnly = true)
    public ApiResponse<PlatformStatistics> statistics() {
        long totalUsers = userRepository.count();
        long totalClubs = clubRepository.count();
        long totalComputers = computerRepository.count();
        long totalBookings = bookingRepository.count();
        long activeClubs = clubRepository.countByActiveTrue();
        long activeBookings = bookingRepository.countByStatus(BookingStatus.CONFIRMED)
                + bookingRepository.countByStatus(BookingStatus.PENDING)
                + bookingRepository.countByStatus(BookingStatus.COMPLETED);
        long cancelledBookings = bookingRepository.countByStatus(BookingStatus.CANCELLED);
        BigDecimal revenue = bookingRepository.totalRevenue(BookingStatus.CANCELLED);
        if (revenue == null) revenue = BigDecimal.ZERO;

        return ApiResponse.ok(new PlatformStatistics(
                totalUsers,
                totalClubs,
                totalComputers,
                totalBookings,
                activeClubs,
                activeBookings,
                cancelledBookings,
                revenue.setScale(0, RoundingMode.HALF_UP),
                reviewRepository.count(),
                favoriteRepository.count()));
    }

    @Transactional(readOnly = true)
    public ApiResponse<PageResponse<UserResponse>> users(String search, String role, int page, int size) {
        var pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        var users = (role == null || role.isBlank())
                ? (search == null || search.isBlank()
                    ? userRepository.findAll(pageable)
                    : userRepository.findByFullNameContainingIgnoreCaseOrEmailContainingIgnoreCase(search, search, pageable))
                : userRepository.findByRole(Role.valueOf(role.toUpperCase()), pageable);

        List<UserResponse> content = users.getContent().stream().map(UserResponse::from).toList();
        return ApiResponse.ok(PageResponse.of(content, page, size, users.getTotalElements()));
    }

    @Transactional
    public ApiResponse<UserResponse> updateUserRole(Long userId, String role) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ApiException(404, "User not found"));
        try {
            user.setRole(Role.valueOf(role.toUpperCase()));
        } catch (IllegalArgumentException e) {
            throw new ApiException("Unknown role: " + role);
        }
        user = userRepository.save(user);
        return ApiResponse.ok("User role updated", UserResponse.from(user));
    }

    @Transactional
    public ApiResponse<Void> deleteUser(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ApiException(404, "User not found"));
        if (user.getRole() == Role.ADMIN) {
            throw new ApiException("Administrators cannot be deleted");
        }
        List<Booking> bookings = bookingRepository.findByUserIdOrderByBookingDateDescStartTimeDesc(userId);
        bookings.forEach(b -> b.setStatus(BookingStatus.CANCELLED));
        bookingRepository.saveAll(bookings);
        favoriteRepository.deleteAll(favoriteRepository.findByUserId(userId));
        userRepository.delete(user);
        return ApiResponse.ok("User deleted", null);
    }

    @Transactional(readOnly = true)
    public ApiResponse<PageResponse<ClubResponse>> clubs(int page, int size) {
        var clubs = clubRepository.findAll(PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt")));
        List<ClubResponse> content = clubs.getContent().stream()
                .map(club -> clubService.decorate(club, null, null, null))
                .toList();
        return ApiResponse.ok(PageResponse.of(content, page, size, clubs.getTotalElements()));
    }

    @Transactional
    public ApiResponse<ClubResponse> toggleClub(Long clubId) {
        Club club = clubRepository.findById(clubId)
                .orElseThrow(() -> new ApiException(404, "Club not found"));
        club.setActive(!club.getActive());
        club = clubRepository.save(club);
        return ApiResponse.ok(club.getActive() ? "Club activated" : "Club deactivated",
                clubService.decorate(club, null, null, null));
    }

    @Transactional(readOnly = true)
    public ApiResponse<PageResponse<BookingResponse>> bookings(int page, int size) {
        var bookings = bookingRepository.findAll(PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt")));
        List<BookingResponse> content = bookingService.toResponses(bookings.getContent());
        return ApiResponse.ok(PageResponse.of(content, page, size, bookings.getTotalElements()));
    }

    @Transactional(readOnly = true)
    public ApiResponse<List<Map<String, Object>>> recentActivity() {
        List<Booking> recent = bookingRepository.findAll(PageRequest.of(0, 8, Sort.by(Sort.Direction.DESC, "createdAt"))).getContent();
        Map<Long, String> clubNames = clubRepository.findAllById(recent.stream().map(Booking::getClubId).collect(Collectors.toSet()))
                .stream().collect(Collectors.toMap(Club::getId, Club::getName));
        Map<Long, String> userNames = userRepository.findAllById(recent.stream().map(Booking::getUserId).collect(Collectors.toSet()))
                .stream().collect(Collectors.toMap(User::getId, User::getFullName));

        List<Map<String, Object>> items = recent.stream().map(b -> Map.<String, Object>of(
                "id", b.getId(),
                "type", b.getStatus().name(),
                "club", clubNames.getOrDefault(b.getClubId(), "Unknown club"),
                "user", userNames.getOrDefault(b.getUserId(), "Unknown user"),
                "date", b.getBookingDate().toString(),
                "amount", b.getTotalPrice(),
                "createdAt", b.getCreatedAt().toString()
        )).toList();

        return ApiResponse.ok(items);
    }
}
