package com.smartev;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class SmartEvApplication {

    public static void main(String[] args) {
        SpringApplication.run(SmartEvApplication.class, args);
    }
}
