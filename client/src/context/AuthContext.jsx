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
          // Only clear session on genuine auth failure (expired/invalid token)
          // Don't log out on network errors (server restarting, no internet, etc.)
          const isAuthError = err.message?.includes('401') ||
                              err.message?.includes('Unauthorized') ||
                              err.message?.includes('Invalid token') ||
                              err.message?.includes('jwt expired') ||
                              err.message?.includes('token');
          if (isAuthError) {
            console.warn('[Auth] Token invalid/expired — logging out');
            logout();
          } else {
            // Network/server error — keep token, try again later
            console.warn('[Auth] Could not verify session (network error), staying logged in:', err.message);
            // Decode the token locally to get basic user info while offline
            try {
              const payload = JSON.parse(atob(token.split('.')[1]));
              // Check if token is expired
              if (payload.exp && payload.exp * 1000 < Date.now()) {
                console.warn('[Auth] Token expired — logging out');
                logout();
              } else {
                // Token still valid locally, set minimal user data
                setUser({ id: payload.id, username: payload.username });
              }
            } catch {
              logout();
            }
          }
        }
      }
      setLoading(false);
    };
    initAuth();
  }, []);

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
