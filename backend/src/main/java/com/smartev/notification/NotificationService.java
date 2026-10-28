package com.smartev.notification;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class NotificationService {

    private final NotificationRepository notificationRepository;

    public List<Notification> getUserNotifications(Long userId) {
        return notificationRepository.findByUserIdOrderByCreatedAtDesc(userId);
    }

    public long getUnreadCount(Long userId) {
        return notificationRepository.countByUserIdAndIsReadFalse(userId);
    }

    public void markAllRead(Long userId) {
        List<Notification> notifs = notificationRepository.findByUserIdOrderByCreatedAtDesc(userId);
        for (Notification n : notifs) {
            n.setIsRead(true);
        }
        notificationRepository.saveAll(notifs);
    }
}
