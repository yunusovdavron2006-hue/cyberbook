package com.cyberbook.controller;

import com.cyberbook.dto.AuthDtos.LoginRequest;
import com.cyberbook.dto.AuthDtos.RegisterRequest;
import com.cyberbook.dto.CommonDtos.ApiResponse;
import com.cyberbook.dto.UserDtos.UserResponse;
import com.cyberbook.security.CurrentUserService;
import com.cyberbook.service.AuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final CurrentUserService currentUserService;

    @PostMapping("/register")
    public ApiResponse<AuthService.AuthResponse> register(@Valid @RequestBody RegisterRequest request) {
        return authService.register(request);
    }

    @PostMapping("/login")
    public ApiResponse<AuthService.AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        return authService.login(request);
    }

    @GetMapping("/me")
    public ApiResponse<UserResponse> me() {
        return authService.me(currentUserService.currentUserId());
    }
}
