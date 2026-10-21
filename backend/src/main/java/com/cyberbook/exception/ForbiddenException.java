package com.cyberbook.exception;

public class ForbiddenException extends ApiException {

    public ForbiddenException(String message) {
        super(403, message);
    }
}
