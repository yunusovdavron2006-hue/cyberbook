package com.cyberbook.service;

import com.cyberbook.dto.ClubDtos.AvailabilitySlot;
import com.cyberbook.dto.ClubDtos.ClubRequest;
import com.cyberbook.dto.ClubDtos.ClubResponse;
import com.cyberbook.dto.ClubDtos.TimeRange;
import com.cyberbook.dto.CommonDtos.ApiResponse;
import com.cyberbook.dto.CommonDtos.PageResponse;
import com.cyberbook.entity.*;
import com.cyberbook.exception.ForbiddenException;
import com.cyberbook.exception.NotFoundException;
import com.cyberbook.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Service
@RequiredArgsConstructor
public class ClubService {

    private static final DateTimeFormatter TIME_FORMAT = DateTimeFormatter.ofPattern("HH:mm");

    private final ClubRepository clubRepository;
    private final ComputerRepository computerRepository;
    private final BookingRepository bookingRepository;
    private final ReviewRepository reviewRepository;
    private final FavoriteRepository favoriteRepository;
    private final UserRepository userRepository;

    @Transactional(readOnly = true)
    public ApiResponse<PageResponse<ClubResponse>> list(String search,
                                                        BigDecimal minPrice,
                                                        BigDecimal maxPrice,
                                                        BigDecimal minRating,
                                                        Boolean vip,
                                                        Boolean availableNow,
                                                        String game,
                                                        String sort,
                                                        Double lat,
                                                        Double lon,
                                                        Integer page,
                                                        Integer size,
                                                        Long currentUserId) {
        int pageIndex = page == null || page < 0 ? 0 : page;
        int pageSize = size == null || size <= 0 || size > 60 ? 12 : size;

        String term = (search == null || search.isBlank()) ? null : search.trim();

        String key = sort == null ? "" : sort.trim().toLowerCase();
        boolean byDistance = "nearest".equals(key) || key.isEmpty();

        List<Club> all;
        if (game != null && !game.isBlank()) {
            all = clubRepository.findByGame(game.trim(), true,
                    PageRequest.of(0, 1000, Sort.by("id"))).getContent();
        } else {
            all = clubRepository.search(term, minPrice, maxPrice, minRating, vip, true,
                    PageRequest.of(0, 1000, Sort.by(resolveSort(key, lat, lon)))).getContent();
        }

        List<ClubResponse> responses = all.stream()
                .map(club -> decorate(club, lat, lon, currentUserId))
                .filter(response -> !Boolean.TRUE.equals(availableNow) || isAvailableNow(response))
                .sorted(byDistance
                        ? Comparator.comparingDouble(r -> r.distanceKm() == null ? Double.MAX_VALUE : r.distanceKm())
                        : comparatorFor(key))
                .toList();

        int total = responses.size();
        int fromIndex = Math.min(pageIndex * pageSize, total);
        int toIndex = Math.min(fromIndex + pageSize, total);
        List<ClubResponse> content = responses.subList(fromIndex, toIndex);

        return ApiResponse.ok(PageResponse.of(content, pageIndex, pageSize, total));
    }

    private Comparator<ClubResponse> comparatorFor(String key) {
        return switch (key) {
            case "cheapest" -> Comparator.comparing(r -> r.minPricePerHour() == null ? BigDecimal.ZERO : r.minPricePerHour());
            case "rating", "highest_rated" -> Comparator.comparing(r -> r.rating() == null ? BigDecimal.ZERO : r.rating(), Comparator.reverseOrder());
            case "popular" -> Comparator.comparing(r -> r.reviewCount() == null ? 0L : r.reviewCount(), Comparator.reverseOrder());
            case "newest" -> Comparator.comparing(ClubResponse::createdAt, Comparator.nullsLast(Comparator.reverseOrder()));
            default -> Comparator.comparing(ClubResponse::name, String.CASE_INSENSITIVE_ORDER);
        };
    }

    @Transactional(readOnly = true)
    public ApiResponse<ClubResponse> get(Long id, Double lat, Double lon, Long currentUserId) {
        Club club = find(id);
        return ApiResponse.ok(decorate(club, lat, lon, currentUserId));
    }

    @Transactional
    public ApiResponse<ClubResponse> create(ClubRequest request, Long ownerId) {
        validate(request);
        Club club = Club.builder()
                .name(request.name().trim())
                .description(request.description())
                .address(request.address().trim())
                .latitude(request.latitude())
                .longitude(request.longitude())
                .phone(request.phone())
                .openingTime(parseTime(request.openingTime(), LocalTime.of(10, 0)))
                .closingTime(parseTime(request.closingTime(), LocalTime.of(23, 59)))
                .imageUrl(request.imageUrl())
                .vip(Boolean.TRUE.equals(request.vip()))
                .active(request.active() == null || request.active())
                .ownerId(ownerId)
                .minPricePerHour(BigDecimal.ZERO)
                .totalComputers(0)
                .rating(BigDecimal.ZERO)
                .build();

        club = clubRepository.save(club);
        return ApiResponse.ok("Club created", decorate(club, null, null, ownerId));
    }

    @Transactional
    public ApiResponse<ClubResponse> update(Long id, ClubRequest request, Long userId) {
        Club club = find(id);
        checkOwnerOrAdmin(club, userId);
        validate(request);

        club.setName(request.name().trim());
        club.setDescription(request.description());
        club.setAddress(request.address().trim());
        club.setLatitude(request.latitude());
        club.setLongitude(request.longitude());
        club.setPhone(request.phone());
        if (request.openingTime() != null) club.setOpeningTime(parseTime(request.openingTime(), club.getOpeningTime()));
        if (request.closingTime() != null) club.setClosingTime(parseTime(request.closingTime(), club.getClosingTime()));
        if (request.imageUrl() != null) club.setImageUrl(request.imageUrl());
        if (request.vip() != null) club.setVip(request.vip());
        if (request.active() != null) club.setActive(request.active());

        club = clubRepository.save(club);
        return ApiResponse.ok("Club updated", decorate(club, null, null, userId));
    }

    @Transactional
    public ApiResponse<Void> delete(Long id, Long userId) {
        Club club = find(id);
        checkOwnerOrAdmin(club, userId);
        List<Booking> bookings = bookingRepository.findByClubIdOrderByBookingDateDescStartTimeDesc(id);
        bookings.forEach(b -> b.setStatus(BookingStatus.CANCELLED));
        bookingRepository.saveAll(bookings);
        computerRepository.deleteByClubId(id);
        clubRepository.delete(club);
        return ApiResponse.ok("Club deleted", null);
    }

    @Transactional(readOnly = true)
    public ApiResponse<List<AvailabilitySlot>> availability(Long clubId, LocalDate date, Long currentUserId) {
        find(clubId);
        List<Computer> computers = computerRepository.findByClubIdOrderByComputerNumberAsc(clubId);
        List<Booking> bookings = date == null ? List.of()
                : bookingRepository.findClubDayBookings(clubId, date, BookingStatus.CANCELLED);

        List<AvailabilitySlot> slots = computers.stream().map(computer -> {
            List<TimeRange> busy = bookings.stream()
                    .filter(b -> b.getComputerId().equals(computer.getId()))
                    .sorted(Comparator.comparing(Booking::getStartTime))
                    .map(b -> new TimeRange(
                            b.getStartTime().format(TIME_FORMAT),
                            b.getEndTime().format(TIME_FORMAT),
                            b.getId()))
                    .toList();
            return new AvailabilitySlot(computer.getId(), computer.getComputerNumber(),
                    computer.getStatus().name(), busy);
        }).toList();

        return ApiResponse.ok(slots);
    }

    public Club find(Long id) {
        return clubRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Club not found"));
    }

    public void checkOwnerOrAdmin(Club club, Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ForbiddenException("You do not have permission to manage this club"));
        if (user.getRole() == Role.ADMIN) {
            return;
        }
        if (!club.getOwnerId().equals(userId)) {
            throw new ForbiddenException("You do not have permission to manage this club");
        }
    }

    public void recalculateRating(Long clubId) {
        Club club = clubRepository.findById(clubId).orElse(null);
        if (club == null) return;
        Double avg = reviewRepository.averageRating(clubId);
        long count = reviewRepository.countByClubId(clubId);
        club.setRating(BigDecimal.valueOf(avg == null ? 0 : avg).setScale(1, RoundingMode.HALF_UP));
        clubRepository.save(club);
    }

    public void refreshClubAggregates(Long clubId) {
        Club club = clubRepository.findById(clubId).orElse(null);
        if (club == null) return;
        List<Computer> computers = computerRepository.findByClubIdOrderByComputerNumberAsc(clubId);
        club.setTotalComputers(computers.size());
        club.setMinPricePerHour(computers.stream()
                .map(Computer::getPricePerHour)
                .filter(Objects::nonNull)
                .min(Comparator.naturalOrder())
                .orElse(BigDecimal.ZERO));
        clubRepository.save(club);
    }

    public ClubResponse decorate(Club club, Double lat, Double lon, Long currentUserId) {
        String ownerName = userRepository.findById(club.getOwnerId()).map(User::getFullName).orElse(null);
        long reviewCount = reviewRepository.countByClubId(club.getId());
        long favoriteCount = favoriteRepository.countByClubId(club.getId());
        boolean favorite = currentUserId != null && favoriteRepository.existsByUserIdAndClubId(currentUserId, club.getId());
        Double distance = (lat != null && lon != null) ? haversine(lat, lon, club.getLatitude(), club.getLongitude()) : null;

        return new ClubResponse(club.getId(), club.getName(), club.getDescription(), club.getAddress(),
                club.getLatitude(), club.getLongitude(), club.getPhone(), club.getOpeningTime(),
                club.getClosingTime(), club.getRating(), club.getImageUrl(), club.getMinPricePerHour(),
                club.getTotalComputers(), club.getVip(), club.getActive(), club.getOwnerId(),
                ownerName, reviewCount, favoriteCount, favorite, distance, club.getCreatedAt());
    }

    private boolean isAvailableNow(ClubResponse club) {
        LocalTime now = LocalTime.now();
        if (club.openingTime() != null && now.isBefore(club.openingTime())) return false;
        if (club.closingTime() != null && now.isAfter(club.closingTime())) return false;
        return club.totalComputers() != null && club.totalComputers() > 0;
    }

    private Sort resolveSort(String key, Double lat, Double lon) {
        return switch (key) {
            case "cheapest" -> Sort.by(Sort.Direction.ASC, "minPricePerHour");
            case "rating", "highest_rated" -> Sort.by(Sort.Direction.DESC, "rating");
            case "popular" -> Sort.by(Sort.Direction.DESC, "totalComputers");
            case "newest" -> Sort.by(Sort.Direction.DESC, "createdAt");
            default -> Sort.by(Sort.Direction.ASC, "name");
        };
    }

    private void validate(ClubRequest request) {
        if (request.name() == null || request.name().isBlank()) {
            throw new com.cyberbook.exception.ApiException("Club name is required");
        }
        if (request.address() == null || request.address().isBlank()) {
            throw new com.cyberbook.exception.ApiException("Club address is required");
        }
        if (request.latitude() == null || request.longitude() == null) {
            throw new com.cyberbook.exception.ApiException("Club coordinates are required");
        }
        if (request.latitude() < -90 || request.latitude() > 90 || request.longitude() < -180 || request.longitude() > 180) {
            throw new com.cyberbook.exception.ApiException("Club coordinates are not valid");
        }
    }

    private LocalTime parseTime(String value, LocalTime fallback) {
        if (value == null || value.isBlank()) return fallback;
        try {
            return LocalTime.parse(value.trim());
        } catch (Exception e) {
            throw new com.cyberbook.exception.ApiException("Time must be in HH:mm format");
        }
    }

    public static Double haversine(double lat1, double lon1, double lat2, double lon2) {
        final int R = 6371;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        double distance = R * c;
        return Math.round(distance * 10.0) / 10.0;
    }
}
