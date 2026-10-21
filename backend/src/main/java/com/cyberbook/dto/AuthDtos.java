package com.cyberbook.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public class AuthDtos {

    public record RegisterRequest(
            @NotBlank(message = "Full name is required")
            @Size(min = 2, max = 120, message = "Full name must be 2-120 characters")
            String fullName,

            @NotBlank(message = "Email is required")
            @Email(message = "Email must be valid")
            String email,

            @Pattern(regexp = "^\\+?[0-9\\-\\s]{7,20}$", message = "Phone number is not valid")
            String phone,

            @NotBlank(message = "Password is required")
            @Size(min = 6, max = 72, message = "Password must be at least 6 characters")
            String password,

            String role
    ) {
    }

    public record LoginRequest(
            @NotBlank(message = "Email is required") String email,
            @NotBlank(message = "Password is required") String password
    ) {
    }
}
