import axios from 'axios';
import { toast } from 'react-toastify';

// Get environment variables with fallbacks for safety
const API_URL = process.env.REACT_APP_API_URL || 'http://192.168.1.15:5000/api';
const API_TIMEOUT = parseInt(process.env.REACT_APP_API_TIMEOUT || '8000', 10);
const API_RETRIES = parseInt(process.env.REACT_APP_API_RETRIES || '2', 10);
const UPLOADS_URL = process.env.REACT_APP_UPLOADS_URL || 'http://192.168.1.15:5000/uploads';

// Create axios instance with base URL from env
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  // Default timeout from env
  timeout: API_TIMEOUT,
  // Include credentials in requests
  withCredentials: true
});

// Log configuration during development
if (process.env.NODE_ENV !== 'production') {
  console.log('API Configuration:', {
    baseURL: API_URL,
    timeout: API_TIMEOUT,
    retries: API_RETRIES,
    uploadsUrl: UPLOADS_URL
  });
}

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

// Retry logic for failed requests using env variable
const retryRequest = async (request, maxRetries = API_RETRIES) => {
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
  reorderChannels: (orderedIds) => retryRequest(() => api.post('/channels/reorder', { orderedIds })),
  uploadLogo: (id, logoFile) => {
    const formData = new FormData();
    formData.append('logo', logoFile);
    
    return retryRequest(() => api.post(`/channels/${id}/logo`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      // Longer timeout for file uploads (double the normal timeout)
      timeout: API_TIMEOUT * 2, 
    }));
  },
  
  // Helper method to get complete logo URL
  getLogoUrl: (logoPath) => {
    if (!logoPath) return null;
    
    // If it's already an absolute URL (starts with http)
    if (logoPath.startsWith('http')) {
      return logoPath;
    }
    
    // Clean up the path:
    // 1. Remove leading slash if present
    // 2. Remove 'uploads/' prefix if present (since it's already in UPLOADS_URL)
    let path = logoPath.startsWith('/') ? logoPath.substring(1) : logoPath;
    path = path.replace(/^uploads\//, '');
    
    // Construct full URL ensuring no double slashes
    return `${UPLOADS_URL}/${path}`;
  }
};

// Transcoding API
export const transcodingAPI = {
  getActiveJobs: () => retryRequest(() => api.get('/transcoding/jobs')),
  getTranscodingStatus: (channelId) => retryRequest(() => api.get(`/transcoding/status/${channelId}`)),
  startTranscoding: (channelId, options = {}) => retryRequest(() => api.post(`/transcoding/start/${channelId}`, options)),
  stopTranscoding: (channelId) => retryRequest(() => api.post(`/transcoding/stop/${channelId}`)),
  restartTranscoding: (channelId) => retryRequest(() => api.post(`/transcoding/restart/${channelId}`)),
  toggleTranscoding: (channelId, enabled) => retryRequest(() => api.post(`/transcoding/toggle/${channelId}`, { enabled })),
  getTranscodingHistory: (channelId, limit = 10) => retryRequest(() => api.get(`/transcoding/history/${channelId}?limit=${limit}`)),
  getTranscodingStats: () => retryRequest(() => api.get('/transcoding/stats')),
};

// Smart Transcoding API
export const smartTranscodingAPI = {
  // Stream analysis
  analyzeStream: (channelId, forceRefresh = false) => 
    retryRequest(() => api.post(`/smart-transcoding/analyze/${channelId}`, { forceRefresh })),
  
  // Dynamic profile generation
  generateProfile: (channelId, options = {}) => 
    retryRequest(() => api.post(`/smart-transcoding/profile/${channelId}`, { options })),
  
  // Core transcoding operations
  startTranscoding: (channelId, options = {}) => 
    retryRequest(() => api.post(`/smart-transcoding/start/${channelId}`, { options })),
  stopTranscoding: (channelId) => 
    retryRequest(() => api.post(`/smart-transcoding/stop/${channelId}`)),
  
  // System statistics and monitoring
  getSystemStats: () => retryRequest(() => api.get('/smart-transcoding/stats')),
  getChannelHealth: (channelId) => retryRequest(() => api.get(`/smart-transcoding/health/${channelId}`)),
  
  // Fallback management
  getFallbackStats: (channelId) => retryRequest(() => api.get(`/smart-transcoding/fallback/${channelId}`)),
  resetFallbackTracking: (channelId) => retryRequest(() => api.post(`/smart-transcoding/fallback/reset/${channelId}`)),
  
  // Analysis cache management
  getCachedAnalysis: (channelId) => retryRequest(() => api.get(`/smart-transcoding/cache/${channelId}`)),
  clearAnalysisCache: (channelId) => retryRequest(() => api.delete(`/smart-transcoding/cache/${channelId}`)),
  
  // Bulk operations
  bulkStartTranscoding: (channelIds, options = {}) => 
    retryRequest(() => api.post('/smart-transcoding/bulk/start', { channelIds, options })),
  
  // System initialization
  initializeSystem: () => retryRequest(() => api.post('/smart-transcoding/init')),
};

// Transcoding Profiles API
export const transcodingProfilesAPI = {
  getAllProfiles: () => retryRequest(() => api.get('/transcoding-profiles')),
  getProfileById: (id) => retryRequest(() => api.get(`/transcoding-profiles/${id}`)),
  createProfile: (profileData) => retryRequest(() => api.post('/transcoding-profiles', profileData)),
  updateProfile: (id, profileData) => retryRequest(() => api.put(`/transcoding-profiles/${id}`, profileData)),
  deleteProfile: (id) => retryRequest(() => api.delete(`/transcoding-profiles/${id}`)),
  setDefaultProfile: (id) => retryRequest(() => api.post(`/transcoding-profiles/${id}/set-default`)),
  getProfileUsage: (id) => retryRequest(() => api.get(`/transcoding-profiles/${id}/usage`)),
};

// Bulk Operations API
export const bulkOperationsAPI = {
  parseM3U8: (file) => {
    const formData = new FormData();
    formData.append('m3u8File', file);
    
    return retryRequest(() => api.post('/bulk-operations/parse-m3u8', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: API_TIMEOUT * 3, // Extended timeout for file processing
    }));
  },
  importChannels: (validChannels) => retryRequest(() => api.post('/bulk-operations/import-channels', { validChannels })),
  startBulkTranscoding: (channelIds = null, profileId = null) => retryRequest(() => api.post('/bulk-operations/start-bulk-transcoding', { channelIds, profileId })),
  stopBulkTranscoding: () => retryRequest(() => api.post('/bulk-operations/stop-bulk-transcoding')),
  getBulkOperationStatus: (operationId) => retryRequest(() => api.get(`/bulk-operations/status/${operationId}`)),
  getRecentBulkOperations: (limit = 10) => retryRequest(() => api.get(`/bulk-operations/recent?limit=${limit}`)),
  getImportLogs: (operationId) => retryRequest(() => api.get(`/bulk-operations/import-logs/${operationId}`)),
  getTranscodingEligibleChannels: () => retryRequest(() => api.get('/bulk-operations/transcoding-eligible')),
  getBulkOperationsStats: () => retryRequest(() => api.get('/bulk-operations/stats')),
  deleteAllChannels: () => retryRequest(() => api.post('/bulk-operations/delete-all-channels')),
};

// Auth API
export const authAPI = {
  login: (credentials) => retryRequest(() => api.post('/auth/login', credentials)),
  logout: () => retryRequest(() => api.post('/auth/logout')),
  getSession: () => retryRequest(() => api.get('/auth/session')),
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

// Stream Health Monitoring API (Phase 2A)
export const streamHealthAPI = {
  // System overview
  getSystemOverview: () => retryRequest(() => api.get('/stream-health/overview')),
  
  // Channel health status
  getChannelStatus: (channelId) => retryRequest(() => api.get(`/stream-health/channel/${channelId}/status`)),
  getChannelHistory: (channelId, limit = 100) => retryRequest(() => api.get(`/stream-health/channel/${channelId}/history?limit=${limit}`)),
  forceHealthCheck: (channelId) => retryRequest(() => api.post(`/stream-health/channel/${channelId}/check`)),
  
  // Alerts management
  getActiveAlerts: (channelId = null) => {
    let queryParams = new URLSearchParams();
    if (channelId) queryParams.append('channelId', channelId);
    
    return retryRequest(() => api.get(`/stream-health/alerts?${queryParams.toString()}`));
  },
  acknowledgeAlert: (alertId) => retryRequest(() => api.post(`/stream-health/alerts/${alertId}/acknowledge`)),
  resolveAlert: (alertId) => retryRequest(() => api.post(`/stream-health/alerts/${alertId}/resolve`)),
  getAlertsSummary: () => retryRequest(() => api.get('/stream-health/alerts/summary')),
  
  // Statistics and trends
  getHealthStatistics: () => retryRequest(() => api.get('/stream-health/statistics')),
  getHealthTrends: (hours = 24, channelId = null) => {
    let queryParams = new URLSearchParams();
    queryParams.append('hours', hours);
    if (channelId) queryParams.append('channelId', channelId);
    
    return retryRequest(() => api.get(`/stream-health/trends?${queryParams.toString()}`));
  },
  getUptimeStatistics: (days = 7, channelId = null) => {
    let queryParams = new URLSearchParams();
    queryParams.append('days', days);
    if (channelId) queryParams.append('channelId', channelId);
    
    return retryRequest(() => api.get(`/stream-health/uptime?${queryParams.toString()}`));
  },
  
  // System maintenance
  cleanupOldHistory: (daysToKeep = 7) => retryRequest(() => api.post('/stream-health/cleanup', { daysToKeep })),
  getMonitoringConfig: () => retryRequest(() => api.get('/stream-health/config')),
};

// Profile Template Management API (Phase 2A)
export const profileTemplatesAPI = {
  // Template management
  getAllTemplates: () => retryRequest(() => api.get('/profile-templates')),
  getTemplateById: (templateId) => retryRequest(() => api.get(`/profile-templates/${templateId}`)),
  getTemplatesByContentType: (contentType) => retryRequest(() => api.get(`/profile-templates/content-type/${contentType}`)),
  createTemplate: (templateData) => retryRequest(() => api.post('/profile-templates/create', templateData)),
  updateTemplate: (templateId, templateData) => retryRequest(() => api.put(`/profile-templates/${templateId}`, templateData)),
  deleteTemplate: (templateId) => retryRequest(() => api.delete(`/profile-templates/${templateId}`)),
  
  // Profile recommendations
  getChannelRecommendations: (channelId) => retryRequest(() => api.get(`/profile-templates/recommendations/${channelId}`)),
  generateRecommendation: (channelId) => retryRequest(() => api.post(`/profile-templates/recommendations/${channelId}/generate`)),
  generateAllRecommendations: () => retryRequest(() => api.post('/profile-templates/recommendations/generate-all')),
  
  // Template application
  applyTemplateToChannel: (channelId, templateId, forceApply = false) => 
    retryRequest(() => api.post(`/profile-templates/apply/${channelId}`, { templateId, forceApply })),
  bulkApplyTemplate: (channelIds, templateId, forceApply = false) => 
    retryRequest(() => api.post('/profile-templates/bulk-apply', { channelIds, templateId, forceApply })),
  
  // Analytics and insights
  getUsageStatistics: () => retryRequest(() => api.get('/profile-templates/usage/statistics')),
  getChannelsOverview: () => retryRequest(() => api.get('/profile-templates/channels/overview')),
  getOptimizationSuggestions: () => retryRequest(() => api.get('/profile-templates/optimization/suggestions')),
  getTemplatePerformance: (templateId, days = 7) => retryRequest(() => api.get(`/profile-templates/performance/${templateId}?days=${days}`)),
  
  // Configuration
  getContentTypeMapping: () => retryRequest(() => api.get('/profile-templates/content-types/mapping')),
};

// Optimized Transcoding API (Phase 1)
export const optimizedTranscodingAPI = {
  // Core transcoding operations
  startTranscoding: (channelId, profileId = null) => retryRequest(() => api.post(`/optimized-transcoding/start/${channelId}`, { profileId })),
  stopTranscoding: (channelId) => retryRequest(() => api.post(`/optimized-transcoding/stop/${channelId}`)),
  restartTranscoding: (channelId) => retryRequest(() => api.post(`/optimized-transcoding/restart/${channelId}`)),
  
  // Bulk operations
  bulkStartTranscoding: (channelIds, staggerDelay = 2000) => 
    retryRequest(() => api.post('/optimized-transcoding/bulk/start', { channelIds, staggerDelay })),
  bulkStopTranscoding: (channelIds) => 
    retryRequest(() => api.post('/optimized-transcoding/bulk/stop', { channelIds })),
  
  // System monitoring
  getActiveJobs: () => retryRequest(() => api.get('/optimized-transcoding/jobs')),
  getSystemHealth: () => retryRequest(() => api.get('/optimized-transcoding/health')),
  getStorageStats: () => retryRequest(() => api.get('/optimized-transcoding/storage')),
  getChannelStatus: (channelId) => retryRequest(() => api.get(`/optimized-transcoding/status/${channelId}`)),
  
  // Configuration and maintenance
  getSystemConfig: () => retryRequest(() => api.get('/optimized-transcoding/config')),
  setLogLevel: (logLevel) => retryRequest(() => api.post('/optimized-transcoding/logger/level', { logLevel })),
  getLoggerConfig: () => retryRequest(() => api.get('/optimized-transcoding/logger/config')),
  
  // Cleanup operations
  cleanupChannel: (channelId) => retryRequest(() => api.post(`/optimized-transcoding/cleanup/${channelId}`)),
  cleanupSystem: () => retryRequest(() => api.post('/optimized-transcoding/cleanup/system')),
  
  // Health checks
  checkStreamHealth: (channelId) => retryRequest(() => api.get(`/optimized-transcoding/health/stream/${channelId}`)),
};

export default api;
