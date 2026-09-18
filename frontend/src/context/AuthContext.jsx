import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi, userApi } from '../api/client';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem('token') || null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const verifyToken = async () => {
      const storedToken = localStorage.getItem('token');
      if (storedToken) {
        try {
          const res = await authApi.getMe();
          setUser(res.data.user);
          localStorage.setItem('user', JSON.stringify(res.data.user));
        } catch (err) {
          console.warn('Session verification failed, logging out:', err.message);
          logout();
        }
      }
      setLoading(false);
    };

    verifyToken();
  }, []);

  const login = async (email, password) => {
    const res = await authApi.login({ email, password });
    const { user: userData, token: tokenData } = res.data;
    setUser(userData);
    setToken(tokenData);
    localStorage.setItem('token', tokenData);
    localStorage.setItem('user', JSON.stringify(userData));
    setTimeout(() => window.dispatchEvent(new Event('wallet_updated')), 50);
    return userData;
  };

  const register = async (email, password, role = 'bidder', name = '') => {
    const res = await authApi.register({ email, password, role, name });
    const { user: userData, token: tokenData } = res.data;
    setUser(userData);
    setToken(tokenData);
    localStorage.setItem('token', tokenData);
    localStorage.setItem('user', JSON.stringify(userData));
    setTimeout(() => window.dispatchEvent(new Event('wallet_updated')), 50);
    return userData;
  };

  const updateName = async (newName) => {
    const res = await authApi.updateProfile({ name: newName });
    const { user: userData, token: tokenData } = res.data;
    setUser(userData);
    if (tokenData) {
      setToken(tokenData);
      localStorage.setItem('token', tokenData);
    }
    localStorage.setItem('user', JSON.stringify(userData));
    return userData;
  };

  const upgradeToSeller = async () => {
    const res = await userApi.upgradeToSeller();
    const updatedUser = res.data.user;
    setUser(updatedUser);
    localStorage.setItem('user', JSON.stringify(updatedUser));
    return updatedUser;
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.dispatchEvent(new Event('wallet_updated'));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token,
        loading,
        login,
        register,
        updateName,
        upgradeToSeller,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
