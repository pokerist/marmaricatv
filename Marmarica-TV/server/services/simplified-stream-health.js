const axios = require('axios');
const { spawn } = require('child_process');

// Database reference
let db = null;

// Health check configuration
const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
const HEALTH_CHECK_TIMEOUT = 10000; // 10 seconds
const UPTIME_WINDOW_HOURS = 24; // 24 hours for uptime calculation

// Active monitoring
let monitoringInterval = null;
const channelHealthCache = new Map();

// Set database reference
const setDatabase = (database) => {
  db = database;
};

// Check stream health using HTTP HEAD request
const checkStreamWithHTTP = async (url) => {
  try {
    const response = await axios.head(url, {
      timeout: HEALTH_CHECK_TIMEOUT,
      validateStatus: (status) => status < 500,
      headers: {
        'User-Agent': 'MarmaricaTV-HealthMonitor/1.0'
      }
    });
    
    return {
      available: response.status < 400,
      responseTime: response.headers['x-response-time'] || null,
      statusCode: response.status,
      method: 'http'
    };
  } catch (error) {
    return {
      available: false,
      error: error.message,
      statusCode: error.response?.status || null,
      method: 'http'
    };
  }
};

// Check stream using FFprobe
const checkStreamWithFFprobe = async (url) => {
  return new Promise((resolve) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      '-analyzeduration', '3000000',
      '-probesize', '3000000',
      '-timeout', '10000000',
      url
    ]);

    let stdout = '';
    let stderr = '';

    ffprobe.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    ffprobe.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (code === 0) {
        try {
          const probeData = JSON.parse(stdout);
          resolve({
            available: probeData.streams && probeData.streams.length > 0,
            streamCount: probeData.streams?.length || 0,
            hasVideo: probeData.streams?.some(s => s.codec_type === 'video') || false,
            hasAudio: probeData.streams?.some(s => s.codec_type === 'audio') || false,
            method: 'ffprobe'
          });
        } catch (parseError) {
          resolve({
            available: false,
            error: 'Failed to parse FFprobe output',
            method: 'ffprobe'
          });
        }
      } else {
        resolve({
          available: false,
          error: stderr || 'FFprobe failed',
          method: 'ffprobe'
        });
      }
    });

    // Timeout handler
    setTimeout(() => {
      ffprobe.kill('SIGTERM');
      resolve({
        available: false,
        error: 'FFprobe timeout',
        method: 'ffprobe'
      });
    }, 15000);
  });
};

// Check health of a single channel
const checkChannelHealth = async (channelId, url) => {
  const startTime = Date.now();
  
  let result = {
    channelId: channelId,
    url: url,
    timestamp: new Date().toISOString(),
    available: false,
    responseTime: null,
    method: 'unknown',
    error: null
  };

  try {
    // Try HTTP first
    const httpResult = await checkStreamWithHTTP(url);
    result.responseTime = Date.now() - startTime;
    result.method = httpResult.method;
    result.available = httpResult.available;
    result.statusCode = httpResult.statusCode;
    result.error = httpResult.error;

    // If HTTP fails, try FFprobe
    if (!result.available) {
      const ffprobeResult = await checkStreamWithFFprobe(url);
      result.method = ffprobeResult.method;
      result.available = ffprobeResult.available;
      result.streamCount = ffprobeResult.streamCount;
      result.hasVideo = ffprobeResult.hasVideo;
      result.hasAudio = ffprobeResult.hasAudio;
      result.error = ffprobeResult.error || result.error;
      result.responseTime = Date.now() - startTime;
    }

  } catch (error) {
    result.error = error.message;
    result.responseTime = Date.now() - startTime;
  }

  // Cache the result
  channelHealthCache.set(channelId, result);
  
  // Store in database if available
  if (db) {
    await storeHealthResult(result);
  }

  return result;
};

// Store health check result in database
const storeHealthResult = async (result) => {
  if (!db) return;

  return new Promise((resolve, reject) => {
    db.run(`
      INSERT OR REPLACE INTO stream_health_history (
        channel_id, 
        timestamp, 
        availability_status, 
        response_time, 
        http_status_code, 
        error_message, 
        detection_method,
        additional_data,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      result.channelId,
      result.timestamp,
      result.available ? 'available' : 'unavailable',
      result.responseTime,
      result.statusCode || null,
      result.error || null,
      result.method,
      JSON.stringify({
        streamCount: result.streamCount,
        hasVideo: result.hasVideo,
        hasAudio: result.hasAudio
      }),
      result.timestamp
    ], (err) => {
      if (err) {
        console.error('Error storing health result:', err);
        reject(err);
      } else {
        resolve();
      }
    });
  });
};

// Calculate uptime percentage for a channel
const calculateUptimePercentage = async (channelId) => {
  if (!db) return 0;

  return new Promise((resolve, reject) => {
    const cutoffTime = new Date(Date.now() - (UPTIME_WINDOW_HOURS * 60 * 60 * 1000)).toISOString();
    
    db.get(`
      SELECT 
        COUNT(*) as total_checks,
        COUNT(CASE WHEN availability_status = 'available' THEN 1 END) as available_checks
      FROM stream_health_history 
      WHERE channel_id = ? AND timestamp >= ?
    `, [channelId, cutoffTime], (err, row) => {
      if (err) {
        reject(err);
      } else {
        const uptime = row && row.total_checks > 0 ? 
          (row.available_checks / row.total_checks) * 100 : 0;
        resolve(Math.round(uptime * 100) / 100);
      }
    });
  });
};

// Update channel with health information
const updateChannelHealth = async (channelId, healthResult) => {
  if (!db) return;

  try {
    const uptimePercentage = await calculateUptimePercentage(channelId);
    
    return new Promise((resolve, reject) => {
      db.run(`
        UPDATE channels 
        SET 
          stream_health_status = ?, 
          last_health_check = ?, 
          avg_response_time = ?,
          uptime_percentage = ?,
          updated_at = ?
        WHERE id = ?
      `, [
        healthResult.available ? 'available' : 'unavailable',
        healthResult.timestamp,
        healthResult.responseTime || 0,
        uptimePercentage,
        new Date().toISOString(),
        channelId
      ], (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  } catch (error) {
    console.error('Error updating channel health:', error);
  }
};

// Monitor all channels
const monitorAllChannels = async () => {
  if (!db) return;

  try {
    // Get all channels with transcoding enabled
    const channels = await new Promise((resolve, reject) => {
      db.all(
        'SELECT id, name, url, transcoding_enabled FROM channels WHERE transcoding_enabled = 1',
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });

    console.log(`Monitoring health for ${channels.length} channels`);

    // Check each channel
    for (const channel of channels) {
      try {
        const healthResult = await checkChannelHealth(channel.id, channel.url);
        await updateChannelHealth(channel.id, healthResult);
        
        // Small delay to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Error monitoring channel ${channel.id}:`, error);
      }
    }

  } catch (error) {
    console.error('Error in monitorAllChannels:', error);
  }
};

// Get health status for a specific channel
const getChannelHealthStatus = (channelId) => {
  const cached = channelHealthCache.get(channelId);
  if (cached) {
    return cached;
  }

  return {
    channelId: channelId,
    available: false,
    error: 'No health data available',
    timestamp: new Date().toISOString()
  };
};

// Get health overview for all channels
const getHealthOverview = async () => {
  if (!db) {
    return {
      totalChannels: 0,
      availableChannels: 0,
      unavailableChannels: 0,
      averageUptime: 0,
      lastUpdateTime: new Date().toISOString()
    };
  }

  return new Promise((resolve, reject) => {
    db.get(`
      SELECT 
        COUNT(*) as total_channels,
        COUNT(CASE WHEN stream_health_status = 'available' THEN 1 END) as available_channels,
        COUNT(CASE WHEN stream_health_status = 'unavailable' THEN 1 END) as unavailable_channels,
        AVG(uptime_percentage) as average_uptime,
        MAX(last_health_check) as last_update
      FROM channels 
      WHERE transcoding_enabled = 1
    `, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve({
          totalChannels: row.total_channels || 0,
          availableChannels: row.available_channels || 0,
          unavailableChannels: row.unavailable_channels || 0,
          averageUptime: Math.round((row.average_uptime || 0) * 100) / 100,
          lastUpdateTime: row.last_update || new Date().toISOString()
        });
      }
    });
  });
};

// Get detailed health history for a channel
const getChannelHealthHistory = async (channelId, limit = 50) => {
  if (!db) return [];

  return new Promise((resolve, reject) => {
    db.all(`
      SELECT * FROM stream_health_history 
      WHERE channel_id = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `, [channelId, limit], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
};

// Clean up old health history
const cleanupOldHealthHistory = async (daysToKeep = 7) => {
  if (!db) return;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  return new Promise((resolve, reject) => {
    db.run(`
      DELETE FROM stream_health_history 
      WHERE timestamp < ?
    `, [cutoffDate.toISOString()], function(err) {
      if (err) {
        reject(err);
      } else {
        console.log(`Cleaned up ${this.changes} old health history records`);
        resolve(this.changes);
      }
    });
  });
};

// Start monitoring
const startMonitoring = () => {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
  }

  console.log('Starting stream health monitoring...');
  
  // Start periodic monitoring
  monitoringInterval = setInterval(monitorAllChannels, HEALTH_CHECK_INTERVAL);
  
  // Run initial check after a short delay
  setTimeout(monitorAllChannels, 5000);
  
  // Set up daily cleanup
  setInterval(() => {
    cleanupOldHealthHistory(7);
  }, 24 * 60 * 60 * 1000); // Daily cleanup

  console.log(`Stream health monitoring started (interval: ${HEALTH_CHECK_INTERVAL / 1000}s)`);
};

// Stop monitoring
const stopMonitoring = () => {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
  }
  
  channelHealthCache.clear();
  console.log('Stream health monitoring stopped');
};

// Initialize stream health monitoring
const initializeStreamHealthMonitoring = async () => {
  try {
    console.log('Initializing simplified stream health monitoring...');
    
    // Start monitoring
    startMonitoring();
    
    console.log('Simplified stream health monitoring initialized successfully');
    
  } catch (error) {
    console.error('Error initializing stream health monitoring:', error);
    throw error;
  }
};

// Cleanup stream health monitoring
const cleanupStreamHealthMonitoring = async () => {
  try {
    stopMonitoring();
    console.log('Stream health monitoring cleanup completed');
  } catch (error) {
    console.error('Error during stream health monitoring cleanup:', error);
  }
};

module.exports = {
  setDatabase,
  checkChannelHealth,
  getChannelHealthStatus,
  getHealthOverview,
  getChannelHealthHistory,
  monitorAllChannels,
  calculateUptimePercentage,
  cleanupOldHealthHistory,
  initializeStreamHealthMonitoring,
  cleanupStreamHealthMonitoring,
  startMonitoring,
  stopMonitoring
};
