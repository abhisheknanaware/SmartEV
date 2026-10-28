package com.smartev.user;

import com.smartev.security.JwtUtils;
import com.smartev.security.UserDetailsServiceImpl;
import com.smartev.user.dto.AuthRequest;
import com.smartev.user.dto.AuthResponse;
import com.smartev.user.dto.RegisterRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
@Tag(name = "Authentication", description = "User registration, login, and token generation")
public class AuthController {

    private final AuthenticationManager authenticationManager;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtils jwtUtils;
    private final UserDetailsServiceImpl userDetailsService;

    @PostMapping("/register")
    @Operation(summary = "Register new user or admin")
    public ResponseEntity<?> register(@Valid @RequestBody RegisterRequest request) {
        if (userRepository.existsByEmail(request.getEmail())) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("message", "Email is already registered"));
        }

        User user = User.builder()
                .name(request.getName())
                .email(request.getEmail().toLowerCase().trim())
                .password(passwordEncoder.encode(request.getPassword()))
                .phone(request.getPhone())
                .role(Role.ROLE_USER) // public sign-up never grants admin; the requested role is ignored
                .build();

        userRepository.save(user);

        UserDetails userDetails = userDetailsService.loadUserByUsername(user.getEmail());
        String token = jwtUtils.generateToken(userDetails, user.getId(), user.getRole().name(), user.getName());

        return ResponseEntity.status(HttpStatus.CREATED).body(
                AuthResponse.builder()
                        .token(token)
                        .id(user.getId())
                        .name(user.getName())
                        .email(user.getEmail())
                        .phone(user.getPhone())
                        .role(user.getRole().name())
                        .build()
        );
    }

    @PostMapping("/login")
    @Operation(summary = "User login with email and password")
    public ResponseEntity<?> login(@Valid @RequestBody AuthRequest request) {
        try {
            authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(request.getEmail().toLowerCase().trim(), request.getPassword())
            );
        } catch (BadCredentialsException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "Invalid email or password"));
        }

        User user = userRepository.findByEmail(request.getEmail().toLowerCase().trim())
                .orElseThrow(() -> new RuntimeException("User not found"));

        UserDetails userDetails = userDetailsService.loadUserByUsername(user.getEmail());
        String token = jwtUtils.generateToken(userDetails, user.getId(), user.getRole().name(), user.getName());

        return ResponseEntity.ok(
                AuthResponse.builder()
                        .token(token)
                        .id(user.getId())
                        .name(user.getName())
                        .email(user.getEmail())
                        .phone(user.getPhone())
                        .role(user.getRole().name())
                        .build()
        );
    }

    @GetMapping("/me")
    @Operation(summary = "Get current authenticated user profile")
    public ResponseEntity<?> getCurrentUser(@RequestHeader(value = "Authorization", required = false) String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("message", "Missing or invalid token"));
        }
        String token = authHeader.substring(7);
        String email = jwtUtils.extractUsername(token);
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));

        return ResponseEntity.ok(
                AuthResponse.builder()
                        .token(token)
                        .id(user.getId())
                        .name(user.getName())
                        .email(user.getEmail())
                        .phone(user.getPhone())
                        .role(user.getRole().name())
                        .build()
        );
    }
}
