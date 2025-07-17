const express = require('express');
const router = express.Router();
const { db } = require('../index');
const optimizedTranscodingService = require('../services/optimized-transcoding');

// Helper function for async route handling
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(err => {
      console.error('Optimized transcoding route error:', err);
      res.status(500).json({ error: err.message || 'Internal server error' });
    });
  };
}

// Start optimized transcoding for a channel
router.post('/start/:channelId', asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  const { profileId } = req.body;

  // Get channel information
  const channel = await new Promise((resolve, reject) => {
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

  if (!channel) {
    return res.status(404).json({ error: 'Channel not found' });
  }

  if (!channel.transcoding_enabled) {
    return res.status(400).json({ error: 'Transcoding is not enabled for this channel' });
  }

  try {
    const result = await optimizedTranscodingService.startTranscoding(
      channel.id,
      channel.url,
      channel.name,
      profileId
    );

    res.json({
      success: true,
      message: 'Optimized transcoding started successfully',
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

// Stop optimized transcoding for a channel
router.post('/stop/:channelId', asyncHandler(async (req, res) => {
  const { channelId } = req.params;

  // Get channel information
  const channel = await new Promise((resolve, reject) => {
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

  if (!channel) {
    return res.status(404).json({ error: 'Channel not found' });
  }

  try {
    const result = await optimizedTranscodingService.stopTranscoding(
      channel.id,
      channel.name
    );

    res.json({
      success: true,
      message: 'Optimized transcoding stopped successfully',
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

// Restart optimized transcoding for a channel
router.post('/restart/:channelId', asyncHandler(async (req, res) => {
  const { channelId } = req.params;

  // Get channel information
  const channel = await new Promise((resolve, reject) => {
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

  if (!channel) {
    return res.status(404).json({ error: 'Channel not found' });
  }

  try {
    const result = await optimizedTranscodingService.restartTranscoding(
      channel.id,
      channel.url,
      channel.name
    );

    res.json({
      success: true,
      message: 'Optimized transcoding restarted successfully',
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

// Get active optimized transcoding jobs
router.get('/jobs', asyncHandler(async (req, res) => {
  try {
    const jobs = await optimizedTranscodingService.getActiveJobs();
    res.json({
      success: true,
      data: jobs
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

// Get system health status
router.get('/health', asyncHandler(async (req, res) => {
  try {
    const health = await optimizedTranscodingService.getSystemHealth();
    res.json({
      success: true,
      data: health
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

// Get storage statistics
router.get('/storage', asyncHandler(async (req, res) => {
  try {
    const stats = optimizedTranscodingService.getStorageStats();
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

// Bulk start transcoding
router.post('/bulk/start', asyncHandler(async (req, res) => {
  const { channelIds, staggerDelay = 2000 } = req.body;

  if (!Array.isArray(channelIds) || channelIds.length === 0) {
    return res.status(400).json({ error: 'Channel IDs array is required' });
  }

  try {
    const results = await optimizedTranscodingService.bulkStartTranscoding(
      channelIds,
      staggerDelay
    );

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    res.json({
      success: true,
      message: `Bulk start completed: ${successCount} successful, ${failCount} failed`,
      data: {
        total: results.length,
        successful: successCount,
        failed: failCount,
        results: results
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

// Bulk stop transcoding
router.post('/bulk/stop', asyncHandler(async (req, res) => {
  const { channelIds } = req.body;

  if (!Array.isArray(channelIds) || channelIds.length === 0) {
    return res.status(400).json({ error: 'Channel IDs array is required' });
  }

  try {
    const results = await optimizedTranscodingService.bulkStopTranscoding(channelIds);

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    res.json({
      success: true,
      message: `Bulk stop completed: ${successCount} successful, ${failCount} failed`,
      data: {
        total: results.length,
        successful: successCount,
        failed: failCount,
        results: results
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

// Manual cleanup for a specific channel
router.post('/cleanup/:channelId', asyncHandler(async (req, res) => {
  const { channelId } = req.params;

  try {
    const result = await optimizedTranscodingService.cleanupChannelSegments(channelId);
    res.json({
      success: true,
      message: 'Channel cleanup completed',
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

// Manual system-wide cleanup
router.post('/cleanup/system', asyncHandler(async (req, res) => {
  try {
    await optimizedTranscodingService.performPeriodicCleanup();
    res.json({
      success: true,
      message: 'System cleanup completed'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

// Get intelligent logger configuration
router.get('/logger/config', asyncHandler(async (req, res) => {
  try {
    const config = {
      logLevel: optimizedTranscodingService.intelligentLogger.logLevel,
      logLevels: optimizedTranscodingService.LOG_LEVELS,
      errorPatterns: optimizedTranscodingService.ERROR_PATTERNS,
      cleanupConfig: optimizedTranscodingService.CLEANUP_CONFIG
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

// Update intelligent logger log level
router.post('/logger/level', asyncHandler(async (req, res) => {
  const { logLevel } = req.body;

  if (typeof logLevel !== 'number' || logLevel < 0 || logLevel > 4) {
    return res.status(400).json({ error: 'Invalid log level. Must be 0-4' });
  }

  try {
    optimizedTranscodingService.intelligentLogger.setLogLevel(logLevel);
    res.json({
      success: true,
      message: 'Log level updated successfully',
      data: { logLevel }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

// Get channel-specific transcoding status
router.get('/status/:channelId', asyncHandler(async (req, res) => {
  const { channelId } = req.params;

  try {
    // Get channel information with transcoding status
    const channel = await new Promise((resolve, reject) => {
      db.get(
        `SELECT c.*, p.name as profile_name, j.status as job_status, j.ffmpeg_pid, j.error_message
         FROM channels c
         LEFT JOIN transcoding_profiles p ON c.transcoding_profile_id = p.id
         LEFT JOIN transcoding_jobs j ON c.id = j.channel_id AND j.status IN ('starting', 'running')
         WHERE c.id = ?`,
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

    res.json({
      success: true,
      data: {
        channel: channel,
        isActive: channel.transcoding_status === 'active',
        hasJob: !!channel.job_status,
        profile: channel.profile_name || 'Default'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

// Get system configuration
router.get('/config', asyncHandler(async (req, res) => {
  try {
    const config = {
      cleanup: optimizedTranscodingService.CLEANUP_CONFIG,
      errorPatterns: optimizedTranscodingService.ERROR_PATTERNS,
      logLevels: optimizedTranscodingService.LOG_LEVELS,
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        HLS_OUTPUT_BASE: process.env.HLS_OUTPUT_BASE,
        FFMPEG_PATH: process.env.FFMPEG_PATH,
        SERVER_BASE_URL: process.env.SERVER_BASE_URL
      }
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

// Stream health check endpoint
router.get('/health/stream/:channelId', asyncHandler(async (req, res) => {
  const { channelId } = req.params;

  try {
    // Get channel information
    const channel = await new Promise((resolve, reject) => {
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

    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    // Basic stream health check
    const healthCheck = {
      channelId: channel.id,
      channelName: channel.name,
      transcodingEnabled: channel.transcoding_enabled,
      transcodingStatus: channel.transcoding_status,
      lastUpdate: channel.updated_at,
      streamUrl: channel.url,
      transcodedUrl: channel.transcoded_url,
      isHealthy: channel.transcoding_status === 'active' && channel.transcoded_url
    };

    res.json({
      success: true,
      data: healthCheck
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

module.exports = router;
