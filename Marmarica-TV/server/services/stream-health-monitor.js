const axios = require('axios');
const { spawn } = require('child_process');
const EventEmitter = require('events');

class StreamHealthMonitor extends EventEmitter {
  constructor() {
    super();
    this.db = null;
    this.monitoringInterval = null;
    this.healthCheckInterval = 30000; // 30 seconds
    this.retryDelay = 5000; // 5 seconds
    this.maxRetries = 3;
    this.activeChannels = new Map();
    this.healthHistory = new Map();
    
    // Alert thresholds
    this.alertThresholds = {
      responseTime: 5000, // 5 seconds
      downtime: 60000, // 1 minute
      errorRate: 0.1 // 10% error rate
    };
    
    console.log('Stream Health Monitor initialized');
  }

  // Set database reference
  setDatabase(database) {
    this.db = database;
  }

  // Start monitoring all active channels
  async startMonitoring() {
    try {
      console.log('Starting stream health monitoring...');
      
      // Get all channels with transcoding enabled
      const channels = await this.getActiveChannels();
      
      for (const channel of channels) {
        this.activeChannels.set(channel.id, {
          ...channel,
          lastCheck: null,
          currentStatus: 'unknown',
          consecutiveFailures: 0,
          isRetrying: false
        });
      }
      
      // Start periodic health checks
      this.monitoringInterval = setInterval(() => {
        this.performHealthChecks();
      }, this.healthCheckInterval);
      
      console.log(`Stream health monitoring started for ${channels.length} channels`);
      
    } catch (error) {
      console.error('Error starting stream health monitoring:', error);
      throw error;
    }
  }

  // Stop monitoring
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    this.activeChannels.clear();
    this.healthHistory.clear();
    
    console.log('Stream health monitoring stopped');
  }

  // Get active channels from database
  async getActiveChannels() {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }
      
      this.db.all(
        'SELECT id, name, url, transcoding_enabled, transcoding_status FROM channels WHERE transcoding_enabled = 1',
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
  }

  // Perform health checks on all active channels
  async performHealthChecks() {
    const promises = [];
    
    for (const [channelId, channelData] of this.activeChannels) {
      promises.push(this.checkChannelHealth(channelId, channelData));
    }
    
    try {
      await Promise.allSettled(promises);
    } catch (error) {
      console.error('Error during health checks:', error);
    }
  }

  // Check health of a single channel
  async checkChannelHealth(channelId, channelData) {
    const startTime = Date.now();
    let result = {
      channelId,
      timestamp: new Date().toISOString(),
      availabilityStatus: 'unknown',
      responseTime: null,
      httpStatusCode: null,
      errorMessage: null,
      retryCount: 0,
      detectionMethod: 'http_head',
      additionalData: null
    };

    try {
      // Try HTTP HEAD request first
      const headResult = await this.performHttpHeadCheck(channelData.url);
      result = { ...result, ...headResult };
      result.responseTime = Date.now() - startTime;
      
      // If HTTP HEAD fails, try FFprobe
      if (result.availabilityStatus !== 'available') {
        const ffprobeResult = await this.performFFprobeCheck(channelData.url);
        result = { ...result, ...ffprobeResult };
        result.detectionMethod = 'ffprobe';
      }
      
    } catch (error) {
      result.availabilityStatus = 'error';
      result.errorMessage = error.message;
      result.responseTime = Date.now() - startTime;
    }

    // Update channel status
    await this.updateChannelHealthStatus(channelId, result);
    
    // Store health history
    await this.storeHealthHistory(result);
    
    // Check for alerts
    await this.checkForAlerts(channelId, result, channelData);
    
    // Update in-memory tracking
    this.activeChannels.set(channelId, {
      ...channelData,
      lastCheck: result.timestamp,
      currentStatus: result.availabilityStatus,
      consecutiveFailures: result.availabilityStatus === 'available' ? 0 : 
                           (channelData.consecutiveFailures || 0) + 1,
      responseTime: result.responseTime
    });

    return result;
  }

  // Perform HTTP HEAD request
  async performHttpHeadCheck(url) {
    try {
      const response = await axios.head(url, {
        timeout: 10000,
        validateStatus: (status) => status < 500, // Don't throw on 4xx errors
        headers: {
          'User-Agent': 'MarmaricaTV-HealthMonitor/1.0'
        }
      });
      
      return {
        availabilityStatus: response.status < 400 ? 'available' : 'unavailable',
        httpStatusCode: response.status,
        additionalData: JSON.stringify({
          contentType: response.headers['content-type'],
          contentLength: response.headers['content-length']
        })
      };
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        return {
          availabilityStatus: 'timeout',
          errorMessage: 'Request timeout'
        };
      }
      
      return {
        availabilityStatus: 'unavailable',
        httpStatusCode: error.response?.status || null,
        errorMessage: error.message
      };
    }
  }

  // Perform FFprobe check
  async performFFprobeCheck(url) {
    return new Promise((resolve) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_streams',
        '-analyzeduration', '3000000',
        '-probesize', '3000000',
        '-timeout', '10000000', // 10 seconds
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
              availabilityStatus: probeData.streams && probeData.streams.length > 0 ? 'available' : 'unavailable',
              additionalData: JSON.stringify({
                streamCount: probeData.streams?.length || 0,
                hasVideo: probeData.streams?.some(s => s.codec_type === 'video') || false,
                hasAudio: probeData.streams?.some(s => s.codec_type === 'audio') || false
              })
            });
          } catch (parseError) {
            resolve({
              availabilityStatus: 'error',
              errorMessage: 'Failed to parse FFprobe output'
            });
          }
        } else {
          resolve({
            availabilityStatus: 'unavailable',
            errorMessage: stderr || 'FFprobe failed'
          });
        }
      });
      
      // Handle timeout
      setTimeout(() => {
        ffprobe.kill('SIGTERM');
        resolve({
          availabilityStatus: 'timeout',
          errorMessage: 'FFprobe timeout'
        });
      }, 15000);
    });
  }

  // Update channel health status in database
  async updateChannelHealthStatus(channelId, healthResult) {
    if (!this.db) return;
    
    const now = new Date().toISOString();
    const responseTime = healthResult.responseTime || 0;
    
    return new Promise((resolve, reject) => {
      this.db.run(`
        UPDATE channels 
        SET stream_health_status = ?, 
            last_health_check = ?, 
            avg_response_time = ?,
            updated_at = ?
        WHERE id = ?
      `, [
        healthResult.availabilityStatus,
        healthResult.timestamp,
        responseTime,
        now,
        channelId
      ], (err) => {
        if (err) {
          console.error('Error updating channel health status:', err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  // Store health history
  async storeHealthHistory(healthResult) {
    if (!this.db) return;
    
    const now = new Date().toISOString();
    
    return new Promise((resolve, reject) => {
      this.db.run(`
        INSERT INTO stream_health_history (
          channel_id, timestamp, availability_status, response_time, 
          http_status_code, error_message, retry_count, detection_method, 
          additional_data, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        healthResult.channelId,
        healthResult.timestamp,
        healthResult.availabilityStatus,
        healthResult.responseTime,
        healthResult.httpStatusCode,
        healthResult.errorMessage,
        healthResult.retryCount,
        healthResult.detectionMethod,
        healthResult.additionalData,
        now
      ], (err) => {
        if (err) {
          console.error('Error storing health history:', err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  // Check for alerts based on health results
  async checkForAlerts(channelId, healthResult, channelData) {
    const alerts = [];
    
    // Check response time
    if (healthResult.responseTime > this.alertThresholds.responseTime) {
      alerts.push({
        type: 'high_latency',
        severity: 'medium',
        message: `High response time: ${healthResult.responseTime}ms (threshold: ${this.alertThresholds.responseTime}ms)`
      });
    }
    
    // Check availability status
    if (healthResult.availabilityStatus === 'unavailable') {
      alerts.push({
        type: 'stream_down',
        severity: 'high',
        message: `Stream unavailable: ${healthResult.errorMessage || 'Unknown error'}`
      });
    }
    
    // Check for recovery
    if (healthResult.availabilityStatus === 'available' && 
        channelData.currentStatus === 'unavailable') {
      alerts.push({
        type: 'stream_recovered',
        severity: 'low',
        message: 'Stream has recovered and is now available'
      });
    }
    
    // Store alerts
    for (const alert of alerts) {
      await this.storeAlert(channelId, alert);
    }
  }

  // Store alert in database
  async storeAlert(channelId, alert) {
    if (!this.db) return;
    
    const now = new Date().toISOString();
    
    return new Promise((resolve, reject) => {
      this.db.run(`
        INSERT INTO stream_health_alerts (
          channel_id, alert_type, severity, message, triggered_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `, [
        channelId,
        alert.type,
        alert.severity,
        alert.message,
        now,
        now
      ], (err) => {
        if (err) {
          console.error('Error storing alert:', err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  // Get health status for a channel
  async getChannelHealthStatus(channelId) {
    if (!this.db) throw new Error('Database not initialized');
    
    return new Promise((resolve, reject) => {
      this.db.get(`
        SELECT c.*, 
               h.availability_status, h.response_time, h.timestamp as last_check
        FROM channels c
        LEFT JOIN stream_health_history h ON c.id = h.channel_id
        WHERE c.id = ?
        ORDER BY h.timestamp DESC
        LIMIT 1
      `, [channelId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  // Get health history for a channel
  async getChannelHealthHistory(channelId, limit = 100) {
    if (!this.db) throw new Error('Database not initialized');
    
    return new Promise((resolve, reject) => {
      this.db.all(`
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
  }

  // Get active alerts
  async getActiveAlerts(channelId = null) {
    if (!this.db) throw new Error('Database not initialized');
    
    const query = channelId 
      ? 'SELECT * FROM stream_health_alerts WHERE channel_id = ? AND resolved_at IS NULL ORDER BY triggered_at DESC'
      : 'SELECT * FROM stream_health_alerts WHERE resolved_at IS NULL ORDER BY triggered_at DESC';
    
    const params = channelId ? [channelId] : [];
    
    return new Promise((resolve, reject) => {
      this.db.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // Get system health overview
  getSystemHealthOverview() {
    const overview = {
      totalChannels: this.activeChannels.size,
      availableChannels: 0,
      unavailableChannels: 0,
      timeoutChannels: 0,
      errorChannels: 0,
      averageResponseTime: 0,
      lastUpdateTime: new Date().toISOString()
    };
    
    let totalResponseTime = 0;
    let responseTimeCount = 0;
    
    for (const [channelId, channelData] of this.activeChannels) {
      switch (channelData.currentStatus) {
        case 'available':
          overview.availableChannels++;
          break;
        case 'unavailable':
          overview.unavailableChannels++;
          break;
        case 'timeout':
          overview.timeoutChannels++;
          break;
        case 'error':
          overview.errorChannels++;
          break;
      }
      
      if (channelData.responseTime) {
        totalResponseTime += channelData.responseTime;
        responseTimeCount++;
      }
    }
    
    overview.averageResponseTime = responseTimeCount > 0 ? 
      Math.round(totalResponseTime / responseTimeCount) : 0;
    
    return overview;
  }

  // Clean up old health history
  async cleanupOldHealthHistory(daysToKeep = 7) {
    if (!this.db) return;
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    return new Promise((resolve, reject) => {
      this.db.run(`
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
  }

  // Initialize monitoring
  async initializeStreamHealthMonitoring() {
    try {
      await this.startMonitoring();
      
      // Start cleanup interval (daily)
      setInterval(() => {
        this.cleanupOldHealthHistory(7);
      }, 24 * 60 * 60 * 1000);
      
      console.log('Stream health monitoring initialized successfully');
    } catch (error) {
      console.error('Failed to initialize stream health monitoring:', error);
      throw error;
    }
  }

  // Cleanup monitoring
  async cleanupStreamHealthMonitoring() {
    try {
      this.stopMonitoring();
      console.log('Stream health monitoring cleanup completed');
    } catch (error) {
      console.error('Error during stream health monitoring cleanup:', error);
    }
  }
}

module.exports = new StreamHealthMonitor();
