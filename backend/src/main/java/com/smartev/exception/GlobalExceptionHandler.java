package com.smartev.exception;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<Map<String, Object>> handleNotFound(ResourceNotFoundException ex) {
        Map<String, Object> err = new HashMap<>();
        err.put("timestamp", LocalDateTime.now());
        err.put("status", HttpStatus.NOT_FOUND.value());
        err.put("error", "Not Found");
        err.put("message", ex.getMessage());
        return new ResponseEntity<>(err, HttpStatus.NOT_FOUND);
    }

    @ExceptionHandler(SlotConflictException.class)
    public ResponseEntity<Map<String, Object>> handleConflict(SlotConflictException ex) {
        Map<String, Object> err = new HashMap<>();
        err.put("timestamp", LocalDateTime.now());
        err.put("status", HttpStatus.CONFLICT.value());
        err.put("error", "Conflict");
        err.put("message", ex.getMessage());
        return new ResponseEntity<>(err, HttpStatus.CONFLICT);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException ex) {
        Map<String, String> fieldErrors = new HashMap<>();
        for (FieldError fieldError : ex.getBindingResult().getFieldErrors()) {
            fieldErrors.put(fieldError.getField(), fieldError.getDefaultMessage());
        }
        Map<String, Object> err = new HashMap<>();
        err.put("timestamp", LocalDateTime.now());
        err.put("status", HttpStatus.BAD_REQUEST.value());
        err.put("error", "Validation Failed");
        err.put("details", fieldErrors);
        return new ResponseEntity<>(err, HttpStatus.BAD_REQUEST);
    }

    @ExceptionHandler(org.springframework.security.authentication.BadCredentialsException.class)
    public ResponseEntity<Map<String, Object>> handleBadCredentials(org.springframework.security.authentication.BadCredentialsException ex) {
        Map<String, Object> err = new HashMap<>();
        err.put("timestamp", LocalDateTime.now());
        err.put("status", HttpStatus.UNAUTHORIZED.value());
        err.put("error", "Unauthorized");
        err.put("message", "Invalid email or password credentials");
        return new ResponseEntity<>(err, HttpStatus.UNAUTHORIZED);
    }

    @ExceptionHandler(org.springframework.security.authentication.AuthenticationCredentialsNotFoundException.class)
    public ResponseEntity<Map<String, Object>> handleNotLoggedIn(Exception ex) {
        Map<String, Object> err = new HashMap<>();
        err.put("timestamp", LocalDateTime.now());
        err.put("status", HttpStatus.UNAUTHORIZED.value());
        err.put("error", "Unauthorized");
        err.put("message", ex.getMessage());
        return new ResponseEntity<>(err, HttpStatus.UNAUTHORIZED);
    }

    @ExceptionHandler(org.springframework.security.access.AccessDeniedException.class)
    public ResponseEntity<Map<String, Object>> handleAccessDenied(org.springframework.security.access.AccessDeniedException ex) {
        Map<String, Object> err = new HashMap<>();
        err.put("timestamp", LocalDateTime.now());
        err.put("status", HttpStatus.FORBIDDEN.value());
        err.put("error", "Forbidden");
        err.put("message", ex.getMessage() != null ? ex.getMessage() : "Access is denied for this resource");
        return new ResponseEntity<>(err, HttpStatus.FORBIDDEN);
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> handleIllegalArgument(IllegalArgumentException ex) {
        Map<String, Object> err = new HashMap<>();
        err.put("timestamp", LocalDateTime.now());
        err.put("status", HttpStatus.BAD_REQUEST.value());
        err.put("error", "Bad Request");
        err.put("message", ex.getMessage());
        return new ResponseEntity<>(err, HttpStatus.BAD_REQUEST);
    }

    @ExceptionHandler(org.springframework.web.multipart.MaxUploadSizeExceededException.class)
    public ResponseEntity<Map<String, Object>> handleTooLarge(org.springframework.web.multipart.MaxUploadSizeExceededException ex) {
        Map<String, Object> err = new HashMap<>();
        err.put("timestamp", LocalDateTime.now());
        err.put("status", HttpStatus.PAYLOAD_TOO_LARGE.value());
        err.put("error", "Payload Too Large");
        err.put("message", "Images must be 5 MB or smaller.");
        return new ResponseEntity<>(err, HttpStatus.PAYLOAD_TOO_LARGE);
    }

    @ExceptionHandler(org.springframework.web.server.ResponseStatusException.class)
    public ResponseEntity<Map<String, Object>> handleStatus(org.springframework.web.server.ResponseStatusException ex) {
        Map<String, Object> err = new HashMap<>();
        err.put("timestamp", LocalDateTime.now());
        err.put("status", ex.getStatusCode().value());
        err.put("error", ex.getStatusCode().toString());
        err.put("message", ex.getReason());
        return new ResponseEntity<>(err, ex.getStatusCode());
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleGeneral(Exception ex) {
        Map<String, Object> err = new HashMap<>();
        err.put("timestamp", LocalDateTime.now());
        err.put("status", HttpStatus.INTERNAL_SERVER_ERROR.value());
        err.put("error", "Internal Server Error");
        err.put("message", ex.getMessage());
        return new ResponseEntity<>(err, HttpStatus.INTERNAL_SERVER_ERROR);
    }
}
