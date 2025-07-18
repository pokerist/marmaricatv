class ProfileTemplateManager {
  constructor() {
    this.db = null;
    this.profileCache = new Map();
    this.recommendationCache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    
    // Content type mappings for automatic recommendations
    this.contentTypeMapping = {
      'Sports': 'sports',
      'News': 'news',
      'Movies': 'movies',
      'Entertainment': 'movies',
      'Family': 'general',
      'Kids': 'general',
      'Religious': 'news',
      'Documentary': 'movies',
      'Music': 'general',
      'General': 'general'
    };
    
    // Initialize default template for simplified mode
    this.defaultTemplate = {
      id: 1,
      name: 'Simplified LL-HLS',
      description: 'Optimized low-latency HLS template',
      content_type: 'general',
      recommended_for: ['General', 'Sports', 'News'],
      video_codec: 'libx264',
      audio_codec: 'aac',
      video_bitrate: '2000k',
      audio_bitrate: '64k',
      resolution: 'original',
      preset: 'ultrafast',
      tune: 'zerolatency',
      gop_size: 15,
      keyint_min: 15,
      hls_time: 0.5,
      hls_list_size: 1,
      hls_segment_type: 'mpegts',
      hls_flags: 'delete_segments+append_list+omit_endlist+independent_segments',
      hls_segment_filename: 'output_%d.ts',
      manifest_filename: 'output.m3u8',
      additional_params: null,
      is_ll_hls: true,
      priority: 1,
      cached_at: Date.now()
    };
    
    console.log('Profile Template Manager initialized (simplified mode)');
  }

  // Set database reference
  setDatabase(database) {
    this.db = database;
  }

  // Initialize profile templates
  async initializeProfileTemplates() {
    try {
      console.log('Initializing profile template management...');
      
      // Load templates into cache
      await this.loadTemplatesIntoCache();
      
      // Generate recommendations for existing channels
      await this.generateAllRecommendations();
      
      console.log('Profile template management initialized successfully');
    } catch (error) {
      console.error('Failed to initialize profile template management:', error);
      throw error;
    }
  }

  // Load all templates into cache
  async loadTemplatesIntoCache() {
    if (!this.db) throw new Error('Database not initialized');
    
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT * FROM profile_templates 
        ORDER BY priority ASC, name ASC
      `, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          this.profileCache.clear();
          for (const template of rows) {
            this.profileCache.set(template.id, {
              ...template,
              recommended_for: template.recommended_for ? JSON.parse(template.recommended_for) : [],
              cached_at: Date.now()
            });
          }
          console.log(`Loaded ${rows.length} profile templates into cache`);
          resolve();
        }
      });
    });
  }

  // Get all profile templates
  async getAllTemplates() {
    try {
      // Check cache first
      if (this.profileCache.size > 0) {
        const templates = Array.from(this.profileCache.values());
        // Check if cache is still valid
        const isValid = templates.every(t => Date.now() - t.cached_at < this.cacheExpiry);
        if (isValid) {
          return templates;
        }
      }
      
      // Reload from database
      await this.loadTemplatesIntoCache();
      const templates = Array.from(this.profileCache.values());
      
      // If no templates found, return default template
      if (templates.length === 0) {
        console.log('No templates found in database, using default template');
        return [this.defaultTemplate];
      }
      
      return templates;
    } catch (error) {
      console.warn('Error loading templates from database, using default template:', error.message);
      return [this.defaultTemplate];
    }
  }

  // Get template by ID
  async getTemplateById(templateId) {
    const templates = await this.getAllTemplates();
    return templates.find(t => t.id === templateId);
  }

  // Get templates by content type
  async getTemplatesByContentType(contentType) {
    const templates = await this.getAllTemplates();
    return templates.filter(t => t.content_type === contentType);
  }

  // Generate profile recommendation for a channel
  async generateProfileRecommendation(channelId, channelData = null) {
    try {
      // Get channel data if not provided
      if (!channelData) {
        channelData = await this.getChannelData(channelId);
      }
      
      if (!channelData) {
        throw new Error('Channel not found');
      }
      
      // Get all templates
      const templates = await this.getAllTemplates();
      
      // Find best matching template
      const recommendation = await this.findBestTemplate(channelData, templates);
      
      // Cache the recommendation
      this.recommendationCache.set(channelId, {
        ...recommendation,
        generated_at: Date.now()
      });
      
      // Update channel with recommendation
      await this.updateChannelRecommendation(channelId, recommendation);
      
      return recommendation;
    } catch (error) {
      console.error('Error generating profile recommendation:', error);
      throw error;
    }
  }

  // Find best template for a channel
  async findBestTemplate(channelData, templates) {
    let bestMatch = null;
    let bestScore = 0;
    
    for (const template of templates) {
      const score = this.calculateMatchScore(channelData, template);
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = template;
      }
    }
    
    // If no good match found, use general template
    if (!bestMatch || bestScore < 0.3) {
      bestMatch = templates.find(t => t.content_type === 'general') || templates[0];
      bestScore = 0.3;
    }
    
    return {
      templateId: bestMatch.id,
      templateName: bestMatch.name,
      confidence: bestScore,
      reason: this.generateRecommendationReason(channelData, bestMatch, bestScore),
      alternativeTemplates: this.findAlternativeTemplates(channelData, templates, bestMatch.id)
    };
  }

  // Calculate match score between channel and template
  calculateMatchScore(channelData, template) {
    let score = 0;
    
    // Category match (most important)
    if (template.recommended_for.includes(channelData.category)) {
      score += 0.6;
    }
    
    // Content type mapping
    const mappedContentType = this.contentTypeMapping[channelData.category];
    if (mappedContentType === template.content_type) {
      score += 0.4;
    }
    
    // Channel type considerations
    if (channelData.type === 'Sports' && template.content_type === 'sports') {
      score += 0.3;
    }
    
    if (channelData.type === 'News' && template.content_type === 'news') {
      score += 0.3;
    }
    
    // Low latency preference for sports and news
    if ((channelData.category === 'Sports' || channelData.category === 'News') && template.is_ll_hls) {
      score += 0.2;
    }
    
    // Penalty for over-complex profiles for simple content
    if (channelData.category === 'News' && template.content_type === 'movies') {
      score -= 0.3;
    }
    
    return Math.max(0, Math.min(1, score));
  }

  // Generate recommendation reason
  generateRecommendationReason(channelData, template, score) {
    const reasons = [];
    
    if (template.recommended_for.includes(channelData.category)) {
      reasons.push(`Optimized for ${channelData.category} content`);
    }
    
    if (template.is_ll_hls && (channelData.category === 'Sports' || channelData.category === 'News')) {
      reasons.push('Low latency for live content');
    }
    
    if (template.content_type === 'news' && channelData.category === 'News') {
      reasons.push('Tuned for talking heads and static content');
    }
    
    if (template.content_type === 'sports' && channelData.category === 'Sports') {
      reasons.push('High motion and fast scene changes');
    }
    
    if (reasons.length === 0) {
      reasons.push('General purpose profile');
    }
    
    return reasons.join(', ');
  }

  // Find alternative templates
  findAlternativeTemplates(channelData, templates, excludeId) {
    const alternatives = [];
    
    for (const template of templates) {
      if (template.id !== excludeId) {
        const score = this.calculateMatchScore(channelData, template);
        if (score > 0.2) {
          alternatives.push({
            templateId: template.id,
            templateName: template.name,
            confidence: score,
            reason: this.generateRecommendationReason(channelData, template, score)
          });
        }
      }
    }
    
    return alternatives
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3); // Top 3 alternatives
  }

  // Get channel data from database
  async getChannelData(channelId) {
    if (!this.db) throw new Error('Database not initialized');
    
    return new Promise((resolve, reject) => {
      this.db.get(`
        SELECT * FROM channels WHERE id = ?
      `, [channelId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  // Update channel recommendation
  async updateChannelRecommendation(channelId, recommendation) {
    if (!this.db) return;
    
    const now = new Date().toISOString();
    
    return new Promise((resolve, reject) => {
      this.db.run(`
        UPDATE channels 
        SET profile_recommendation = ?, 
            updated_at = ?
        WHERE id = ?
      `, [
        JSON.stringify(recommendation),
        now,
        channelId
      ], (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  // Apply profile template to channel
  async applyTemplateToChannel(channelId, templateId, forceApply = false) {
    try {
      const template = await this.getTemplateById(templateId);
      if (!template) {
        throw new Error('Template not found');
      }
      
      const channelData = await this.getChannelData(channelId);
      if (!channelData) {
        throw new Error('Channel not found');
      }
      
      // Check if channel is currently transcoding
      if (channelData.transcoding_status === 'active' && !forceApply) {
        throw new Error('Cannot change profile while transcoding is active. Stop transcoding first or use force apply.');
      }
      
      // Find or create corresponding transcoding profile
      const profileId = await this.findOrCreateTranscodingProfile(template);
      
      // Update channel with new profile
      await this.updateChannelProfile(channelId, profileId, templateId);
      
      // Log the change
      await this.logProfileChange(channelId, templateId, 'template_applied');
      
      return {
        success: true,
        message: `Profile template "${template.name}" applied to channel`,
        templateId: templateId,
        profileId: profileId
      };
    } catch (error) {
      console.error('Error applying template to channel:', error);
      throw error;
    }
  }

  // Find or create transcoding profile from template
  async findOrCreateTranscodingProfile(template) {
    if (!this.db) throw new Error('Database not initialized');
    
    // Check if profile already exists
    const existingProfile = await new Promise((resolve, reject) => {
      this.db.get(`
        SELECT id FROM transcoding_profiles 
        WHERE name = ? AND template_id = ?
      `, [template.name, template.id], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
    
    if (existingProfile) {
      return existingProfile.id;
    }
    
    // Create new profile from template
    const profileData = this.templateToProfile(template);
    
    return new Promise((resolve, reject) => {
      this.db.run(`
        INSERT INTO transcoding_profiles (
          name, description, video_codec, audio_codec, video_bitrate, audio_bitrate,
          resolution, preset, tune, gop_size, keyint_min, hls_time, hls_list_size,
          hls_segment_type, hls_flags, hls_segment_filename, manifest_filename,
          additional_params, is_ll_hls, is_default, template_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        profileData.name,
        profileData.description,
        profileData.video_codec,
        profileData.audio_codec,
        profileData.video_bitrate,
        profileData.audio_bitrate,
        profileData.resolution,
        profileData.preset,
        profileData.tune,
        profileData.gop_size,
        profileData.keyint_min,
        profileData.hls_time,
        profileData.hls_list_size,
        profileData.hls_segment_type,
        profileData.hls_flags,
        profileData.hls_segment_filename,
        profileData.manifest_filename,
        profileData.additional_params,
        profileData.is_ll_hls,
        false, // is_default
        template.id,
        new Date().toISOString(),
        new Date().toISOString()
      ], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.lastID);
        }
      });
    });
  }

  // Convert template to profile format
  templateToProfile(template) {
    return {
      name: template.name,
      description: template.description,
      video_codec: template.video_codec,
      audio_codec: template.audio_codec,
      video_bitrate: template.video_bitrate,
      audio_bitrate: template.audio_bitrate,
      resolution: template.resolution,
      preset: template.preset,
      tune: template.tune,
      gop_size: template.gop_size,
      keyint_min: template.keyint_min,
      hls_time: template.hls_time,
      hls_list_size: template.hls_list_size,
      hls_segment_type: template.hls_segment_type,
      hls_flags: template.hls_flags,
      hls_segment_filename: template.hls_segment_filename,
      manifest_filename: template.manifest_filename,
      additional_params: template.additional_params,
      is_ll_hls: template.is_ll_hls
    };
  }

  // Update channel profile
  async updateChannelProfile(channelId, profileId, templateId) {
    if (!this.db) return;
    
    const now = new Date().toISOString();
    
    return new Promise((resolve, reject) => {
      this.db.run(`
        UPDATE channels 
        SET transcoding_profile_id = ?, 
            last_profile_change = ?,
            updated_at = ?
        WHERE id = ?
      `, [
        profileId,
        now,
        now,
        channelId
      ], (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  // Log profile change
  async logProfileChange(channelId, templateId, action) {
    if (!this.db) return;
    
    const now = new Date().toISOString();
    
    return new Promise((resolve, reject) => {
      this.db.run(`
        INSERT INTO actions (
          action_type, description, channel_id, 
          additional_data, created_at
        ) VALUES (?, ?, ?, ?, ?)
      `, [
        'profile_change',
        `Profile template applied: ${action}`,
        channelId,
        JSON.stringify({ templateId, action, timestamp: now }),
        now
      ], (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  // Generate recommendations for all channels
  async generateAllRecommendations() {
    if (!this.db) return;
    
    try {
      const channels = await new Promise((resolve, reject) => {
        this.db.all('SELECT * FROM channels', (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        });
      });
      
      console.log(`Generating profile recommendations for ${channels.length} channels...`);
      
      for (const channel of channels) {
        try {
          await this.generateProfileRecommendation(channel.id, channel);
        } catch (error) {
          console.error(`Error generating recommendation for channel ${channel.id}:`, error);
        }
      }
      
      console.log('Profile recommendations generated for all channels');
    } catch (error) {
      console.warn('Error generating recommendations, using simplified mode:', error.message);
    }
  }

  // Get channel recommendations
  async getChannelRecommendations(channelId) {
    // Check cache first
    const cached = this.recommendationCache.get(channelId);
    if (cached && Date.now() - cached.generated_at < this.cacheExpiry) {
      return cached;
    }
    
    // Get from database
    const channelData = await this.getChannelData(channelId);
    if (!channelData) {
      throw new Error('Channel not found');
    }
    
    if (channelData.profile_recommendation) {
      try {
        const recommendation = JSON.parse(channelData.profile_recommendation);
        this.recommendationCache.set(channelId, {
          ...recommendation,
          generated_at: Date.now()
        });
        return recommendation;
      } catch (error) {
        console.error('Error parsing stored recommendation:', error);
      }
    }
    
    // Generate new recommendation
    return await this.generateProfileRecommendation(channelId, channelData);
  }

  // Bulk apply template to multiple channels
  async bulkApplyTemplate(channelIds, templateId, forceApply = false) {
    const results = [];
    
    for (const channelId of channelIds) {
      try {
        const result = await this.applyTemplateToChannel(channelId, templateId, forceApply);
        results.push({
          channelId,
          success: true,
          result
        });
      } catch (error) {
        results.push({
          channelId,
          success: false,
          error: error.message
        });
      }
    }
    
    return results;
  }

  // Get profile usage statistics
  async getProfileUsageStats() {
    if (!this.db) throw new Error('Database not initialized');
    
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT 
          pt.name as template_name,
          pt.content_type,
          COUNT(c.id) as channel_count,
          COUNT(CASE WHEN c.transcoding_status = 'active' THEN 1 END) as active_count
        FROM profile_templates pt
        LEFT JOIN transcoding_profiles tp ON pt.id = tp.template_id
        LEFT JOIN channels c ON tp.id = c.transcoding_profile_id
        GROUP BY pt.id, pt.name, pt.content_type
        ORDER BY channel_count DESC
      `, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // Cleanup profile template management
  async cleanupProfileTemplateManagement() {
    this.profileCache.clear();
    this.recommendationCache.clear();
    console.log('Profile template management cleanup completed');
  }
}

module.exports = new ProfileTemplateManager();
