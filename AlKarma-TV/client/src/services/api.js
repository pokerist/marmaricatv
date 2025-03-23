import axios from 'axios';
import { toast } from 'react-toastify';

// Create axios instance with base URL
const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
  headers: {
    'Content-Type': 'application/json',
  },
  // Default timeout for all requests
  timeout: 8000, // 8 seconds
});

// Track active requests to prevent duplicate error messages
const activeRequests = new Set();

// Add request interceptor for request handling
api.interceptors.request.use(
  (config) => {
    // Generate a unique ID for this request
    const requestId = `${config.method}-${config.url}-${Date.now()}`;
    config.requestId = requestId;
    activeRequests.add(requestId);
    
    console.log(`Starting request to ${config.url}`);
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor for global error handling
api.interceptors.response.use(
  (response) => {
    // Remove request from tracking
    if (response.config.requestId) {
      activeRequests.delete(response.config.requestId);
    }
    
    console.log(`Successfully completed request to ${response.config.url}`);
    return response;
  },
  (error) => {
    // Clean up request tracking
    if (error.config?.requestId) {
      activeRequests.delete(error.config.requestId);
    }
    
    // Prevent showing multiple errors for the same request type in quick succession
    const errorKey = `${error.config?.method || 'unknown'}-${error.config?.url || 'unknown'}-error`;
    const showErrorToast = (msg) => {
      toast.error(msg, {
        toastId: errorKey, // This ensures only one toast with this ID is shown at a time
        autoClose: 3000 
      });
    };
    
    // Handle errors based on their type
    if (error.code === 'ECONNABORTED' || error.message === 'Network Error') {
      showErrorToast('Connection to server failed. Please try again in a few moments.');
    } else if (error.code === 'ERR_NETWORK') {
      showErrorToast('Network connection error. Server might be restarting or unavailable.');
    } else if (error.code === 'ERR_BAD_RESPONSE') {
      showErrorToast('The server sent an invalid response. Please try again.');
    } else if (!error.response) {
      showErrorToast('Unable to reach the server. Please check your connection.');
    } else {
      const errorMessage = error.response?.data?.error || 'An unexpected error occurred. Please try again.';
      showErrorToast(errorMessage);
    }
    
    // Log the error for debugging (with cleaner data)
    console.error('API Error:', {
      url: error.config?.url,
      method: error.config?.method,
      status: error.response?.status,
      message: error.message,
      code: error.code
    });
    
    return Promise.reject(error);
  }
);

// Retry logic for failed requests
const retryRequest = async (request, maxRetries = 2) => {
  let retries = 0;
  
  const execute = async () => {
    try {
      return await request();
    } catch (err) {
      if (retries < maxRetries && 
          (err.code === 'ECONNABORTED' || 
           err.code === 'ERR_NETWORK' || 
           err.message === 'Network Error')) {
        retries++;
        console.log(`Retry attempt ${retries} for failed request`);
        // Exponential backoff: 1s, 2s, 4s, etc.
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries - 1) * 1000));
        return execute();
      }
      throw err;
    }
  };
  
  return execute();
};

// Dashboard API
export const dashboardAPI = {
  getDashboardData: () => retryRequest(() => api.get('/dashboard')),
  getRecentActions: (limit = 20) => retryRequest(() => api.get(`/dashboard/actions?limit=${limit}`)),
  getExpiringDevices: (days = 7) => retryRequest(() => api.get(`/dashboard/expiring-devices?days=${days}`)),
  clearActionHistory: () => retryRequest(() => api.delete('/dashboard/actions')),
};

// Devices API
export const devicesAPI = {
  getAllDevices: (filters = {}) => {
    let queryParams = new URLSearchParams();
    if (filters.status) queryParams.append('status', filters.status);
    if (filters.expiring) queryParams.append('expiring', filters.expiring);
    
    return retryRequest(() => api.get(`/devices?${queryParams.toString()}`));
  },
  getDeviceById: (id) => retryRequest(() => api.get(`/devices/${id}`)),
  createDevice: (deviceData) => retryRequest(() => api.post('/devices', deviceData)),
  updateDevice: (id, deviceData) => retryRequest(() => api.put(`/devices/${id}`, deviceData)),
  deleteDevice: (id) => retryRequest(() => api.delete(`/devices/${id}`)),
};

// Channels API
export const channelsAPI = {
  getAllChannels: (filters = {}) => {
    let queryParams = new URLSearchParams();
    if (filters.type) queryParams.append('type', filters.type);
    if (filters.category) queryParams.append('category', filters.category);
    if (filters.has_news !== undefined) queryParams.append('has_news', filters.has_news);
    
    return retryRequest(() => api.get(`/channels?${queryParams.toString()}`));
  },
  getChannelById: (id) => retryRequest(() => api.get(`/channels/${id}`)),
  createChannel: (channelData) => retryRequest(() => api.post('/channels', channelData)),
  updateChannel: (id, channelData) => retryRequest(() => api.put(`/channels/${id}`, channelData)),
  deleteChannel: (id) => retryRequest(() => api.delete(`/channels/${id}`)),
  uploadLogo: (id, logoFile) => {
    const formData = new FormData();
    formData.append('logo', logoFile);
    
    return retryRequest(() => api.post(`/channels/${id}/logo`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      // Longer timeout for file uploads
      timeout: 15000, 
    }));
  },
};

// News API
export const newsAPI = {
  getAllNews: (search = '') => {
    let queryParams = new URLSearchParams();
    if (search) queryParams.append('search', search);
    
    return retryRequest(() => api.get(`/news?${queryParams.toString()}`));
  },
  getNewsById: (id) => retryRequest(() => api.get(`/news/${id}`)),
  createNews: (newsData) => retryRequest(() => api.post('/news', newsData)),
  updateNews: (id, newsData) => retryRequest(() => api.put(`/news/${id}`, newsData)),
  deleteNews: (id) => retryRequest(() => api.delete(`/news/${id}`)),
};

export default api;
