const DynamicProfileGenerator = require('./dynamic-profile-generator');

class FallbackManager {
  constructor() {
    this.profileGenerator = new DynamicProfileGenerator();
    this.fallbackAttempts = new Map();
    this.maxFallbackLevel = 3;
    this.fallbackDelays = [2000, 5000, 10000]; // Progressive delays
    this.permanentFailures = new Set();
    
    // Success tracking for learning
    this.successfulProfiles = new Map();
  }

  // Initialize fallback attempt tracking
  initializeFallbackTracking(channelId) {
    if (!this.fallbackAttempts.has(channelId)) {
      this.fallbackAttempts.set(channelId, {
        level: 0,
        attempts: 0,
        startTime: Date.now(),
        lastAttemptTime: null,
        errors: [],
        originalProfile: null,
        currentProfile: null
      });
    }
  }

  // Check if channel should attempt fallback
  shouldAttemptFallback(channelId, error) {
    const tracking = this.fallbackAttempts.get(channelId);
    
    if (!tracking) {
      return false;
    }

    // Don't attempt fallback if we've reached max level
    if (tracking.level >= this.maxFallbackLevel) {
      console.log(`Channel ${channelId} has reached maximum fallback level`);
      return false;
    }

    // Check if enough time has passed since last attempt
    const now = Date.now();
    if (tracking.lastAttemptTime) {
      const timeSinceLastAttempt = now - tracking.lastAttemptTime;
      const requiredDelay = this.fallbackDelays[tracking.level] || 10000;
      
      if (timeSinceLastAttempt < requiredDelay) {
        console.log(`Channel ${channelId} fallback delayed, waiting ${requiredDelay - timeSinceLastAttempt}ms`);
        return false;
      }
    }

    // Check if this is a fallback-worthy error
    const isFallbackError = this.isFallbackWorthyError(error);
    if (!isFallbackError) {
      console.log(`Channel ${channelId} error not suitable for fallback: ${error.message}`);
      return false;
    }

    return true;
  }

  // Check if error warrants fallback attempt
  isFallbackWorthyError(error) {
    const fallbackPatterns = [
      /Could not write header/i,
      /incorrect codec parameters/i,
      /SPS.*not found/i,
      /PPS.*not found/i,
      /Invalid data found/i,
      /Header missing/i,
      /decode_slice_header error/i,
      /non-existing PPS/i,
      /SPS unavailable/i,
      /Stream.*not found/i,
      /Protocol.*not found/i,
      /Input\/output error/i,
      /Connection.*refused/i,
      /Operation.*timed out/i
    ];

    const errorMessage = error.message || error.toString();
    
    return fallbackPatterns.some(pattern => pattern.test(errorMessage));
  }

  // Generate fallback profile
  async generateFallbackProfile(channelId, originalProfile, analysis) {
    const tracking = this.fallbackAttempts.get(channelId);
    
    if (!tracking) {
      throw new Error(`No fallback tracking initialized for channel ${channelId}`);
    }

    // Increment fallback level
    tracking.level++;
    tracking.attempts++;
    tracking.lastAttemptTime = Date.now();

    console.log(`Generating fallback profile L${tracking.level} for channel ${channelId}`);

    // Store original profile if this is the first fallback
    if (!tracking.originalProfile) {
      tracking.originalProfile = originalProfile;
    }

    // Generate fallback profile based on level
    const fallbackProfile = this.profileGenerator.generateFallbackProfile(
      originalProfile,
      tracking.level
    );

    // Store current profile
    tracking.currentProfile = fallbackProfile;

    // Add fallback-specific metadata
    fallbackProfile.fallback_reason = tracking.errors[tracking.errors.length - 1] || 'Unknown error';
    fallbackProfile.fallback_timestamp = new Date().toISOString();
    fallbackProfile.original_profile_id = originalProfile.id;

    return fallbackProfile;
  }

  // Record fallback attempt result
  recordFallbackResult(channelId, success, error = null) {
    const tracking = this.fallbackAttempts.get(channelId);
    
    if (!tracking) {
      return;
    }

    if (success) {
      console.log(`Fallback L${tracking.level} succeeded for channel ${channelId}`);
      
      // Record successful profile for learning
      this.recordSuccessfulProfile(channelId, tracking.currentProfile);
      
      // Reset permanent failure status
      this.permanentFailures.delete(channelId);
      
    } else {
      console.log(`Fallback L${tracking.level} failed for channel ${channelId}: ${error?.message || 'Unknown error'}`);
      
      // Record error
      if (error) {
        tracking.errors.push({
          level: tracking.level,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }

      // Check if we should mark as permanent failure
      if (tracking.level >= this.maxFallbackLevel) {
        this.permanentFailures.add(channelId);
        console.log(`Channel ${channelId} marked as permanent failure after ${tracking.attempts} attempts`);
      }
    }
  }

  // Record successful profile for learning
  recordSuccessfulProfile(channelId, profile) {
    const key = `${channelId}_${profile.resolution}_${profile.video_bitrate}`;
    
    if (!this.successfulProfiles.has(key)) {
      this.successfulProfiles.set(key, {
        channelId,
        profile: { ...profile },
        successCount: 0,
        firstSuccess: new Date().toISOString()
      });
    }
    
    const record = this.successfulProfiles.get(key);
    record.successCount++;
    record.lastSuccess = new Date().toISOString();
    
    console.log(`Recorded successful profile for channel ${channelId}: ${key} (count: ${record.successCount})`);
  }

  // Get recommended profile based on past successes
  getRecommendedProfile(channelId, analysis) {
    // Look for successful profiles for this channel
    const channelProfiles = Array.from(this.successfulProfiles.values())
      .filter(record => record.channelId === channelId)
      .sort((a, b) => b.successCount - a.successCount);

    if (channelProfiles.length > 0) {
      const bestProfile = channelProfiles[0];
      console.log(`Using learned successful profile for channel ${channelId}: ${bestProfile.successCount} successes`);
      return bestProfile.profile;
    }

    // Fall back to analysis-based recommendation
    return this.profileGenerator.generateProfile(analysis, channelId);
  }

  // Get fallback delay for next attempt
  getFallbackDelay(channelId) {
    const tracking = this.fallbackAttempts.get(channelId);
    
    if (!tracking) {
      return 0;
    }

    return this.fallbackDelays[tracking.level] || 10000;
  }

  // Check if channel is permanently failed
  isPermanentFailure(channelId) {
    return this.permanentFailures.has(channelId);
  }

  // Reset fallback tracking for channel
  resetFallbackTracking(channelId) {
    this.fallbackAttempts.delete(channelId);
    this.permanentFailures.delete(channelId);
    console.log(`Reset fallback tracking for channel ${channelId}`);
  }

  // Get fallback statistics
  getFallbackStats(channelId = null) {
    if (channelId) {
      const tracking = this.fallbackAttempts.get(channelId);
      return {
        channelId,
        level: tracking?.level || 0,
        attempts: tracking?.attempts || 0,
        errors: tracking?.errors || [],
        isPermanentFailure: this.permanentFailures.has(channelId),
        hasSuccessfulProfile: this.hasSuccessfulProfile(channelId)
      };
    }

    // Global statistics
    const stats = {
      totalChannelsWithFallback: this.fallbackAttempts.size,
      permanentFailures: this.permanentFailures.size,
      successfulProfiles: this.successfulProfiles.size,
      fallbackLevels: {
        level1: 0,
        level2: 0,
        level3: 0
      }
    };

    // Count channels by fallback level
    for (const tracking of this.fallbackAttempts.values()) {
      if (tracking.level === 1) stats.fallbackLevels.level1++;
      else if (tracking.level === 2) stats.fallbackLevels.level2++;
      else if (tracking.level === 3) stats.fallbackLevels.level3++;
    }

    return stats;
  }

  // Check if channel has successful profile
  hasSuccessfulProfile(channelId) {
    return Array.from(this.successfulProfiles.values())
      .some(record => record.channelId === channelId);
  }

  // Clean up old tracking data
  cleanupOldTracking(maxAge = 24 * 60 * 60 * 1000) { // 24 hours
    const now = Date.now();
    const expiredChannels = [];

    for (const [channelId, tracking] of this.fallbackAttempts) {
      if (now - tracking.startTime > maxAge) {
        expiredChannels.push(channelId);
      }
    }

    expiredChannels.forEach(channelId => {
      this.fallbackAttempts.delete(channelId);
    });

    if (expiredChannels.length > 0) {
      console.log(`Cleaned up ${expiredChannels.length} expired fallback tracking records`);
    }

    return expiredChannels.length;
  }

  // Export successful profiles for analysis
  exportSuccessfulProfiles() {
    const profiles = Array.from(this.successfulProfiles.values());
    return profiles.map(record => ({
      channelId: record.channelId,
      profile: {
        resolution: record.profile.resolution,
        video_bitrate: record.profile.video_bitrate,
        video_codec: record.profile.video_codec,
        audio_codec: record.profile.audio_codec,
        hls_segment_type: record.profile.hls_segment_type,
        preset: record.profile.preset,
        tune: record.profile.tune
      },
      successCount: record.successCount,
      firstSuccess: record.firstSuccess,
      lastSuccess: record.lastSuccess
    }));
  }

  // Import successful profiles (for persistence)
  importSuccessfulProfiles(profiles) {
    profiles.forEach(record => {
      const key = `${record.channelId}_${record.profile.resolution}_${record.profile.video_bitrate}`;
      this.successfulProfiles.set(key, {
        channelId: record.channelId,
        profile: record.profile,
        successCount: record.successCount,
        firstSuccess: record.firstSuccess,
        lastSuccess: record.lastSuccess
      });
    });
    
    console.log(`Imported ${profiles.length} successful profile records`);
  }
}

module.exports = FallbackManager;
