package com.cyberbook.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "clubs")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Club {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 140)
    private String name;

    @Column(length = 2000)
    private String description;

    @Column(nullable = false, length = 255)
    private String address;

    @Column(nullable = false)
    private Double latitude;

    @Column(nullable = false)
    private Double longitude;

    @Column(length = 40)
    private String phone;

    @Column(name = "opening_time")
    private java.time.LocalTime openingTime;

    @Column(name = "closing_time")
    private java.time.LocalTime closingTime;

    @Column(precision = 4, scale = 2)
    private BigDecimal rating;

    @Column(name = "image_url")
    private String imageUrl;

    @Column(name = "min_price_per_hour", precision = 12, scale = 2)
    private BigDecimal minPricePerHour;

    @Column(name = "total_computers")
    private Integer totalComputers;

    @Column(nullable = false)
    @Builder.Default
    private Boolean vip = false;

    @Column(nullable = false)
    @Builder.Default
    private Boolean active = true;

    @Column(name = "owner_id", nullable = false)
    private Long ownerId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
        if (rating == null) {
            rating = BigDecimal.valueOf(0);
        }
        if (vip == null) vip = false;
        if (active == null) active = true;
        if (totalComputers == null) totalComputers = 0;
        if (minPricePerHour == null) minPricePerHour = BigDecimal.ZERO;
    }
}
