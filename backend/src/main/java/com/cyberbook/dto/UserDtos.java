package com.cyberbook.dto;

import com.cyberbook.entity.Role;
import com.cyberbook.entity.User;

import java.time.LocalDateTime;

public class UserDtos {

    public record UserResponse(Long id, String fullName, String email, String phone,
                               Role role, String avatarUrl, LocalDateTime createdAt) {

        public static UserResponse from(User user) {
            return new UserResponse(user.getId(), user.getFullName(), user.getEmail(), user.getPhone(),
                    user.getRole(), user.getAvatarUrl(), user.getCreatedAt());
        }
    }

    public record UpdateProfileRequest(String fullName, String phone, String avatarUrl) {
    }

    public record ChangePasswordRequest(String currentPassword, String newPassword) {
    }
}
