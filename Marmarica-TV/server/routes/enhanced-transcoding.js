const express = require('express');
const router = express.Router();
const { db } = require('../index');
const enhancedTranscoding = require('../services/enhanced-transcoding');
const { resourceMonitor, processWatchdog } = require('../services/resource-monitor');

// Helper function to handle async routes
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Get system health and resource usage
router.get('/system-health', asyncHandler(async (req, res) => {
  try {
    const systemHealth = await enhancedTranscoding.getSystemHealth();
    res.json({ data: systemHealth });
  } catch (error) {
    console.error('Error getting system health:', error);
    res.status(500).json({ error: 'Failed to get system health' });
  }
}));

// Get resource monitoring stats
router.get('/resource-stats', asyncHandler(async (req, res) => {
  try {
    const stats = await resourceMonitor.getCurrentStats();
    res.json({ data: stats });
  } catch (error) {
    console.error('Error getting resource stats:', error);
    res.status(500).json({ error: 'Failed to get resource stats' });
  }
}));

// Get resource monitoring history
router.get('/resource-history', asyncHandler(async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    const history = await resourceMonitor.getHistoricalData(hours);
    res.json({ data: history });
  } catch (error) {
    console.error('Error getting resource history:', error);
    res.status(500).json({ error: 'Failed to get resource history' });
  }
}));

// Get recent resource alerts
router.get('/resource-alerts', asyncHandler(async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    const alerts = await resourceMonitor.getRecentAlerts(hours);
    res.json({ data: alerts });
  } catch (error) {
    console.error('Error getting resource alerts:', error);
    res.status(500).json({ error: 'Failed to get resource alerts' });
  }
}));

// Get process watchdog status
router.get('/watchdog-status', asyncHandler(async (req, res) => {
  try {
    const status = processWatchdog.getWatchdogStatus();
    res.json({ data: status });
  } catch (error) {
    console.error('Error getting watchdog status:', error);
    res.status(500).json({ error: 'Failed to get watchdog status' });
  }
}));

// Bulk start transcoding
router.post('/bulk-start', asyncHandler(async (req, res) => {
  try {
    const { channelIds, staggerDelay } = req.body;
    
    if (!channelIds || !Array.isArray(channelIds)) {
      return res.status(400).json({ error: 'channelIds must be an array' });
    }
    
    const results = await enhancedTranscoding.bulkStartTranscoding(channelIds, staggerDelay);
    
    res.json({
      message: 'Bulk transcoding start initiated',
      data: {
        totalChannels: channelIds.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results: results
      }
    });
    
  } catch (error) {
    console.error('Error in bulk start transcoding:', error);
    res.status(500).json({ error: 'Failed to start bulk transcoding' });
  }
}));

// Bulk stop transcoding
router.post('/bulk-stop', asyncHandler(async (req, res) => {
  try {
    const { channelIds } = req.body;
    
    if (!channelIds || !Array.isArray(channelIds)) {
      return res.status(400).json({ error: 'channelIds must be an array' });
    }
    
    const results = await enhancedTranscoding.bulkStopTranscoding(channelIds);
    
    res.json({
      message: 'Bulk transcoding stop initiated',
      data: {
        totalChannels: channelIds.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results: results
      }
    });
    
  } catch (error) {
    console.error('Error in bulk stop transcoding:', error);
    res.status(500).json({ error: 'Failed to stop bulk transcoding' });
  }
}));

// Emergency stop all transcoding
router.post('/emergency-stop', asyncHandler(async (req, res) => {
  try {
    const result = await enhancedTranscoding.emergencyStopAll();
    
    res.json({
      message: 'Emergency stop completed',
      data: result
    });
    
  } catch (error) {
    console.error('Error in emergency stop:', error);
    res.status(500).json({ error: 'Failed to perform emergency stop' });
  }
}));

// Get dead source channels
router.get('/dead-sources', asyncHandler(async (req, res) => {
  try {
    const deadSources = await enhancedTranscoding.getDeadSourceChannels();
    res.json({ data: deadSources });
  } catch (error) {
    console.error('Error getting dead source channels:', error);
    res.status(500).json({ error: 'Failed to get dead source channels' });
  }
}));

// Retry dead source channel
router.post('/retry-dead-source/:channelId', asyncHandler(async (req, res) => {
  try {
    const { channelId } = req.params;
    const result = await enhancedTranscoding.retryDeadSourceChannel(parseInt(channelId));
    
    res.json({
      message: 'Dead source retry initiated',
      data: result
    });
    
  } catch (error) {
    console.error('Error retrying dead source channel:', error);
    res.status(500).json({ error: 'Failed to retry dead source channel' });
  }
}));

// Get offline channels
router.get('/offline-channels', asyncHandler(async (req, res) => {
  try {
    const offlineChannels = await new Promise((resolve, reject) => {
      db.all(
        `SELECT id, name, url, transcoding_status, offline_reason, dead_source_count, last_dead_source_event
         FROM channels 
         WHERE transcoding_status IN ('offline_temporary', 'offline_permanent', 'dead_source')
         ORDER BY last_dead_source_event DESC`,
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
    
    res.json({ data: offlineChannels });
  } catch (error) {
    console.error('Error getting offline channels:', error);
    res.status(500).json({ error: 'Failed to get offline channels' });
  }
}));

// Mark channel as permanently offline
router.post('/mark-permanent-offline/:channelId', asyncHandler(async (req, res) => {
  try {
    const { channelId } = req.params;
    const { reason } = req.body;
    
    // Get channel info
    const channel = await new Promise((resolve, reject) => {
      db.get(
        'SELECT id, name FROM channels WHERE id = ?',
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
    
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    
    // Update channel status
    await new Promise((resolve, reject) => {
      const now = new Date().toISOString();
      db.run(
        'UPDATE channels SET transcoding_status = ?, offline_reason = ?, updated_at = ? WHERE id = ?',
        ['offline_permanent', reason || 'Manually marked as permanently offline', now, channelId],
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
    
    res.json({
      message: `Channel ${channel.name} marked as permanently offline`,
      data: { channelId: parseInt(channelId), status: 'offline_permanent' }
    });
    
  } catch (error) {
    console.error('Error marking channel as permanently offline:', error);
    res.status(500).json({ error: 'Failed to mark channel as permanently offline' });
  }
}));

// Get enhanced transcoding statistics
router.get('/enhanced-stats', asyncHandler(async (req, res) => {
  try {
    const stats = await new Promise((resolve, reject) => {
      db.get(
        `SELECT 
          COUNT(*) as total_channels,
          COUNT(CASE WHEN transcoding_enabled = 1 THEN 1 END) as enabled_channels,
          COUNT(CASE WHEN transcoding_status = 'active' THEN 1 END) as active_channels,
          COUNT(CASE WHEN transcoding_status = 'failed' THEN 1 END) as failed_channels,
          COUNT(CASE WHEN transcoding_status = 'offline_temporary' THEN 1 END) as offline_temporary,
          COUNT(CASE WHEN transcoding_status = 'offline_permanent' THEN 1 END) as offline_permanent,
          COUNT(CASE WHEN transcoding_status = 'dead_source' THEN 1 END) as dead_sources,
          AVG(dead_source_count) as avg_dead_source_count
         FROM channels`,
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });
    
    // Get job statistics
    const jobStats = await new Promise((resolve, reject) => {
      db.get(
        `SELECT 
          COUNT(*) as total_jobs,
          COUNT(CASE WHEN status = 'running' THEN 1 END) as running_jobs,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_jobs,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_jobs,
          COUNT(CASE WHEN status = 'stopped' THEN 1 END) as stopped_jobs
         FROM transcoding_jobs`,
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });
    
    // Get system health
    const systemHealth = await enhancedTranscoding.getSystemHealth();
    
    // Get storage stats
    const storageStats = enhancedTranscoding.getStorageStats();
    
    res.json({
      data: {
        channels: stats,
        jobs: jobStats,
        system: systemHealth,
        storage: storageStats
      }
    });
    
  } catch (error) {
    console.error('Error getting enhanced stats:', error);
    res.status(500).json({ error: 'Failed to get enhanced statistics' });
  }
}));

// Get fallback history for a channel
router.get('/fallback-history/:channelId', asyncHandler(async (req, res) => {
  try {
    const { channelId } = req.params;
    const { limit = 10 } = req.query;
    
    const fallbackHistory = await new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM actions 
         WHERE channel_id = ? AND action_type = 'transcoding_fallback' 
         ORDER BY created_at DESC 
         LIMIT ?`,
        [channelId, parseInt(limit)],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
    
    res.json({ data: fallbackHistory });
    
  } catch (error) {
    console.error('Error getting fallback history:', error);
    res.status(500).json({ error: 'Failed to get fallback history' });
  }
}));

// Get error patterns analysis
router.get('/error-patterns', asyncHandler(async (req, res) => {
  try {
    const { hours = 24 } = req.query;
    const cutoffTime = new Date(Date.now() - (hours * 60 * 60 * 1000));
    
    const errorPatterns = await new Promise((resolve, reject) => {
      db.all(
        `SELECT 
          action_type,
          COUNT(*) as count,
          additional_data,
          MAX(created_at) as last_occurrence
         FROM actions 
         WHERE created_at >= ? AND action_type IN ('transcoding_failed', 'transcoding_error', 'dead_source_detected')
         GROUP BY action_type
         ORDER BY count DESC`,
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
    
    res.json({ data: errorPatterns });
    
  } catch (error) {
    console.error('Error getting error patterns:', error);
    res.status(500).json({ error: 'Failed to get error patterns' });
  }
}));

// Get resource availability for profile type
router.get('/resource-availability/:profileId', asyncHandler(async (req, res) => {
  try {
    const { profileId } = req.params;
    const availability = await enhancedTranscoding.checkResourceAvailability(parseInt(profileId));
    
    res.json({ data: availability });
    
  } catch (error) {
    console.error('Error checking resource availability:', error);
    res.status(500).json({ error: 'Failed to check resource availability' });
  }
}));

// Manual fallback for a channel
router.post('/manual-fallback/:channelId', asyncHandler(async (req, res) => {
  try {
    const { channelId } = req.params;
    const { profileId } = req.body;
    
    // Get channel info
    const channel = await new Promise((resolve, reject) => {
      db.get(
        'SELECT id, name, url, transcoding_enabled FROM channels WHERE id = ?',
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
    
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    
    if (!channel.transcoding_enabled) {
      return res.status(400).json({ error: 'Transcoding not enabled for this channel' });
    }
    
    // Stop current transcoding
    await enhancedTranscoding.stopTranscoding(channel.id, channel.name);
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Start with new profile
    const result = await enhancedTranscoding.startTranscoding(channel.id, channel.url, channel.name, profileId);
    
    res.json({
      message: 'Manual fallback completed',
      data: result
    });
    
  } catch (error) {
    console.error('Error in manual fallback:', error);
    res.status(500).json({ error: 'Failed to perform manual fallback' });
  }
}));

module.exports = router;
