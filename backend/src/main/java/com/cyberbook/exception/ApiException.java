package com.cyberbook.exception;

public class ApiException extends RuntimeException {

    private final int status;

    public ApiException(String message) {
        this(400, message);
    }

    public ApiException(int status, String message) {
        super(message);
        this.status = status;
    }

    public int getStatus() {
        return status;
    }
}
