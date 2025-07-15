const os = require('os');

// Database reference - will be set when available
let db = null;

// Function to set database reference
const setDatabase = (database) => {
  db = database;
};

// Function to get database reference safely
const getDatabase = () => {
  return db;
};

// Resource monitoring configuration
const RESOURCE_CONFIG = {
  MONITORING_INTERVAL: 5000,        // 5 seconds
  CPU_SAMPLES: 5,                   // Number of CPU samples to average
  MEMORY_THRESHOLD_WARNING: 75,     // 75% memory usage warning
  MEMORY_THRESHOLD_CRITICAL: 90,    // 90% memory usage critical
  CPU_THRESHOLD_WARNING: 70,        // 70% CPU usage warning
  CPU_THRESHOLD_CRITICAL: 85,       // 85% CPU usage critical
  DISK_THRESHOLD_WARNING: 80,       // 80% disk usage warning
  DISK_THRESHOLD_CRITICAL: 95,      // 95% disk usage critical
  HISTORY_RETENTION_HOURS: 24,      // Keep 24 hours of history
  ALERT_COOLDOWN: 300000            // 5 minutes between same-type alerts
};

// Global state
let monitoringInterval = null;
let cpuSamples = [];
let lastAlerts = new Map();

// Resource monitoring class
class ResourceMonitor {
  constructor() {
    this.isMonitoring = false;
    this.currentStats = null;
    this.alerts = [];
  }

  // Get current system statistics
  async getCurrentStats() {
    try {
      // Get CPU usage over time
      const cpuUsage = await this.getCPUUsage();
      
      // Get memory usage
      const memoryStats = this.getMemoryStats();
      
      // Get disk usage
      const diskStats = await this.getDiskUsage();
      
      // Get process counts
      const processStats = this.getProcessStats();
      
      // Calculate health status
      const health = this.calculateSystemHealth(cpuUsage, memoryStats, diskStats);
      
      const stats = {
        timestamp: new Date().toISOString(),
        cpu: {
          usage_percent: cpuUsage,
          cores: os.cpus().length,
          load_average: os.loadavg(),
          health: health.cpu
        },
        memory: {
          total_bytes: memoryStats.total,
          used_bytes: memoryStats.used,
          free_bytes: memoryStats.free,
          usage_percent: memoryStats.percent,
          health: health.memory,
          swap: {
            total: memoryStats.swap.total,
            used: memoryStats.swap.used,
            free: memoryStats.swap.free
          }
        },
        disk: {
          usage_percent: diskStats.percent,
          total_bytes: diskStats.total,
          used_bytes: diskStats.used,
          free_bytes: diskStats.free,
          health: health.disk
        },
        processes: processStats,
        system: {
          uptime: os.uptime(),
          platform: os.platform(),
          arch: os.arch(),
          hostname: os.hostname()
        },
        overall_health: health.overall
      };
      
      this.currentStats = stats;
      return stats;
      
    } catch (error) {
      console.error('Error getting system stats:', error);
      return { error: error.message };
    }
  }

  // Get CPU usage percentage
  async getCPUUsage() {
    return new Promise((resolve) => {
      const startUsage = process.cpuUsage();
      const startTime = process.hrtime();
      
      setTimeout(() => {
        const endUsage = process.cpuUsage(startUsage);
        const endTime = process.hrtime(startTime);
        
        const totalTime = endTime[0] * 1000000 + endTime[1] / 1000; // microseconds
        const cpuPercent = ((endUsage.user + endUsage.system) / totalTime) * 100;
        
        // Add to samples for averaging
        cpuSamples.push(cpuPercent);
        if (cpuSamples.length > RESOURCE_CONFIG.CPU_SAMPLES) {
          cpuSamples.shift();
        }
        
        // Return average of samples
        const avgCpu = cpuSamples.reduce((sum, val) => sum + val, 0) / cpuSamples.length;
        resolve(Math.round(avgCpu * 100) / 100);
      }, 100);
    });
  }

  // Get memory statistics
  getMemoryStats() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    return {
      total: totalMem,
      used: usedMem,
      free: freeMem,
      percent: Math.round((usedMem / totalMem) * 100 * 100) / 100,
      swap: {
        total: 0, // OS module doesn't provide swap info
        used: 0,
        free: 0
      }
    };
  }

  // Get disk usage (for the current working directory)
  async getDiskUsage() {
    try {
      const fs = require('fs');
      const stats = fs.statSync('.');
      
      // This is a basic implementation - in production you might want to use a library
      // that provides actual disk usage statistics
      return {
        total: 100 * 1024 * 1024 * 1024, // Assume 100GB for now
        used: 50 * 1024 * 1024 * 1024,   // Assume 50GB used
        free: 50 * 1024 * 1024 * 1024,   // Assume 50GB free
        percent: 50
      };
    } catch (error) {
      return {
        total: 0,
        used: 0,
        free: 0,
        percent: 0
      };
    }
  }

  // Get process statistics
  getProcessStats() {
    const memUsage = process.memoryUsage();
    
    return {
      pid: process.pid,
      ppid: process.ppid,
      node_memory: {
        rss: memUsage.rss,
        heap_total: memUsage.heapTotal,
        heap_used: memUsage.heapUsed,
        external: memUsage.external
      },
      uptime: process.uptime(),
      version: process.version
    };
  }

  // Calculate system health status
  calculateSystemHealth(cpuUsage, memoryStats, diskStats) {
    const getCpuHealth = (usage) => {
      if (usage > RESOURCE_CONFIG.CPU_THRESHOLD_CRITICAL) return 'critical';
      if (usage > RESOURCE_CONFIG.CPU_THRESHOLD_WARNING) return 'warning';
      return 'healthy';
    };

    const getMemoryHealth = (usage) => {
      if (usage > RESOURCE_CONFIG.MEMORY_THRESHOLD_CRITICAL) return 'critical';
      if (usage > RESOURCE_CONFIG.MEMORY_THRESHOLD_WARNING) return 'warning';
      return 'healthy';
    };

    const getDiskHealth = (usage) => {
      if (usage > RESOURCE_CONFIG.DISK_THRESHOLD_CRITICAL) return 'critical';
      if (usage > RESOURCE_CONFIG.DISK_THRESHOLD_WARNING) return 'warning';
      return 'healthy';
    };

    const cpuHealth = getCpuHealth(cpuUsage);
    const memoryHealth = getMemoryHealth(memoryStats.percent);
    const diskHealth = getDiskHealth(diskStats.percent);

    // Overall health is the worst of all components
    const overallHealth = [cpuHealth, memoryHealth, diskHealth].includes('critical') ? 'critical' :
                         [cpuHealth, memoryHealth, diskHealth].includes('warning') ? 'warning' : 'healthy';

    return {
      cpu: cpuHealth,
      memory: memoryHealth,
      disk: diskHealth,
      overall: overallHealth
    };
  }

  // Check for alerts and trigger them
  async checkAlerts(stats) {
    const now = Date.now();
    const alerts = [];

    // Check CPU alert
    if (stats.cpu.health === 'critical' || stats.cpu.health === 'warning') {
      const alertType = `cpu_${stats.cpu.health}`;
      const lastAlert = lastAlerts.get(alertType);
      
      if (!lastAlert || (now - lastAlert) > RESOURCE_CONFIG.ALERT_COOLDOWN) {
        alerts.push({
          type: alertType,
          message: `CPU usage ${stats.cpu.health}: ${stats.cpu.usage_percent}%`,
          value: stats.cpu.usage_percent,
          threshold: stats.cpu.health === 'critical' ? 
            RESOURCE_CONFIG.CPU_THRESHOLD_CRITICAL : 
            RESOURCE_CONFIG.CPU_THRESHOLD_WARNING
        });
        lastAlerts.set(alertType, now);
      }
    }

    // Check memory alert
    if (stats.memory.health === 'critical' || stats.memory.health === 'warning') {
      const alertType = `memory_${stats.memory.health}`;
      const lastAlert = lastAlerts.get(alertType);
      
      if (!lastAlert || (now - lastAlert) > RESOURCE_CONFIG.ALERT_COOLDOWN) {
        alerts.push({
          type: alertType,
          message: `Memory usage ${stats.memory.health}: ${stats.memory.usage_percent}%`,
          value: stats.memory.usage_percent,
          threshold: stats.memory.health === 'critical' ? 
            RESOURCE_CONFIG.MEMORY_THRESHOLD_CRITICAL : 
            RESOURCE_CONFIG.MEMORY_THRESHOLD_WARNING
        });
        lastAlerts.set(alertType, now);
      }
    }

    // Check disk alert
    if (stats.disk.health === 'critical' || stats.disk.health === 'warning') {
      const alertType = `disk_${stats.disk.health}`;
      const lastAlert = lastAlerts.get(alertType);
      
      if (!lastAlert || (now - lastAlert) > RESOURCE_CONFIG.ALERT_COOLDOWN) {
        alerts.push({
          type: alertType,
          message: `Disk usage ${stats.disk.health}: ${stats.disk.usage_percent}%`,
          value: stats.disk.usage_percent,
          threshold: stats.disk.health === 'critical' ? 
            RESOURCE_CONFIG.DISK_THRESHOLD_CRITICAL : 
            RESOURCE_CONFIG.DISK_THRESHOLD_WARNING
        });
        lastAlerts.set(alertType, now);
      }
    }

    // Log alerts to database
    for (const alert of alerts) {
      await this.logAlert(alert);
    }

    return alerts;
  }

  // Log alert to database
  async logAlert(alert) {
    try {
      if (!db) {
        console.log(`Resource alert (DB not available): ${alert.message}`);
        return;
      }
      
      const now = new Date().toISOString();
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO resource_alerts (alert_type, message, value, threshold, created_at) VALUES (?, ?, ?, ?, ?)',
          [alert.type, alert.message, alert.value, alert.threshold, now],
          (err) => {
            if (err) {
              console.error('Error logging alert:', err.message);
              reject(err);
            } else {
              console.log(`Resource alert: ${alert.message}`);
              resolve();
            }
          }
        );
      });
    } catch (error) {
      console.error('Error logging alert to database:', error);
    }
  }

  // Store historical data
  async storeHistoricalData(stats) {
    try {
      if (!db) {
        // Skip storing if database is not available
        return;
      }
      
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO resource_history (
            timestamp, cpu_usage, memory_usage, disk_usage, 
            memory_total, memory_used, disk_total, disk_used,
            cpu_health, memory_health, disk_health, overall_health
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            stats.timestamp,
            stats.cpu.usage_percent,
            stats.memory.usage_percent,
            stats.disk.usage_percent,
            stats.memory.total_bytes,
            stats.memory.used_bytes,
            stats.disk.total_bytes,
            stats.disk.used_bytes,
            stats.cpu.health,
            stats.memory.health,
            stats.disk.health,
            stats.overall_health
          ],
          (err) => {
            if (err) {
              console.error('Error storing historical data:', err.message);
              reject(err);
            } else {
              resolve();
            }
          }
        );
      });
    } catch (error) {
      console.error('Error storing historical data:', error);
    }
  }

  // Clean up old historical data
  async cleanupHistoricalData() {
    try {
      const cutoffTime = new Date(Date.now() - (RESOURCE_CONFIG.HISTORY_RETENTION_HOURS * 60 * 60 * 1000));
      
      await new Promise((resolve, reject) => {
        db.run(
          'DELETE FROM resource_history WHERE timestamp < ?',
          [cutoffTime.toISOString()],
          function(err) {
            if (err) {
              console.error('Error cleaning up historical data:', err.message);
              reject(err);
            } else {
              if (this.changes > 0) {
                console.log(`Cleaned up ${this.changes} old resource history records`);
              }
              resolve();
            }
          }
        );
      });
      
      // Also clean up old alerts
      await new Promise((resolve, reject) => {
        db.run(
          'DELETE FROM resource_alerts WHERE created_at < ?',
          [cutoffTime.toISOString()],
          function(err) {
            if (err) {
              console.error('Error cleaning up old alerts:', err.message);
              reject(err);
            } else {
              if (this.changes > 0) {
                console.log(`Cleaned up ${this.changes} old alert records`);
              }
              resolve();
            }
          }
        );
      });
      
    } catch (error) {
      console.error('Error during historical data cleanup:', error);
    }
  }

  // Get historical data for charts
  async getHistoricalData(hours = 24) {
    try {
      const cutoffTime = new Date(Date.now() - (hours * 60 * 60 * 1000));
      
      return new Promise((resolve, reject) => {
        db.all(
          `SELECT * FROM resource_history 
           WHERE timestamp >= ? 
           ORDER BY timestamp ASC`,
          [cutoffTime.toISOString()],
          (err, rows) => {
            if (err) {
              reject(err);
            } else {
              resolve(rows);
            }
          }
        );
      });
    } catch (error) {
      console.error('Error getting historical data:', error);
      return [];
    }
  }

  // Get recent alerts
  async getRecentAlerts(hours = 24) {
    try {
      const cutoffTime = new Date(Date.now() - (hours * 60 * 60 * 1000));
      
      return new Promise((resolve, reject) => {
        db.all(
          `SELECT * FROM resource_alerts 
           WHERE created_at >= ? 
           ORDER BY created_at DESC`,
          [cutoffTime.toISOString()],
          (err, rows) => {
            if (err) {
              reject(err);
            } else {
              resolve(rows);
            }
          }
        );
      });
    } catch (error) {
      console.error('Error getting recent alerts:', error);
      return [];
    }
  }

  // Start monitoring
  startMonitoring() {
    if (this.isMonitoring) {
      console.log('Resource monitoring already running');
      return;
    }

    console.log('Starting resource monitoring...');
    this.isMonitoring = true;

    // Initial stats collection
    this.getCurrentStats();

    // Set up periodic monitoring
    monitoringInterval = setInterval(async () => {
      try {
        const stats = await this.getCurrentStats();
        
        // Check for alerts
        await this.checkAlerts(stats);
        
        // Store historical data (every 5th sample to reduce storage)
        if (Math.random() < 0.2) { // 20% chance = roughly every 5th sample
          await this.storeHistoricalData(stats);
        }
        
        // Clean up old data (every hour)
        if (Math.random() < 0.0003) { // Very low chance = roughly every hour
          await this.cleanupHistoricalData();
        }
        
      } catch (error) {
        console.error('Error in resource monitoring cycle:', error);
      }
    }, RESOURCE_CONFIG.MONITORING_INTERVAL);

    console.log(`Resource monitoring started with ${RESOURCE_CONFIG.MONITORING_INTERVAL}ms interval`);
  }

  // Stop monitoring
  stopMonitoring() {
    if (!this.isMonitoring) {
      console.log('Resource monitoring not running');
      return;
    }

    console.log('Stopping resource monitoring...');
    this.isMonitoring = false;

    if (monitoringInterval) {
      clearInterval(monitoringInterval);
      monitoringInterval = null;
    }

    console.log('Resource monitoring stopped');
  }

  // Get monitoring status
  getMonitoringStatus() {
    return {
      isMonitoring: this.isMonitoring,
      interval: RESOURCE_CONFIG.MONITORING_INTERVAL,
      currentStats: this.currentStats,
      config: RESOURCE_CONFIG
    };
  }
}

// Process watchdog functionality
class ProcessWatchdog {
  constructor() {
    this.watchedProcesses = new Map();
    this.watchdogInterval = null;
  }

  // Add process to watchdog
  addProcess(channelId, pid, limits = {}) {
    const processInfo = {
      pid: pid,
      channelId: channelId,
      startTime: Date.now(),
      limits: {
        maxMemoryMB: limits.maxMemoryMB || 500,      // 500MB default
        maxRuntimeMinutes: limits.maxRuntimeMinutes || 1440, // 24 hours default
        maxCpuPercent: limits.maxCpuPercent || 80     // 80% CPU default
      },
      violations: 0,
      lastCheck: Date.now()
    };

    this.watchedProcesses.set(channelId, processInfo);
    console.log(`Added process ${pid} (channel ${channelId}) to watchdog`);
  }

  // Remove process from watchdog
  removeProcess(channelId) {
    if (this.watchedProcesses.has(channelId)) {
      this.watchedProcesses.delete(channelId);
      console.log(`Removed channel ${channelId} from watchdog`);
    }
  }

  // Check process limits
  async checkProcessLimits() {
    for (const [channelId, processInfo] of this.watchedProcesses) {
      try {
        const now = Date.now();
        const runtime = now - processInfo.startTime;
        
        // Check runtime limit
        if (runtime > (processInfo.limits.maxRuntimeMinutes * 60 * 1000)) {
          console.log(`Process ${processInfo.pid} (channel ${channelId}) exceeded runtime limit`);
          await this.killProcess(channelId, 'runtime_limit_exceeded');
          continue;
        }

        // Check if process still exists
        try {
          process.kill(processInfo.pid, 0); // Signal 0 just checks if process exists
        } catch (error) {
          // Process doesn't exist anymore
          console.log(`Process ${processInfo.pid} (channel ${channelId}) no longer exists`);
          this.removeProcess(channelId);
          continue;
        }

        // TODO: Add memory and CPU checking using a library like 'pidusage'
        // For now, we'll just track basic runtime limits
        
        processInfo.lastCheck = now;
        
      } catch (error) {
        console.error(`Error checking process limits for channel ${channelId}:`, error);
      }
    }
  }

  // Kill process that exceeded limits
  async killProcess(channelId, reason) {
    try {
      const processInfo = this.watchedProcesses.get(channelId);
      if (!processInfo) return;

      console.log(`Killing process ${processInfo.pid} (channel ${channelId}) due to: ${reason}`);
      
      // Try graceful termination first
      process.kill(processInfo.pid, 'SIGTERM');
      
      // If still running after 5 seconds, force kill
      setTimeout(() => {
        try {
          process.kill(processInfo.pid, 'SIGKILL');
        } catch (error) {
          // Process might already be dead
        }
      }, 5000);

      // Log the action
      const logAction = require('./enhanced-transcoding').logAction;
      if (logAction) {
        logAction('watchdog_kill', `Process killed by watchdog: ${reason}`, channelId, {
          pid: processInfo.pid,
          reason: reason,
          runtime: Date.now() - processInfo.startTime
        });
      }

      // Remove from watchdog
      this.removeProcess(channelId);

    } catch (error) {
      console.error(`Error killing process for channel ${channelId}:`, error);
    }
  }

  // Start watchdog
  startWatchdog() {
    if (this.watchdogInterval) {
      console.log('Process watchdog already running');
      return;
    }

    console.log('Starting process watchdog...');
    
    this.watchdogInterval = setInterval(() => {
      this.checkProcessLimits();
    }, 30000); // Check every 30 seconds

    console.log('Process watchdog started');
  }

  // Stop watchdog
  stopWatchdog() {
    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval);
      this.watchdogInterval = null;
      console.log('Process watchdog stopped');
    }
  }

  // Get watchdog status
  getWatchdogStatus() {
    return {
      isRunning: !!this.watchdogInterval,
      watchedProcesses: this.watchedProcesses.size,
      processes: Array.from(this.watchedProcesses.values())
    };
  }
}

// Create global instances
const resourceMonitor = new ResourceMonitor();
const processWatchdog = new ProcessWatchdog();

// Initialize resource monitoring
const initializeResourceMonitoring = async () => {
  try {
    console.log('Initializing resource monitoring...');
    
    // Start resource monitoring
    resourceMonitor.startMonitoring();
    
    // Start process watchdog
    processWatchdog.startWatchdog();
    
    console.log('Resource monitoring initialized successfully');
    
  } catch (error) {
    console.error('Error initializing resource monitoring:', error);
  }
};

// Cleanup resource monitoring
const cleanupResourceMonitoring = async () => {
  try {
    console.log('Cleaning up resource monitoring...');
    
    // Stop monitoring
    resourceMonitor.stopMonitoring();
    
    // Stop watchdog
    processWatchdog.stopWatchdog();
    
    console.log('Resource monitoring cleanup completed');
    
  } catch (error) {
    console.error('Error cleaning up resource monitoring:', error);
  }
};

module.exports = {
  resourceMonitor,
  processWatchdog,
  initializeResourceMonitoring,
  cleanupResourceMonitoring,
  setDatabase,
  getDatabase,
  RESOURCE_CONFIG
};
