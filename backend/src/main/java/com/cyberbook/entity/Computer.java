package com.cyberbook.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "computers")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Computer {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "club_id", nullable = false)
    private Long clubId;

    @Column(name = "computer_number", nullable = false)
    private Integer computerNumber;

    @Column(length = 120)
    private String name;

    @Column(length = 80)
    private String cpu;

    @Column(length = 80)
    private String gpu;

    @Column(length = 60)
    private String ram;

    @Column(length = 80)
    private String monitor;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "computer_games", joinColumns = @JoinColumn(name = "computer_id"))
    @Column(name = "game", length = 80)
    @Builder.Default
    private List<String> games = new ArrayList<>();

    @Column(name = "price_per_hour", nullable = false, precision = 12, scale = 2)
    private BigDecimal pricePerHour;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private ComputerStatus status = ComputerStatus.ACTIVE;

    @Column(name = "is_vip", nullable = false)
    @Builder.Default
    private Boolean vip = false;
}
