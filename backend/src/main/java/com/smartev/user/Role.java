package com.smartev.user;

import com.fasterxml.jackson.annotation.JsonCreator;

public enum Role {
    ROLE_USER,
    ROLE_ADMIN;

    @JsonCreator
    public static Role fromString(String val) {
        if (val == null) return ROLE_USER;
        String upper = val.trim().toUpperCase();
        if (upper.contains("ADMIN") || upper.contains("OPERATOR")) return ROLE_ADMIN;
        return ROLE_USER;
    }
}
