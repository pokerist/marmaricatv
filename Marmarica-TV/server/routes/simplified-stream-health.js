const express = require('express');
const router = express.Router();
const { db } = require('../index');
const simplifiedStreamHealthService = require('../services/simplified-stream-health');

// Helper function to handle async routes
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Get health overview for all channels
router.get('/overview', asyncHandler(async (req, res) => {
  try {
    const overview = await simplifiedStreamHealthService.getHealthOverview();
    res.json({
      success: true,
      data: overview
    });
  } catch (error) {
    console.error('Error fetching health overview:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch health overview' 
    });
  }
}));

// Get health status for a specific channel
router.get('/channel/:channelId', asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  
  try {
    const healthStatus = simplifiedStreamHealthService.getChannelHealthStatus(parseInt(channelId));
    res.json({
      success: true,
      data: healthStatus
    });
  } catch (error) {
    console.error('Error fetching channel health:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch channel health status' 
    });
  }
}));

// Get health history for a specific channel
router.get('/history/:channelId', asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  const { limit = 50 } = req.query;
  
  try {
    const history = await simplifiedStreamHealthService.getChannelHealthHistory(
      parseInt(channelId), 
      parseInt(limit)
    );
    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error('Error fetching channel health history:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch channel health history' 
    });
  }
}));

// Check health of a specific channel manually
router.post('/check/:channelId', asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  
  try {
    // Get channel info
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
      return res.status(404).json({ 
        success: false, 
        error: 'Channel not found' 
      });
    }
    
    // Check health manually
    const healthResult = await simplifiedStreamHealthService.checkChannelHealth(
      parseInt(channelId),
      channel.url
    );
    
    res.json({
      success: true,
      message: 'Health check completed',
      data: healthResult
    });
    
  } catch (error) {
    console.error('Error checking channel health:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to check channel health' 
    });
  }
}));

// Get uptime percentage for a specific channel
router.get('/uptime/:channelId', asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  
  try {
    const uptimePercentage = await simplifiedStreamHealthService.calculateUptimePercentage(
      parseInt(channelId)
    );
    
    res.json({
      success: true,
      data: {
        channelId: parseInt(channelId),
        uptimePercentage: uptimePercentage,
        period: '24 hours'
      }
    });
    
  } catch (error) {
    console.error('Error calculating uptime:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to calculate uptime percentage' 
    });
  }
}));

// Trigger manual monitoring of all channels
router.post('/monitor-all', asyncHandler(async (req, res) => {
  try {
    await simplifiedStreamHealthService.monitorAllChannels();
    
    res.json({
      success: true,
      message: 'Manual monitoring completed for all channels'
    });
    
  } catch (error) {
    console.error('Error during manual monitoring:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to complete manual monitoring' 
    });
  }
}));

// Clean up old health history
router.post('/cleanup', asyncHandler(async (req, res) => {
  const { days = 7 } = req.body;
  
  try {
    const cleanedRecords = await simplifiedStreamHealthService.cleanupOldHealthHistory(days);
    
    res.json({
      success: true,
      message: 'Health history cleanup completed',
      data: {
        cleanedRecords: cleanedRecords,
        retentionDays: days
      }
    });
    
  } catch (error) {
    console.error('Error during health history cleanup:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to cleanup health history' 
    });
  }
}));

module.exports = router;
