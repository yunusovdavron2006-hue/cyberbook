package com.cyberbook.dto;

import java.util.List;

public class CommonDtos {

    public record ApiResponse<T>(boolean success, String message, T data) {

        public static <T> ApiResponse<T> ok(T data) {
            return new ApiResponse<>(true, "OK", data);
        }

        public static <T> ApiResponse<T> ok(String message, T data) {
            return new ApiResponse<>(true, message, data);
        }

        public static <T> ApiResponse<T> error(String message) {
            return new ApiResponse<>(false, message, null);
        }
    }

    public record PageResponse<T>(List<T> content, int page, int size, long totalElements, int totalPages) {

        public static <T> PageResponse<T> of(List<T> content, int page, int size, long totalElements) {
            int totalPages = size <= 0 ? 0 : (int) Math.ceil((double) totalElements / size);
            return new PageResponse<>(content, page, size, totalElements, totalPages);
        }
    }

    public record PlatformStatistics(
            long totalUsers,
            long totalClubs,
            long totalComputers,
            long totalBookings,
            long activeClubs,
            long activeBookings,
            long cancelledBookings,
            java.math.BigDecimal totalRevenue,
            long totalReviews,
            long totalFavorites
    ) {
    }

    public record OwnerStatistics(
            long totalComputers,
            long activeComputers,
            long bookingsToday,
            long totalBookings,
            long upcomingBookings,
            java.math.BigDecimal revenue,
            java.math.BigDecimal revenueToday,
            double occupancyPercent,
            double rating,
            long reviewCount
    ) {
    }

    public record ActivityItem(String type, String text, LocalDateTimeWrapper createdAt) {
    }

    public record LocalDateTimeWrapper(java.time.LocalDateTime value) {
    }

    public record KeyValue(Long id, String label, String sublabel, String value) {
    }
}
