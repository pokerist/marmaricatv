import React, { createContext, useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { toast } from 'react-toastify';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [admin, setAdmin] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Check authentication status on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const response = await api.get('/auth/check', { withCredentials: true });
      if (response.data.authenticated) {
        setAdmin(response.data.admin);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const login = async (username, password) => {
    try {
      const response = await api.post('/auth/login', { username, password }, { withCredentials: true });
      setAdmin(response.data.admin);
      toast.success('Login successful');
      navigate('/');
      return true;
    } catch (error) {
      console.error('Login failed:', error);
      toast.error(error.response?.data?.error || 'Login failed');
      return false;
    }
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout', {}, { withCredentials: true });
      setAdmin(null);
      toast.success('Logged out successfully');
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
      toast.error('Logout failed');
    }
  };

  const changePassword = async (currentPassword, newPassword) => {
    try {
      await api.post('/auth/change-password', 
        { currentPassword, newPassword },
        { withCredentials: true }
      );
      toast.success('Password changed successfully');
      return true;
    } catch (error) {
      console.error('Password change failed:', error);
      toast.error(error.response?.data?.error || 'Failed to change password');
      return false;
    }
  };

  const value = {
    admin,
    loading,
    login,
    logout,
    changePassword,
    isAuthenticated: !!admin
  };

  if (loading) {
    // You could return a loading spinner here
    return <div>Loading...</div>;
  }

  return (
    <AuthContext.Provider value={value}>
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

export default AuthContext;
