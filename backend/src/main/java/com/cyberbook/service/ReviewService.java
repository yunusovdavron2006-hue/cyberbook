package com.cyberbook.service;

import com.cyberbook.dto.CommonDtos.ApiResponse;
import com.cyberbook.dto.ReviewDtos.ReviewRequest;
import com.cyberbook.dto.ReviewDtos.ReviewResponse;
import com.cyberbook.entity.Review;
import com.cyberbook.entity.User;
import com.cyberbook.exception.ForbiddenException;
import com.cyberbook.repository.ReviewRepository;
import com.cyberbook.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class ReviewService {

    private final ReviewRepository reviewRepository;
    private final UserRepository userRepository;
    private final ClubService clubService;

    @Transactional
    public ApiResponse<ReviewResponse> create(Long clubId, ReviewRequest request, Long userId) {
        clubService.find(clubId);

        if (request.rating() == null) {
            throw new com.cyberbook.exception.ApiException("Rating is required");
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new com.cyberbook.exception.ApiException(401, "Authentication required"));

        Review review = reviewRepository.findByUserIdAndClubId(userId, clubId).orElseGet(Review::new);
        review.setUserId(userId);
        review.setClubId(clubId);
        review.setRating(request.rating());
        review.setComment(request.comment() == null ? null : request.comment().trim());

        review = reviewRepository.save(review);
        clubService.recalculateRating(clubId);

        return ApiResponse.ok("Review saved", toResponse(review, user.getFullName()));
    }

    @Transactional(readOnly = true)
    public ApiResponse<List<ReviewResponse>> list(Long clubId) {
        clubService.find(clubId);
        List<ReviewResponse> reviews = reviewRepository.findByClubIdOrderByCreatedAtDesc(clubId)
                .stream()
                .map(review -> toResponse(review, userName(review.getUserId())))
                .toList();
        return ApiResponse.ok(reviews);
    }

    @Transactional
    public ApiResponse<Void> delete(Long clubId, Long reviewId, Long userId) {
        Review review = reviewRepository.findById(reviewId)
                .orElseThrow(() -> new com.cyberbook.exception.NotFoundException("Review not found"));
        if (!review.getClubId().equals(clubId)) {
            throw new com.cyberbook.exception.NotFoundException("Review not found");
        }
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ForbiddenException("You do not have permission"));
        if (!review.getUserId().equals(userId) && user.getRole() != com.cyberbook.entity.Role.ADMIN) {
            throw new ForbiddenException("You can only delete your own reviews");
        }
        Long club = review.getClubId();
        reviewRepository.delete(review);
        clubService.recalculateRating(club);
        return ApiResponse.ok("Review deleted", null);
    }

    private String userName(Long userId) {
        return userRepository.findById(userId).map(User::getFullName).orElse(null);
    }

    private ReviewResponse toResponse(Review review, String userName) {
        return new ReviewResponse(review.getId(), review.getUserId(), userName, review.getClubId(),
                review.getRating(), review.getComment(), review.getCreatedAt());
    }
}
