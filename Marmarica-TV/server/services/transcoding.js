const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { db } = require('../index');

// Configuration
const HLS_OUTPUT_BASE = process.env.HLS_OUTPUT_BASE || '/var/www/html/hls_stream';
const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';
const SERVER_BASE_URL = process.env.SERVER_BASE_URL || 'http://192.168.100.232';

// Cleanup configuration
const CLEANUP_INTERVAL = parseInt(process.env.CLEANUP_INTERVAL) || 5 * 60 * 1000; // 5 minutes
const MAX_SEGMENT_AGE = parseInt(process.env.MAX_SEGMENT_AGE) || 30 * 1000; // 30 seconds
const MAX_CHANNEL_DIR_SIZE = parseInt(process.env.MAX_CHANNEL_DIR_SIZE) || 100 * 1024 * 1024; // 100MB
const HLS_LIST_SIZE = parseInt(process.env.HLS_LIST_SIZE) || 3; // Number of segments to keep
const ORPHANED_DIR_CLEANUP_AGE = parseInt(process.env.ORPHANED_DIR_CLEANUP_AGE) || 60 * 60 * 1000; // 1 hour

// Store active FFmpeg processes
const activeProcesses = new Map();

// Store cleanup interval
let cleanupInterval = null;

// Helper function to log actions
const logAction = (actionType, description) => {
  const now = new Date().toISOString();
  db.run(
    'INSERT INTO actions (action_type, description, created_at) VALUES (?, ?, ?)',
    [actionType, description, now],
    (err) => {
      if (err) {
        console.error('Error logging action:', err.message);
      }
    }
  );
};

// Helper function to update channel transcoding status
const updateChannelStatus = (channelId, status, transcodedUrl = null, persistState = true) => {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    let sql = 'UPDATE channels SET transcoding_status = ?, updated_at = ?';
    let params = [status, now];

    if (transcodedUrl !== null) {
      sql += ', transcoded_url = ?';
      params.push(transcodedUrl);
    }

    // Update last_transcoding_state for persistence across restarts
    if (persistState) {
      sql += ', last_transcoding_state = ?';
      params.push(status === 'active' ? 'active' : status === 'failed' ? 'failed' : 'idle');
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

// Helper function to update transcoding job status
const updateJobStatus = (jobId, status, errorMessage = null, ffmpegPid = null) => {
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

// Generate FFmpeg command for LL-HLS transcoding with enhanced cleanup
const generateFFmpegCommand = (inputUrl, channelId) => {
  const outputDir = createOutputDirectory(channelId);
  const outputPath = path.join(outputDir, 'output.m3u8');
  const segmentPath = path.join(outputDir, 'output_%03d.m4s');

  const command = [
    '-i', inputUrl,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-tune', 'zerolatency',
    '-g', '50',                     // Keyframe every 2 seconds (for 25 fps input, adjust as needed)
    '-keyint_min', '50',
    '-sc_threshold', '0',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-f', 'hls',
    '-hls_time', '4',               // 4 second segments for classic HLS
    '-hls_playlist_type', 'event',
    '-hls_flags', 'independent_segments+delete_segments+program_date_time',
    '-hls_segment_type', 'mpegts',  // <-- KEY CHANGE!
    '-hls_segment_filename', segmentPath,
    '-hls_start_number_source', 'epoch',
    '-hls_list_size', Math.max(HLS_LIST_SIZE, 4).toString(),
    '-hls_delete_threshold', '1',
    outputPath
  ];


  return { command, outputPath };
};

// Start transcoding for a channel
const startTranscoding = async (channelId, inputUrl, channelName) => {
  try {
    console.log(`Starting transcoding for channel ${channelId}: ${channelName}`);
    console.log(`Input URL: ${inputUrl}`);
    console.log(`FFmpeg path: ${FFMPEG_PATH}`);
    console.log(`HLS output base: ${HLS_OUTPUT_BASE}`);

    // Validate input parameters
    if (!inputUrl || !inputUrl.trim()) {
      throw new Error('Input URL is required');
    }

    // Update channel status to starting
    await updateChannelStatus(channelId, 'starting');

    // Generate FFmpeg command
    const { command, outputPath } = generateFFmpegCommand(inputUrl, channelId);
    console.log(`FFmpeg command: ${FFMPEG_PATH} ${command.join(' ')}`);

    // Create transcoding job record
    const now = new Date().toISOString();
    const jobId = await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO transcoding_jobs (channel_id, output_path, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        [channelId, outputPath, 'starting', now, now],
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

    // Spawn FFmpeg process with detailed error handling
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

    console.log(`Started FFmpeg process with PID: ${pid}`);

    // Store process reference
    activeProcesses.set(channelId, {
      process: ffmpegProcess,
      jobId: jobId,
      channelName: channelName
    });

    // Update job with PID
    await updateJobStatus(jobId, 'running', null, pid);

    // Set up process event handlers
    ffmpegProcess.stdout.on('data', (data) => {
      // Log FFmpeg output if needed (can be verbose)
      // console.log(`FFmpeg stdout: ${data}`);
    });

    ffmpegProcess.stderr.on('data', (data) => {
      const output = data.toString();
      // Log significant errors, but not normal FFmpeg info
      if (output.includes('Error') || output.includes('error')) {
        console.error(`FFmpeg stderr: ${output}`);
      }
    });

    ffmpegProcess.on('close', async (code) => {
      console.log(`FFmpeg process for channel ${channelId} closed with code ${code}`);

      // Remove from active processes
      activeProcesses.delete(channelId);

      if (code === 0) {
        // Process completed successfully
        await updateJobStatus(jobId, 'completed');
        await updateChannelStatus(channelId, 'active', `${SERVER_BASE_URL}/hls_stream/channel_${channelId}/output.m3u8`);
        logAction('transcoding_completed', `Transcoding completed for channel: ${channelName}`);
      } else {
        // Process failed
        await updateJobStatus(jobId, 'failed', `Process exited with code ${code}`);
        await updateChannelStatus(channelId, 'failed');
        logAction('transcoding_failed', `Transcoding failed for channel: ${channelName} (exit code: ${code})`);
      }
    });

    ffmpegProcess.on('error', async (err) => {
      console.error(`FFmpeg process error for channel ${channelId}:`, err);

      // Remove from active processes
      activeProcesses.delete(channelId);

      // Update job and channel status
      await updateJobStatus(jobId, 'failed', err.message);
      await updateChannelStatus(channelId, 'failed');
      logAction('transcoding_error', `Transcoding error for channel: ${channelName} - ${err.message}`);
    });

    // Give it a moment to start, then update status
    setTimeout(async () => {
      if (activeProcesses.has(channelId)) {
        await updateChannelStatus(channelId, 'active', `${SERVER_BASE_URL}/hls_stream/channel_${channelId}/output.m3u8`);
        logAction('transcoding_started', `Transcoding started for channel: ${channelName}`);
      }
    }, 2000);

    return { success: true, jobId, pid };

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

    logAction('transcoding_stopped', `Transcoding stopped for channel: ${channelName}`);

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
      `SELECT j.*, c.name as channel_name, c.url as channel_url 
       FROM transcoding_jobs j 
       JOIN channels c ON j.channel_id = c.id 
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
    const keepCount = HLS_LIST_SIZE + 2; // Keep a couple extra for safety
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

// Cleanup orphaned directories (channels no longer active)
const cleanupOrphanedDirectories = async () => {
  if (!fs.existsSync(HLS_OUTPUT_BASE)) {
    return { cleaned: 0, size_freed: 0 };
  }

  let cleanedDirs = 0;
  let sizeFreed = 0;

  try {
    // Get all active channel IDs
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

      // Clean up if channel is not active or directory is old
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

// Monitor and cleanup directories that exceed size limits
const cleanupOversizedDirectories = async () => {
  if (!fs.existsSync(HLS_OUTPUT_BASE)) {
    return { cleaned: 0, size_freed: 0 };
  }

  let totalCleaned = 0;
  let totalSizeFreed = 0;

  try {
    const dirs = fs.readdirSync(HLS_OUTPUT_BASE);

    for (const dir of dirs) {
      if (!dir.startsWith('channel_')) continue;

      const channelId = parseInt(dir.replace('channel_', ''));
      const dirPath = path.join(HLS_OUTPUT_BASE, dir);
      const dirSize = getDirectorySize(dirPath);

      if (dirSize > MAX_CHANNEL_DIR_SIZE) {
        console.log(`Channel ${channelId} directory oversized: ${Math.round(dirSize / 1024 / 1024)}MB`);
        const result = await cleanupChannelSegments(channelId);
        totalCleaned += result.cleaned;
        totalSizeFreed += result.size_freed;

        logAction('cleanup_oversized', `Cleaned oversized directory for channel ${channelId}: freed ${Math.round(result.size_freed / 1024 / 1024)}MB`);
      }
    }

  } catch (error) {
    console.error('Error cleaning up oversized directories:', error);
  }

  return { cleaned: totalCleaned, size_freed: totalSizeFreed };
};

// Periodic cleanup function
const performPeriodicCleanup = async () => {
  console.log('Starting periodic transcoding cleanup...');

  try {
    const startTime = Date.now();
    let totalCleaned = 0;
    let totalSizeFreed = 0;

    // 1. Clean up segments for all active channels
    for (const [channelId] of activeProcesses) {
      const result = await cleanupChannelSegments(channelId);
      totalCleaned += result.cleaned;
      totalSizeFreed += result.size_freed;
    }

    // 2. Clean up orphaned directories
    const orphanedResult = await cleanupOrphanedDirectories();
    totalCleaned += orphanedResult.cleaned;
    totalSizeFreed += orphanedResult.size_freed;

    // 3. Clean up oversized directories
    const oversizedResult = await cleanupOversizedDirectories();
    totalCleaned += oversizedResult.cleaned;
    totalSizeFreed += oversizedResult.size_freed;

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
  setTimeout(performPeriodicCleanup, 10000); // 10 seconds after start
};

// Stop cleanup scheduler
const stopCleanupScheduler = () => {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log('Cleanup scheduler stopped');
  }
};

// Startup cleanup - clean stale segments and directories
const performStartupCleanup = async () => {
  console.log('Performing startup cleanup...');

  try {
    // Clean up all directories on startup
    const orphanedResult = await cleanupOrphanedDirectories();
    const oversizedResult = await cleanupOversizedDirectories();

    const totalCleaned = orphanedResult.cleaned + oversizedResult.cleaned;
    const totalSizeFreed = orphanedResult.size_freed + oversizedResult.size_freed;

    if (totalCleaned > 0 || totalSizeFreed > 0) {
      const message = `Startup cleanup completed: ${totalCleaned} items cleaned, ${Math.round(totalSizeFreed / 1024 / 1024)}MB freed`;
      console.log(message);
      logAction('startup_cleanup', message);
    }

  } catch (error) {
    console.error('Error during startup cleanup:', error);
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

// Initialize transcoding service on server start
const initializeTranscoding = async () => {
  try {
    console.log('Initializing transcoding service...');

    // Create base HLS output directory
    if (!fs.existsSync(HLS_OUTPUT_BASE)) {
      fs.mkdirSync(HLS_OUTPUT_BASE, { recursive: true });
      console.log(`Created HLS output base directory: ${HLS_OUTPUT_BASE}`);
    }

    // Perform startup cleanup with error handling
    try {
      await performStartupCleanup();
    } catch (error) {
      console.error('Startup cleanup failed, but continuing initialization:', error);
    }

    // Start cleanup scheduler with error handling
    try {
      startCleanupScheduler();
    } catch (error) {
      console.error('Failed to start cleanup scheduler, but continuing initialization:', error);
    }

    // Find channels that should be transcoded based on persistent state
    const channelsToRestart = await new Promise((resolve, reject) => {
      db.all(
        `SELECT c.*, j.id as job_id 
         FROM channels c 
         LEFT JOIN transcoding_jobs j ON c.id = j.channel_id 
         WHERE c.transcoding_enabled = 1 AND c.last_transcoding_state = 'active'`,
        (err, rows) => {
          if (err) {
            console.error('Error fetching channels to restart:', err.message);
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });

    // Reset transcoding status for all channels to inactive on startup
    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE channels SET transcoding_status = 'inactive', transcoded_url = NULL 
         WHERE transcoding_status != 'inactive'`,
        (err) => {
          if (err) {
            console.error('Error resetting transcoding status:', err.message);
            reject(err);
          } else {
            console.log('Reset transcoding status for all channels');
            resolve();
          }
        }
      );
    });

    // Restart transcoding for channels that were previously active
    for (const channel of channelsToRestart) {
      if (channel.transcoding_enabled && channel.last_transcoding_state === 'active') {
        console.log(`Restarting transcoding for channel: ${channel.name} (was previously active)`);
        try {
          await restartTranscoding(channel.id, channel.url, channel.name);
        } catch (error) {
          console.error(`Failed to restart transcoding for channel ${channel.id}:`, error);
          await updateChannelStatus(channel.id, 'failed');
        }
      }
    }

    console.log(`Transcoding service initialized - restarted ${channelsToRestart.length} channels`);

  } catch (error) {
    console.error('Error initializing transcoding service:', error);
  }
};

// Cleanup function for graceful shutdown
const cleanup = async () => {
  console.log('Cleaning up transcoding processes...');

  // Stop cleanup scheduler
  try {
    stopCleanupScheduler();
  } catch (error) {
    console.error('Error stopping cleanup scheduler:', error);
  }

  // Stop all active processes
  for (const [channelId, { process, channelName }] of activeProcesses) {
    try {
      console.log(`Stopping transcoding for channel ${channelId}: ${channelName}`);
      process.kill('SIGTERM');
      await updateChannelStatus(channelId, 'inactive', null);
    } catch (error) {
      console.error(`Error stopping transcoding for channel ${channelId}:`, error);
    }
  }

  activeProcesses.clear();
  console.log('Transcoding cleanup completed');
};

module.exports = {
  startTranscoding,
  stopTranscoding,
  restartTranscoding,
  getActiveJobs,
  initializeTranscoding,
  cleanup,
  // Cleanup functions
  cleanupChannelSegments,
  performPeriodicCleanup,
  getStorageStats,
  startCleanupScheduler,
  stopCleanupScheduler
};
