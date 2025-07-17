const express = require('express');
const router = express.Router();
const { db } = require('../index');
const streamHealthMonitor = require('../services/stream-health-monitor');

// Helper function for async route handling
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(err => {
      console.error('Stream health route error:', err);
      res.status(500).json({ error: err.message || 'Internal server error' });
    });
  };
}

// Get system health overview
router.get('/overview', asyncHandler(async (req, res) => {
  try {
    const overview = streamHealthMonitor.getSystemHealthOverview();
    res.json({
      success: true,
      data: overview
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

// Get health status for a specific channel
router.get('/channel/:channelId/status', asyncHandler(async (req, res) => {
  const { channelId } = req.params;

  try {
    const status = await streamHealthMonitor.getChannelHealthStatus(channelId);
    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

// Get health history for a specific channel
router.get('/channel/:channelId/history', asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  const limit = parseInt(req.query.limit) || 100;

  try {
    const history = await streamHealthMonitor.getChannelHealthHistory(channelId, limit);
    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

// Get active alerts
router.get('/alerts', asyncHandler(async (req, res) => {
  const channelId = req.query.channelId ? parseInt(req.query.channelId) : null;

  try {
    const alerts = await streamHealthMonitor.getActiveAlerts(channelId);
    res.json({
      success: true,
      data: alerts
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

// Acknowledge an alert
router.post('/alerts/:alertId/acknowledge', asyncHandler(async (req, res) => {
  const { alertId } = req.params;

  try {
    const now = new Date().toISOString();
    
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE stream_health_alerts SET acknowledged_at = ? WHERE id = ?',
        [now, alertId],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });

    res.json({
      success: true,
      message: 'Alert acknowledged successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

// Resolve an alert
router.post('/alerts/:alertId/resolve', asyncHandler(async (req, res) => {
  const { alertId } = req.params;

  try {
    const now = new Date().toISOString();
    
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE stream_health_alerts SET resolved_at = ?, auto_resolved = 0 WHERE id = ?',
        [now, alertId],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });

    res.json({
      success: true,
      message: 'Alert resolved successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

// Get health statistics for all channels
router.get('/statistics', asyncHandler(async (req, res) => {
  try {
    const stats = await new Promise((resolve, reject) => {
      db.all(`
        SELECT 
          c.id,
          c.name,
          c.stream_health_status,
          c.last_health_check,
          c.avg_response_time,
          c.uptime_percentage,
          COUNT(h.id) as total_checks,
          COUNT(CASE WHEN h.availability_status = 'available' THEN 1 END) as successful_checks,
          COUNT(CASE WHEN h.availability_status = 'unavailable' THEN 1 END) as failed_checks,
          COUNT(CASE WHEN h.availability_status = 'timeout' THEN 1 END) as timeout_checks
        FROM channels c
        LEFT JOIN stream_health_history h ON c.id = h.channel_id 
          AND h.timestamp >= datetime('now', '-24 hours')
        WHERE c.transcoding_enabled = 1
        GROUP BY c.id, c.name, c.stream_health_status, c.last_health_check, c.avg_response_time, c.uptime_percentage
        ORDER BY c.name
      `, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

// Get health trends for dashboard
router.get('/trends', asyncHandler(async (req, res) => {
  const hours = parseInt(req.query.hours) || 24;
  const channelId = req.query.channelId ? parseInt(req.query.channelId) : null;

  try {
    let query = `
      SELECT 
        strftime('%Y-%m-%d %H:00:00', timestamp) as hour,
        COUNT(*) as total_checks,
        COUNT(CASE WHEN availability_status = 'available' THEN 1 END) as available_checks,
        COUNT(CASE WHEN availability_status = 'unavailable' THEN 1 END) as unavailable_checks,
        COUNT(CASE WHEN availability_status = 'timeout' THEN 1 END) as timeout_checks,
        AVG(response_time) as avg_response_time
      FROM stream_health_history
      WHERE timestamp >= datetime('now', '-${hours} hours')
    `;

    const params = [];
    if (channelId) {
      query += ' AND channel_id = ?';
      params.push(channelId);
    }

    query += `
      GROUP BY strftime('%Y-%m-%d %H:00:00', timestamp)
      ORDER BY hour
    `;

    const trends = await new Promise((resolve, reject) => {
      db.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });

    res.json({
      success: true,
      data: trends
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

// Force health check for a channel
router.post('/channel/:channelId/check', asyncHandler(async (req, res) => {
  const { channelId } = req.params;

  try {
    // Get channel data
    const channelData = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM channels WHERE id = ?',
        [channelId],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });

    if (!channelData) {
      return res.status(404).json({
        success: false,
        error: 'Channel not found'
      });
    }

    // Perform health check
    const result = await streamHealthMonitor.checkChannelHealth(channelId, channelData);

    res.json({
      success: true,
      data: result,
      message: 'Health check completed'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

// Get alert summary
router.get('/alerts/summary', asyncHandler(async (req, res) => {
  try {
    const summary = await new Promise((resolve, reject) => {
      db.all(`
        SELECT 
          alert_type,
          severity,
          COUNT(*) as count,
          COUNT(CASE WHEN acknowledged_at IS NULL THEN 1 END) as unacknowledged,
          COUNT(CASE WHEN resolved_at IS NULL THEN 1 END) as unresolved
        FROM stream_health_alerts
        WHERE triggered_at >= datetime('now', '-24 hours')
        GROUP BY alert_type, severity
        ORDER BY 
          CASE severity 
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'medium' THEN 3
            WHEN 'low' THEN 4
          END,
          count DESC
      `, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

// Get uptime statistics
router.get('/uptime', asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const channelId = req.query.channelId ? parseInt(req.query.channelId) : null;

  try {
    let query = `
      SELECT 
        date(timestamp) as date,
        COUNT(*) as total_checks,
        COUNT(CASE WHEN availability_status = 'available' THEN 1 END) as available_checks,
        ROUND(
          (COUNT(CASE WHEN availability_status = 'available' THEN 1 END) * 100.0 / COUNT(*)), 2
        ) as uptime_percentage
      FROM stream_health_history
      WHERE timestamp >= datetime('now', '-${days} days')
    `;

    const params = [];
    if (channelId) {
      query += ' AND channel_id = ?';
      params.push(channelId);
    }

    query += `
      GROUP BY date(timestamp)
      ORDER BY date
    `;

    const uptime = await new Promise((resolve, reject) => {
      db.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });

    res.json({
      success: true,
      data: uptime
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

// Cleanup old health history
router.post('/cleanup', asyncHandler(async (req, res) => {
  const daysToKeep = parseInt(req.body.daysToKeep) || 7;

  try {
    const deletedCount = await streamHealthMonitor.cleanupOldHealthHistory(daysToKeep);
    
    res.json({
      success: true,
      message: `Cleaned up ${deletedCount} old health history records`,
      deletedCount
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

// Get monitoring configuration
router.get('/config', asyncHandler(async (req, res) => {
  try {
    const config = {
      healthCheckInterval: streamHealthMonitor.healthCheckInterval,
      retryDelay: streamHealthMonitor.retryDelay,
      maxRetries: streamHealthMonitor.maxRetries,
      alertThresholds: streamHealthMonitor.alertThresholds,
      activeChannels: streamHealthMonitor.activeChannels.size,
      isMonitoring: streamHealthMonitor.monitoringInterval !== null
    };

    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

module.exports = router;
