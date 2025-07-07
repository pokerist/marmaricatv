import React from 'react';
import { Outlet } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import { AuthProvider } from '../../contexts/AuthContext';

/**
 * Root layout component that provides auth context to the app
 */
const RootLayout = () => {
  return (
    <AuthProvider>
      <ToastContainer position="top-right" autoClose={3000} />
      <Outlet />
    </AuthProvider>
  );
};

export default RootLayout;
