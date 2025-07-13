const express = require('express');
const router = express.Router();
const { db } = require('../index');
const transcodingService = require('../services/transcoding');

// Helper function to handle async routes
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Get all transcoding jobs
router.get('/jobs', asyncHandler(async (req, res) => {
  try {
    const jobs = await transcodingService.getActiveJobs();
    res.json({ data: jobs });
  } catch (error) {
    console.error('Error fetching transcoding jobs:', error);
    res.status(500).json({ error: 'Failed to fetch transcoding jobs' });
  }
}));

// Get transcoding status for a specific channel
router.get('/status/:channelId', asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  
  try {
    const channel = await new Promise((resolve, reject) => {
      db.get(
        'SELECT id, name, transcoding_enabled, transcoding_status, transcoded_url FROM channels WHERE id = ?',
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
    
    // Get latest transcoding job info
    const job = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM transcoding_jobs WHERE channel_id = ? ORDER BY created_at DESC LIMIT 1',
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
    
    res.json({
      data: {
        channel: channel,
        job: job
      }
    });
    
  } catch (error) {
    console.error('Error fetching transcoding status:', error);
    res.status(500).json({ error: 'Failed to fetch transcoding status' });
  }
}));

// Start transcoding for a channel
router.post('/start/:channelId', asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  
  try {
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
      return res.status(400).json({ error: 'Transcoding is not enabled for this channel' });
    }
    
    // Start transcoding
    const result = await transcodingService.startTranscoding(
      channel.id,
      channel.url,
      channel.name
    );
    
    res.json({
      message: 'Transcoding started successfully',
      data: result
    });
    
  } catch (error) {
    console.error('Error starting transcoding:', error);
    res.status(500).json({ error: 'Failed to start transcoding' });
  }
}));

// Stop transcoding for a channel
router.post('/stop/:channelId', asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  
  try {
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
    
    // Stop transcoding
    const result = await transcodingService.stopTranscoding(
      channel.id,
      channel.name
    );
    
    res.json({
      message: 'Transcoding stopped successfully',
      data: result
    });
    
  } catch (error) {
    console.error('Error stopping transcoding:', error);
    res.status(500).json({ error: 'Failed to stop transcoding' });
  }
}));

// Restart transcoding for a channel
router.post('/restart/:channelId', asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  
  try {
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
      return res.status(400).json({ error: 'Transcoding is not enabled for this channel' });
    }
    
    // Restart transcoding
    const result = await transcodingService.restartTranscoding(
      channel.id,
      channel.url,
      channel.name
    );
    
    res.json({
      message: 'Transcoding restarted successfully',
      data: result
    });
    
  } catch (error) {
    console.error('Error restarting transcoding:', error);
    res.status(500).json({ error: 'Failed to restart transcoding' });
  }
}));

// Toggle transcoding for a channel
router.post('/toggle/:channelId', asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  const { enabled } = req.body;
  
  try {
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
    
    // Update transcoding enabled status
    const now = new Date().toISOString();
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE channels SET transcoding_enabled = ?, updated_at = ? WHERE id = ?',
        [enabled ? 1 : 0, now, channelId],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
    
    if (enabled) {
      // Start transcoding
      await transcodingService.startTranscoding(
        channel.id,
        channel.url,
        channel.name
      );
      
      res.json({
        message: 'Transcoding enabled and started',
        data: { transcoding_enabled: true }
      });
    } else {
      // Stop transcoding
      await transcodingService.stopTranscoding(
        channel.id,
        channel.name
      );
      
      res.json({
        message: 'Transcoding disabled and stopped',
        data: { transcoding_enabled: false }
      });
    }
    
  } catch (error) {
    console.error('Error toggling transcoding:', error);
    res.status(500).json({ error: 'Failed to toggle transcoding' });
  }
}));

// Get transcoding jobs history for a channel
router.get('/history/:channelId', asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  const { limit = 10 } = req.query;
  
  try {
    const jobs = await new Promise((resolve, reject) => {
      db.all(
        `SELECT j.*, c.name as channel_name 
         FROM transcoding_jobs j 
         JOIN channels c ON j.channel_id = c.id 
         WHERE j.channel_id = ? 
         ORDER BY j.created_at DESC 
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
    
    res.json({ data: jobs });
    
  } catch (error) {
    console.error('Error fetching transcoding history:', error);
    res.status(500).json({ error: 'Failed to fetch transcoding history' });
  }
}));

// Get transcoding statistics
router.get('/stats', asyncHandler(async (req, res) => {
  try {
    const stats = await new Promise((resolve, reject) => {
      db.get(
        `SELECT 
          COUNT(*) as total_jobs,
          COUNT(CASE WHEN status = 'running' THEN 1 END) as running_jobs,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_jobs,
          COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_jobs,
          (SELECT COUNT(*) FROM channels WHERE transcoding_enabled = 1) as enabled_channels
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
    
    res.json({ data: stats });
    
  } catch (error) {
    console.error('Error fetching transcoding stats:', error);
    res.status(500).json({ error: 'Failed to fetch transcoding statistics' });
  }
}));

// Get storage statistics
router.get('/storage', asyncHandler(async (req, res) => {
  try {
    const storageStats = transcodingService.getStorageStats();
    res.json({ data: storageStats });
  } catch (error) {
    console.error('Error fetching storage stats:', error);
    res.status(500).json({ error: 'Failed to fetch storage statistics' });
  }
}));

// Manual cleanup trigger
router.post('/cleanup', asyncHandler(async (req, res) => {
  try {
    console.log('Manual cleanup triggered via API');
    await transcodingService.performPeriodicCleanup();
    
    res.json({
      message: 'Manual cleanup completed successfully',
      data: { cleanup_triggered: true }
    });
    
  } catch (error) {
    console.error('Error during manual cleanup:', error);
    res.status(500).json({ error: 'Failed to perform cleanup' });
  }
}));

// Clean up specific channel segments
router.post('/cleanup/:channelId', asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  
  try {
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
    
    console.log(`Manual cleanup triggered for channel ${channelId}: ${channel.name}`);
    const result = await transcodingService.cleanupChannelSegments(parseInt(channelId));
    
    res.json({
      message: `Cleanup completed for channel: ${channel.name}`,
      data: {
        channel_id: parseInt(channelId),
        channel_name: channel.name,
        files_cleaned: result.cleaned,
        size_freed_bytes: result.size_freed,
        size_freed_mb: Math.round(result.size_freed / 1024 / 1024 * 100) / 100
      }
    });
    
  } catch (error) {
    console.error('Error during channel cleanup:', error);
    res.status(500).json({ error: 'Failed to cleanup channel segments' });
  }
}));

module.exports = router;
