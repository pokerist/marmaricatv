const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Database reference - will be set when available
let db = null;

// Function to set database reference
const setDatabase = (database) => {
  db = database;
};

// Configuration
const HLS_OUTPUT_BASE = process.env.HLS_OUTPUT_BASE || '/var/www/html/hls_stream';
const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';
const SERVER_BASE_URL = process.env.SERVER_BASE_URL || 'http://192.168.1.15';

// Optimized cleanup configuration - addressing the 6-second segment issue
const CLEANUP_CONFIG = {
  // Safe cleanup thresholds (addressing the aggressive cleanup issue)
  MIN_SEGMENT_AGE: 5 * 60 * 1000,        // 5 minutes - much safer than 30 seconds
  ACTIVE_SEGMENT_BUFFER: 2 * 60 * 1000,   // 2 minutes buffer for active segments
  CLEANUP_INTERVAL: 10 * 60 * 1000,       // 10 minutes - less frequent cleanup
  MAX_SEGMENT_AGE: 15 * 60 * 1000,        // 15 minutes max age for segments
  
  // Batch cleanup settings (addressing log flooding)
  BATCH_SIZE: 50,                          // Process in batches
  BATCH_DELAY: 1000,                       // 1 second delay between batches
  LOG_SUMMARY_ONLY: true,                  // Only log summaries, not individual files
  
  // Directory management
  MAX_CHANNEL_DIR_SIZE: 100 * 1024 * 1024, // 100MB per channel
  ORPHANED_DIR_CLEANUP_AGE: 60 * 60 * 1000, // 1 hour
  
  // Performance optimization
  PARALLEL_CLEANUP_LIMIT: 3,               // Max parallel cleanup operations
  DISK_USAGE_CHECK_INTERVAL: 30 * 60 * 1000, // Check disk usage every 30 minutes
};

// Enhanced error patterns for better categorization
const ERROR_PATTERNS = {
  // Recoverable errors (don't flood logs)
  RECOVERABLE: {
    AUDIO_DECODE: /Header missing|Invalid data found when processing input|decode_slice_header error/,
    VIDEO_DECODE: /concealing \d+ DC, \d+ AC, \d+ MV errors|non-existing PPS|SPS unavailable/,
    TIMESTAMP: /Timestamps are unset|DTS|PTS/,
    PACKET_LOSS: /Packet corrupt|Missing parts|Stream|Buffer/
  },
  
  // Critical errors (log these)
  CRITICAL: {
    CONNECTION: /Connection refused|No route to host|End of file|Invalid URL/,
    RESOURCE: /Cannot allocate memory|Out of memory|Permission denied/,
    CODEC: /Unknown encoder|Codec not found|Invalid codec/,
    SYSTEM: /Segmentation fault|Aborted|Killed/
  },
  
  // Warning errors (log but don't act on)
  WARNING: {
    PERFORMANCE: /Real-time factor|Queue full|Dropping frame/,
    QUALITY: /Bitrate|Quality|Resolution/,
    DEPRECATED: /deprecated|Warning/
  }
};

// Log levels for intelligent filtering
const LOG_LEVELS = {
  SILENT: 0,
  ERROR: 1,
  WARN: 2,
  INFO: 3,
  DEBUG: 4
};

// Store active FFmpeg processes with enhanced tracking
const activeProcesses = new Map();
const errorCounts = new Map();
const cleanupOperations = new Map();

// Store cleanup interval
let cleanupInterval = null;
let diskUsageInterval = null;

// Intelligent Logger Class
class IntelligentLogger {
  constructor() {
    this.errorCounts = new Map();
    this.logLevel = LOG_LEVELS.INFO;
    this.errorSuppressionWindow = 30000; // 30 seconds
    this.maxErrorsPerWindow = 5;
  }

  // Set log level
  setLogLevel(level) {
    this.logLevel = level;
  }

  // Check if we should suppress this error
  shouldSuppressError(channelId, errorType) {
    const key = `${channelId}_${errorType}`;
    const now = Date.now();
    
    if (!this.errorCounts.has(key)) {
      this.errorCounts.set(key, { count: 0, lastReset: now });
    }
    
    const errorData = this.errorCounts.get(key);
    
    // Reset count if window has passed
    if (now - errorData.lastReset > this.errorSuppressionWindow) {
      errorData.count = 0;
      errorData.lastReset = now;
    }
    
    errorData.count++;
    
    // Suppress if we've exceeded the limit
    return errorData.count > this.maxErrorsPerWindow;
  }

  // Categorize and log FFmpeg output
  logFFmpegOutput(channelId, output, isError = false) {
    const outputStr = output.toString();
    
    // Check for recoverable errors
    for (const [type, pattern] of Object.entries(ERROR_PATTERNS.RECOVERABLE)) {
      if (pattern.test(outputStr)) {
        if (!this.shouldSuppressError(channelId, `recoverable_${type}`)) {
          if (this.logLevel >= LOG_LEVELS.DEBUG) {
            console.log(`[Channel ${channelId}] Recoverable ${type} error (suppressing further similar errors)`);
          }
        }
        return { type: 'recoverable', category: type, shouldLog: false };
      }
    }
    
    // Check for critical errors
    for (const [type, pattern] of Object.entries(ERROR_PATTERNS.CRITICAL)) {
      if (pattern.test(outputStr)) {
        if (this.logLevel >= LOG_LEVELS.ERROR) {
          console.error(`[Channel ${channelId}] CRITICAL ${type} error: ${outputStr.trim()}`);
        }
        return { type: 'critical', category: type, shouldLog: true };
      }
    }
    
    // Check for warnings
    for (const [type, pattern] of Object.entries(ERROR_PATTERNS.WARNING)) {
      if (pattern.test(outputStr)) {
        if (!this.shouldSuppressError(channelId, `warning_${type}`)) {
          if (this.logLevel >= LOG_LEVELS.WARN) {
            console.warn(`[Channel ${channelId}] Warning ${type}: ${outputStr.trim()}`);
          }
        }
        return { type: 'warning', category: type, shouldLog: false };
      }
    }
    
    // Unknown error - log if significant
    if (isError && outputStr.includes('Error')) {
      if (this.logLevel >= LOG_LEVELS.ERROR) {
        console.error(`[Channel ${channelId}] Unknown error: ${outputStr.trim()}`);
      }
      return { type: 'unknown', category: 'unknown', shouldLog: true };
    }
    
    return { type: 'info', category: 'normal', shouldLog: false };
  }

  // Log cleanup summary (batch logging instead of individual files)
  logCleanupSummary(channelId, stats) {
    if (this.logLevel >= LOG_LEVELS.INFO && stats.totalCleaned > 0) {
      const sizeMB = Math.round(stats.totalSizeFreed / 1024 / 1024 * 100) / 100;
      const avgAge = Math.round(stats.avgAge / 1000);
      console.log(`[Channel ${channelId}] Cleanup: ${stats.totalCleaned} segments removed, ${sizeMB}MB freed, avg age: ${avgAge}s`);
    }
  }

  // Log system summary
  logSystemSummary(summary) {
    if (this.logLevel >= LOG_LEVELS.INFO) {
      console.log(`[System] Active: ${summary.activeChannels}, Errors: ${summary.recentErrors}, Cleanup: ${summary.cleanupOperations}`);
    }
  }
}

// Create intelligent logger instance
const intelligentLogger = new IntelligentLogger();

// Enhanced logging function with action categorization
const logAction = (actionType, description, channelId = null, additionalData = null) => {
  const now = new Date().toISOString();
  
  // Only log significant actions to database
  const significantActions = [
    'transcoding_started', 'transcoding_stopped', 'transcoding_failed',
    'dead_source_detected', 'fallback_profile_used', 'emergency_stop',
    'cleanup_error', 'resource_alert'
  ];
  
  if (significantActions.includes(actionType)) {
    if (db) {
      db.run(
        'INSERT INTO actions (action_type, description, channel_id, additional_data, created_at) VALUES (?, ?, ?, ?, ?)',
        [actionType, description, channelId, additionalData ? JSON.stringify(additionalData) : null, now],
        (err) => {
          if (err) {
            console.error('Error logging action:', err.message);
          }
        }
      );
    }
  }
  
  // Always log to console with appropriate level
  const logLevel = getActionLogLevel(actionType);
  if (intelligentLogger.logLevel >= logLevel) {
    console.log(`[${actionType}] ${description}`);
  }
};

// Get appropriate log level for action type
const getActionLogLevel = (actionType) => {
  if (actionType.includes('error') || actionType.includes('failed')) {
    return LOG_LEVELS.ERROR;
  } else if (actionType.includes('warning') || actionType.includes('fallback')) {
    return LOG_LEVELS.WARN;
  } else {
    return LOG_LEVELS.INFO;
  }
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

// Create output directory for a channel
const createOutputDirectory = (channelId) => {
  const outputDir = path.join(HLS_OUTPUT_BASE, `channel_${channelId}`);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`Created output directory: ${outputDir}`);
  }

  return outputDir;
};

// Get transcoding profile
const getTranscodingProfile = (profileId) => {
  return new Promise((resolve, reject) => {
    if (!profileId) {
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

// Generate optimized FFmpeg command for Tvheadend streams
const generateOptimizedFFmpegCommand = async (inputUrl, channelId, profileId = null) => {
  try {
    const outputDir = createOutputDirectory(channelId);
    
    // Get transcoding profile
    const profile = await getTranscodingProfile(profileId);
    console.log(`Using transcoding profile: ${profile.name} (ID: ${profile.id})`);

    // Use profile-defined filenames or fallback to defaults
    const manifestFilename = profile.manifest_filename || 'output.m3u8';
    const segmentFilename = profile.hls_segment_filename || 'output_%d.m4s';
    
    const outputPath = path.join(outputDir, manifestFilename);
    const segmentPath = path.join(outputDir, segmentFilename);

    // Optimized FFmpeg command for Tvheadend with error handling
    let command = [
      // Hide banner and set appropriate log level
      '-hide_banner',
      '-loglevel', 'error',
      
      // Input handling flags for unstable Tvheadend streams
      '-fflags', '+genpts+igndts+discardcorrupt',
      '-avoid_negative_ts', 'make_zero',
      '-analyzeduration', '3000000',
      '-probesize', '3000000',
      '-max_delay', '1000000',
      '-thread_queue_size', '512',
      
      // Error handling flags (addresses MP2 audio and MPEG2 video issues)
      '-err_detect', 'ignore_err',
      
      // Connection resilience
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      '-timeout', '10000000',
      
      // Input
      '-i', inputUrl,
      
      // Video codec and settings
      '-c:v', profile.video_codec,
      '-preset', profile.preset,
      '-profile:v', profile.video_codec === 'libx264' ? 'baseline' : 'main',
      '-level', '3.1',
      
      // Keyframe settings for stable streaming
      '-g', profile.gop_size.toString(),
      '-keyint_min', profile.keyint_min.toString(),
      '-sc_threshold', '0',
      '-force_key_frames', 'expr:gte(t,n_forced*1)',
      
      // Audio codec and settings
      '-c:a', profile.audio_codec,
      '-b:a', profile.audio_bitrate,
      '-ac', '2',
      '-ar', '48000',
      
      // Pixel format
      '-pix_fmt', 'yuv420p',
      
      // HLS output settings
      '-f', 'hls',
      '-hls_time', profile.hls_time.toString(),
      '-hls_playlist_type', 'live',
      '-hls_list_size', Math.max(profile.hls_list_size, 3).toString(),
      '-hls_segment_type', profile.hls_segment_type || 'mpegts',
      
      // Enhanced HLS flags for better cleanup
      '-hls_flags', 'delete_segments+append_list+independent_segments',
      '-hls_delete_threshold', '1',
      '-hls_segment_filename', segmentPath,
      
      // Output
      outputPath
    ];

    // Add video bitrate if specified
    if (profile.video_bitrate && profile.video_bitrate !== 'original') {
      const insertIndex = command.findIndex(arg => arg === '-c:v') + 2;
      command.splice(insertIndex, 0, '-b:v', profile.video_bitrate);
      command.splice(insertIndex + 2, 0, '-maxrate', profile.video_bitrate);
      command.splice(insertIndex + 4, 0, '-bufsize', `${parseInt(profile.video_bitrate) * 2}k`);
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

    // Add additional parameters from profile
    if (profile.additional_params) {
      const additionalArgs = profile.additional_params.split(' ').filter(arg => arg.trim());
      const insertIndex = command.length - 1; // Before output path
      command.splice(insertIndex, 0, ...additionalArgs);
    }

    console.log(`Generated optimized FFmpeg command for profile ${profile.name}`);
    return { command, outputPath, profile };

  } catch (error) {
    console.error('Error generating FFmpeg command:', error);
    throw error;
  }
};

// Enhanced segment cleanup with intelligent batch processing
const cleanupChannelSegments = async (channelId) => {
  const channelDir = path.join(HLS_OUTPUT_BASE, `channel_${channelId}`);
  
  if (!fs.existsSync(channelDir)) {
    return { cleaned: 0, size_freed: 0, avg_age: 0 };
  }

  // Check if cleanup is already in progress for this channel
  if (cleanupOperations.has(channelId)) {
    return { cleaned: 0, size_freed: 0, avg_age: 0, skipped: 'cleanup_in_progress' };
  }

  cleanupOperations.set(channelId, true);

  try {
    const files = fs.readdirSync(channelDir);
    const segmentFiles = files.filter(file =>
      file.endsWith('.m4s') || file.endsWith('.ts')
    );

    if (segmentFiles.length === 0) {
      cleanupOperations.delete(channelId);
      return { cleaned: 0, size_freed: 0, avg_age: 0 };
    }

    // Get file stats with safety checks
    const fileStats = [];
    for (const file of segmentFiles) {
      const filePath = path.join(channelDir, file);
      try {
        const stats = fs.statSync(filePath);
        const age = Date.now() - stats.mtime.getTime();
        
        fileStats.push({
          name: file,
          path: filePath,
          age: age,
          size: stats.size,
          mtime: stats.mtime
        });
      } catch (error) {
        // Skip files that can't be stat'd
        continue;
      }
    }

    // Sort by age (oldest first)
    fileStats.sort((a, b) => b.age - a.age);

    // Apply safe cleanup logic
    const toDelete = [];
    const keepCount = Math.max(profile?.hls_list_size || 3, 3) + 2; // Keep extra segments for safety
    
    // Only delete segments that are:
    // 1. Older than MIN_SEGMENT_AGE (5 minutes)
    // 2. Beyond the keep count
    // 3. Not in the active buffer window
    
    for (let i = keepCount; i < fileStats.length; i++) {
      const file = fileStats[i];
      
      // Safety check: only delete old segments
      if (file.age > CLEANUP_CONFIG.MIN_SEGMENT_AGE) {
        toDelete.push(file);
      }
    }

    // Also check for very old segments (beyond MAX_SEGMENT_AGE)
    for (const file of fileStats) {
      if (file.age > CLEANUP_CONFIG.MAX_SEGMENT_AGE && !toDelete.includes(file)) {
        toDelete.push(file);
      }
    }

    // Process deletion in batches to avoid overwhelming the system
    let cleanedFiles = 0;
    let sizeFreed = 0;
    let totalAge = 0;
    
    for (let i = 0; i < toDelete.length; i += CLEANUP_CONFIG.BATCH_SIZE) {
      const batch = toDelete.slice(i, i + CLEANUP_CONFIG.BATCH_SIZE);
      
      for (const file of batch) {
        try {
          fs.unlinkSync(file.path);
          cleanedFiles++;
          sizeFreed += file.size;
          totalAge += file.age;
        } catch (error) {
          // Skip files that can't be deleted
          continue;
        }
      }
      
      // Small delay between batches
      if (i + CLEANUP_CONFIG.BATCH_SIZE < toDelete.length) {
        await new Promise(resolve => setTimeout(resolve, CLEANUP_CONFIG.BATCH_DELAY));
      }
    }

    cleanupOperations.delete(channelId);
    
    const avgAge = cleanedFiles > 0 ? totalAge / cleanedFiles : 0;
    const result = { cleaned: cleanedFiles, size_freed: sizeFreed, avg_age: avgAge };
    
    // Log summary only (not individual files)
    if (cleanedFiles > 0) {
      intelligentLogger.logCleanupSummary(channelId, {
        totalCleaned: cleanedFiles,
        totalSizeFreed: sizeFreed,
        avgAge: avgAge
      });
    }
    
    return result;

  } catch (error) {
    console.error(`Error cleaning up channel ${channelId} segments:`, error);
    cleanupOperations.delete(channelId);
    return { cleaned: 0, size_freed: 0, avg_age: 0, error: error.message };
  }
};

// Enhanced periodic cleanup with intelligent scheduling
const performPeriodicCleanup = async () => {
  const startTime = Date.now();
  let totalCleaned = 0;
  let totalSizeFreed = 0;
  let activeCleanups = 0;
  
  try {
    // Get active channels for cleanup
    const activeChannels = Array.from(activeProcesses.keys());
    
    // Process channels in parallel but with limits
    const cleanupPromises = activeChannels.map(async (channelId) => {
      if (activeCleanups >= CLEANUP_CONFIG.PARALLEL_CLEANUP_LIMIT) {
        return { cleaned: 0, size_freed: 0, skipped: 'rate_limited' };
      }
      
      activeCleanups++;
      try {
        const result = await cleanupChannelSegments(channelId);
        return result;
      } finally {
        activeCleanups--;
      }
    });
    
    const results = await Promise.all(cleanupPromises);
    
    // Aggregate results
    for (const result of results) {
      if (result.cleaned) {
        totalCleaned += result.cleaned;
        totalSizeFreed += result.size_freed;
      }
    }
    
    // Clean up orphaned directories
    const orphanedResult = await cleanupOrphanedDirectories();
    totalCleaned += orphanedResult.cleaned;
    totalSizeFreed += orphanedResult.size_freed;
    
    const duration = Date.now() - startTime;
    
    // Log summary only if significant cleanup occurred
    if (totalCleaned > 0) {
      const message = `Cleanup completed: ${totalCleaned} segments, ${Math.round(totalSizeFreed / 1024 / 1024)}MB freed in ${duration}ms`;
      logAction('periodic_cleanup', message);
    }
    
    // System health summary
    intelligentLogger.logSystemSummary({
      activeChannels: activeChannels.length,
      recentErrors: errorCounts.size,
      cleanupOperations: cleanupOperations.size
    });
    
  } catch (error) {
    console.error('Error during periodic cleanup:', error);
    logAction('cleanup_error', `Periodic cleanup error: ${error.message}`);
  }
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

      if (!activeChannelSet.has(channelId) && dirAge > CLEANUP_CONFIG.ORPHANED_DIR_CLEANUP_AGE) {
        try {
          const dirSize = getDirectorySize(dirPath);
          fs.rmSync(dirPath, { recursive: true, force: true });
          sizeFreed += dirSize;
          cleanedDirs++;
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

// Helper function to get file age
const getFileAge = (filePath) => {
  try {
    const stats = fs.statSync(filePath);
    return Date.now() - stats.mtime.getTime();
  } catch (error) {
    return Infinity;
  }
};

// Enhanced start transcoding with intelligent error handling
const startTranscoding = async (channelId, inputUrl, channelName, profileId = null) => {
  try {
    console.log(`Starting optimized transcoding for channel ${channelId}: ${channelName}`);

    // Validate input parameters
    if (!inputUrl || !inputUrl.trim()) {
      throw new Error('Input URL is required');
    }

    // Update channel status to starting
    await updateChannelStatus(channelId, 'starting');

    // Get channel's transcoding profile
    const channel = await new Promise((resolve, reject) => {
      db.get('SELECT transcoding_profile_id FROM channels WHERE id = ?', [channelId], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });

    // Generate optimized FFmpeg command
    const { command, outputPath, profile } = await generateOptimizedFFmpegCommand(
      inputUrl, 
      channelId, 
      profileId || channel?.transcoding_profile_id
    );
    
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

    // Enhanced process event handlers with intelligent logging
    ffmpegProcess.stdout.on('data', (data) => {
      const processInfo = activeProcesses.get(channelId);
      if (processInfo) {
        processInfo.lastActivity = Date.now();
      }
    });

    ffmpegProcess.stderr.on('data', (data) => {
      const processInfo = activeProcesses.get(channelId);
      if (processInfo) {
        const logResult = intelligentLogger.logFFmpegOutput(channelId, data, true);
        
        if (logResult.type === 'critical') {
          processInfo.errorCount++;
          processInfo.lastError = data.toString();
        }
      }
    });

    ffmpegProcess.on('close', async (code) => {
      console.log(`FFmpeg process for channel ${channelId} closed with code ${code}`);
      
      // Remove from active processes
      activeProcesses.delete(channelId);

      if (code === 0) {
        // Process completed successfully
        const manifestFilename = profile.manifest_filename || 'output.m3u8';
        await updateJobStatus(jobId, 'completed');
        await updateChannelStatus(channelId, 'active', `${SERVER_BASE_URL}/hls_stream/channel_${channelId}/${manifestFilename}`);
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
        await updateChannelStatus(channelId, 'active', `${SERVER_BASE_URL}/hls_stream/channel_${channelId}/${manifestFilename}`);
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
        is_oversized: dirSize > CLEANUP_CONFIG.MAX_CHANNEL_DIR_SIZE
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

// Start cleanup scheduler
const startCleanupScheduler = () => {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }

  console.log(`Starting optimized cleanup scheduler with ${CLEANUP_CONFIG.CLEANUP_INTERVAL / 1000}s interval`);
  cleanupInterval = setInterval(performPeriodicCleanup, CLEANUP_CONFIG.CLEANUP_INTERVAL);

  // Run initial cleanup after a short delay
  setTimeout(performPeriodicCleanup, 30000); // 30 seconds after start
};

// Stop cleanup scheduler
const stopCleanupScheduler = () => {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log('Cleanup scheduler stopped');
  }
};

// Initialize optimized transcoding service
const initializeOptimizedTranscoding = async () => {
  try {
    console.log('Initializing optimized transcoding service...');

    // Create base HLS output directory
    if (!fs.existsSync(HLS_OUTPUT_BASE)) {
      fs.mkdirSync(HLS_OUTPUT_BASE, { recursive: true });
      console.log(`Created HLS output base directory: ${HLS_OUTPUT_BASE}`);
    }

    // Set intelligent logger level based on environment
    const logLevel = process.env.NODE_ENV === 'production' ? LOG_LEVELS.WARN : LOG_LEVELS.INFO;
    intelligentLogger.setLogLevel(logLevel);

    // Start cleanup scheduler
    startCleanupScheduler();

    // Clean up any stale transcoding jobs
    await cleanupStaleTranscodingJobs();

    // Perform initial cleanup
    await performPeriodicCleanup();

    console.log('Optimized transcoding service initialized successfully');

  } catch (error) {
    console.error('Error initializing optimized transcoding service:', error);
    throw error;
  }
};

// Clean up stale transcoding jobs
const cleanupStaleTranscodingJobs = async () => {
  try {
    console.log('Cleaning up stale transcoding jobs...');
    
    // Mark running/starting jobs as failed on startup
    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE transcoding_jobs SET status = 'failed', error_message = 'Server restart cleanup', updated_at = ? 
         WHERE status IN ('starting', 'running')`,
        [new Date().toISOString()],
        function(err) {
          if (err) {
            reject(err);
          } else {
            if (this.changes > 0) {
              console.log(`Marked ${this.changes} stale transcoding jobs as failed`);
            }
            resolve();
          }
        }
      );
    });

    // Clean up very old completed/failed jobs (older than 7 days)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    await new Promise((resolve, reject) => {
      db.run(
        'DELETE FROM transcoding_jobs WHERE status IN (?, ?, ?) AND updated_at < ?',
        ['completed', 'failed', 'stopped', weekAgo],
        function(err) {
          if (err) {
            reject(err);
          } else {
            if (this.changes > 0) {
              console.log(`Cleaned up ${this.changes} old transcoding job records`);
            }
            resolve();
          }
        }
      );
    });

  } catch (error) {
    console.error('Error cleaning up stale transcoding jobs:', error);
  }
};

// Cleanup function for graceful shutdown
const cleanupOptimizedTranscoding = async () => {
  try {
    console.log('Cleaning up optimized transcoding processes...');

    // Stop cleanup scheduler
    stopCleanupScheduler();

    // Stop all active processes
    for (const [channelId, processInfo] of activeProcesses) {
      try {
        console.log(`Stopping transcoding for channel ${channelId}: ${processInfo.channelName}`);
        processInfo.process.kill('SIGTERM');
        await updateJobStatus(processInfo.jobId, 'stopped', 'Graceful shutdown');
        await updateChannelStatus(channelId, 'inactive', null);
      } catch (error) {
        console.error(`Error stopping transcoding for channel ${channelId}:`, error);
      }
    }

    // Clear all active processes
    activeProcesses.clear();

    console.log('Optimized transcoding cleanup completed');

  } catch (error) {
    console.error('Error during optimized transcoding cleanup:', error);
  }
};

// Bulk operations for enhanced functionality
const bulkStartTranscoding = async (channelIds, staggerDelay = 2000) => {
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

  return await Promise.all(stopPromises);
};

// Get system health status
const getSystemHealth = async () => {
  try {
    const activeChannels = activeProcesses.size;
    const totalErrors = errorCounts.size;
    const activeCleanups = cleanupOperations.size;
    
    // Get storage stats
    const storageStats = getStorageStats();
    
    return {
      timestamp: new Date().toISOString(),
      active_channels: activeChannels,
      total_errors: totalErrors,
      active_cleanups: activeCleanups,
      storage: storageStats,
      config: {
        cleanup_interval: CLEANUP_CONFIG.CLEANUP_INTERVAL,
        min_segment_age: CLEANUP_CONFIG.MIN_SEGMENT_AGE,
        max_segment_age: CLEANUP_CONFIG.MAX_SEGMENT_AGE,
        log_level: intelligentLogger.logLevel
      },
      health: activeChannels > 0 ? 'active' : 'idle'
    };
  } catch (error) {
    console.error('Error getting system health:', error);
    return { error: error.message };
  }
};

module.exports = {
  // Core transcoding functions
  startTranscoding,
  stopTranscoding,
  restartTranscoding,
  getActiveJobs,
  
  // Bulk operations
  bulkStartTranscoding,
  bulkStopTranscoding,
  
  // System health and monitoring
  getSystemHealth,
  getStorageStats,
  
  // Cleanup functions
  cleanupChannelSegments,
  performPeriodicCleanup,
  startCleanupScheduler,
  stopCleanupScheduler,
  
  // Initialization and cleanup
  initializeOptimizedTranscoding,
  cleanupOptimizedTranscoding,
  
  // Utility functions
  setDatabase,
  intelligentLogger,
  
  // Constants
  CLEANUP_CONFIG,
  ERROR_PATTERNS,
  LOG_LEVELS
};
