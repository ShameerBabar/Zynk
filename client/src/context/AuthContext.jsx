import React, { createContext, useContext, useState, useEffect } from 'react';
import { get, post } from '../utils/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const cached = localStorage.getItem('zynk_user') || sessionStorage.getItem('zynk_user');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  // Token can be in localStorage (remember me) or sessionStorage (session only)
  const [token, setToken] = useState(
    localStorage.getItem('zynk_token') || sessionStorage.getItem('zynk_token')
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      if (token) {
        try {
          const userData = await get('/auth/me');
          setUser(userData.user);
          localStorage.setItem('zynk_user', JSON.stringify(userData.user));
        } catch (err) {
          // Only clear session on genuine auth failure (expired/invalid token)
          // Don't log out on network errors (server restarting, no internet, etc.)
          const isAuthError = err.message?.includes('401') ||
                              err.message?.includes('404') ||
                              err.message?.toLowerCase().includes('not found') ||
                              err.message?.includes('Unauthorized') ||
                              err.message?.includes('Invalid token') ||
                              err.message?.includes('jwt expired') ||
                              err.message?.includes('token');
          if (isAuthError) {
            console.warn('[Auth] Token invalid/expired or user not found — logging out');
            logout();
          } else {
            // Network/server error — keep token, try again later
            console.warn('[Auth] Could not verify session (network error), staying logged in:', err.message);
            // If we don't have a cached user, try to decode token locally as a last resort
            if (!localStorage.getItem('zynk_user')) {
              try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                if (payload.exp && payload.exp * 1000 < Date.now()) {
                  console.warn('[Auth] Token expired — logging out');
                  logout();
                } else {
                  const fallbackUser = { id: payload.id, username: payload.username };
                  setUser(fallbackUser);
                  localStorage.setItem('zynk_user', JSON.stringify(fallbackUser));
                }
              } catch {
                logout();
              }
            }
          }
        }
      } else {
        setUser(null);
        localStorage.removeItem('zynk_user');
      }
      setLoading(false);
    };
    initAuth();
  }, [token]);

  const login = async (identifier, password, rememberMe = false) => {
    const data = await post('/auth/login', { identifier, password });
    // rememberMe=true  → localStorage  (survives browser close)
    // rememberMe=false → sessionStorage (cleared when tab/browser closes)
    const store = rememberMe ? localStorage : sessionStorage;
    store.setItem('zynk_token', data.token);
    store.setItem('zynk_user', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    return data;
  };

  const loginWithGoogle = async (idToken) => {
    const data = await post('/auth/google', { idToken });
    localStorage.setItem('zynk_token', data.token);
    localStorage.setItem('zynk_user', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    return data;
  };

  const register = async (userData) => {
    const data = await post('/auth/register', userData);
    localStorage.setItem('zynk_token', data.token);
    localStorage.setItem('zynk_user', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    return data;
  };

  const logout = () => {
    localStorage.removeItem('zynk_token');
    localStorage.removeItem('zynk_user');
    sessionStorage.removeItem('zynk_token');
    sessionStorage.removeItem('zynk_user');
    setToken(null);
    setUser(null);
  };

  const updateProfile = (newData) => {
    setUser(prev => {
      const updated = { ...prev, ...newData };
      localStorage.setItem('zynk_user', JSON.stringify(updated));
      return updated;
    });
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, loginWithGoogle, register, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
