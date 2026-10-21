package com.cyberbook.controller;

import com.cyberbook.dto.ClubDtos.AvailabilitySlot;
import com.cyberbook.dto.ClubDtos.ClubRequest;
import com.cyberbook.dto.ClubDtos.ClubResponse;
import com.cyberbook.dto.CommonDtos.ApiResponse;
import com.cyberbook.dto.CommonDtos.PageResponse;
import com.cyberbook.entity.Role;
import com.cyberbook.repository.UserRepository;
import com.cyberbook.security.CurrentUserService;
import com.cyberbook.service.ClubService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/clubs")
@RequiredArgsConstructor
public class ClubController {

    private final ClubService clubService;
    private final CurrentUserService currentUserService;
    private final UserRepository userRepository;

    @GetMapping
    public ApiResponse<PageResponse<ClubResponse>> list(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) BigDecimal minPrice,
            @RequestParam(required = false) BigDecimal maxPrice,
            @RequestParam(required = false) BigDecimal minRating,
            @RequestParam(required = false) Boolean vip,
            @RequestParam(required = false) Boolean availableNow,
            @RequestParam(required = false) String game,
            @RequestParam(required = false) String sort,
            @RequestParam(required = false) Double lat,
            @RequestParam(required = false) Double lon,
            @RequestParam(required = false, defaultValue = "0") Integer page,
            @RequestParam(required = false, defaultValue = "12") Integer size) {
        return clubService.list(search, minPrice, maxPrice, minRating, vip, availableNow, game, sort,
                lat, lon, page, size, optionalUserId());
    }

    @GetMapping("/{id}")
    public ApiResponse<ClubResponse> get(@PathVariable Long id,
                                         @RequestParam(required = false) Double lat,
                                         @RequestParam(required = false) Double lon) {
        return clubService.get(id, lat, lon, optionalUserId());
    }

    @GetMapping("/{id}/availability")
    public ApiResponse<List<AvailabilitySlot>> availability(
            @PathVariable Long id,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return clubService.availability(id, date, optionalUserId());
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('CLUB_OWNER','ADMIN')")
    public ApiResponse<ClubResponse> create(@Valid @RequestBody ClubRequest request) {
        return clubService.create(request, currentUserService.currentUserId());
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('CLUB_OWNER','ADMIN')")
    public ApiResponse<ClubResponse> update(@PathVariable Long id, @Valid @RequestBody ClubRequest request) {
        return clubService.update(id, request, currentUserService.currentUserId());
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('CLUB_OWNER','ADMIN')")
    public ApiResponse<Void> delete(@PathVariable Long id) {
        return clubService.delete(id, currentUserService.currentUserId());
    }

    private Long optionalUserId() {
        try {
            return currentUserService.currentUserId();
        } catch (Exception e) {
            return null;
        }
    }
}
