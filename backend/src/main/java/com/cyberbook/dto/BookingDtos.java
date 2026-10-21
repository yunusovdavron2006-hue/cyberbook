package com.cyberbook.dto;

import com.cyberbook.entity.BookingStatus;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;

public class BookingDtos {

    public record BookingRequest(
            @NotNull(message = "Club is required") Long clubId,
            @NotNull(message = "Computer is required") Long computerId,
            @NotNull(message = "Date is required") LocalDate bookingDate,
            @NotNull(message = "Start time is required") LocalTime startTime,
            @NotNull(message = "End time is required") LocalTime endTime
    ) {
    }

    public record BookingResponse(
            Long id,
            Long userId,
            String userName,
            Long clubId,
            String clubName,
            Long computerId,
            Integer computerNumber,
            String computerName,
            LocalDate bookingDate,
            LocalTime startTime,
            LocalTime endTime,
            BigDecimal totalPrice,
            BookingStatus status,
            java.time.LocalDateTime createdAt
    ) {
    }

    public record OwnerBookingStatusRequest(BookingStatus status) {
    }
}
