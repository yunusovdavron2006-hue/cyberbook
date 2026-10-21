package com.cyberbook.service;

import com.cyberbook.dto.ClubDtos.ClubResponse;
import com.cyberbook.dto.CommonDtos.ApiResponse;
import com.cyberbook.entity.Favorite;
import com.cyberbook.repository.FavoriteRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class FavoriteService {

    private final FavoriteRepository favoriteRepository;
    private final ClubService clubService;

    @Transactional
    public ApiResponse<Boolean> toggle(Long clubId, Long userId) {
        clubService.find(clubId);
        var existing = favoriteRepository.findByUserIdAndClubId(userId, clubId);
        if (existing.isPresent()) {
            favoriteRepository.delete(existing.get());
            return ApiResponse.ok("Removed from favorites", false);
        }
        favoriteRepository.save(Favorite.builder().userId(userId).clubId(clubId).build());
        return ApiResponse.ok("Added to favorites", true);
    }

    @Transactional
    public ApiResponse<Void> remove(Long clubId, Long userId) {
        favoriteRepository.deleteByUserIdAndClubId(userId, clubId);
        return ApiResponse.ok("Removed from favorites", null);
    }

    @Transactional(readOnly = true)
    public ApiResponse<List<ClubResponse>> list(Long userId, Double lat, Double lon) {
        List<ClubResponse> clubs = favoriteRepository.findByUserId(userId).stream()
                .map(Favorite::getClubId)
                .map(id -> clubRepositoryFind(id, lat, lon, userId))
                .toList();
        return ApiResponse.ok(clubs);
    }

    private ClubResponse clubRepositoryFind(Long clubId, Double lat, Double lon, Long userId) {
        return clubService.get(clubId, lat, lon, userId).data();
    }
}
