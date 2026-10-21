package com.cyberbook.service;

import com.cyberbook.dto.AuthDtos.LoginRequest;
import com.cyberbook.dto.AuthDtos.RegisterRequest;
import com.cyberbook.dto.CommonDtos.ApiResponse;
import com.cyberbook.dto.UserDtos.UserResponse;
import com.cyberbook.entity.Role;
import com.cyberbook.entity.User;
import com.cyberbook.exception.ApiException;
import com.cyberbook.exception.ConflictException;
import com.cyberbook.repository.UserRepository;
import com.cyberbook.security.JwtService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final AuthenticationManager authenticationManager;

    @Transactional
    public ApiResponse<AuthResponse> register(RegisterRequest request) {
        String email = request.email().trim().toLowerCase();

        if (userRepository.existsByEmail(email)) {
            throw new ConflictException("An account with this email already exists");
        }

        Role role = resolveRole(request.role());

        User user = User.builder()
                .fullName(request.fullName().trim())
                .email(email)
                .phone(request.phone() == null ? null : request.phone().trim())
                .password(passwordEncoder.encode(request.password()))
                .role(role)
                .build();

        user = userRepository.save(user);

        String token = jwtService.generateToken(user.getId(), user.getEmail(), user.getRole().name());
        return ApiResponse.ok("Registration successful", new AuthResponse(token, UserResponse.from(user)));
    }

    @Transactional(readOnly = true)
    public ApiResponse<AuthResponse> login(LoginRequest request) {
        String email = request.email().trim().toLowerCase();

        authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(email, request.password()));

        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new ApiException(401, "Email or password is incorrect"));

        String token = jwtService.generateToken(user.getId(), user.getEmail(), user.getRole().name());
        return ApiResponse.ok("Login successful", new AuthResponse(token, UserResponse.from(user)));
    }

    @Transactional(readOnly = true)
    public ApiResponse<UserResponse> me(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ApiException(401, "Authentication required"));
        return ApiResponse.ok(UserResponse.from(user));
    }

    private Role resolveRole(String requested) {
        if (requested == null || requested.isBlank()) {
            return Role.USER;
        }
        try {
            Role role = Role.valueOf(requested.trim().toUpperCase());
            return role == Role.ADMIN ? Role.USER : role;
        } catch (IllegalArgumentException e) {
            return Role.USER;
        }
    }

    public record AuthResponse(String token, UserResponse user) {
    }
}
