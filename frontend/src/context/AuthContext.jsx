import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('smartev_token');
      const savedUser = localStorage.getItem('smartev_user');
      if (token && savedUser) {
        try {
          setUser(JSON.parse(savedUser));
        } catch (e) {
          localStorage.removeItem('smartev_token');
          localStorage.removeItem('smartev_user');
        }
      }
      setLoading(false);
    };
    initAuth();
  }, []);

  const login = async (email, password) => {
    const res = await authApi.login(email, password);
    const data = res.data;
    localStorage.setItem('smartev_token', data.token);
    const userData = {
      id: data.id,
      name: data.name,
      email: data.email,
      phone: data.phone,
      role: data.role,
    };
    localStorage.setItem('smartev_user', JSON.stringify(userData));
    setUser(userData);
    return userData;
  };

  const register = async (name, email, password, phone, role) => {
    const res = await authApi.register({ name, email, password, phone, role });
    const data = res.data;
    localStorage.setItem('smartev_token', data.token);
    const userData = {
      id: data.id,
      name: data.name,
      email: data.email,
      phone: data.phone,
      role: data.role,
    };
    localStorage.setItem('smartev_user', JSON.stringify(userData));
    setUser(userData);
    return userData;
  };

  const logout = () => {
    localStorage.removeItem('smartev_token');
    localStorage.removeItem('smartev_user');
    setUser(null);
  };

  const isAdmin = user?.role === 'ROLE_ADMIN' || user?.role === 'ADMIN';

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
