import React, { createContext, useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [admin, setAdmin] = useState(null);
  const navigate = useNavigate();

  // Check auth status on mount
  useEffect(() => {
    checkAuth();
  }, []);

  // Check current session
  const checkAuth = async () => {
    try {
      const response = await api.get('/auth/session');
      setIsAuthenticated(response.data.isAuthenticated);
      setAdmin(response.data.admin);
    } catch (error) {
      console.error('Error checking auth status:', error);
      setIsAuthenticated(false);
      setAdmin(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Login
  const login = async (username, password) => {
    try {
      const response = await api.post('/auth/login', { username, password });
      setIsAuthenticated(true);
      setAdmin(response.data.admin);
      navigate('/');
      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        error: error.response?.data?.message || 'Login failed'
      };
    }
  };

  // Logout
  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setIsAuthenticated(false);
      setAdmin(null);
      navigate('/login');
    }
  };

  // Context value
  const value = {
    isAuthenticated,
    isLoading,
    admin,
    login,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook for using auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
