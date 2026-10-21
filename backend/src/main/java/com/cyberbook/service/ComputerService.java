package com.cyberbook.service;

import com.cyberbook.dto.CommonDtos.ApiResponse;
import com.cyberbook.dto.ComputerDtos.ComputerRequest;
import com.cyberbook.dto.ComputerDtos.ComputerResponse;
import com.cyberbook.entity.Computer;
import com.cyberbook.entity.ComputerStatus;
import com.cyberbook.exception.ApiException;
import com.cyberbook.exception.NotFoundException;
import com.cyberbook.repository.ComputerRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;

@Service
@RequiredArgsConstructor
public class ComputerService {

    private final ComputerRepository computerRepository;
    private final ClubService clubService;

    @Transactional(readOnly = true)
    public ApiResponse<List<ComputerResponse>> listByClub(Long clubId) {
        clubService.find(clubId);
        List<ComputerResponse> computers = computerRepository.findByClubIdOrderByComputerNumberAsc(clubId)
                .stream()
                .map(ComputerResponse::from)
                .toList();
        return ApiResponse.ok(computers);
    }

    @Transactional
    public ApiResponse<ComputerResponse> create(Long clubId, ComputerRequest request, Long userId) {
        var club = clubService.find(clubId);
        clubService.checkOwnerOrAdmin(club, userId);
        validate(request);

        if (computerRepository.findByClubIdOrderByComputerNumberAsc(clubId).stream()
                .anyMatch(c -> c.getComputerNumber().equals(request.computerNumber()))) {
            throw new ApiException("Computer #" + request.computerNumber() + " already exists in this club");
        }

        Computer computer = Computer.builder()
                .clubId(clubId)
                .computerNumber(request.computerNumber())
                .name(request.name() == null || request.name().isBlank()
                        ? "PC #" + request.computerNumber() : request.name().trim())
                .cpu(trim(request.cpu()))
                .gpu(trim(request.gpu()))
                .ram(trim(request.ram()))
                .monitor(trim(request.monitor()))
                .games(request.games() == null ? List.of() : request.games().stream().filter(g -> g != null && !g.isBlank()).map(String::trim).toList())
                .pricePerHour(request.pricePerHour())
                .status(request.status() == null ? ComputerStatus.ACTIVE : request.status())
                .vip(Boolean.TRUE.equals(request.vip()))
                .build();

        computer = computerRepository.save(computer);
        clubService.refreshClubAggregates(clubId);
        return ApiResponse.ok("Computer added", ComputerResponse.from(computer));
    }

    @Transactional
    public ApiResponse<ComputerResponse> update(Long id, ComputerRequest request, Long userId) {
        Computer computer = find(id);
        var club = clubService.find(computer.getClubId());
        clubService.checkOwnerOrAdmin(club, userId);
        validate(request);

        computerRepository.findByClubIdOrderByComputerNumberAsc(computer.getClubId()).stream()
                .filter(c -> !c.getId().equals(id) && c.getComputerNumber().equals(request.computerNumber()))
                .findFirst()
                .ifPresent(c -> {
                    throw new ApiException("Computer #" + request.computerNumber() + " already exists in this club");
                });

        computer.setComputerNumber(request.computerNumber());
        if (request.name() != null && !request.name().isBlank()) computer.setName(request.name().trim());
        computer.setCpu(trim(request.cpu()));
        computer.setGpu(trim(request.gpu()));
        computer.setRam(trim(request.ram()));
        computer.setMonitor(trim(request.monitor()));
        if (request.games() != null) {
            computer.setGames(request.games().stream()
                    .filter(g -> g != null && !g.isBlank())
                    .map(String::trim)
                    .toList());
        }
        computer.setPricePerHour(request.pricePerHour());
        if (request.status() != null) computer.setStatus(request.status());
        if (request.vip() != null) computer.setVip(request.vip());

        computer = computerRepository.save(computer);
        clubService.refreshClubAggregates(computer.getClubId());
        return ApiResponse.ok("Computer updated", ComputerResponse.from(computer));
    }

    @Transactional
    public ApiResponse<Void> delete(Long id, Long userId) {
        Computer computer = find(id);
        var club = clubService.find(computer.getClubId());
        clubService.checkOwnerOrAdmin(club, userId);
        Long clubId = computer.getClubId();
        computerRepository.delete(computer);
        clubService.refreshClubAggregates(clubId);
        return ApiResponse.ok("Computer deleted", null);
    }

    public Computer find(Long id) {
        return computerRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Computer not found"));
    }

    private void validate(ComputerRequest request) {
        if (request.computerNumber() == null || request.computerNumber() < 1) {
            throw new ApiException("Computer number is required");
        }
        if (request.pricePerHour() == null || request.pricePerHour().compareTo(BigDecimal.ZERO) <= 0) {
            throw new ApiException("Price per hour must be greater than 0");
        }
    }

    private String trim(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
