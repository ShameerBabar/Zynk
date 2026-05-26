import React, { createContext, useContext, useState, useEffect } from 'react';
import { get, post } from '../utils/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('zynk_token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      if (token) {
        try {
          const userData = await get('/auth/me');
          setUser(userData.user);
        } catch (err) {
          console.error('Failed to restore session:', err);
          logout();
        }
      }
      setLoading(false);
    };
    initAuth();
  }, [token]);

  const login = async (identifier, password) => {
    const data = await post('/auth/login', { identifier, password });
    localStorage.setItem('zynk_token', data.token);
    setToken(data.token);
    setUser(data.user);
    return data;
  };

  const loginWithGoogle = async (idToken) => {
    const data = await post('/auth/google', { idToken });
    localStorage.setItem('zynk_token', data.token);
    setToken(data.token);
    setUser(data.user);
    return data;
  };

  const register = async (userData) => {
    const data = await post('/auth/register', userData);
    localStorage.setItem('zynk_token', data.token);
    setToken(data.token);
    setUser(data.user);
    return data;
  };

  const logout = () => {
    localStorage.removeItem('zynk_token');
    setToken(null);
    setUser(null);
  };

  const updateProfile = (newData) => {
    setUser({ ...user, ...newData });
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, loginWithGoogle, register, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
