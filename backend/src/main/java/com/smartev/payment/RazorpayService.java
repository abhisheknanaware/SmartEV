package com.smartev.payment;

import com.razorpay.Order;
import com.razorpay.RazorpayClient;
import com.razorpay.Utils;
import lombok.extern.slf4j.Slf4j;
import org.json.JSONObject;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

@Service
@Slf4j
public class RazorpayService {

    @Value("${razorpay.key.id:}")
    private String keyId;

    @Value("${razorpay.key.secret:}")
    private String keySecret;

    @Value("${razorpay.simulation:false}")
    private boolean simulation;

    public boolean isSimulation() {
        return simulation;
    }

    public String getKeyId() {
        return keyId;
    }

    public String createOrder(Double amountInRupees, String receipt) {
        try {
            RazorpayClient razorpay = new RazorpayClient(keyId, keySecret);
            JSONObject orderRequest = new JSONObject();
            orderRequest.put("amount", Math.round(amountInRupees * 100)); // amount in the smallest currency sub-unit (paise)
            orderRequest.put("currency", "INR");
            orderRequest.put("receipt", receipt);
            orderRequest.put("payment_capture", 1);

            Order order = razorpay.orders.create(orderRequest);
            return order.get("id");
        } catch (Exception e) {
            if (!simulation) {
                throw new IllegalStateException("Payment gateway unavailable. Please try again.", e);
            }
            log.warn("Razorpay order creation failed ({}); simulation mode, issuing a test order ID.", e.getMessage());
            return "order_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        }
    }

    public boolean verifySignature(String orderId, String paymentId, String signature) {
        if (signature == null || signature.isEmpty()) {
            return false;
        }
        if (simulation && signature.startsWith("sig_test_")) {
            return true;
        }

        try {
            String payload = orderId + "|" + paymentId;
            Mac sha256_HMAC = Mac.getInstance("HmacSHA256");
            SecretKeySpec secret_key = new SecretKeySpec(keySecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            sha256_HMAC.init(secret_key);
            byte[] hash = sha256_HMAC.doFinal(payload.getBytes(StandardCharsets.UTF_8));
            
            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) hexString.append('0');
                hexString.append(hex);
            }
            return hexString.toString().equalsIgnoreCase(signature);
        } catch (Exception e) {
            log.error("Signature verification error: {}", e.getMessage());
            return false;
        }
    }
}
