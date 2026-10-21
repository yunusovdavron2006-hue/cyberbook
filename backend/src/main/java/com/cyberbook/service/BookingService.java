package com.cyberbook.service;

import com.cyberbook.dto.BookingDtos.BookingRequest;
import com.cyberbook.dto.BookingDtos.BookingResponse;
import com.cyberbook.dto.CommonDtos.ApiResponse;
import com.cyberbook.entity.*;
import com.cyberbook.exception.ApiException;
import com.cyberbook.exception.ForbiddenException;
import com.cyberbook.exception.NotFoundException;
import com.cyberbook.repository.BookingRepository;
import com.cyberbook.repository.ClubRepository;
import com.cyberbook.repository.ComputerRepository;
import com.cyberbook.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class BookingService {

    private static final DateTimeFormatter TIME_FORMAT = DateTimeFormatter.ofPattern("HH:mm");

    private final BookingRepository bookingRepository;
    private final ComputerRepository computerRepository;
    private final ClubRepository clubRepository;
    private final UserRepository userRepository;

    @Transactional
    public ApiResponse<BookingResponse> create(BookingRequest request, Long userId) {
        if (!request.endTime().isAfter(request.startTime())) {
            throw new ApiException("End time must be after start time");
        }
        if (request.bookingDate().isBefore(LocalDate.now())) {
            throw new ApiException("You cannot book a date in the past");
        }
        if (request.startTime().isBefore(LocalTime.of(0, 0)) || request.endTime().isAfter(LocalTime.of(23, 59))) {
            throw new ApiException("Booking time is outside the allowed range");
        }
        if (request.endTime().getMinute() % 30 != 0 || request.startTime().getMinute() % 30 != 0) {
            throw new ApiException("Booking time must be in 30 minute increments");
        }

        Club club = clubRepository.findById(request.clubId())
                .orElseThrow(() -> new NotFoundException("Club not found"));
        if (!Boolean.TRUE.equals(club.getActive())) {
            throw new ApiException("This club is not accepting bookings");
        }

        Computer computer = computerRepository.findByIdAndClubId(request.computerId(), request.clubId())
                .orElseThrow(() -> new NotFoundException("Computer not found in this club"));

        if (computer.getStatus() != ComputerStatus.ACTIVE) {
            throw new ApiException("This computer is not available for booking");
        }

        if (club.getOpeningTime() != null && request.startTime().isBefore(club.getOpeningTime())) {
            throw new ApiException("Booking starts before the club opens (" + club.getOpeningTime().format(TIME_FORMAT) + ")");
        }
        if (club.getClosingTime() != null && request.endTime().isAfter(club.getClosingTime())) {
            throw new ApiException("Booking ends after the club closes (" + club.getClosingTime().format(TIME_FORMAT) + ")");
        }

        List<Booking> overlaps = bookingRepository.findOverlapping(
                computer.getId(), request.bookingDate(), request.startTime(), request.endTime(), BookingStatus.CANCELLED);

        if (!overlaps.isEmpty()) {
            throw new ApiException(409, "This computer is already booked for the selected time. Choose another time or computer.");
        }

        BigDecimal hours = hoursBetween(request.startTime(), request.endTime());
        BigDecimal totalPrice = computer.getPricePerHour().multiply(hours).setScale(0, RoundingMode.HALF_UP);

        Booking booking = Booking.builder()
                .userId(userId)
                .clubId(club.getId())
                .computerId(computer.getId())
                .bookingDate(request.bookingDate())
                .startTime(request.startTime())
                .endTime(request.endTime())
                .totalPrice(totalPrice)
                .status(BookingStatus.CONFIRMED)
                .build();

        booking = bookingRepository.save(booking);
        return ApiResponse.ok("Booking confirmed", toResponse(booking));
    }

    @Transactional(readOnly = true)
    public ApiResponse<List<BookingResponse>> my(Long userId) {
        List<BookingResponse> bookings = bookingRepository.findByUserIdOrderByBookingDateDescStartTimeDesc(userId)
                .stream()
                .map(this::toResponse)
                .toList();
        return ApiResponse.ok(bookings);
    }

    @Transactional(readOnly = true)
    public ApiResponse<BookingResponse> get(Long id, Long userId) {
        Booking booking = find(id);
        User user = userRepository.findById(userId).orElseThrow(() -> new ApiException(401, "Authentication required"));
        if (booking.getUserId().equals(userId) || user.getRole() == Role.ADMIN
                || belongsToOwner(booking, userId)) {
            return ApiResponse.ok(toResponse(booking));
        }
        throw new ForbiddenException("You do not have access to this booking");
    }

    @Transactional
    public ApiResponse<BookingResponse> cancel(Long id, Long userId) {
        Booking booking = find(id);
        User user = userRepository.findById(userId).orElseThrow(() -> new ApiException(401, "Authentication required"));

        boolean allowed = booking.getUserId().equals(userId) || user.getRole() == Role.ADMIN
                || belongsToOwner(booking, userId);
        if (!allowed) {
            throw new ForbiddenException("You do not have access to this booking");
        }
        if (booking.getStatus() == BookingStatus.CANCELLED) {
            throw new ApiException("Booking is already cancelled");
        }
        if (booking.getStatus() == BookingStatus.COMPLETED) {
            throw new ApiException("Completed bookings cannot be cancelled");
        }

        booking.setStatus(BookingStatus.CANCELLED);
        booking = bookingRepository.save(booking);
        return ApiResponse.ok("Booking cancelled", toResponse(booking));
    }

    @Transactional
    public ApiResponse<BookingResponse> updateStatus(Long id, BookingStatus status, Long userId) {
        Booking booking = find(id);
        User user = userRepository.findById(userId).orElseThrow(() -> new ApiException(401, "Authentication required"));

        boolean allowed = user.getRole() == Role.ADMIN || belongsToOwner(booking, userId);
        if (!allowed) {
            throw new ForbiddenException("You do not have access to this booking");
        }
        if (status == null) {
            throw new ApiException("Status is required");
        }
        if (booking.getStatus() == BookingStatus.CANCELLED && status != BookingStatus.CANCELLED) {
            throw new ApiException("Cancelled bookings cannot be reactivated");
        }

        booking.setStatus(status);
        booking = bookingRepository.save(booking);
        return ApiResponse.ok("Booking updated", toResponse(booking));
    }

    @Transactional(readOnly = true)
    public ApiResponse<List<BookingResponse>> clubBookings(Long clubId, Long userId) {
        Club club = clubRepository.findById(clubId)
                .orElseThrow(() -> new NotFoundException("Club not found"));
        User user = userRepository.findById(userId).orElseThrow(() -> new ApiException(401, "Authentication required"));
        if (!club.getOwnerId().equals(userId) && user.getRole() != Role.ADMIN) {
            throw new ForbiddenException("You do not have access to this club's bookings");
        }
        List<BookingResponse> bookings = bookingRepository.findByClubIdOrderByBookingDateDescStartTimeDesc(clubId)
                .stream().map(this::toResponse).toList();
        return ApiResponse.ok(bookings);
    }

    public Booking find(Long id) {
        return bookingRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Booking not found"));
    }

    private boolean belongsToOwner(Booking booking, Long userId) {
        return clubRepository.findById(booking.getClubId())
                .map(club -> club.getOwnerId().equals(userId))
                .orElse(false);
    }

    public static BigDecimal hoursBetween(LocalTime start, LocalTime end) {
        long minutes = java.time.Duration.between(start, end).toMinutes();
        return BigDecimal.valueOf(minutes).divide(BigDecimal.valueOf(60), 2, RoundingMode.HALF_UP);
    }

    public BookingResponse toResponse(Booking booking) {
        String userName = userRepository.findById(booking.getUserId()).map(User::getFullName).orElse(null);
        String clubName = clubRepository.findById(booking.getClubId()).map(Club::getName).orElse(null);
        Computer computer = computerRepository.findById(booking.getComputerId()).orElse(null);

        return new BookingResponse(
                booking.getId(),
                booking.getUserId(),
                userName,
                booking.getClubId(),
                clubName,
                booking.getComputerId(),
                computer == null ? null : computer.getComputerNumber(),
                computer == null ? null : computer.getName(),
                booking.getBookingDate(),
                booking.getStartTime(),
                booking.getEndTime(),
                booking.getTotalPrice(),
                booking.getStatus(),
                booking.getCreatedAt());
    }

    public List<BookingResponse> toResponses(List<Booking> bookings) {
        if (bookings.isEmpty()) return List.of();
        Map<Long, String> users = userRepository.findAllById(bookings.stream().map(Booking::getUserId).collect(Collectors.toSet()))
                .stream().collect(Collectors.toMap(User::getId, User::getFullName));
        Map<Long, String> clubs = clubRepository.findAllById(bookings.stream().map(Booking::getClubId).collect(Collectors.toSet()))
                .stream().collect(Collectors.toMap(Club::getId, Club::getName));
        Map<Long, Computer> computers = computerRepository.findAllById(bookings.stream().map(Booking::getComputerId).collect(Collectors.toSet()))
                .stream().collect(Collectors.toMap(Computer::getId, c -> c));

        List<BookingResponse> responses = new ArrayList<>();
        for (Booking booking : bookings) {
            Computer computer = computers.get(booking.getComputerId());
            responses.add(new BookingResponse(
                    booking.getId(), booking.getUserId(), users.getOrDefault(booking.getUserId(), null),
                    booking.getClubId(), clubs.getOrDefault(booking.getClubId(), null),
                    booking.getComputerId(),
                    computer == null ? null : computer.getComputerNumber(),
                    computer == null ? null : computer.getName(),
                    booking.getBookingDate(), booking.getStartTime(), booking.getEndTime(),
                    booking.getTotalPrice(), booking.getStatus(), booking.getCreatedAt()));
        }
        return responses;
    }
}
