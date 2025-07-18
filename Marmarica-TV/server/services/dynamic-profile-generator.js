const path = require('path');

class DynamicProfileGenerator {
  constructor() {
    this.profileCache = new Map();
    this.serverBaseUrl = process.env.SERVER_BASE_URL || 'http://192.168.1.15';
    this.hlsOutputBase = process.env.HLS_OUTPUT_BASE || '/var/www/html/hls_stream';
  }

  // Generate dynamic transcoding profile from stream analysis
  generateProfile(analysis, channelId, options = {}) {
    const recommendation = analysis.recommendation || this.getDefaultRecommendation();
    
    // Create unique profile ID based on analysis
    const profileId = this.generateProfileId(analysis, channelId);
    
    // Check cache first
    if (this.profileCache.has(profileId)) {
      console.log(`Using cached dynamic profile: ${profileId}`);
      return this.profileCache.get(profileId);
    }

    console.log(`Generating dynamic profile for channel ${channelId}`);
    
    // Generate profile based on analysis
    const profile = this.createProfileFromRecommendation(recommendation, channelId, options);
    
    // Cache the profile
    this.profileCache.set(profileId, {
      profile,
      timestamp: Date.now(),
      channelId,
      analysis: analysis
    });
    
    return profile;
  }

  // Generate unique profile ID
  generateProfileId(analysis, channelId) {
    const recommendation = analysis.recommendation || {};
    const stability = analysis.stability || {};
    
    // Create hash-like ID from key parameters
    const keyParams = [
      recommendation.segmentType || 'mpegts',
      recommendation.resolution || 'original',
      recommendation.videoBitrate || 'original',
      recommendation.videoCodec || 'libx264',
      recommendation.audioCodec || 'aac',
      Math.round(stability.score * 100) || 0,
      channelId
    ].join('_');
    
    return `dynamic_${keyParams}`;
  }

  // Create profile object from recommendation
  createProfileFromRecommendation(recommendation, channelId, options = {}) {
    const outputDir = path.join(this.hlsOutputBase, `channel_${channelId}`);
    
    // Determine segment filename based on segment type
    const segmentExtension = recommendation.segmentType === 'fmp4' ? '.m4s' : '.ts';
    const segmentFilename = `output_%d${segmentExtension}`;
    
    const profile = {
      id: `dynamic_${channelId}_${Date.now()}`,
      name: `Dynamic Profile - Channel ${channelId}`,
      description: `Auto-generated profile based on stream analysis (confidence: ${Math.round(recommendation.confidence * 100)}%)`,
      
      // Video settings
      video_codec: recommendation.videoCodec,
      video_bitrate: recommendation.videoBitrate,
      resolution: recommendation.resolution,
      preset: recommendation.preset,
      tune: recommendation.tune,
      profile: recommendation.profile,
      level: recommendation.level,
      
      // Audio settings
      audio_codec: recommendation.audioCodec,
      audio_bitrate: recommendation.audioBitrate,
      
      // Keyframe settings
      gop_size: recommendation.keyframeInterval * 25, // Assume 25fps base
      keyint_min: recommendation.keyframeInterval,
      
      // HLS settings
      hls_time: recommendation.hlsTime,
      hls_list_size: recommendation.hlsListSize,
      hls_segment_type: recommendation.segmentType,
      hls_flags: this.generateHLSFlags(recommendation),
      hls_segment_filename: segmentFilename,
      manifest_filename: 'output.m3u8',
      
      // Additional parameters
      additional_params: this.generateAdditionalParams(recommendation),
      
      // Metadata
      is_dynamic: true,
      is_default: false,
      confidence: recommendation.confidence,
      created_at: new Date().toISOString(),
      
      // Paths
      output_dir: outputDir,
      output_path: path.join(outputDir, 'output.m3u8'),
      segment_path: path.join(outputDir, segmentFilename)
    };

    // Apply user overrides if provided
    if (options.overrides) {
      Object.assign(profile, options.overrides);
    }

    return profile;
  }

  // Generate HLS flags based on recommendation
  generateHLSFlags(recommendation) {
    const flags = ['delete_segments', 'independent_segments'];
    
    // Add segment type specific flags
    if (recommendation.segmentType === 'mpegts') {
      flags.push('append_list');
    } else {
      flags.push('split_by_time');
    }
    
    // Add stability flags for problematic streams
    if (recommendation.confidence < 0.7) {
      flags.push('program_date_time');
    }
    
    return flags.join('+');
  }

  // Generate additional FFmpeg parameters
  generateAdditionalParams(recommendation) {
    const params = [];
    
    // Add additional flags from recommendation
    if (recommendation.additionalFlags && recommendation.additionalFlags.length > 0) {
      params.push(...recommendation.additionalFlags);
    }
    
    // Add Tizen-specific optimizations
    params.push('-movflags', '+faststart');
    params.push('-max_muxing_queue_size', '1024');
    
    // Add frame rate parameter if specified
    if (recommendation.framerate && recommendation.framerate !== 'original') {
      params.push('-r', recommendation.framerate);
    }
    
    // Add pixel format for compatibility
    params.push('-pix_fmt', 'yuv420p');
    
    return params.join(' ');
  }

  // Generate fallback profile with reduced quality
  generateFallbackProfile(originalProfile, fallbackLevel = 1) {
    const fallbackProfile = { ...originalProfile };
    
    // Apply fallback transformations based on level
    switch (fallbackLevel) {
      case 1:
        // First fallback: Force mpegts, reduce resolution to 720p
        fallbackProfile.hls_segment_type = 'mpegts';
        fallbackProfile.hls_segment_filename = 'output_%d.ts';
        fallbackProfile.resolution = '720p';
        fallbackProfile.video_bitrate = this.reduceBitrate(originalProfile.video_bitrate, 0.5);
        fallbackProfile.preset = 'ultrafast';
        fallbackProfile.tune = 'zerolatency';
        fallbackProfile.name = `${originalProfile.name} (Fallback L1)`;
        break;
        
      case 2:
        // Second fallback: Further reduce to 480p, half bitrate again
        fallbackProfile.hls_segment_type = 'mpegts';
        fallbackProfile.hls_segment_filename = 'output_%d.ts';
        fallbackProfile.resolution = '480p';
        fallbackProfile.video_bitrate = this.reduceBitrate(originalProfile.video_bitrate, 0.25);
        fallbackProfile.audio_codec = 'aac';
        fallbackProfile.audio_bitrate = '64k';
        fallbackProfile.preset = 'ultrafast';
        fallbackProfile.tune = 'zerolatency';
        fallbackProfile.name = `${originalProfile.name} (Fallback L2)`;
        break;
        
      case 3:
        // Third fallback: Minimal quality, maximum compatibility
        fallbackProfile.hls_segment_type = 'mpegts';
        fallbackProfile.hls_segment_filename = 'output_%d.ts';
        fallbackProfile.resolution = '480p';
        fallbackProfile.video_bitrate = '500k';
        fallbackProfile.audio_codec = 'aac';
        fallbackProfile.audio_bitrate = '64k';
        fallbackProfile.preset = 'ultrafast';
        fallbackProfile.tune = 'zerolatency';
        fallbackProfile.profile = 'baseline';
        fallbackProfile.level = '3.0';
        fallbackProfile.name = `${originalProfile.name} (Fallback L3)`;
        
        // Add maximum compatibility flags
        const additionalFlags = [
          '-avoid_negative_ts', 'make_zero',
          '-fflags', '+genpts+igndts+discardcorrupt',
          '-err_detect', 'ignore_err'
        ];
        
        if (fallbackProfile.additional_params) {
          fallbackProfile.additional_params += ' ' + additionalFlags.join(' ');
        } else {
          fallbackProfile.additional_params = additionalFlags.join(' ');
        }
        break;
    }
    
    // Update confidence and metadata
    fallbackProfile.confidence = (originalProfile.confidence || 0.5) - (fallbackLevel * 0.1);
    fallbackProfile.is_fallback = true;
    fallbackProfile.fallback_level = fallbackLevel;
    fallbackProfile.created_at = new Date().toISOString();
    
    return fallbackProfile;
  }

  // Reduce bitrate by factor
  reduceBitrate(originalBitrate, factor) {
    if (!originalBitrate || originalBitrate === 'original') {
      return '1000k'; // Default fallback
    }
    
    // Extract numeric value
    const match = originalBitrate.match(/(\d+)/);
    if (match) {
      const numericValue = parseInt(match[1]);
      const reducedValue = Math.round(numericValue * factor);
      return `${reducedValue}k`;
    }
    
    return '1000k';
  }

  // Generate profile for specific use case
  generateTizenOptimizedProfile(analysis, channelId) {
    const recommendation = analysis.recommendation || this.getDefaultRecommendation();
    
    // Tizen-specific optimizations
    const tizenRecommendation = {
      ...recommendation,
      segmentType: 'mpegts', // Tizen prefers mpegts
      videoCodec: 'libx264',
      audioCodec: 'aac',
      preset: 'ultrafast',
      tune: 'zerolatency',
      profile: 'baseline',
      level: '3.1',
      hlsTime: 2,
      hlsListSize: 3,
      additionalFlags: [
        '-movflags', '+faststart',
        '-max_muxing_queue_size', '1024',
        '-pix_fmt', 'yuv420p'
      ]
    };
    
    return this.createProfileFromRecommendation(tizenRecommendation, channelId, {
      overrides: {
        name: `Tizen Optimized - Channel ${channelId}`,
        description: 'Optimized for Samsung Tizen Smart TV compatibility'
      }
    });
  }

  // Get default recommendation for fallback
  getDefaultRecommendation() {
    return {
      segmentType: 'mpegts',
      videoCodec: 'libx264',
      audioCodec: 'aac',
      preset: 'ultrafast',
      tune: 'zerolatency',
      profile: 'baseline',
      level: '3.1',
      resolution: '720p',
      framerate: '25',
      videoBitrate: '2000k',
      audioBitrate: '128k',
      keyframeInterval: 2,
      hlsTime: 2,
      hlsListSize: 3,
      additionalFlags: ['-avoid_negative_ts', 'make_zero'],
      confidence: 0.4
    };
  }

  // Clear profile cache
  clearCache() {
    this.profileCache.clear();
  }

  // Get cache statistics
  getCacheStats() {
    return {
      size: this.profileCache.size,
      profiles: Array.from(this.profileCache.keys())
    };
  }

  // Get cached profile
  getCachedProfile(profileId) {
    return this.profileCache.get(profileId);
  }

  // Remove expired profiles from cache
  cleanupExpiredProfiles(maxAge = 24 * 60 * 60 * 1000) { // 24 hours
    const now = Date.now();
    const expiredKeys = [];
    
    for (const [key, value] of this.profileCache) {
      if (now - value.timestamp > maxAge) {
        expiredKeys.push(key);
      }
    }
    
    expiredKeys.forEach(key => this.profileCache.delete(key));
    
    if (expiredKeys.length > 0) {
      console.log(`Cleaned up ${expiredKeys.length} expired dynamic profiles`);
    }
    
    return expiredKeys.length;
  }
}

module.exports = DynamicProfileGenerator;
