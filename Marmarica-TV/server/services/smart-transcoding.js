const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const StreamAnalyzer = require('./stream-analyzer');
const DynamicProfileGenerator = require('./dynamic-profile-generator');
const FallbackManager = require('./fallback-manager');

class SmartTranscodingEngine {
  constructor() {
    this.db = null;
    this.streamAnalyzer = new StreamAnalyzer();
    this.profileGenerator = new DynamicProfileGenerator();
    this.fallbackManager = new FallbackManager();
    
    // Configuration
    this.hlsOutputBase = process.env.HLS_OUTPUT_BASE || '/var/www/html/hls_stream';
    this.ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
    this.serverBaseUrl = process.env.SERVER_BASE_URL || 'http://192.168.1.15';
    // HLS streams are served by nginx on port 80, not the Express server
    this.hlsBaseUrl = process.env.HLS_BASE_URL || process.env.SERVER_BASE_URL?.replace(':5000', '') || 'http://192.168.1.15';
    this.enableSmartMode = process.env.ENABLE_SMART_TRANSCODING !== 'false';
    
    // Active processes tracking
    this.activeProcesses = new Map();
    
    console.log(`Smart Transcoding Engine initialized (Smart Mode: ${this.enableSmartMode})`);
  }

  // Set database reference
  setDatabase(database) {
    this.db = database;
  }

  // Main smart transcoding entry point
  async startSmartTranscoding(channelId, inputUrl, channelName, options = {}) {
    try {
      console.log(`Starting smart transcoding for channel ${channelId}: ${channelName}`);
      
      // Initialize fallback tracking
      this.fallbackManager.initializeFallbackTracking(channelId);
      
      // Update channel status
      await this.updateChannelStatus(channelId, 'analyzing');
      
      // Check if we should use smart mode
      let profile;
      if (this.enableSmartMode && !options.forceStaticProfile) {
        profile = await this.generateSmartProfile(channelId, inputUrl, options);
      } else {
        profile = await this.getStaticProfile(channelId, options.profileId);
      }
      
      // Start transcoding with the profile
      const result = await this.executeTranscoding(channelId, inputUrl, channelName, profile);
      
      // Record success
      this.fallbackManager.recordFallbackResult(channelId, true);
      
      return result;
      
    } catch (error) {
      console.error(`Smart transcoding failed for channel ${channelId}:`, error);
      
      // Check if we should attempt fallback
      if (this.fallbackManager.shouldAttemptFallback(channelId, error)) {
        console.log(`Attempting fallback for channel ${channelId}`);
        return await this.attemptFallback(channelId, inputUrl, channelName, error);
      }
      
      // Record failure
      this.fallbackManager.recordFallbackResult(channelId, false, error);
      await this.updateChannelStatus(channelId, 'failed');
      
      throw error;
    }
  }

  // Generate smart profile based on stream analysis
  async generateSmartProfile(channelId, inputUrl, options = {}) {
    console.log(`Generating smart profile for channel ${channelId}`);
    
    try {
      // Check for cached analysis first
      const cachedAnalysis = await this.getCachedAnalysis(channelId, inputUrl);
      
      let analysis;
      if (cachedAnalysis && this.isAnalysisValid(cachedAnalysis)) {
        console.log(`Using cached analysis for channel ${channelId}`);
        analysis = cachedAnalysis;
      } else {
        // Perform fresh analysis
        console.log(`Performing fresh analysis for channel ${channelId}`);
        analysis = await this.streamAnalyzer.analyzeStream(inputUrl);
        
        // Cache the analysis
        await this.cacheAnalysis(channelId, inputUrl, analysis);
      }
      
      // Check if we have a successful profile for this channel
      const recommendedProfile = this.fallbackManager.getRecommendedProfile(channelId, analysis);
      
      if (recommendedProfile.is_dynamic) {
        console.log(`Using learned profile for channel ${channelId}`);
        return recommendedProfile;
      }
      
      // Generate new dynamic profile
      const profile = this.profileGenerator.generateProfile(analysis, channelId, options);
      
      // Store last working profile reference
      await this.updateLastWorkingProfile(channelId, profile);
      
      return profile;
      
    } catch (error) {
      console.error(`Smart profile generation failed for channel ${channelId}:`, error);
      
      // Fall back to static profile
      console.log(`Falling back to static profile for channel ${channelId}`);
      return await this.getStaticProfile(channelId, options.profileId);
    }
  }

  // Get static profile (existing behavior)
  async getStaticProfile(channelId, profileId = null) {
    return new Promise((resolve, reject) => {
      if (!profileId) {
        // Get channel's assigned profile or default
        this.db.get(
          'SELECT transcoding_profile_id FROM channels WHERE id = ?',
          [channelId],
          (err, row) => {
            if (err) {
              reject(err);
            } else {
              const assignedProfileId = row?.transcoding_profile_id;
              this.getProfileById(assignedProfileId).then(resolve).catch(reject);
            }
          }
        );
      } else {
        this.getProfileById(profileId).then(resolve).catch(reject);
      }
    });
  }

  // Get profile by ID
  async getProfileById(profileId = null) {
    return new Promise((resolve, reject) => {
      if (!profileId) {
        // Get default profile
        this.db.get(
          'SELECT * FROM transcoding_profiles WHERE is_default = 1',
          (err, row) => {
            if (err) {
              reject(err);
            } else if (row) {
              resolve(this.normalizeProfile(row));
            } else {
              reject(new Error('No default transcoding profile found'));
            }
          }
        );
      } else {
        // Get specific profile
        this.db.get(
          'SELECT * FROM transcoding_profiles WHERE id = ?',
          [profileId],
          (err, row) => {
            if (err) {
              reject(err);
            } else if (row) {
              resolve(this.normalizeProfile(row));
            } else {
              reject(new Error(`Transcoding profile with ID ${profileId} not found`));
            }
          }
        );
      }
    });
  }

  // Normalize profile to consistent format
  normalizeProfile(dbProfile) {
    const outputDir = path.join(this.hlsOutputBase, `channel_${dbProfile.id || 'unknown'}`);
    
    return {
      id: dbProfile.id,
      name: dbProfile.name,
      description: dbProfile.description,
      video_codec: dbProfile.video_codec,
      video_bitrate: dbProfile.video_bitrate,
      audio_codec: dbProfile.audio_codec,
      audio_bitrate: dbProfile.audio_bitrate,
      resolution: dbProfile.resolution,
      preset: dbProfile.preset,
      tune: dbProfile.tune,
      profile: dbProfile.profile,
      level: dbProfile.level,
      gop_size: dbProfile.gop_size,
      keyint_min: dbProfile.keyint_min,
      hls_time: dbProfile.hls_time,
      hls_list_size: dbProfile.hls_list_size,
      hls_segment_type: dbProfile.hls_segment_type || 'mpegts', // Default to mpegts
      hls_flags: dbProfile.hls_flags,
      hls_segment_filename: dbProfile.hls_segment_filename || 'output_%d.ts',
      manifest_filename: dbProfile.manifest_filename || 'output.m3u8',
      additional_params: dbProfile.additional_params,
      is_dynamic: false,
      is_default: dbProfile.is_default,
      output_dir: outputDir,
      output_path: path.join(outputDir, dbProfile.manifest_filename || 'output.m3u8'),
      segment_path: path.join(outputDir, dbProfile.hls_segment_filename || 'output_%d.ts')
    };
  }

  // Execute transcoding with given profile
  async executeTranscoding(channelId, inputUrl, channelName, profile) {
    console.log(`Executing transcoding for channel ${channelId} with profile: ${profile.name}`);
    
    // Create output directory
    const outputDir = this.createOutputDirectory(channelId);
    
    // Generate FFmpeg command
    const ffmpegCommand = this.generateFFmpegCommand(inputUrl, channelId, profile);
    
    console.log(`FFmpeg command: ${this.ffmpegPath} ${ffmpegCommand.join(' ')}`);
    
    // Create transcoding job record
    const jobId = await this.createTranscodingJob(channelId, profile, outputDir);
    
    // Start FFmpeg process
    const ffmpegProcess = spawn(this.ffmpegPath, ffmpegCommand);
    const pid = ffmpegProcess.pid;
    
    if (!pid) {
      throw new Error('FFmpeg process failed to start - no PID');
    }
    
    console.log(`Started FFmpeg process with PID: ${pid}`);
    
    // Store process reference
    this.activeProcesses.set(channelId, {
      process: ffmpegProcess,
      jobId: jobId,
      channelName: channelName,
      profile: profile,
      startTime: Date.now()
    });
    
    // Update job status
    await this.updateJobStatus(jobId, 'running', null, pid);
    
    // Set up process handlers
    this.setupProcessHandlers(channelId, ffmpegProcess, jobId, profile);
    
    // Update channel status after brief delay
    setTimeout(async () => {
      if (this.activeProcesses.has(channelId)) {
        const manifestUrl = `${this.hlsBaseUrl}/hls_stream/channel_${channelId}/${profile.manifest_filename}`;
        await this.updateChannelStatus(channelId, 'active', manifestUrl);
      }
    }, 3000);
    
    return {
      success: true,
      jobId,
      pid,
      profile: profile.name,
      isSmartProfile: profile.is_dynamic
    };
  }

  // Attempt fallback on transcoding failure
  async attemptFallback(channelId, inputUrl, channelName, originalError) {
    console.log(`Attempting fallback for channel ${channelId}`);
    
    try {
      // Get current profile for fallback generation
      const currentProfile = this.activeProcesses.get(channelId)?.profile;
      
      if (!currentProfile) {
        throw new Error('No current profile found for fallback');
      }
      
      // Generate fallback profile
      const fallbackProfile = await this.fallbackManager.generateFallbackProfile(
        channelId,
        currentProfile,
        null // Analysis not needed for fallback
      );
      
      // Add delay before retry
      const delay = this.fallbackManager.getFallbackDelay(channelId);
      if (delay > 0) {
        console.log(`Waiting ${delay}ms before fallback attempt`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      // Update status
      await this.updateChannelStatus(channelId, 'retrying');
      
      // Try with fallback profile
      return await this.executeTranscoding(channelId, inputUrl, channelName, fallbackProfile);
      
    } catch (fallbackError) {
      console.error(`Fallback failed for channel ${channelId}:`, fallbackError);
      
      // Record fallback failure
      this.fallbackManager.recordFallbackResult(channelId, false, fallbackError);
      
      // Check if we should try another fallback level
      if (this.fallbackManager.shouldAttemptFallback(channelId, fallbackError)) {
        console.log(`Attempting next fallback level for channel ${channelId}`);
        return await this.attemptFallback(channelId, inputUrl, channelName, fallbackError);
      }
      
      // No more fallbacks available
      await this.updateChannelStatus(channelId, 'failed');
      throw fallbackError;
    }
  }

  // Helper function to ensure mandatory cleanup flags are present
  ensureMandatoryCleanupFlags(command) {
    const mandatoryFlags = [
      'delete_segments',
      'program_date_time',
      'independent_segments',
      'split_by_time'
    ];

    // Find the -hls_flags parameter
    const hlsFlagsIndex = command.findIndex(arg => arg === '-hls_flags');
    
    if (hlsFlagsIndex !== -1 && hlsFlagsIndex + 1 < command.length) {
      const currentFlags = command[hlsFlagsIndex + 1].split('+');
      const missingFlags = mandatoryFlags.filter(flag => !currentFlags.includes(flag));
      
      if (missingFlags.length > 0) {
        // Add missing flags
        command[hlsFlagsIndex + 1] = [...currentFlags, ...missingFlags].join('+');
        console.log(`Added missing mandatory HLS flags: ${missingFlags.join('+')}`);
      }
    } else {
      // Add -hls_flags if not present
      const hlsTimeIndex = command.findIndex(arg => arg === '-hls_time');
      if (hlsTimeIndex !== -1) {
        command.splice(hlsTimeIndex, 0, '-hls_flags', mandatoryFlags.join('+'));
      } else {
        command.push('-hls_flags', mandatoryFlags.join('+'));
      }
      console.log('Added mandatory HLS flags to command');
    }

    // Ensure -hls_delete_threshold is present
    const deleteThresholdIndex = command.findIndex(arg => arg === '-hls_delete_threshold');
    if (deleteThresholdIndex === -1) {
      command.push('-hls_delete_threshold', '1');
      console.log('Added mandatory hls_delete_threshold to command');
    }

    return command;
  }

  // Generate FFmpeg command from profile
  generateFFmpegCommand(inputUrl, channelId, profile) {
    const outputPath = path.join(this.hlsOutputBase, `channel_${channelId}`, profile.manifest_filename);
    const segmentPath = path.join(this.hlsOutputBase, `channel_${channelId}`, profile.hls_segment_filename);
    
    let command = [
      '-hide_banner',
      '-loglevel', 'warning',
      '-i', inputUrl,
      '-c:v', profile.video_codec,
      '-preset', profile.preset,
      '-g', profile.gop_size.toString(),
      '-keyint_min', profile.keyint_min.toString(),
      '-sc_threshold', '0',
      '-c:a', profile.audio_codec,
      '-b:a', profile.audio_bitrate,
      '-f', 'hls',
      '-hls_time', profile.hls_time.toString(),
      '-hls_list_size', Math.max(profile.hls_list_size, 6).toString(), // Minimum 6 for live streams
      '-hls_segment_type', 'mpegts', // Force mpegts for consistency
      '-hls_flags', profile.hls_flags || 'delete_segments+program_date_time+independent_segments+split_by_time',
      '-hls_segment_filename', segmentPath,
      '-hls_start_number_source', 'epoch',
      outputPath
    ];
    
    // Add video bitrate if specified
    if (profile.video_bitrate && profile.video_bitrate !== 'original') {
      const insertIndex = command.findIndex(arg => arg === '-c:v') + 2;
      command.splice(insertIndex, 0, '-b:v', profile.video_bitrate);
    }
    
    // Add tune parameter if specified
    if (profile.tune) {
      const insertIndex = command.findIndex(arg => arg === '-preset') + 2;
      command.splice(insertIndex, 0, '-tune', profile.tune);
    }
    
    // Add resolution scaling if specified
    if (profile.resolution && profile.resolution !== 'original') {
      let scaleFilter = '';
      switch (profile.resolution) {
        case '720p':
          scaleFilter = 'scale=1280:720';
          break;
        case '1080p':
          scaleFilter = 'scale=1920:1080';
          break;
        case '480p':
          scaleFilter = 'scale=854:480';
          break;
        default:
          if (profile.resolution.includes('x')) {
            scaleFilter = `scale=${profile.resolution.replace('x', ':')}`;
          }
      }
      
      if (scaleFilter) {
        const insertIndex = command.findIndex(arg => arg === '-f');
        command.splice(insertIndex, 0, '-vf', scaleFilter);
      }
    }
    
    // Add additional parameters
    if (profile.additional_params) {
      const additionalArgs = profile.additional_params.split(' ').filter(arg => arg.trim());
      const insertIndex = command.length - 1;
      command.splice(insertIndex, 0, ...additionalArgs);
    }
    
    // Ensure mandatory cleanup flags are present (this is non-negotiable for live streams)
    command = this.ensureMandatoryCleanupFlags(command);
    
    return command;
  }

  // Setup FFmpeg process event handlers
  setupProcessHandlers(channelId, ffmpegProcess, jobId, profile) {
    ffmpegProcess.stdout.on('data', (data) => {
      // Handle stdout if needed
    });
    
    ffmpegProcess.stderr.on('data', (data) => {
      const output = data.toString();
      
      // Check for errors that might warrant fallback
      if (output.includes('Could not write header') || 
          output.includes('incorrect codec parameters') ||
          output.includes('SPS') || output.includes('PPS')) {
        console.error(`FFmpeg error for channel ${channelId}: ${output}`);
        
        // Store error for potential fallback
        const processInfo = this.activeProcesses.get(channelId);
        if (processInfo) {
          processInfo.lastError = output;
        }
      }
    });
    
    ffmpegProcess.on('close', async (code) => {
      console.log(`FFmpeg process for channel ${channelId} closed with code ${code}`);
      
      this.activeProcesses.delete(channelId);
      
      if (code === 0) {
        // Success
        await this.updateJobStatus(jobId, 'completed');
        const manifestUrl = `${this.hlsBaseUrl}/hls_stream/channel_${channelId}/${profile.manifest_filename}`;
        await this.updateChannelStatus(channelId, 'active', manifestUrl);
        
        // Record success for learning
        this.fallbackManager.recordFallbackResult(channelId, true);
        
      } else {
        // Failure
        await this.updateJobStatus(jobId, 'failed', `Process exited with code ${code}`);
        
        // Check if we should attempt fallback
        const processInfo = this.activeProcesses.get(channelId);
        const error = new Error(processInfo?.lastError || `Process exited with code ${code}`);
        
        if (this.fallbackManager.shouldAttemptFallback(channelId, error)) {
          // Trigger fallback (this would need to be handled at a higher level)
          console.log(`Process exit triggered fallback consideration for channel ${channelId}`);
        } else {
          await this.updateChannelStatus(channelId, 'failed');
        }
      }
    });
    
    ffmpegProcess.on('error', async (error) => {
      console.error(`FFmpeg process error for channel ${channelId}:`, error);
      
      this.activeProcesses.delete(channelId);
      await this.updateJobStatus(jobId, 'failed', error.message);
      await this.updateChannelStatus(channelId, 'failed');
    });
  }

  // Create output directory
  createOutputDirectory(channelId) {
    const outputDir = path.join(this.hlsOutputBase, `channel_${channelId}`);
    
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      console.log(`Created output directory: ${outputDir}`);
    }
    
    return outputDir;
  }

  // Database operations
  async createTranscodingJob(channelId, profile, outputDir) {
    const now = new Date().toISOString();
    const outputPath = path.join(outputDir, profile.manifest_filename);
    
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO transcoding_jobs (channel_id, output_path, status, profile_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [channelId, outputPath, 'starting', profile.id, now, now],
        function (err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.lastID);
          }
        }
      );
    });
  }

  async updateJobStatus(jobId, status, errorMessage = null, ffmpegPid = null) {
    const now = new Date().toISOString();
    let sql = 'UPDATE transcoding_jobs SET status = ?, updated_at = ?';
    let params = [status, now];
    
    if (errorMessage !== null) {
      sql += ', error_message = ?';
      params.push(errorMessage);
    }
    
    if (ffmpegPid !== null) {
      sql += ', ffmpeg_pid = ?';
      params.push(ffmpegPid);
    }
    
    sql += ' WHERE id = ?';
    params.push(jobId);
    
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async updateChannelStatus(channelId, status, transcodedUrl = null) {
    const now = new Date().toISOString();
    let sql = 'UPDATE channels SET transcoding_status = ?, updated_at = ?';
    let params = [status, now];
    
    if (transcodedUrl !== null) {
      sql += ', transcoded_url = ?';
      params.push(transcodedUrl);
    }
    
    sql += ' WHERE id = ?';
    params.push(channelId);
    
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  // Cache management
  async getCachedAnalysis(channelId, inputUrl) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM stream_analysis_cache WHERE channel_id = ? AND input_url = ? AND is_valid = 1',
        [channelId, inputUrl],
        (err, row) => {
          if (err) {
            reject(err);
          } else if (row) {
            try {
              const analysis = JSON.parse(row.analysis_data);
              resolve(analysis);
            } catch (parseError) {
              resolve(null);
            }
          } else {
            resolve(null);
          }
        }
      );
    });
  }

  async cacheAnalysis(channelId, inputUrl, analysis) {
    const now = new Date().toISOString();
    
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT OR REPLACE INTO stream_analysis_cache (channel_id, input_url, analysis_data, last_analyzed, is_valid) VALUES (?, ?, ?, ?, ?)',
        [channelId, inputUrl, JSON.stringify(analysis), now, 1],
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  async updateLastWorkingProfile(channelId, profile) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE channels SET last_working_profile_id = ?, stream_stability_score = ? WHERE id = ?',
        [profile.id, profile.confidence || 0.5, channelId],
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  isAnalysisValid(analysis, maxAge = 60 * 60 * 1000) { // 1 hour
    if (!analysis || !analysis.timestamp) return false;
    
    const age = Date.now() - new Date(analysis.timestamp).getTime();
    return age < maxAge;
  }

  // Stop transcoding
  async stopTranscoding(channelId, channelName) {
    console.log(`Stopping smart transcoding for channel ${channelId}: ${channelName}`);
    
    await this.updateChannelStatus(channelId, 'stopping');
    
    if (this.activeProcesses.has(channelId)) {
      const { process, jobId } = this.activeProcesses.get(channelId);
      
      process.kill('SIGTERM');
      this.activeProcesses.delete(channelId);
      
      await this.updateJobStatus(jobId, 'stopped');
    }
    
    // Clean up output directory
    const outputDir = path.join(this.hlsOutputBase, `channel_${channelId}`);
    if (fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
    
    await this.updateChannelStatus(channelId, 'inactive', null);
    
    // Reset fallback tracking
    this.fallbackManager.resetFallbackTracking(channelId);
    
    return { success: true };
  }

  // Get system statistics
  getSystemStats() {
    return {
      activeProcesses: this.activeProcesses.size,
      smartModeEnabled: this.enableSmartMode,
      cacheStats: this.streamAnalyzer.getCacheStats(),
      profileCacheStats: this.profileGenerator.getCacheStats(),
      fallbackStats: this.fallbackManager.getFallbackStats()
    };
  }
}

module.exports = SmartTranscodingEngine;
