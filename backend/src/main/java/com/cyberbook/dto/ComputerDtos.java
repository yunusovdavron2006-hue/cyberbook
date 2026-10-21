package com.cyberbook.dto;

import com.cyberbook.entity.Computer;
import com.cyberbook.entity.ComputerStatus;

import java.math.BigDecimal;
import java.util.List;

public class ComputerDtos {

    public record ComputerRequest(
            Integer computerNumber,
            String name,
            String cpu,
            String gpu,
            String ram,
            String monitor,
            List<String> games,
            BigDecimal pricePerHour,
            ComputerStatus status,
            Boolean vip
    ) {
    }

    public record ComputerResponse(
            Long id,
            Long clubId,
            Integer computerNumber,
            String name,
            String cpu,
            String gpu,
            String ram,
            String monitor,
            List<String> games,
            BigDecimal pricePerHour,
            ComputerStatus status,
            Boolean vip
    ) {

        public static ComputerResponse from(Computer computer) {
            return new ComputerResponse(computer.getId(), computer.getClubId(), computer.getComputerNumber(),
                    computer.getName(), computer.getCpu(), computer.getGpu(), computer.getRam(),
                    computer.getMonitor(), computer.getGames(), computer.getPricePerHour(),
                    computer.getStatus(), computer.getVip());
        }
    }
}
