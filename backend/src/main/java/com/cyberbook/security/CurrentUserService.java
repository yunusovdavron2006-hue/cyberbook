package com.cyberbook.security;

import com.cyberbook.entity.User;
import com.cyberbook.exception.ApiException;
import com.cyberbook.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class CurrentUserService {

    private final UserRepository userRepository;

    public Long currentUserId() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()
                || authentication.getPrincipal() == null
                || "anonymousUser".equals(authentication.getPrincipal())) {
            throw new ApiException(401, "Authentication required");
        }
        try {
            return Long.valueOf(authentication.getName());
        } catch (NumberFormatException e) {
            throw new ApiException(401, "Authentication required");
        }
    }

    public User requireUser() {
        return userRepository.findById(currentUserId())
                .orElseThrow(() -> new ApiException(401, "Authentication required"));
    }
}
