const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

// Database reference
let db = null;

// Configuration
const HLS_OUTPUT_BASE = process.env.HLS_OUTPUT_BASE || '/var/www/html/hls_stream';
const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';
const SERVER_BASE_URL = process.env.SERVER_BASE_URL || 'http://192.168.1.15';
const HLS_BASE_URL = process.env.HLS_BASE_URL || process.env.SERVER_BASE_URL?.replace(':5000', '') || 'http://192.168.1.15';

// Cleanup configuration
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
const MAX_SEGMENT_AGE = 30 * 1000; // 30 seconds
const SEGMENT_CLEANUP_COUNT = 3; // Keep only 3 most recent segments

// Active processes and health tracking
const activeProcesses = new Map();
const streamHealthStatus = new Map();

// Cleanup interval reference
let cleanupInterval = null;

// Set database reference
const setDatabase = (database) => {
  db = database;
};

// Logging function
const logAction = (actionType, description, channelId = null) => {
  const now = new Date().toISOString();
  if (db) {
    db.run(
      'INSERT INTO actions (action_type, description, created_at) VALUES (?, ?, ?)',
      [actionType, description, now],
      (err) => {
        if (err) {
          console.error('Error logging action:', err.message);
        }
      }
    );
  }
};

// Update channel status
const updateChannelStatus = (channelId, status, transcodedUrl = null) => {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }

    const now = new Date().toISOString();
    let sql = 'UPDATE channels SET transcoding_status = ?, updated_at = ?';
    let params = [status, now];

    if (transcodedUrl !== null) {
      sql += ', transcoded_url = ?';
      params.push(transcodedUrl);
    }

    // Always update the persistent state for recovery
    const persistentState = status === 'active' ? 'active' : status === 'failed' ? 'failed' : 'idle';
    sql += ', last_transcoding_state = ?';
    params.push(persistentState);

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

// Create output directory
const createOutputDirectory = (channelId) => {
  const outputDir = path.join(HLS_OUTPUT_BASE, `channel_${channelId}`);
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`Created output directory: ${outputDir}`);
  }
  
  return outputDir;
};

// Generate FFmpeg command using your template with LL-HLS adaptations
const generateFFmpegCommand = (inputUrl, channelId, profile = null) => {
  const outputDir = createOutputDirectory(channelId);
  const manifestPath = path.join(outputDir, 'output.m3u8');
  const segmentPath = path.join(outputDir, 'output_%d.ts');

  // If profile is provided, use it; otherwise use the simplified template
  if (profile) {
    // Use existing profile system for experts
    let command = [
      '-fflags', 'nobuffer',
      '-flags', 'low_delay',
      '-i', inputUrl,
      '-c:v', profile.video_codec,
      '-preset', profile.preset,
      '-g', profile.gop_size.toString(),
      '-keyint_min', profile.keyint_min.toString(),
      '-c:a', profile.audio_codec,
      '-b:a', profile.audio_bitrate,
      '-hls_time', profile.hls_time.toString(),
      '-hls_list_size', '3', // Keep 3 segments for live streaming
      '-hls_flags', 'delete_segments+append_list+omit_endlist+independent_segments',
      '-hls_playlist_type', 'event',
      '-start_number', '1',
      '-hls_segment_filename', segmentPath,
      '-f', 'hls',
      manifestPath
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

    // Add CRF if specified
    if (profile.crf) {
      const insertIndex = command.findIndex(arg => arg === '-g');
      command.splice(insertIndex, 0, '-crf', profile.crf.toString());
    }

    return command;
  } else {
    // Use your simplified template with minor LL-HLS adaptations
    return [
      '-fflags', 'nobuffer',
      '-flags', 'low_delay',
      '-i', inputUrl,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-crf', '23',
      '-g', '15',
      '-keyint_min', '15',
      '-c:a', 'aac',
      '-b:a', '64k',
      '-hls_time', '0.5',
      '-hls_list_size', '3', // Adjusted for live streaming stability
      '-hls_flags', 'delete_segments+append_list+omit_endlist+independent_segments',
      '-hls_playlist_type', 'event',
      '-start_number', '1',
      '-hls_segment_filename', segmentPath,
      '-f', 'hls',
      manifestPath
    ];
  }
};

// Get transcoding profile if specified
const getTranscodingProfile = (channelId) => {
  return new Promise((resolve, reject) => {
    if (!db) {
      resolve(null);
      return;
    }

    db.get(
      'SELECT tp.* FROM channels c LEFT JOIN transcoding_profiles tp ON c.transcoding_profile_id = tp.id WHERE c.id = ?',
      [channelId],
      (err, row) => {
        if (err) {
          console.error('Error getting transcoding profile:', err.message);
          resolve(null);
        } else {
          resolve(row);
        }
      }
    );
  });
};

// Start transcoding for a channel
const startTranscoding = async (channelId, inputUrl, channelName) => {
  try {
    console.log(`Starting transcoding for channel ${channelId}: ${channelName}`);
    
    // Validate input
    if (!inputUrl || !inputUrl.trim()) {
      throw new Error('Input URL is required');
    }

    // Update status to starting
    await updateChannelStatus(channelId, 'starting');

    // Get transcoding profile for experts (optional)
    const profile = await getTranscodingProfile(channelId);
    
    // Generate FFmpeg command
    const command = generateFFmpegCommand(inputUrl, channelId, profile);
    
    console.log(`FFmpeg command: ${FFMPEG_PATH} ${command.join(' ')}`);

    // Start FFmpeg process
    const ffmpegProcess = spawn(FFMPEG_PATH, command);
    const pid = ffmpegProcess.pid;

    if (!pid) {
      throw new Error('FFmpeg process failed to start');
    }

    console.log(`Started FFmpeg process with PID: ${pid}`);

    // Store process info
    activeProcesses.set(channelId, {
      process: ffmpegProcess,
      channelName: channelName,
      startTime: Date.now(),
      inputUrl: inputUrl,
      profile: profile
    });

    // Set up process handlers
    let errorOutput = '';
    let isProcessRunning = true;

    ffmpegProcess.stderr.on('data', (data) => {
      const output = data.toString();
      
      // Check for critical errors
      if (output.includes('Invalid data found') || 
          output.includes('Connection refused') ||
          output.includes('No such file or directory') ||
          output.includes('Server returned 404')) {
        console.error(`FFmpeg error for channel ${channelId}:`, output);
        errorOutput += output;
      }
    });

    ffmpegProcess.on('close', async (code) => {
      console.log(`FFmpeg process for channel ${channelId} closed with code ${code}`);
      
      activeProcesses.delete(channelId);
      isProcessRunning = false;

      if (code === 0) {
        // Success
        const manifestUrl = `${HLS_BASE_URL}/hls_stream/channel_${channelId}/output.m3u8`;
        await updateChannelStatus(channelId, 'active', manifestUrl);
        logAction('transcoding_completed', `Transcoding completed for channel: ${channelName}`);
      } else {
        // Failure
        await updateChannelStatus(channelId, 'failed');
        logAction('transcoding_failed', `Transcoding failed for channel: ${channelName} (exit code: ${code})`);
      }
    });

    ffmpegProcess.on('error', async (err) => {
      console.error(`FFmpeg process error for channel ${channelId}:`, err);
      
      activeProcesses.delete(channelId);
      isProcessRunning = false;
      
      await updateChannelStatus(channelId, 'failed');
      logAction('transcoding_error', `Transcoding error for channel: ${channelName} - ${err.message}`);
    });

    // Monitor process health
    setTimeout(async () => {
      if (isProcessRunning && activeProcesses.has(channelId)) {
        // Process is running, check if it's producing output
        const outputDir = path.join(HLS_OUTPUT_BASE, `channel_${channelId}`);
        const manifestPath = path.join(outputDir, 'output.m3u8');
        
        if (fs.existsSync(manifestPath)) {
          const manifestUrl = `${HLS_BASE_URL}/hls_stream/channel_${channelId}/output.m3u8`;
          await updateChannelStatus(channelId, 'active', manifestUrl);
          logAction('transcoding_started', `Transcoding started for channel: ${channelName}`);
        }
      }
    }, 5000);

    return {
      success: true,
      pid: pid,
      message: `Transcoding started for ${channelName}`
    };

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

    // Update status
    await updateChannelStatus(channelId, 'stopping');

    // Kill FFmpeg process
    if (activeProcesses.has(channelId)) {
      const { process } = activeProcesses.get(channelId);
      process.kill('SIGTERM');
      activeProcesses.delete(channelId);
    }

    // Clean up output directory
    const outputDir = path.join(HLS_OUTPUT_BASE, `channel_${channelId}`);
    if (fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true, force: true });
      console.log(`Cleaned up output directory: ${outputDir}`);
    }

    // Update final status
    await updateChannelStatus(channelId, 'inactive');
    logAction('transcoding_stopped', `Transcoding stopped for channel: ${channelName}`);

    return { success: true };

  } catch (error) {
    console.error(`Error stopping transcoding for channel ${channelId}:`, error);
    throw error;
  }
};

// Restart transcoding
const restartTranscoding = async (channelId, inputUrl, channelName) => {
  try {
    console.log(`Restarting transcoding for channel ${channelId}: ${channelName}`);
    
    // Stop existing transcoding
    await stopTranscoding(channelId, channelName);
    
    // Wait for cleanup
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Start again
    return await startTranscoding(channelId, inputUrl, channelName);

  } catch (error) {
    console.error(`Error restarting transcoding for channel ${channelId}:`, error);
    throw error;
  }
};

// Check stream health using both HTTP and FFprobe
const checkStreamHealth = async (channelId, inputUrl) => {
  const healthResult = {
    channelId: channelId,
    timestamp: new Date().toISOString(),
    available: false,
    responseTime: null,
    method: 'http',
    error: null
  };

  try {
    const startTime = Date.now();
    
    // Try HTTP HEAD request first
    try {
      const response = await axios.head(inputUrl, {
        timeout: 10000,
        validateStatus: (status) => status < 500
      });
      
      healthResult.responseTime = Date.now() - startTime;
      healthResult.available = response.status < 400;
      
      if (healthResult.available) {
        streamHealthStatus.set(channelId, healthResult);
        return healthResult;
      }
    } catch (httpError) {
      healthResult.error = httpError.message;
    }

    // If HTTP fails, try FFprobe
    healthResult.method = 'ffprobe';
    const ffprobeResult = await checkStreamWithFFprobe(inputUrl);
    healthResult.available = ffprobeResult.available;
    healthResult.responseTime = Date.now() - startTime;
    healthResult.error = ffprobeResult.error;

  } catch (error) {
    healthResult.error = error.message;
  }

  streamHealthStatus.set(channelId, healthResult);
  return healthResult;
};

// Check stream using FFprobe
const checkStreamWithFFprobe = (inputUrl) => {
  return new Promise((resolve) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      '-analyzeduration', '3000000',
      '-probesize', '3000000',
      '-timeout', '10000000',
      inputUrl
    ]);

    let stdout = '';
    let stderr = '';

    ffprobe.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    ffprobe.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (code === 0) {
        try {
          const probeData = JSON.parse(stdout);
          resolve({
            available: probeData.streams && probeData.streams.length > 0,
            error: null
          });
        } catch (parseError) {
          resolve({
            available: false,
            error: 'Failed to parse FFprobe output'
          });
        }
      } else {
        resolve({
          available: false,
          error: stderr || 'FFprobe failed'
        });
      }
    });

    // Timeout
    setTimeout(() => {
      ffprobe.kill('SIGTERM');
      resolve({
        available: false,
        error: 'FFprobe timeout'
      });
    }, 15000);
  });
};

// Monitor all active channels
const monitorChannelHealth = async () => {
  if (!db) return;

  try {
    // Get all channels with transcoding enabled
    const channels = await new Promise((resolve, reject) => {
      db.all(
        'SELECT id, name, url, transcoding_enabled, transcoding_status FROM channels WHERE transcoding_enabled = 1',
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });

    for (const channel of channels) {
      try {
        const healthResult = await checkStreamHealth(channel.id, channel.url);
        
        // Update channel status if stream is down and transcoding is supposed to be active
        if (!healthResult.available && channel.transcoding_status === 'active') {
          console.log(`Stream down detected for channel ${channel.id}: ${channel.name}`);
          await updateChannelStatus(channel.id, 'failed');
          logAction('stream_health_failure', `Stream health check failed for channel: ${channel.name}`);
        }

      } catch (error) {
        console.error(`Error checking health for channel ${channel.id}:`, error);
      }
    }

  } catch (error) {
    console.error('Error in channel health monitoring:', error);
  }
};

// Get stream health status
const getStreamHealthStatus = (channelId) => {
  return streamHealthStatus.get(channelId) || {
    channelId: channelId,
    available: false,
    error: 'No health data available'
  };
};

// Get all stream health statuses
const getAllStreamHealthStatuses = () => {
  const statuses = {};
  for (const [channelId, status] of streamHealthStatus) {
    statuses[channelId] = status;
  }
  return statuses;
};

// Clean up old segments
const cleanupChannelSegments = async (channelId) => {
  const channelDir = path.join(HLS_OUTPUT_BASE, `channel_${channelId}`);
  
  if (!fs.existsSync(channelDir)) {
    return { cleaned: 0, size_freed: 0 };
  }

  let cleanedFiles = 0;
  let sizeFreed = 0;

  try {
    const files = fs.readdirSync(channelDir);
    const segmentFiles = files.filter(file => file.endsWith('.ts'));

    // Sort by modification time (newest first)
    const fileStats = segmentFiles.map(file => {
      const filePath = path.join(channelDir, file);
      const stats = fs.statSync(filePath);
      return {
        name: file,
        path: filePath,
        mtime: stats.mtime.getTime(),
        size: stats.size
      };
    }).sort((a, b) => b.mtime - a.mtime);

    // Keep only the most recent segments
    const filesToDelete = fileStats.slice(SEGMENT_CLEANUP_COUNT);

    for (const file of filesToDelete) {
      try {
        const age = Date.now() - file.mtime;
        if (age > MAX_SEGMENT_AGE) {
          fs.unlinkSync(file.path);
          cleanedFiles++;
          sizeFreed += file.size;
        }
      } catch (error) {
        console.error(`Error deleting segment ${file.path}:`, error);
      }
    }

  } catch (error) {
    console.error(`Error cleaning up segments for channel ${channelId}:`, error);
  }

  return { cleaned: cleanedFiles, size_freed: sizeFreed };
};

// Periodic cleanup
const performPeriodicCleanup = async () => {
  console.log('Starting periodic cleanup...');
  
  try {
    let totalCleaned = 0;
    let totalSizeFreed = 0;

    // Clean up segments for all active channels
    for (const [channelId] of activeProcesses) {
      const result = await cleanupChannelSegments(channelId);
      totalCleaned += result.cleaned;
      totalSizeFreed += result.size_freed;
    }

    // Clean up orphaned directories
    if (fs.existsSync(HLS_OUTPUT_BASE)) {
      const dirs = fs.readdirSync(HLS_OUTPUT_BASE);
      
      for (const dir of dirs) {
        if (dir.startsWith('channel_')) {
          const channelId = parseInt(dir.replace('channel_', ''));
          
          // If channel is not active, clean up the directory
          if (!activeProcesses.has(channelId)) {
            const dirPath = path.join(HLS_OUTPUT_BASE, dir);
            try {
              fs.rmSync(dirPath, { recursive: true, force: true });
              console.log(`Cleaned up orphaned directory: ${dir}`);
            } catch (error) {
              console.error(`Error cleaning up directory ${dir}:`, error);
            }
          }
        }
      }
    }

    if (totalCleaned > 0) {
      console.log(`Cleanup completed: ${totalCleaned} files cleaned, ${Math.round(totalSizeFreed / 1024 / 1024)}MB freed`);
    }

  } catch (error) {
    console.error('Error during periodic cleanup:', error);
  }
};

// Start cleanup and monitoring
const startPeriodicTasks = () => {
  // Start cleanup scheduler
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }
  
  cleanupInterval = setInterval(performPeriodicCleanup, CLEANUP_INTERVAL);
  
  // Start health monitoring
  setInterval(monitorChannelHealth, 30000); // Every 30 seconds
  
  console.log('Periodic tasks started (cleanup and health monitoring)');
};

// Stop periodic tasks
const stopPeriodicTasks = () => {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
  console.log('Periodic tasks stopped');
};

// Get active jobs
const getActiveJobs = () => {
  const jobs = [];
  for (const [channelId, processInfo] of activeProcesses) {
    jobs.push({
      channelId: channelId,
      channelName: processInfo.channelName,
      pid: processInfo.process.pid,
      startTime: processInfo.startTime,
      inputUrl: processInfo.inputUrl,
      profile: processInfo.profile ? processInfo.profile.name : 'Default Template'
    });
  }
  return jobs;
};

// Initialize the service
const initializeSimplifiedTranscoding = async () => {
  try {
    console.log('Initializing simplified transcoding service...');

    // Create base HLS output directory
    if (!fs.existsSync(HLS_OUTPUT_BASE)) {
      fs.mkdirSync(HLS_OUTPUT_BASE, { recursive: true });
      console.log(`Created HLS output base directory: ${HLS_OUTPUT_BASE}`);
    }

    // Start periodic tasks
    startPeriodicTasks();

    // Recover channels that were previously active
    if (db) {
      const channelsToRecover = await new Promise((resolve, reject) => {
        db.all(
          'SELECT id, name, url FROM channels WHERE transcoding_enabled = 1 AND last_transcoding_state = ?',
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

      // Reset all channels to inactive status first
      await new Promise((resolve, reject) => {
        db.run(
          'UPDATE channels SET transcoding_status = ? WHERE transcoding_status != ?',
          ['inactive', 'inactive'],
          (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          }
        );
      });

      // Restart channels that were previously active
      for (const channel of channelsToRecover) {
        try {
          console.log(`Recovering transcoding for channel: ${channel.name}`);
          await startTranscoding(channel.id, channel.url, channel.name);
          // Stagger the starts to avoid overwhelming the system
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
          console.error(`Failed to recover channel ${channel.id}:`, error);
        }
      }

      console.log(`Recovered ${channelsToRecover.length} channels`);
    }

    console.log('Simplified transcoding service initialized successfully');

  } catch (error) {
    console.error('Error initializing simplified transcoding service:', error);
    throw error;
  }
};

// Cleanup function
const cleanupSimplifiedTranscoding = async () => {
  console.log('Cleaning up simplified transcoding service...');
  
  try {
    // Stop periodic tasks
    stopPeriodicTasks();

    // Stop all active processes
    for (const [channelId, processInfo] of activeProcesses) {
      try {
        console.log(`Stopping transcoding for channel ${channelId}: ${processInfo.channelName}`);
        processInfo.process.kill('SIGTERM');
        await updateChannelStatus(channelId, 'inactive');
      } catch (error) {
        console.error(`Error stopping channel ${channelId}:`, error);
      }
    }

    activeProcesses.clear();
    streamHealthStatus.clear();

    console.log('Simplified transcoding cleanup completed');

  } catch (error) {
    console.error('Error during simplified transcoding cleanup:', error);
  }
};

module.exports = {
  setDatabase,
  startTranscoding,
  stopTranscoding,
  restartTranscoding,
  getActiveJobs,
  checkStreamHealth,
  getStreamHealthStatus,
  getAllStreamHealthStatuses,
  monitorChannelHealth,
  cleanupChannelSegments,
  performPeriodicCleanup,
  initializeSimplifiedTranscoding,
  cleanupSimplifiedTranscoding,
  // Legacy method names for compatibility
  cleanup: cleanupSimplifiedTranscoding,
  getStorageStats: () => ({ totalSize: 0, channelCount: activeProcesses.size })
};
