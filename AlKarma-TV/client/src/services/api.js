import axios from 'axios';
import { toast } from 'react-toastify';

// Create axios instance with base URL
const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add response interceptor for global error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle errors globally
    const errorMessage = error.response?.data?.error || 'An error occurred. Please try again.';
    toast.error(errorMessage);
    return Promise.reject(error);
  }
);

// Dashboard API
export const dashboardAPI = {
  getDashboardData: () => api.get('/dashboard'),
  getRecentActions: (limit = 20) => api.get(`/dashboard/actions?limit=${limit}`),
  getExpiringDevices: (days = 7) => api.get(`/dashboard/expiring-devices?days=${days}`),
  clearActionHistory: () => api.delete('/dashboard/actions'),
};

// Devices API
export const devicesAPI = {
  getAllDevices: (filters = {}) => {
    let queryParams = new URLSearchParams();
    if (filters.status) queryParams.append('status', filters.status);
    if (filters.expiring) queryParams.append('expiring', filters.expiring);
    
    return api.get(`/devices?${queryParams.toString()}`);
  },
  getDeviceById: (id) => api.get(`/devices/${id}`),
  createDevice: (deviceData) => api.post('/devices', deviceData),
  updateDevice: (id, deviceData) => api.put(`/devices/${id}`, deviceData),
  deleteDevice: (id) => api.delete(`/devices/${id}`),
};

// Channels API
export const channelsAPI = {
  getAllChannels: (filters = {}) => {
    let queryParams = new URLSearchParams();
    if (filters.type) queryParams.append('type', filters.type);
    if (filters.category) queryParams.append('category', filters.category);
    if (filters.has_news !== undefined) queryParams.append('has_news', filters.has_news);
    
    return api.get(`/channels?${queryParams.toString()}`);
  },
  getChannelById: (id) => api.get(`/channels/${id}`),
  createChannel: (channelData) => api.post('/channels', channelData),
  updateChannel: (id, channelData) => api.put(`/channels/${id}`, channelData),
  deleteChannel: (id) => api.delete(`/channels/${id}`),
  uploadLogo: (id, logoFile) => {
    const formData = new FormData();
    formData.append('logo', logoFile);
    
    return api.post(`/channels/${id}/logo`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
};

// News API
export const newsAPI = {
  getAllNews: (search = '') => {
    let queryParams = new URLSearchParams();
    if (search) queryParams.append('search', search);
    
    return api.get(`/news?${queryParams.toString()}`);
  },
  getNewsById: (id) => api.get(`/news/${id}`),
  createNews: (newsData) => api.post('/news', newsData),
  updateNews: (id, newsData) => api.put(`/news/${id}`, newsData),
  deleteNews: (id) => api.delete(`/news/${id}`),
};

export default api;
