const express = require('express');
const router = express.Router();
const { db } = require('../index');
const profileTemplateManager = require('../services/profile-template-manager');

// Helper function for async route handling
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(err => {
      console.error('Profile template route error:', err);
      res.status(500).json({ error: err.message || 'Internal server error' });
    });
  };
}

// Get all profile templates
router.get('/', asyncHandler(async (req, res) => {
  try {
    const templates = await profileTemplateManager.getAllTemplates();
    res.json({
      success: true,
      data: templates
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

// Get profile template by ID
router.get('/:templateId', asyncHandler(async (req, res) => {
  const { templateId } = req.params;

  try {
    const template = await profileTemplateManager.getTemplateById(parseInt(templateId));
    
    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    }

    res.json({
      success: true,
      data: template
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

// Get templates by content type
router.get('/content-type/:contentType', asyncHandler(async (req, res) => {
  const { contentType } = req.params;

  try {
    const templates = await profileTemplateManager.getTemplatesByContentType(contentType);
    res.json({
      success: true,
      data: templates
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

// Get profile recommendation for a channel
router.get('/recommendations/:channelId', asyncHandler(async (req, res) => {
  const { channelId } = req.params;

  try {
    const recommendations = await profileTemplateManager.getChannelRecommendations(parseInt(channelId));
    res.json({
      success: true,
      data: recommendations
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

// Generate new recommendation for a channel
router.post('/recommendations/:channelId/generate', asyncHandler(async (req, res) => {
  const { channelId } = req.params;

  try {
    const recommendation = await profileTemplateManager.generateProfileRecommendation(parseInt(channelId));
    res.json({
      success: true,
      data: recommendation,
      message: 'Profile recommendation generated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

// Apply profile template to a channel
router.post('/apply/:channelId', asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  const { templateId, forceApply = false } = req.body;

  if (!templateId) {
    return res.status(400).json({
      success: false,
      error: 'Template ID is required'
    });
  }

  try {
    const result = await profileTemplateManager.applyTemplateToChannel(
      parseInt(channelId),
      parseInt(templateId),
      forceApply
    );

    res.json({
      success: true,
      data: result,
      message: result.message
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

// Bulk apply template to multiple channels
router.post('/bulk-apply', asyncHandler(async (req, res) => {
  const { channelIds, templateId, forceApply = false } = req.body;

  if (!Array.isArray(channelIds) || channelIds.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Channel IDs array is required'
    });
  }

  if (!templateId) {
    return res.status(400).json({
      success: false,
      error: 'Template ID is required'
    });
  }

  try {
    const results = await profileTemplateManager.bulkApplyTemplate(
      channelIds.map(id => parseInt(id)),
      parseInt(templateId),
      forceApply
    );

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    res.json({
      success: true,
      data: {
        total: results.length,
        successful: successCount,
        failed: failCount,
        results: results
      },
      message: `Bulk template application completed: ${successCount} successful, ${failCount} failed`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

// Generate recommendations for all channels
router.post('/recommendations/generate-all', asyncHandler(async (req, res) => {
  try {
    await profileTemplateManager.generateAllRecommendations();
    res.json({
      success: true,
      message: 'Profile recommendations generated for all channels'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

// Get profile usage statistics
router.get('/usage/statistics', asyncHandler(async (req, res) => {
  try {
    const stats = await profileTemplateManager.getProfileUsageStats();
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

// Get channels with their current profiles and recommendations
router.get('/channels/overview', asyncHandler(async (req, res) => {
  try {
    const channels = await new Promise((resolve, reject) => {
      db.all(`
        SELECT 
          c.id,
          c.name,
          c.category,
          c.type,
          c.transcoding_enabled,
          c.transcoding_status,
          c.profile_recommendation,
          c.last_profile_change,
          tp.name as current_profile_name,
          tp.template_id as current_template_id,
          pt.name as current_template_name,
          pt.content_type as current_template_type
        FROM channels c
        LEFT JOIN transcoding_profiles tp ON c.transcoding_profile_id = tp.id
        LEFT JOIN profile_templates pt ON tp.template_id = pt.id
        ORDER BY c.name
      `, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });

    // Parse profile recommendations
    const channelsWithRecommendations = channels.map(channel => {
      let recommendation = null;
      if (channel.profile_recommendation) {
        try {
          recommendation = JSON.parse(channel.profile_recommendation);
        } catch (error) {
          console.error('Error parsing recommendation for channel', channel.id, error);
        }
      }
      
      return {
        ...channel,
        recommendation
      };
    });

    res.json({
      success: true,
      data: channelsWithRecommendations
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

// Get content type mapping
router.get('/content-types/mapping', asyncHandler(async (req, res) => {
  try {
    const mapping = profileTemplateManager.contentTypeMapping;
    res.json({
      success: true,
      data: mapping
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

// Get template performance metrics
router.get('/performance/:templateId', asyncHandler(async (req, res) => {
  const { templateId } = req.params;
  const days = parseInt(req.query.days) || 7;

  try {
    const metrics = await new Promise((resolve, reject) => {
      db.all(`
        SELECT 
          ppm.timestamp,
          ppm.cpu_usage,
          ppm.memory_usage,
          ppm.encoding_speed,
          ppm.bitrate_efficiency,
          ppm.quality_score,
          ppm.error_rate,
          c.name as channel_name
        FROM profile_performance_metrics ppm
        JOIN transcoding_profiles tp ON ppm.profile_id = tp.id
        JOIN channels c ON ppm.channel_id = c.id
        WHERE tp.template_id = ?
          AND ppm.timestamp >= datetime('now', '-${days} days')
        ORDER BY ppm.timestamp DESC
      `, [templateId], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });

    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

// Get channels that would benefit from profile change
router.get('/optimization/suggestions', asyncHandler(async (req, res) => {
  try {
    const suggestions = await new Promise((resolve, reject) => {
      db.all(`
        SELECT 
          c.id,
          c.name,
          c.category,
          c.type,
          c.transcoding_status,
          c.profile_recommendation,
          tp.name as current_profile_name,
          pt.name as current_template_name,
          pt.content_type as current_template_type
        FROM channels c
        LEFT JOIN transcoding_profiles tp ON c.transcoding_profile_id = tp.id
        LEFT JOIN profile_templates pt ON tp.template_id = pt.id
        WHERE c.transcoding_enabled = 1
          AND c.profile_recommendation IS NOT NULL
        ORDER BY c.name
      `, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });

    // Filter channels that have better recommendations
    const optimizationSuggestions = suggestions.filter(channel => {
      if (!channel.profile_recommendation) return false;
      
      try {
        const recommendation = JSON.parse(channel.profile_recommendation);
        // Suggest if confidence is high and it's different from current template
        return recommendation.confidence > 0.7 && 
               recommendation.templateName !== channel.current_template_name;
      } catch (error) {
        return false;
      }
    }).map(channel => {
      const recommendation = JSON.parse(channel.profile_recommendation);
      return {
        ...channel,
        recommendation,
        optimizationReason: `Better match: ${recommendation.reason} (${Math.round(recommendation.confidence * 100)}% confidence)`
      };
    });

    res.json({
      success: true,
      data: optimizationSuggestions
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

// Create custom profile template
router.post('/create', asyncHandler(async (req, res) => {
  const {
    name,
    description,
    content_type,
    recommended_for,
    video_codec = 'libx264',
    audio_codec = 'aac',
    video_bitrate = '2000k',
    audio_bitrate = '128k',
    resolution = 'original',
    preset = 'ultrafast',
    tune,
    gop_size = 25,
    keyint_min = 25,
    hls_time = 2,
    hls_list_size = 3,
    hls_segment_type = 'mpegts',
    hls_flags = 'delete_segments+append_list+omit_endlist',
    hls_segment_filename = 'output_%d.m4s',
    manifest_filename = 'output.m3u8',
    additional_params,
    is_ll_hls = false,
    priority = 10
  } = req.body;

  if (!name || !content_type) {
    return res.status(400).json({
      success: false,
      error: 'Name and content type are required'
    });
  }

  try {
    const now = new Date().toISOString();
    const recommendedForJson = Array.isArray(recommended_for) ? JSON.stringify(recommended_for) : '[]';

    const templateId = await new Promise((resolve, reject) => {
      db.run(`
        INSERT INTO profile_templates (
          name, description, content_type, recommended_for, video_codec, audio_codec,
          video_bitrate, audio_bitrate, resolution, preset, tune, gop_size, keyint_min,
          hls_time, hls_list_size, hls_segment_type, hls_flags, hls_segment_filename,
          manifest_filename, additional_params, is_ll_hls, priority, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        name, description, content_type, recommendedForJson, video_codec, audio_codec,
        video_bitrate, audio_bitrate, resolution, preset, tune, gop_size, keyint_min,
        hls_time, hls_list_size, hls_segment_type, hls_flags, hls_segment_filename,
        manifest_filename, additional_params, is_ll_hls, priority, now, now
      ], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
    });

    // Reload cache
    await profileTemplateManager.loadTemplatesIntoCache();

    res.json({
      success: true,
      data: { templateId },
      message: 'Profile template created successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

// Update profile template
router.put('/:templateId', asyncHandler(async (req, res) => {
  const { templateId } = req.params;
  const updateData = req.body;

  try {
    const now = new Date().toISOString();
    const setClause = [];
    const values = [];

    // Build dynamic update query
    const allowedFields = [
      'name', 'description', 'content_type', 'recommended_for', 'video_codec',
      'audio_codec', 'video_bitrate', 'audio_bitrate', 'resolution', 'preset',
      'tune', 'gop_size', 'keyint_min', 'hls_time', 'hls_list_size',
      'hls_segment_type', 'hls_flags', 'hls_segment_filename', 'manifest_filename',
      'additional_params', 'is_ll_hls', 'priority'
    ];

    for (const field of allowedFields) {
      if (updateData.hasOwnProperty(field)) {
        setClause.push(`${field} = ?`);
        if (field === 'recommended_for' && Array.isArray(updateData[field])) {
          values.push(JSON.stringify(updateData[field]));
        } else {
          values.push(updateData[field]);
        }
      }
    }

    if (setClause.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields to update'
      });
    }

    setClause.push('updated_at = ?');
    values.push(now);
    values.push(templateId);

    await new Promise((resolve, reject) => {
      db.run(`
        UPDATE profile_templates 
        SET ${setClause.join(', ')}
        WHERE id = ?
      `, values, function(err) {
        if (err) {
          reject(err);
        } else if (this.changes === 0) {
          reject(new Error('Template not found'));
        } else {
          resolve();
        }
      });
    });

    // Reload cache
    await profileTemplateManager.loadTemplatesIntoCache();

    res.json({
      success: true,
      message: 'Profile template updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

// Delete profile template
router.delete('/:templateId', asyncHandler(async (req, res) => {
  const { templateId } = req.params;

  try {
    // Check if template is in use
    const usage = await new Promise((resolve, reject) => {
      db.get(`
        SELECT COUNT(*) as count
        FROM transcoding_profiles tp
        JOIN channels c ON tp.id = c.transcoding_profile_id
        WHERE tp.template_id = ?
      `, [templateId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row.count);
        }
      });
    });

    if (usage > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete template: it is currently used by ${usage} channels`
      });
    }

    // Delete template
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM profile_templates WHERE id = ?', [templateId], function(err) {
        if (err) {
          reject(err);
        } else if (this.changes === 0) {
          reject(new Error('Template not found'));
        } else {
          resolve();
        }
      });
    });

    // Reload cache
    await profileTemplateManager.loadTemplatesIntoCache();

    res.json({
      success: true,
      message: 'Profile template deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

module.exports = router;
