const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { db } = require('../index');

// Configuration
const HLS_OUTPUT_BASE = process.env.HLS_OUTPUT_BASE || '/var/www/html/hls_stream';
const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';

// Store active FFmpeg processes
const activeProcesses = new Map();

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
const updateChannelStatus = (channelId, status, transcodedUrl = null) => {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    let sql = 'UPDATE channels SET transcoding_status = ?, updated_at = ?';
    let params = [status, now];
    
    if (transcodedUrl !== null) {
      sql += ', transcoded_url = ?';
      params.push(transcodedUrl);
    }
    
    sql += ' WHERE id = ?';
    params.push(channelId);
    
    db.run(sql, params, function(err) {
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
    
    db.run(sql, params, function(err) {
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

// Generate FFmpeg command for LL-HLS transcoding
const generateFFmpegCommand = (inputUrl, channelId) => {
  const outputDir = createOutputDirectory(channelId);
  const outputPath = path.join(outputDir, 'output.m3u8');
  const segmentPath = path.join(outputDir, 'output_%03d.m4s');
  
  const command = [
    '-i', inputUrl,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-tune', 'zerolatency',
    '-g', '12',
    '-keyint_min', '12',
    '-sc_threshold', '0',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-f', 'hls',
    '-hls_time', '0.5',
    '-hls_playlist_type', 'event',
    '-hls_flags', 'independent_segments+delete_segments+append_list+split_by_time+program_date_time',
    '-hls_segment_type', 'fmp4',
    '-hls_segment_filename', segmentPath,
    '-hls_start_number_source', 'epoch',
    '-hls_list_size', '6',
    '-hls_delete_threshold', '1',
    outputPath
  ];
  
  return { command, outputPath };
};

// Start transcoding for a channel
const startTranscoding = async (channelId, inputUrl, channelName) => {
  try {
    console.log(`Starting transcoding for channel ${channelId}: ${channelName}`);
    
    // Update channel status to starting
    await updateChannelStatus(channelId, 'starting');
    
    // Generate FFmpeg command
    const { command, outputPath } = generateFFmpegCommand(inputUrl, channelId);
    
    // Create transcoding job record
    const now = new Date().toISOString();
    const jobId = await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO transcoding_jobs (channel_id, output_path, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        [channelId, outputPath, 'starting', now, now],
        function(err) {
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
    const ffmpegProcess = spawn(FFMPEG_PATH, command);
    const pid = ffmpegProcess.pid;
    
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
        await updateChannelStatus(channelId, 'active', `/hls_stream/channel_${channelId}/output.m3u8`);
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
        await updateChannelStatus(channelId, 'active', `/hls_stream/channel_${channelId}/output.m3u8`);
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

// Initialize transcoding service on server start
const initializeTranscoding = async () => {
  try {
    console.log('Initializing transcoding service...');
    
    // Create base HLS output directory
    if (!fs.existsSync(HLS_OUTPUT_BASE)) {
      fs.mkdirSync(HLS_OUTPUT_BASE, { recursive: true });
      console.log(`Created HLS output base directory: ${HLS_OUTPUT_BASE}`);
    }
    
    // Find channels that were being transcoded when server stopped
    const activeChannels = await new Promise((resolve, reject) => {
      db.all(
        `SELECT c.*, j.id as job_id 
         FROM channels c 
         LEFT JOIN transcoding_jobs j ON c.id = j.channel_id 
         WHERE c.transcoding_enabled = 1 AND c.transcoding_status != 'inactive'`,
        (err, rows) => {
          if (err) {
            console.error('Error fetching active channels:', err.message);
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
    
    // Restart transcoding for channels that were active
    for (const channel of activeChannels) {
      if (channel.transcoding_enabled) {
        console.log(`Restarting transcoding for channel: ${channel.name}`);
        try {
          await restartTranscoding(channel.id, channel.url, channel.name);
        } catch (error) {
          console.error(`Failed to restart transcoding for channel ${channel.id}:`, error);
          await updateChannelStatus(channel.id, 'failed');
        }
      }
    }
    
    console.log('Transcoding service initialized');
    
  } catch (error) {
    console.error('Error initializing transcoding service:', error);
  }
};

// Cleanup function for graceful shutdown
const cleanup = async () => {
  console.log('Cleaning up transcoding processes...');
  
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
  cleanup
};
