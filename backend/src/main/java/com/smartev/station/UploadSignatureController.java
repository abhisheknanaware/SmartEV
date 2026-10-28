package com.smartev.station;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;

/**
 * Station photo uploads for the admin portal (admin-only through the /api/admin/** rule in SecurityConfig).
 * With Cloudinary configured the browser uploads straight to Cloudinary using a signature from here, so the
 * API secret never reaches the browser. Without it, images are stored by this server under /uploads.
 */
@RestController
@RequestMapping("/api/admin/uploads")
public class UploadSignatureController {

    private static final String FOLDER = "smartev_stations";
    private static final long MAX_BYTES = 5L * 1024 * 1024;

    @Value("${cloudinary.cloud-name:}")
    private String cloudName;

    @Value("${cloudinary.api-key:}")
    private String apiKey;

    @Value("${cloudinary.api-secret:}")
    private String apiSecret;

    @Value("${uploads.dir:./data/uploads}")
    private String uploadsDir;

    @PostMapping("/signature")
    public ResponseEntity<Map<String, Object>> sign() throws NoSuchAlgorithmException {
        if (cloudName.isBlank() || apiKey.isBlank() || apiSecret.isBlank()) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("message", "Cloudinary is not configured; upload to this server instead.", "fallback", "local"));
        }
        long timestamp = System.currentTimeMillis() / 1000;
        // Cloudinary signs the alphabetically sorted params followed by the secret.
        String toSign = "folder=" + FOLDER + "&timestamp=" + timestamp + apiSecret;
        byte[] digest = MessageDigest.getInstance("SHA-1").digest(toSign.getBytes(StandardCharsets.UTF_8));
        return ResponseEntity.ok(Map.of(
                "cloudName", cloudName,
                "apiKey", apiKey,
                "folder", FOLDER,
                "timestamp", timestamp,
                "signature", HexFormat.of().formatHex(digest)));
    }

    @PostMapping("/image")
    public ResponseEntity<Map<String, Object>> upload(@RequestParam("file") MultipartFile file) throws IOException {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Choose an image to upload.");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new IllegalArgumentException("Images must be 5 MB or smaller.");
        }
        String ext;
        try (InputStream in = file.getInputStream()) {
            ext = imageExtension(in.readNBytes(12));
        }
        if (ext == null) {
            throw new IllegalArgumentException("Only PNG, JPEG or WebP images are allowed.");
        }

        Path dir = Paths.get(uploadsDir).toAbsolutePath().normalize();
        Files.createDirectories(dir);
        String name = UUID.randomUUID() + "." + ext;
        file.transferTo(dir.resolve(name));

        String url = ServletUriComponentsBuilder.fromCurrentContextPath().path("/uploads/").path(name).toUriString();
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("url", url));
    }

    /** Identifies the file by its leading bytes rather than trusting the name or declared type. */
    private static String imageExtension(byte[] h) {
        if (h.length >= 8 && (h[0] & 0xFF) == 0x89 && h[1] == 'P' && h[2] == 'N' && h[3] == 'G') return "png";
        if (h.length >= 3 && (h[0] & 0xFF) == 0xFF && (h[1] & 0xFF) == 0xD8 && (h[2] & 0xFF) == 0xFF) return "jpg";
        if (h.length >= 12 && h[0] == 'R' && h[1] == 'I' && h[2] == 'F' && h[3] == 'F'
                && h[8] == 'W' && h[9] == 'E' && h[10] == 'B' && h[11] == 'P') return "webp";
        return null;
    }
}
