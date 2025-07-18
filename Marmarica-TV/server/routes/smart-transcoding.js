const express = require('express');
const router = express.Router();
const SmartTranscodingEngine = require('../services/smart-transcoding');
const StreamAnalyzer = require('../services/stream-analyzer');
const streamHealthMonitor = require('../services/stream-health-monitor');
const SmartTranscodingSchema = require('../scripts/smart-transcoding-schema');

// Initialize smart transcoding engine
const smartTranscodingEngine = new SmartTranscodingEngine();

// Helper function to handle async routes
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Initialize smart transcoding engine with database
router.use((req, res, next) => {
  if (!smartTranscodingEngine.db) {
    const { db } = require('../index');
    smartTranscodingEngine.setDatabase(db);
  }
  next();
});

// Analyze stream endpoint
router.post('/analyze/:channelId', asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  const { forceRefresh = false } = req.body;
  
  try {
    // Get channel info
    const { db } = require('../index');
    const channel = await new Promise((resolve, reject) => {
      db.get(
        'SELECT id, name, url FROM channels WHERE id = ?',
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
    
    // Analyze stream
    const streamAnalyzer = new StreamAnalyzer();
    const analysis = await streamAnalyzer.analyzeStream(channel.url, !forceRefresh);
    
    // Cache analysis result
    await smartTranscodingEngine.cacheAnalysis(channelId, channel.url, analysis);
    
    res.json({
      success: true,
      data: {
        channelId: parseInt(channelId),
        channelName: channel.name,
        analysis: analysis,
        cached: !forceRefresh
      }
    });
    
  } catch (error) {
    console.error('Error analyzing stream:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to analyze stream',
      details: error.message 
    });
  }
}));

// Generate dynamic profile endpoint
router.post('/profile/:channelId', asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  const { options = {} } = req.body;
  
  try {
    // Get channel info
    const { db } = require('../index');
    const channel = await new Promise((resolve, reject) => {
      db.get(
        'SELECT id, name, url FROM channels WHERE id = ?',
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
    
    // Generate smart profile
    const profile = await smartTranscodingEngine.generateSmartProfile(channelId, channel.url, options);
    
    res.json({
      success: true,
      data: {
        channelId: parseInt(channelId),
        channelName: channel.name,
        profile: profile,
        isSmartProfile: profile.is_dynamic
      }
    });
    
  } catch (error) {
    console.error('Error generating profile:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to generate profile',
      details: error.message 
    });
  }
}));

// Start smart transcoding
router.post('/start/:channelId', asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  const { options = {} } = req.body;
  
  try {
    // Get channel info
    const { db } = require('../index');
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
    
    // Start smart transcoding
    const result = await smartTranscodingEngine.startSmartTranscoding(
      channel.id,
      channel.url,
      channel.name,
      options
    );
    
    res.json({
      success: true,
      message: 'Smart transcoding started successfully',
      data: result
    });
    
  } catch (error) {
    console.error('Error starting smart transcoding:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to start smart transcoding',
      details: error.message 
    });
  }
}));

// Stop smart transcoding
router.post('/stop/:channelId', asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  
  try {
    // Get channel info
    const { db } = require('../index');
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
    
    // Stop smart transcoding
    const result = await smartTranscodingEngine.stopTranscoding(channel.id, channel.name);
    
    res.json({
      success: true,
      message: 'Smart transcoding stopped successfully',
      data: result
    });
    
  } catch (error) {
    console.error('Error stopping smart transcoding:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to stop smart transcoding',
      details: error.message 
    });
  }
}));

// Get smart transcoding statistics
router.get('/stats', asyncHandler(async (req, res) => {
  try {
    const systemStats = smartTranscodingEngine.getSystemStats();
    const schemaManager = new SmartTranscodingSchema();
    const dbStats = await schemaManager.getSmartTranscodingStats();
    
    res.json({
      success: true,
      data: {
        system: systemStats,
        database: dbStats,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('Error getting smart transcoding stats:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get statistics',
      details: error.message 
    });
  }
}));

// Get fallback statistics for a channel
router.get('/fallback/:channelId', asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  
  try {
    const fallbackStats = smartTranscodingEngine.fallbackManager.getFallbackStats(parseInt(channelId));
    
    res.json({
      success: true,
      data: fallbackStats
    });
    
  } catch (error) {
    console.error('Error getting fallback stats:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get fallback statistics',
      details: error.message 
    });
  }
}));

// Reset fallback tracking for a channel
router.post('/fallback/reset/:channelId', asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  
  try {
    smartTranscodingEngine.fallbackManager.resetFallbackTracking(parseInt(channelId));
    
    res.json({
      success: true,
      message: 'Fallback tracking reset successfully'
    });
    
  } catch (error) {
    console.error('Error resetting fallback tracking:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to reset fallback tracking',
      details: error.message 
    });
  }
}));

// Get cached analysis for a channel
router.get('/cache/:channelId', asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  
  try {
    // Get channel info
    const { db } = require('../index');
    const channel = await new Promise((resolve, reject) => {
      db.get(
        'SELECT id, name, url FROM channels WHERE id = ?',
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
    
    // Get cached analysis
    const cachedAnalysis = await smartTranscodingEngine.getCachedAnalysis(channelId, channel.url);
    
    res.json({
      success: true,
      data: {
        channelId: parseInt(channelId),
        channelName: channel.name,
        hasCache: !!cachedAnalysis,
        analysis: cachedAnalysis,
        isValid: cachedAnalysis ? smartTranscodingEngine.isAnalysisValid(cachedAnalysis) : false
      }
    });
    
  } catch (error) {
    console.error('Error getting cached analysis:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get cached analysis',
      details: error.message 
    });
  }
}));

// Clear analysis cache
router.delete('/cache/:channelId', asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  
  try {
    const { db } = require('../index');
    
    // Clear from database cache
    await new Promise((resolve, reject) => {
      db.run(
        'DELETE FROM stream_analysis_cache WHERE channel_id = ?',
        [channelId],
        function(err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.changes);
          }
        }
      );
    });
    
    // Clear from memory cache
    const streamAnalyzer = new StreamAnalyzer();
    streamAnalyzer.clearCache();
    
    res.json({
      success: true,
      message: 'Analysis cache cleared successfully'
    });
    
  } catch (error) {
    console.error('Error clearing analysis cache:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to clear analysis cache',
      details: error.message 
    });
  }
}));

// Bulk smart transcoding operations
router.post('/bulk/start', asyncHandler(async (req, res) => {
  const { channelIds, options = {} } = req.body;
  
  if (!Array.isArray(channelIds) || channelIds.length === 0) {
    return res.status(400).json({ error: 'Channel IDs array is required' });
  }
  
  try {
    const results = [];
    
    for (const channelId of channelIds) {
      try {
        // Get channel info
        const { db } = require('../index');
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
          results.push({ channelId, success: false, error: 'Channel not found' });
          continue;
        }
        
        if (!channel.transcoding_enabled) {
          results.push({ channelId, success: false, error: 'Transcoding not enabled' });
          continue;
        }
        
        // Start smart transcoding
        const result = await smartTranscodingEngine.startSmartTranscoding(
          channel.id,
          channel.url,
          channel.name,
          options
        );
        
        results.push({ channelId, success: true, result });
        
        // Small delay between starts to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`Error starting smart transcoding for channel ${channelId}:`, error);
        results.push({ channelId, success: false, error: error.message });
      }
    }
    
    res.json({
      success: true,
      message: `Bulk smart transcoding initiated for ${channelIds.length} channels`,
      data: results
    });
    
  } catch (error) {
    console.error('Error in bulk smart transcoding:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to start bulk smart transcoding',
      details: error.message 
    });
  }
}));

// Get stream health combined with smart transcoding status
router.get('/health/:channelId', asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  
  try {
    // Get channel info
    const { db } = require('../index');
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
    
    // Get stream health status
    const healthStatus = await streamHealthMonitor.getChannelHealthStatus(channelId);
    
    // Get smart transcoding status
    const fallbackStats = smartTranscodingEngine.fallbackManager.getFallbackStats(parseInt(channelId));
    const cachedAnalysis = await smartTranscodingEngine.getCachedAnalysis(channelId, channel.url);
    
    res.json({
      success: true,
      data: {
        channelId: parseInt(channelId),
        channelName: channel.name,
        health: {
          status: healthStatus?.availability_status || 'unknown',
          responseTime: healthStatus?.response_time || null,
          lastCheck: healthStatus?.last_check || null,
          uptime: channel.uptime_percentage || null
        },
        smartTranscoding: {
          enabled: channel.smart_transcoding_enabled,
          stabilityScore: channel.stream_stability_score,
          lastAnalysis: channel.last_analysis_timestamp,
          fallbackLevel: fallbackStats.level,
          hasCachedAnalysis: !!cachedAnalysis
        },
        transcoding: {
          enabled: channel.transcoding_enabled,
          status: channel.transcoding_status,
          url: channel.transcoded_url
        }
      }
    });
    
  } catch (error) {
    console.error('Error getting stream health:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get stream health',
      details: error.message 
    });
  }
}));

// Initialize smart transcoding schema
router.post('/init', asyncHandler(async (req, res) => {
  try {
    const schemaManager = new SmartTranscodingSchema();
    await schemaManager.runAllUpdates();
    
    res.json({
      success: true,
      message: 'Smart transcoding schema initialized successfully'
    });
    
  } catch (error) {
    console.error('Error initializing smart transcoding schema:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to initialize schema',
      details: error.message 
    });
  }
}));

module.exports = router;
