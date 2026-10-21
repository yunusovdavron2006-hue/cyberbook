package com.cyberbook.dto;

import com.cyberbook.entity.Club;

import java.math.BigDecimal;
import java.time.LocalTime;

public class ClubDtos {

    public record ClubRequest(
            String name,
            String description,
            String address,
            Double latitude,
            Double longitude,
            String phone,
            String openingTime,
            String closingTime,
            String imageUrl,
            Boolean vip,
            Boolean active
    ) {
    }

    public record ClubResponse(
            Long id,
            String name,
            String description,
            String address,
            Double latitude,
            Double longitude,
            String phone,
            LocalTime openingTime,
            LocalTime closingTime,
            BigDecimal rating,
            String imageUrl,
            BigDecimal minPricePerHour,
            Integer totalComputers,
            Boolean vip,
            Boolean active,
            Long ownerId,
            String ownerName,
            Long reviewCount,
            Long favoriteCount,
            Boolean favorite,
            Double distanceKm,
            java.time.LocalDateTime createdAt
    ) {

        public static ClubResponse basic(Club club) {
            return new ClubResponse(club.getId(), club.getName(), club.getDescription(), club.getAddress(),
                    club.getLatitude(), club.getLongitude(), club.getPhone(), club.getOpeningTime(),
                    club.getClosingTime(), club.getRating(), club.getImageUrl(), club.getMinPricePerHour(),
                    club.getTotalComputers(), club.getVip(), club.getActive(), club.getOwnerId(),
                    null, null, null, false, null, null, club.getCreatedAt());
        }
    }

    public record AvailabilitySlot(Long computerId, Integer computerNumber, String status,
                                   java.util.List<TimeRange> busy) {
    }

    public record TimeRange(String start, String end, Long bookingId) {
    }
}
