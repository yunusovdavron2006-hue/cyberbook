package com.cyberbook.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;

public class ReviewDtos {

    public record ReviewRequest(
            @Min(value = 1, message = "Rating must be between 1 and 5")
            @Max(value = 5, message = "Rating must be between 1 and 5")
            Integer rating,

            @Size(max = 1000, message = "Comment must be at most 1000 characters")
            String comment
    ) {
    }

    public record ReviewResponse(
            Long id,
            Long userId,
            String userName,
            Long clubId,
            Integer rating,
            String comment,
            LocalDateTime createdAt
    ) {
    }
}
