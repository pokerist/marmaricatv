const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Database reference - will be set when available
let db = null;

// Function to set database reference
const setDatabase = (database) => {
  db = database;
};

// Function to get database reference safely
const getDatabase = () => {
  return db;
};

// Configuration
const HLS_OUTPUT_BASE = process.env.HLS_OUTPUT_BASE || '/var/www/html/hls_stream';
const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';
const SERVER_BASE_URL = process.env.SERVER_BASE_URL || 'http://192.168.1.15';
// HLS streams are served by nginx on port 80, not the Express server
const HLS_BASE_URL = process.env.HLS_BASE_URL || process.env.SERVER_BASE_URL?.replace(':5000', '') || 'http://192.168.1.15';

// Enhanced cleanup configuration
const CLEANUP_INTERVAL = parseInt(process.env.CLEANUP_INTERVAL) || 5 * 60 * 1000;
const MAX_SEGMENT_AGE = parseInt(process.env.MAX_SEGMENT_AGE) || 30 * 1000;
const MAX_CHANNEL_DIR_SIZE = parseInt(process.env.MAX_CHANNEL_DIR_SIZE) || 100 * 1024 * 1024;
const HLS_LIST_SIZE = parseInt(process.env.HLS_LIST_SIZE) || 3;
const ORPHANED_DIR_CLEANUP_AGE = parseInt(process.env.ORPHANED_DIR_CLEANUP_AGE) || 60 * 60 * 1000;

// Enhanced concurrency configuration (optimized for 44 cores / 40GB RAM)
const CONCURRENCY_CONFIG = {
  MAX_CONCURRENT_HIGH_QUALITY: 15,    // 1080p streams
  MAX_CONCURRENT_MEDIUM_QUALITY: 25,  // 720p streams  
  MAX_CONCURRENT_LOW_QUALITY: 35,     // 480p streams
  MAX_CONCURRENT_COPY_MODE: 45,       // Copy mode (no transcoding)
  
  STARTUP_STAGGER_DELAY: 2000,        // 2 seconds between starts
  PROFILE_MIGRATION_STAGGER: 3000,    // 3 seconds for profile changes
  BULK_OPERATION_STAGGER: 1500,       // 1.5 seconds for bulk ops
  
  CPU_WARNING_THRESHOLD: 70,
  CPU_CRITICAL_THRESHOLD: 85,
  RAM_WARNING_THRESHOLD: 75,
  RAM_CRITICAL_THRESHOLD: 90,
};

// Error detection patterns
const ERROR_PATTERNS = {
  STREAM_DECODE: /non-existing PPS|SPS unavailable|decode_slice_header error|no frame|Header missing/,
  INVALID_DATA: /Invalid data found when processing input/,
  CONNECTION_LOST: /Connection refused|No route to host|End of file/,
  TIMEOUT: /Operation timed out|Read timeout/,
  RESOURCE_ERROR: /Cannot allocate memory|Out of memory/
};

// Fallback profile hierarchy
const FALLBACK_PROFILES = [
  { name: 'high_quality', level: 1, maxConcurrent: 15 },
  { name: 'medium_quality', level: 2, maxConcurrent: 25 },
  { name: 'low_quality', level: 3, maxConcurrent: 35 },
  { name: 'copy_mode', level: 4, maxConcurrent: 45 }
];

// Dead source detection configuration
const DEAD_SOURCE_CONFIG = {
  MAX_ERRORS_IN_COPY_MODE: 5,
  ERROR_WINDOW: 30000,
  OFFLINE_COOLDOWN: 300000,
  MAX_DEAD_SOURCE_RETRIES: 3,
  PERMANENT_OFFLINE_THRESHOLD: 24 * 60 * 60 * 1000
};

// Store active FFmpeg processes with enhanced tracking
const activeProcesses = new Map();
const errorCounts = new Map();
const errorTimestamps = new Map();
const fallbackHistory = new Map();
const resourceUsage = new Map();

// Store cleanup interval
let cleanupInterval = null;

// Dead Source Detector Class
class DeadSourceDetector {
  constructor() {
    this.errorCounts = new Map();
    this.errorTimestamps = new Map();
  }

  checkForDeadSource(channelId, errorMessage, currentProfile) {
    // Only trigger if we're in copy mode (lowest fallback)
    if (currentProfile.level !== 4) return false;

    // Check if error matches dead source patterns
    const isDeadSourceError = Object.values(ERROR_PATTERNS)
      .some(pattern => pattern.test(errorMessage));

    if (!isDeadSourceError) return false;

    // Track error count in time window
    const now = Date.now();
    const errorTimes = this.errorTimestamps.get(channelId) || [];
    
    // Remove old errors outside time window
    const recentErrors = errorTimes.filter(time => 
      now - time < DEAD_SOURCE_CONFIG.ERROR_WINDOW
    );

    recentErrors.push(now);
    this.errorTimestamps.set(channelId, recentErrors);

    // Check if we've exceeded the threshold
    return recentErrors.length >= DEAD_SOURCE_CONFIG.MAX_ERRORS_IN_COPY_MODE;
  }

  reset(channelId) {
    this.errorCounts.delete(channelId);
    this.errorTimestamps.delete(channelId);
  }
}

const deadSourceDetector = new DeadSourceDetector();

// Enhanced logging function
const logAction = (actionType, description, channelId = null, additionalData = null) => {
  const now = new Date().toISOString();
  const logData = {
    action_type: actionType,
    description: description,
    channel_id: channelId,
    additional_data: additionalData ? JSON.stringify(additionalData) : null,
    created_at: now
  };

  db.run(
    'INSERT INTO actions (action_type, description, channel_id, additional_data, created_at) VALUES (?, ?, ?, ?, ?)',
    [logData.action_type, logData.description, logData.channel_id, logData.additional_data, logData.created_at],
    (err) => {
      if (err) {
        console.error('Error logging action:', err.message);
      }
    }
  );
};

// Enhanced channel status update
const updateChannelStatus = (channelId, status, transcodedUrl = null, persistState = true, offlineReason = null) => {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    let sql = 'UPDATE channels SET transcoding_status = ?, updated_at = ?';
    let params = [status, now];

    if (transcodedUrl !== null) {
      sql += ', transcoded_url = ?';
      params.push(transcodedUrl);
    }

    if (offlineReason !== null) {
      sql += ', offline_reason = ?';
      params.push(offlineReason);
    }

    if (persistState) {
      const persistentState = ['active', 'offline_temporary', 'offline_permanent'].includes(status) ? status : 'inactive';
      sql += ', last_transcoding_state = ?';
      params.push(persistentState);
    }

    sql += ' WHERE id = ?';
    params.push(channelId);

    db.run(sql, params, function (err) {
      if (err) {
        console.error('Error updating channel status:', err.message);
        reject(err);
      } else {
        resolve();
      }
    });
  });
};

// Enhanced job status update
const updateJobStatus = (jobId, status, errorMessage = null, ffmpegPid = null, profileId = null) => {
  return new Promise((resolve, reject) => {
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

    if (profileId !== null) {
      sql += ', profile_id = ?';
      params.push(profileId);
    }

    sql += ' WHERE id = ?';
    params.push(jobId);

    db.run(sql, params, function (err) {
      if (err) {
        console.error('Error updating job status:', err.message);
        reject(err);
      } else {
        resolve();
      }
    });
  });
};

// Log dead source event
const logDeadSourceEvent = (channelId, errorPatterns, cooldownUntil, retryCount = 0) => {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    db.run(
      'INSERT INTO dead_source_events (channel_id, error_count, error_patterns, profile_level, cooldown_until, retry_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [channelId, DEAD_SOURCE_CONFIG.MAX_ERRORS_IN_COPY_MODE, errorPatterns.join(','), 4, cooldownUntil.toISOString(), retryCount, now],
      function (err) {
        if (err) {
          console.error('Error logging dead source event:', err.message);
          reject(err);
        } else {
          resolve(this.lastID);
        }
      }
    );
  });
};

// Handle dead source detection
const handleDeadSource = async (channelId, channelName, errorPatterns) => {
  try {
    console.log(`Dead source detected for channel ${channelId}: ${channelName}`);
    
    // Force kill FFmpeg process
    const activeProcess = activeProcesses.get(channelId);
    if (activeProcess) {
      activeProcess.process.kill('SIGKILL');
      activeProcesses.delete(channelId);
    }

    // Calculate cooldown period
    const cooldownUntil = new Date(Date.now() + DEAD_SOURCE_CONFIG.OFFLINE_COOLDOWN);

    // Mark channel as offline temporary
    await updateChannelStatus(channelId, 'offline_temporary', null, true, 
      `Dead source detected: ${errorPatterns.join(', ')}`);
    
    // Log dead source event
    await logDeadSourceEvent(channelId, errorPatterns, cooldownUntil);

    // Update dead source count
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE channels SET dead_source_count = dead_source_count + 1, last_dead_source_event = ? WHERE id = ?',
        [new Date().toISOString(), channelId],
        (err) => {
          if (err) {
            console.error('Error updating dead source count:', err.message);
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });

    // Schedule automatic retry after cooldown
    setTimeout(() => {
      attemptDeadSourceRecovery(channelId, channelName);
    }, DEAD_SOURCE_CONFIG.OFFLINE_COOLDOWN);

    logAction('dead_source_detected', `Channel marked as dead source: ${channelName}`, channelId, {
      error_patterns: errorPatterns,
      cooldown_until: cooldownUntil.toISOString()
    });

  } catch (error) {
    console.error(`Error handling dead source for channel ${channelId}:`, error);
  }
};

// Attempt to recover from dead source
const attemptDeadSourceRecovery = async (channelId, channelName) => {
  try {
    console.log(`Attempting dead source recovery for channel ${channelId}: ${channelName}`);

    // Get current retry count
    const deadSourceEvent = await new Promise((resolve, reject) => {
      db.get(
        'SELECT retry_count FROM dead_source_events WHERE channel_id = ? ORDER BY created_at DESC LIMIT 1',
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

    const retryCount = deadSourceEvent ? deadSourceEvent.retry_count + 1 : 1;

    if (retryCount > DEAD_SOURCE_CONFIG.MAX_DEAD_SOURCE_RETRIES) {
      // Mark as permanently offline
      await updateChannelStatus(channelId, 'offline_permanent', null, true, 
        'Maximum dead source retries exceeded');
      
      logAction('dead_source_permanent', `Channel marked as permanently offline: ${channelName}`, channelId);
      return;
    }

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

    if (!channel || !channel.transcoding_enabled) {
      console.log(`Skipping recovery for disabled channel ${channelId}`);
      return;
    }

    // Reset dead source detector
    deadSourceDetector.reset(channelId);

    // Try to restart transcoding
    await startTranscoding(channel.id, channel.url, channel.name);

    logAction('dead_source_recovery_attempt', `Dead source recovery attempt ${retryCount} for channel: ${channelName}`, channelId);

  } catch (error) {
    console.error(`Error in dead source recovery for channel ${channelId}:`, error);
    
    // Schedule next retry if we haven't exceeded max retries
    if (retryCount < DEAD_SOURCE_CONFIG.MAX_DEAD_SOURCE_RETRIES) {
      setTimeout(() => {
        attemptDeadSourceRecovery(channelId, channelName);
      }, DEAD_SOURCE_CONFIG.OFFLINE_COOLDOWN);
    }
  }
};

// Get appropriate fallback profile
const getFallbackProfile = async (channelId, currentProfileId, errorType) => {
  try {
    // Get current profile level
    const currentProfile = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM transcoding_profiles WHERE id = ?',
        [currentProfileId],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });

    if (!currentProfile) {
      throw new Error('Current profile not found');
    }

    // Determine current level based on profile characteristics
    let currentLevel = 1;
    if (currentProfile.video_codec === 'copy') {
      currentLevel = 4;
    } else if (currentProfile.resolution === '480p') {
      currentLevel = 3;
    } else if (currentProfile.resolution === '720p') {
      currentLevel = 2;
    }

    // Find next fallback level
    const nextLevel = currentLevel + 1;
    if (nextLevel > 4) {
      return null; // No more fallbacks available
    }

    // Get fallback profile
    const fallbackProfile = await new Promise((resolve, reject) => {
      let sql = 'SELECT * FROM transcoding_profiles WHERE ';
      let params = [];

      switch (nextLevel) {
        case 2:
          sql += 'resolution = ? AND video_codec != ?';
          params = ['720p', 'copy'];
          break;
        case 3:
          sql += 'resolution = ? AND video_codec != ?';
          params = ['480p', 'copy'];
          break;
        case 4:
          sql += 'video_codec = ?';
          params = ['copy'];
          break;
        default:
          reject(new Error('Invalid fallback level'));
          return;
      }

      sql += ' LIMIT 1';

      db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });

    return { profile: fallbackProfile, level: nextLevel };
  } catch (error) {
    console.error('Error getting fallback profile:', error);
    return null;
  }
};

// Check resource usage and availability
const checkResourceAvailability = async (profileId) => {
  try {
    // Get profile details
    const profile = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM transcoding_profiles WHERE id = ?',
        [profileId],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });

    if (!profile) {
      throw new Error('Profile not found');
    }

    // Count current active processes by type
    const activeByType = {
      high_quality: 0,
      medium_quality: 0,
      low_quality: 0,
      copy_mode: 0
    };

    for (const [channelId, processInfo] of activeProcesses) {
      const profileType = getProfileType(processInfo.profile);
      if (activeByType[profileType] !== undefined) {
        activeByType[profileType]++;
      }
    }

    // Check limits based on profile type
    const profileType = getProfileType(profile);
    const maxConcurrent = CONCURRENCY_CONFIG[`MAX_CONCURRENT_${profileType.toUpperCase()}`];

    return {
      available: activeByType[profileType] < maxConcurrent,
      current: activeByType[profileType],
      max: maxConcurrent,
      profileType: profileType
    };

  } catch (error) {
    console.error('Error checking resource availability:', error);
    return { available: false, error: error.message };
  }
};

// Get profile type based on characteristics
const getProfileType = (profile) => {
  if (profile.video_codec === 'copy') {
    return 'copy_mode';
  } else if (profile.resolution === '480p') {
    return 'low_quality';
  } else if (profile.resolution === '720p') {
    return 'medium_quality';
  } else {
    return 'high_quality';
  }
};

// Enhanced FFmpeg command generation with error recovery
const generateFFmpegCommand = async (inputUrl, channelId, profileId = null, isRetry = false) => {
  try {
    const outputDir = createOutputDirectory(channelId);
    
    // Get transcoding profile
    const profile = await getTranscodingProfile(profileId);
    console.log(`Using transcoding profile: ${profile.name} (ID: ${profile.id})`);

    // Add retry-specific parameters for unstable streams
    const retryParams = isRetry ? [
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      '-timeout', '10000000'
    ] : [];

    // Use profile-defined filenames or fallback to defaults (force .ts for mpegts)
    const manifestFilename = profile.manifest_filename || 'output.m3u8';
    const segmentFilename = profile.hls_segment_filename || 'output_%d.ts';
    
    const outputPath = path.join(outputDir, manifestFilename);
    const segmentPath = path.join(outputDir, segmentFilename);

    // Base command structure using profile settings
    let command = [
      ...retryParams,
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
      '-hls_playlist_type', '2',
      '-hls_segment_type', 'mpegts', // Force mpegts for consistency with TVHeadend
      '-hls_flags', profile.hls_flags || 'delete_segments+program_date_time+independent_segments+split_by_time',
      '-hls_segment_filename', segmentPath,
      '-hls_start_number_source', 'epoch',
      '-hls_list_size', Math.max(profile.hls_list_size, 6).toString(), // Minimum 6 for live streams
      '-hls_delete_threshold', '1',
      outputPath
    ];

    // Add video bitrate if specified
    if (profile.video_bitrate && profile.video_bitrate !== 'original') {
      const videoBitrateIndex = command.findIndex(arg => arg === '-c:v');
      command.splice(videoBitrateIndex + 2, 0, '-b:v', profile.video_bitrate);
    }

    // Add tune parameter if specified
    if (profile.tune) {
      const presetIndex = command.findIndex(arg => arg === '-preset');
      command.splice(presetIndex + 2, 0, '-tune', profile.tune);
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
        const formatIndex = command.findIndex(arg => arg === '-f');
        command.splice(formatIndex, 0, '-vf', scaleFilter);
      }
    }

    // Add additional parameters from profile
    if (profile.additional_params) {
      const additionalArgs = profile.additional_params.split(' ').filter(arg => arg.trim());
      const outputIndex = command.length - 1; // Before output path
      command.splice(outputIndex, 0, ...additionalArgs);
    }

    // Ensure mandatory cleanup flags are present
    command = ensureMandatoryCleanupFlags(command);

    console.log(`Generated FFmpeg command for profile ${profile.name}${isRetry ? ' (retry)' : ''}`);
    return { command, outputPath, profile };

  } catch (error) {
    console.error('Error generating FFmpeg command:', error);
    throw error;
  }
};

// Create output directory for a channel
const createOutputDirectory = (channelId) => {
  const outputDir = path.join(HLS_OUTPUT_BASE, `channel_${channelId}`);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`Created output directory: ${outputDir}`);
  }

  return outputDir;
};

// Helper function to get transcoding profile
const getTranscodingProfile = (profileId) => {
  return new Promise((resolve, reject) => {
    if (!profileId) {
      // Get default profile if no ID provided
      db.get('SELECT * FROM transcoding_profiles WHERE is_default = 1', (err, row) => {
        if (err) {
          reject(err);
        } else if (row) {
          resolve(row);
        } else {
          reject(new Error('No default transcoding profile found'));
        }
      });
    } else {
      // Get specific profile
      db.get('SELECT * FROM transcoding_profiles WHERE id = ?', [profileId], (err, row) => {
        if (err) {
          reject(err);
        } else if (row) {
          resolve(row);
        } else {
          reject(new Error(`Transcoding profile with ID ${profileId} not found`));
        }
      });
    }
  });
};

// Enhanced mandatory cleanup flags
const ensureMandatoryCleanupFlags = (command) => {
  const mandatoryFlags = [
    'delete_segments',
    'program_date_time',
    'independent_segments',
    'split_by_time'
  ];

  const hlsFlagsIndex = command.findIndex(arg => arg === '-hls_flags');
  
  if (hlsFlagsIndex !== -1 && hlsFlagsIndex + 1 < command.length) {
    const currentFlags = command[hlsFlagsIndex + 1].split('+');
    const missingFlags = mandatoryFlags.filter(flag => !currentFlags.includes(flag));
    
    if (missingFlags.length > 0) {
      command[hlsFlagsIndex + 1] = [...currentFlags, ...missingFlags].join('+');
      console.log(`Added missing mandatory HLS flags: ${missingFlags.join('+')}`);
    }
  } else {
    const hlsTimeIndex = command.findIndex(arg => arg === '-hls_time');
    if (hlsTimeIndex !== -1) {
      command.splice(hlsTimeIndex, 0, '-hls_flags', mandatoryFlags.join('+'));
    } else {
      command.push('-hls_flags', mandatoryFlags.join('+'));
    }
    console.log('Added mandatory HLS flags to command');
  }

  const deleteThresholdIndex = command.findIndex(arg => arg === '-hls_delete_threshold');
  if (deleteThresholdIndex === -1) {
    command.push('-hls_delete_threshold', '1');
    console.log('Added mandatory hls_delete_threshold to command');
  }

  return command;
};

// Enhanced start transcoding with error handling and fallback
const startTranscoding = async (channelId, inputUrl, channelName, profileId = null, isRetry = false) => {
  try {
    console.log(`Starting transcoding for channel ${channelId}: ${channelName}${isRetry ? ' (retry)' : ''}`);

    // Validate input parameters
    if (!inputUrl || !inputUrl.trim()) {
      throw new Error('Input URL is required');
    }

    // Check resource availability
    const channel = await new Promise((resolve, reject) => {
      db.get('SELECT transcoding_profile_id FROM channels WHERE id = ?', [channelId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });

    const targetProfileId = profileId || channel?.transcoding_profile_id;
    const resourceCheck = await checkResourceAvailability(targetProfileId);
    
    if (!resourceCheck.available) {
      throw new Error(`Resource limit reached for profile type: ${resourceCheck.profileType} (${resourceCheck.current}/${resourceCheck.max})`);
    }

    // Update channel status to starting
    await updateChannelStatus(channelId, 'starting');

    // Generate FFmpeg command with profile
    const { command, outputPath, profile } = await generateFFmpegCommand(inputUrl, channelId, targetProfileId, isRetry);
    console.log(`FFmpeg command: ${FFMPEG_PATH} ${command.join(' ')}`);

    // Create transcoding job record
    const now = new Date().toISOString();
    const jobId = await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO transcoding_jobs (channel_id, output_path, status, profile_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [channelId, outputPath, 'starting', profile.id, now, now],
        function (err) {
          if (err) {
            console.error('Error creating transcoding job:', err.message);
            reject(err);
          } else {
            resolve(this.lastID);
          }
        }
      );
    });

    // Spawn FFmpeg process
    let ffmpegProcess;
    try {
      ffmpegProcess = spawn(FFMPEG_PATH, command);
    } catch (spawnError) {
      console.error('Failed to spawn FFmpeg process:', spawnError);
      await updateJobStatus(jobId, 'failed', `Failed to spawn FFmpeg: ${spawnError.message}`);
      await updateChannelStatus(channelId, 'failed');
      throw spawnError;
    }

    const pid = ffmpegProcess.pid;

    if (!pid) {
      const error = new Error('FFmpeg process failed to start - no PID');
      console.error(error.message);
      await updateJobStatus(jobId, 'failed', error.message);
      await updateChannelStatus(channelId, 'failed');
      throw error;
    }

    console.log(`Started FFmpeg process with PID: ${pid} using profile: ${profile.name}`);

    // Store process reference with enhanced tracking
    activeProcesses.set(channelId, {
      process: ffmpegProcess,
      jobId: jobId,
      channelName: channelName,
      profileId: profile.id,
      profile: profile,
      startTime: Date.now(),
      errorCount: 0,
      lastError: null
    });

    // Update job with PID
    await updateJobStatus(jobId, 'running', null, pid, profile.id);

    // Enhanced process event handlers
    ffmpegProcess.stdout.on('data', (data) => {
      // Monitor stdout for useful information
      const output = data.toString();
      if (output.includes('frame=') || output.includes('time=')) {
        // Update last activity timestamp
        const processInfo = activeProcesses.get(channelId);
        if (processInfo) {
          processInfo.lastActivity = Date.now();
        }
      }
    });

    ffmpegProcess.stderr.on('data', (data) => {
      const output = data.toString();
      const processInfo = activeProcesses.get(channelId);
      
      if (processInfo) {
        // Check for error patterns
        const errorType = detectErrorType(output);
        
        if (errorType) {
          console.error(`FFmpeg error detected for channel ${channelId}: ${output}`);
          processInfo.errorCount++;
          processInfo.lastError = output;
          
          // Check for dead source in copy mode
          if (deadSourceDetector.checkForDeadSource(channelId, output, processInfo.profile)) {
            console.log(`Dead source detected for channel ${channelId}`);
            handleDeadSource(channelId, channelName, [output.trim()]);
            return;
          }
          
          // Check if we should attempt fallback
          if (processInfo.errorCount >= 5) {
            console.log(`Multiple errors detected for channel ${channelId}, attempting fallback`);
            attemptFallback(channelId, channelName, inputUrl, processInfo.profile.id, errorType);
          }
        }
      }
    });

    ffmpegProcess.on('close', async (code) => {
      console.log(`FFmpeg process for channel ${channelId} closed with code ${code}`);
      const processInfo = activeProcesses.get(channelId);
      
      // Remove from active processes
      activeProcesses.delete(channelId);

      if (code === 0) {
        // Process completed successfully
        const manifestFilename = profile.manifest_filename || 'output.m3u8';
        await updateJobStatus(jobId, 'completed');
        await updateChannelStatus(channelId, 'active', `${HLS_BASE_URL}/hls_stream/channel_${channelId}/${manifestFilename}`);
        logAction('transcoding_completed', `Transcoding completed for channel: ${channelName} using profile: ${profile.name}`, channelId);
      } else {
        // Process failed
        await updateJobStatus(jobId, 'failed', `Process exited with code ${code}`);
        await updateChannelStatus(channelId, 'failed');
        logAction('transcoding_failed', `Transcoding failed for channel: ${channelName} (exit code: ${code})`, channelId);
      }
    });

    ffmpegProcess.on('error', async (err) => {
      console.error(`FFmpeg process error for channel ${channelId}:`, err);

      // Remove from active processes
      activeProcesses.delete(channelId);

      // Update job and channel status
      await updateJobStatus(jobId, 'failed', err.message);
      await updateChannelStatus(channelId, 'failed');
      logAction('transcoding_error', `Transcoding error for channel: ${channelName} - ${err.message}`, channelId);
    });

    // Give it a moment to start, then update status
    setTimeout(async () => {
      if (activeProcesses.has(channelId)) {
        const manifestFilename = profile.manifest_filename || 'output.m3u8';
        await updateChannelStatus(channelId, 'active', `${HLS_BASE_URL}/hls_stream/channel_${channelId}/${manifestFilename}`);
        logAction('transcoding_started', `Transcoding started for channel: ${channelName} using profile: ${profile.name}`, channelId);
      }
    }, 2000);

    return { success: true, jobId, pid, profile: profile.name };

  } catch (error) {
    console.error(`Error starting transcoding for channel ${channelId}:`, error);
    await updateChannelStatus(channelId, 'failed');
    throw error;
  }
};

// Detect error type from FFmpeg output
const detectErrorType = (output) => {
  for (const [type, pattern] of Object.entries(ERROR_PATTERNS)) {
    if (pattern.test(output)) {
      return type;
    }
  }
  return null;
};

// Attempt fallback to lower quality profile
const attemptFallback = async (channelId, channelName, inputUrl, currentProfileId, errorType) => {
  try {
    console.log(`Attempting fallback for channel ${channelId} due to ${errorType}`);
    
    // Get fallback profile
    const fallbackResult = await getFallbackProfile(channelId, currentProfileId, errorType);
    
    if (!fallbackResult || !fallbackResult.profile) {
      console.log(`No fallback profile available for channel ${channelId}`);
      return false;
    }

    // Stop current transcoding
    await stopTranscoding(channelId, channelName);

    // Wait a moment for cleanup
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Start with fallback profile
    await startTranscoding(channelId, inputUrl, channelName, fallbackResult.profile.id, true);

    // Log fallback event
    logAction('transcoding_fallback', `Fallback to profile: ${fallbackResult.profile.name} for channel: ${channelName}`, channelId, {
      from_profile: currentProfileId,
      to_profile: fallbackResult.profile.id,
      error_type: errorType,
      fallback_level: fallbackResult.level
    });

    return true;

  } catch (error) {
    console.error(`Error during fallback for channel ${channelId}:`, error);
    return false;
  }
};

// Stop transcoding for a channel
const stopTranscoding = async (channelId, channelName) => {
  try {
    console.log(`Stopping transcoding for channel ${channelId}: ${channelName}`);

    // Update channel status
    await updateChannelStatus(channelId, 'stopping');

    // Kill FFmpeg process if it's running
    if (activeProcesses.has(channelId)) {
      const { process, jobId } = activeProcesses.get(channelId);

      // Kill the process
      process.kill('SIGTERM');

      // Remove from active processes
      activeProcesses.delete(channelId);

      // Update job status
      await updateJobStatus(jobId, 'stopped');
    }

    // Clean up output directory
    const outputDir = path.join(HLS_OUTPUT_BASE, `channel_${channelId}`);
    if (fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true, force: true });
      console.log(`Cleaned up output directory: ${outputDir}`);
    }

    // Update channel status
    await updateChannelStatus(channelId, 'inactive', null);

    logAction('transcoding_stopped', `Transcoding stopped for channel: ${channelName}`, channelId);

    return { success: true };

  } catch (error) {
    console.error(`Error stopping transcoding for channel ${channelId}:`, error);
    throw error;
  }
};

// Restart transcoding for a channel
const restartTranscoding = async (channelId, inputUrl, channelName) => {
  try {
    console.log(`Restarting transcoding for channel ${channelId}: ${channelName}`);

    // First stop any existing transcoding
    await stopTranscoding(channelId, channelName);

    // Wait a moment for cleanup
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Start transcoding again
    return await startTranscoding(channelId, inputUrl, channelName);

  } catch (error) {
    console.error(`Error restarting transcoding for channel ${channelId}:`, error);
    throw error;
  }
};

// Get all active transcoding jobs
const getActiveJobs = () => {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT j.*, c.name as channel_name, c.url as channel_url, p.name as profile_name
       FROM transcoding_jobs j 
       JOIN channels c ON j.channel_id = c.id 
       LEFT JOIN transcoding_profiles p ON j.profile_id = p.id
       WHERE j.status IN ('starting', 'running') 
       ORDER BY j.created_at DESC`,
      (err, rows) => {
        if (err) {
          console.error('Error fetching active jobs:', err.message);
          reject(err);
        } else {
          resolve(rows);
        }
      }
    );
  });
};

// Bulk start transcoding with staggered delays
const bulkStartTranscoding = async (channelIds, staggerDelay = CONCURRENCY_CONFIG.BULK_OPERATION_STAGGER) => {
  const results = [];
  
  for (let i = 0; i < channelIds.length; i++) {
    const channelId = channelIds[i];
    
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
        results.push({ channelId, success: false, error: 'Channel not found' });
        continue;
      }

      if (!channel.transcoding_enabled) {
        results.push({ channelId, success: false, error: 'Transcoding not enabled' });
        continue;
      }

      // Start transcoding
      const result = await startTranscoding(channel.id, channel.url, channel.name);
      results.push({ channelId, success: true, result });

      // Apply stagger delay (except for the last one)
      if (i < channelIds.length - 1) {
        await new Promise(resolve => setTimeout(resolve, staggerDelay));
      }

    } catch (error) {
      console.error(`Error starting transcoding for channel ${channelId}:`, error);
      results.push({ channelId, success: false, error: error.message });
    }
  }

  return results;
};

// Bulk stop transcoding
const bulkStopTranscoding = async (channelIds) => {
  // Stop all channels in parallel for quicker response
  const stopPromises = channelIds.map(async (channelId) => {
    try {
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
        return { channelId, success: false, error: 'Channel not found' };
      }

      const result = await stopTranscoding(channel.id, channel.name);
      return { channelId, success: true, result };

    } catch (error) {
      console.error(`Error stopping transcoding for channel ${channelId}:`, error);
      return { channelId, success: false, error: error.message };
    }
  });

  const stopResults = await Promise.all(stopPromises);
  return stopResults;
};

// Emergency stop all transcoding processes
const emergencyStopAll = async () => {
  try {
    console.log('Emergency stop: Killing all active transcoding processes');
    
    const results = [];
    
    // Kill all active processes
    for (const [channelId, processInfo] of activeProcesses) {
      try {
        processInfo.process.kill('SIGKILL');
        await updateJobStatus(processInfo.jobId, 'stopped', 'Emergency stop');
        await updateChannelStatus(channelId, 'inactive', null);
        
        results.push({ channelId, success: true });
      } catch (error) {
        console.error(`Error emergency stopping channel ${channelId}:`, error);
        results.push({ channelId, success: false, error: error.message });
      }
    }

    // Clear all active processes
    activeProcesses.clear();

    logAction('emergency_stop_all', `Emergency stop executed for ${results.length} channels`);

    return {
      success: true,
      stopped_channels: results.length,
      results: results
    };

  } catch (error) {
    console.error('Error during emergency stop:', error);
    throw error;
  }
};

// Get system health and resource usage
const getSystemHealth = async () => {
  try {
    const os = require('os');
    
    // Get CPU usage
    const cpuUsage = await new Promise((resolve) => {
      const startUsage = process.cpuUsage();
      const startTime = process.hrtime();
      
      setTimeout(() => {
        const endUsage = process.cpuUsage(startUsage);
        const endTime = process.hrtime(startTime);
        
        const totalTime = endTime[0] * 1000000 + endTime[1] / 1000; // microseconds
        const cpuPercent = ((endUsage.user + endUsage.system) / totalTime) * 100;
        
        resolve(Math.round(cpuPercent * 100) / 100);
      }, 100);
    });

    // Get memory usage
    const memUsage = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    // Get active processes by type
    const activeByType = {
      high_quality: 0,
      medium_quality: 0,
      low_quality: 0,
      copy_mode: 0,
      total: activeProcesses.size
    };

    for (const [channelId, processInfo] of activeProcesses) {
      const profileType = getProfileType(processInfo.profile);
      if (activeByType[profileType] !== undefined) {
        activeByType[profileType]++;
      }
    }

    // Calculate health status
    const cpuHealth = cpuUsage > CONCURRENCY_CONFIG.CPU_CRITICAL_THRESHOLD ? 'critical' : 
                     cpuUsage > CONCURRENCY_CONFIG.CPU_WARNING_THRESHOLD ? 'warning' : 'healthy';
    
    const memoryPercent = (usedMem / totalMem) * 100;
    const memoryHealth = memoryPercent > CONCURRENCY_CONFIG.RAM_CRITICAL_THRESHOLD ? 'critical' : 
                        memoryPercent > CONCURRENCY_CONFIG.RAM_WARNING_THRESHOLD ? 'warning' : 'healthy';

    return {
      timestamp: new Date().toISOString(),
      cpu: {
        usage_percent: cpuUsage,
        cores: os.cpus().length,
        health: cpuHealth
      },
      memory: {
        total_bytes: totalMem,
        used_bytes: usedMem,
        free_bytes: freeMem,
        usage_percent: memoryPercent,
        health: memoryHealth,
        process_usage: {
          rss: memUsage.rss,
          heap_total: memUsage.heapTotal,
          heap_used: memUsage.heapUsed
        }
      },
      active_processes: activeByType,
      limits: {
        high_quality: CONCURRENCY_CONFIG.MAX_CONCURRENT_HIGH_QUALITY,
        medium_quality: CONCURRENCY_CONFIG.MAX_CONCURRENT_MEDIUM_QUALITY,
        low_quality: CONCURRENCY_CONFIG.MAX_CONCURRENT_LOW_QUALITY,
        copy_mode: CONCURRENCY_CONFIG.MAX_CONCURRENT_COPY_MODE
      },
      overall_health: (cpuHealth === 'critical' || memoryHealth === 'critical') ? 'critical' : 
                     (cpuHealth === 'warning' || memoryHealth === 'warning') ? 'warning' : 'healthy'
    };

  } catch (error) {
    console.error('Error getting system health:', error);
    return { error: error.message };
  }
};

// Get dead source channels
const getDeadSourceChannels = async () => {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT c.id, c.name, c.url, c.transcoding_status, c.offline_reason, c.dead_source_count, c.last_dead_source_event,
              d.error_patterns, d.cooldown_until, d.retry_count, d.created_at as event_created_at
       FROM channels c
       LEFT JOIN dead_source_events d ON c.id = d.channel_id
       WHERE c.transcoding_status IN ('offline_temporary', 'offline_permanent', 'dead_source')
       ORDER BY c.last_dead_source_event DESC`,
      (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      }
    );
  });
};

// Manually retry dead source channel
const retryDeadSourceChannel = async (channelId) => {
  try {
    const channel = await new Promise((resolve, reject) => {
      db.get(
        'SELECT id, name, url, transcoding_enabled, transcoding_status FROM channels WHERE id = ?',
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
      throw new Error('Channel not found');
    }

    if (!channel.transcoding_enabled) {
      throw new Error('Transcoding is not enabled for this channel');
    }

    if (!['offline_temporary', 'offline_permanent', 'dead_source'].includes(channel.transcoding_status)) {
      throw new Error('Channel is not in dead source state');
    }

    // Reset dead source detector
    deadSourceDetector.reset(channelId);

    // Try to start transcoding
    const result = await startTranscoding(channel.id, channel.url, channel.name);

    logAction('manual_dead_source_retry', `Manual retry for dead source channel: ${channel.name}`, channelId);

    return result;

  } catch (error) {
    console.error(`Error retrying dead source channel ${channelId}:`, error);
    throw error;
  }
};

// Profile Migration Service
class ProfileMigrationService {
  constructor() {
    this.migrationInProgress = false;
    this.currentMigration = null;
  }

  async migrateToNewDefaultProfile(newProfileId) {
    if (this.migrationInProgress) {
      throw new Error('Profile migration already in progress');
    }

    try {
      this.migrationInProgress = true;
      
      // Get all currently transcoding channels
      const activeChannels = await this.getActiveTranscodingChannels();
      
      // Update default profile in database
      await this.updateDefaultProfile(newProfileId);
      
      // Log migration start
      const migrationId = await this.logMigrationStart(newProfileId, activeChannels.length);
      this.currentMigration = migrationId;
      
      // Process channels in staggered batches
      const results = await this.staggeredRestart(activeChannels, newProfileId);
      
      // Log migration completion
      await this.logMigrationComplete(migrationId, results);
      
      return {
        success: true,
        migrationId: migrationId,
        totalChannels: activeChannels.length,
        results: results
      };

    } catch (error) {
      if (this.currentMigration) {
        await this.logMigrationError(this.currentMigration, error.message);
      }
      throw error;
    } finally {
      this.migrationInProgress = false;
      this.currentMigration = null;
    }
  }

  async getActiveTranscodingChannels() {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT id, name, url FROM channels WHERE transcoding_enabled = 1 AND transcoding_status = ?',
        ['active'],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
  }

  async updateDefaultProfile(newProfileId) {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('UPDATE transcoding_profiles SET is_default = 0');
        db.run('UPDATE transcoding_profiles SET is_default = 1 WHERE id = ?', [newProfileId], (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    });
  }

  async logMigrationStart(profileId, affectedChannels) {
    return new Promise((resolve, reject) => {
      const now = new Date().toISOString();
      db.run(
        'INSERT INTO profile_migrations (to_profile_id, affected_channels, status, started_at) VALUES (?, ?, ?, ?)',
        [profileId, affectedChannels, 'running', now],
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

  async logMigrationComplete(migrationId, results) {
    return new Promise((resolve, reject) => {
      const now = new Date().toISOString();
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      
      db.run(
        'UPDATE profile_migrations SET status = ?, completed_at = ?, successful_channels = ?, failed_channels = ? WHERE id = ?',
        ['completed', now, successful, failed, migrationId],
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

  async logMigrationError(migrationId, errorMessage) {
    return new Promise((resolve, reject) => {
      const now = new Date().toISOString();
      db.run(
        'UPDATE profile_migrations SET status = ?, completed_at = ?, error_message = ? WHERE id = ?',
        ['failed', now, errorMessage, migrationId],
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

  async staggeredRestart(channels, newProfileId) {
    const BATCH_SIZE = 6;
    const STAGGER_DELAY = CONCURRENCY_CONFIG.PROFILE_MIGRATION_STAGGER;
    const COOLDOWN_BETWEEN_BATCHES = 5000;
    
    const batches = this.createBatches(channels, BATCH_SIZE);
    const allResults = [];
    
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      
      console.log(`Processing migration batch ${batchIndex + 1}/${batches.length}`);
      
      // Process batch in parallel with internal staggering
      const restartPromises = batch.map((channel, index) => {
        return this.delayedRestart(channel, newProfileId, index * STAGGER_DELAY);
      });
      
      const batchResults = await Promise.allSettled(restartPromises);
      
      // Process results
      batchResults.forEach((result, index) => {
        const channel = batch[index];
        if (result.status === 'fulfilled' && result.value) {
          allResults.push({ channelId: channel.id, success: true });
        } else {
          const error = result.reason || result.value;
          allResults.push({ channelId: channel.id, success: false, error: error.message });
        }
      });
      
      // Cooldown between batches
      if (batchIndex < batches.length - 1) {
        await this.delay(COOLDOWN_BETWEEN_BATCHES);
      }
    }
    
    return allResults;
  }

  createBatches(items, batchSize) {
    const batches = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  async delayedRestart(channel, newProfileId, delay) {
    await this.delay(delay);
    
    try {
      // Stop current transcoding
      await stopTranscoding(channel.id, channel.name);
      
      // Update channel profile
      await this.updateChannelProfile(channel.id, newProfileId);
      
      // Start with new profile
      await startTranscoding(channel.id, channel.url, channel.name);
      
      return { success: true };
      
    } catch (error) {
      console.error(`Failed to restart channel ${channel.id}:`, error);
      throw error;
    }
  }

  async updateChannelProfile(channelId, profileId) {
    return new Promise((resolve, reject) => {
      db.run(
        'UPDATE channels SET transcoding_profile_id = ? WHERE id = ?',
        [profileId, channelId],
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

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

const profileMigrationService = new ProfileMigrationService();

// Helper function to get directory size
const getDirectorySize = (dirPath) => {
  let totalSize = 0;
  try {
    if (!fs.existsSync(dirPath)) return 0;

    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      if (stats.isFile()) {
        totalSize += stats.size;
      }
    }
  } catch (error) {
    console.error(`Error calculating directory size for ${dirPath}:`, error);
  }
  return totalSize;
};

// Helper function to get file age in milliseconds
const getFileAge = (filePath) => {
  try {
    const stats = fs.statSync(filePath);
    return Date.now() - stats.mtime.getTime();
  } catch (error) {
    return Infinity; // Consider files we can't stat as very old
  }
};

// Aggressive segment cleanup for a specific channel
const cleanupChannelSegments = async (channelId) => {
  const channelDir = path.join(HLS_OUTPUT_BASE, `channel_${channelId}`);

  if (!fs.existsSync(channelDir)) {
    return { cleaned: 0, size_freed: 0 };
  }

  let cleanedFiles = 0;
  let sizeFreed = 0;

  try {
    const files = fs.readdirSync(channelDir);
    const segmentFiles = files.filter(file =>
      file.endsWith('.m4s') || file.endsWith('.ts')
    );

    // Sort by modification time (oldest first)
    const fileStats = segmentFiles.map(file => {
      const filePath = path.join(channelDir, file);
      return {
        name: file,
        path: filePath,
        age: getFileAge(filePath),
        size: fs.statSync(filePath).size
      };
    }).sort((a, b) => b.age - a.age);

    // Keep only the newest segments according to HLS_LIST_SIZE + buffer
    const keepCount = HLS_LIST_SIZE + 2;
    const filesToDelete = fileStats.slice(keepCount);

    // Also delete files older than MAX_SEGMENT_AGE
    const oldFiles = fileStats.filter(file => file.age > MAX_SEGMENT_AGE);

    const toDelete = [...new Set([...filesToDelete, ...oldFiles])];

    for (const file of toDelete) {
      try {
        sizeFreed += file.size;
        fs.unlinkSync(file.path);
        cleanedFiles++;
        console.log(`Cleaned up old segment: ${file.name} (age: ${Math.round(file.age / 1000)}s)`);
      } catch (error) {
        console.error(`Error deleting file ${file.path}:`, error);
      }
    }

  } catch (error) {
    console.error(`Error cleaning up channel ${channelId} segments:`, error);
  }

  return { cleaned: cleanedFiles, size_freed: sizeFreed };
};

// Cleanup orphaned directories
const cleanupOrphanedDirectories = async () => {
  if (!fs.existsSync(HLS_OUTPUT_BASE)) {
    return { cleaned: 0, size_freed: 0 };
  }

  let cleanedDirs = 0;
  let sizeFreed = 0;

  try {
    const activeChannelIds = await new Promise((resolve, reject) => {
      db.all(
        'SELECT id FROM channels WHERE transcoding_enabled = 1 AND transcoding_status IN (?, ?, ?)',
        ['active', 'starting', 'running'],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows.map(row => row.id));
          }
        }
      );
    });

    const activeChannelSet = new Set(activeChannelIds);
    const dirs = fs.readdirSync(HLS_OUTPUT_BASE);

    for (const dir of dirs) {
      if (!dir.startsWith('channel_')) continue;

      const channelId = parseInt(dir.replace('channel_', ''));
      const dirPath = path.join(HLS_OUTPUT_BASE, dir);
      const dirAge = getFileAge(dirPath);

      if (!activeChannelSet.has(channelId) && dirAge > ORPHANED_DIR_CLEANUP_AGE) {
        try {
          const dirSize = getDirectorySize(dirPath);
          fs.rmSync(dirPath, { recursive: true, force: true });
          sizeFreed += dirSize;
          cleanedDirs++;
          console.log(`Cleaned up orphaned directory: ${dir} (${Math.round(dirSize / 1024 / 1024)}MB)`);
          logAction('cleanup_orphaned', `Cleaned up orphaned directory for channel ${channelId}`);
        } catch (error) {
          console.error(`Error cleaning up orphaned directory ${dir}:`, error);
        }
      }
    }

  } catch (error) {
    console.error('Error cleaning up orphaned directories:', error);
  }

  return { cleaned: cleanedDirs, size_freed: sizeFreed };
};

// Periodic cleanup function
const performPeriodicCleanup = async () => {
  console.log('Starting periodic transcoding cleanup...');

  try {
    const startTime = Date.now();
    let totalCleaned = 0;
    let totalSizeFreed = 0;

    // Clean up segments for all active channels
    for (const [channelId] of activeProcesses) {
      const result = await cleanupChannelSegments(channelId);
      totalCleaned += result.cleaned;
      totalSizeFreed += result.size_freed;
    }

    // Clean up orphaned directories
    const orphanedResult = await cleanupOrphanedDirectories();
    totalCleaned += orphanedResult.cleaned;
    totalSizeFreed += orphanedResult.size_freed;

    const duration = Date.now() - startTime;
    const message = `Periodic cleanup completed: ${totalCleaned} items cleaned, ${Math.round(totalSizeFreed / 1024 / 1024)}MB freed in ${duration}ms`;
    console.log(message);

    if (totalCleaned > 0 || totalSizeFreed > 0) {
      logAction('periodic_cleanup', message);
    }

  } catch (error) {
    console.error('Error during periodic cleanup:', error);
    logAction('cleanup_error', `Periodic cleanup error: ${error.message}`);
  }
};

// Start periodic cleanup scheduler
const startCleanupScheduler = () => {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }

  console.log(`Starting cleanup scheduler with ${CLEANUP_INTERVAL / 1000}s interval`);
  cleanupInterval = setInterval(performPeriodicCleanup, CLEANUP_INTERVAL);

  // Run initial cleanup after a short delay
  setTimeout(performPeriodicCleanup, 10000);
};

// Stop cleanup scheduler
const stopCleanupScheduler = () => {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log('Cleanup scheduler stopped');
  }
};

// Get storage statistics
const getStorageStats = () => {
  if (!fs.existsSync(HLS_OUTPUT_BASE)) {
    return {
      total_directories: 0,
      total_size: 0,
      channels: []
    };
  }

  try {
    const dirs = fs.readdirSync(HLS_OUTPUT_BASE);
    const channelDirs = dirs.filter(dir => dir.startsWith('channel_'));

    let totalSize = 0;
    const channels = [];

    for (const dir of channelDirs) {
      const channelId = parseInt(dir.replace('channel_', ''));
      const dirPath = path.join(HLS_OUTPUT_BASE, dir);
      const dirSize = getDirectorySize(dirPath);

      totalSize += dirSize;
      channels.push({
        channel_id: channelId,
        directory: dir,
        size_bytes: dirSize,
        size_mb: Math.round(dirSize / 1024 / 1024 * 100) / 100,
        is_oversized: dirSize > MAX_CHANNEL_DIR_SIZE
      });
    }

    return {
      total_directories: channelDirs.length,
      total_size_bytes: totalSize,
      total_size_mb: Math.round(totalSize / 1024 / 1024 * 100) / 100,
      channels: channels.sort((a, b) => b.size_bytes - a.size_bytes)
    };

  } catch (error) {
    console.error('Error getting storage stats:', error);
    return { error: error.message };
  }
};

// Initialize enhanced transcoding service
const initializeEnhancedTranscoding = async () => {
  try {
    console.log('Initializing enhanced transcoding service...');

    // Create base HLS output directory
    if (!fs.existsSync(HLS_OUTPUT_BASE)) {
      fs.mkdirSync(HLS_OUTPUT_BASE, { recursive: true });
      console.log(`Created HLS output base directory: ${HLS_OUTPUT_BASE}`);
    }

    // Start cleanup scheduler
    startCleanupScheduler();

    // Initialize resource monitoring
    setTimeout(() => {
      console.log('Enhanced transcoding service initialized successfully');
    }, 1000);

  } catch (error) {
    console.error('Error initializing enhanced transcoding service:', error);
    throw error;
  }
};

// Cleanup function for graceful shutdown
const cleanupEnhancedTranscoding = async () => {
  console.log('Cleaning up enhanced transcoding processes...');

  try {
    // Stop cleanup scheduler
    stopCleanupScheduler();

    // Emergency stop all processes
    await emergencyStopAll();

    console.log('Enhanced transcoding cleanup completed');

  } catch (error) {
    console.error('Error during enhanced transcoding cleanup:', error);
  }
};

module.exports = {
  // Core transcoding functions
  startTranscoding,
  stopTranscoding,
  restartTranscoding,
  getActiveJobs,
  
  // Enhanced bulk operations
  bulkStartTranscoding,
  bulkStopTranscoding,
  emergencyStopAll,
  
  // System health and monitoring
  getSystemHealth,
  getStorageStats,
  
  // Dead source management
  getDeadSourceChannels,
  retryDeadSourceChannel,
  
  // Profile migration
  profileMigrationService,
  
  // Cleanup functions
  cleanupChannelSegments,
  performPeriodicCleanup,
  startCleanupScheduler,
  stopCleanupScheduler,
  
  // Initialization and cleanup
  initializeEnhancedTranscoding,
  cleanupEnhancedTranscoding,
  
  // Utility functions
  checkResourceAvailability,
  getProfileType,
  
  // Error handling
  detectErrorType,
  attemptFallback,
  
  // Database management
  setDatabase,
  getDatabase,
  logAction,
  
  // Constants
  CONCURRENCY_CONFIG,
  ERROR_PATTERNS,
  DEAD_SOURCE_CONFIG
};
