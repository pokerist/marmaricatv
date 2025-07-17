const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db } = require('../index');
const { parseM3U8Buffer, generateImportPreview } = require('../services/m3u8-parser');
const { performBulkImport, performBulkTranscoding, getBulkOperationStatus, getRecentBulkOperations } = require('../services/bulk-transcoding');
const { M3U8_CONSTRAINTS } = require('../services/input-validator');
const transcodingService = require('../services/transcoding');

// Configure multer for M3U8 file uploads
const storage = multer.memoryStorage(); // Store in memory for processing

const fileFilter = (req, file, cb) => {
  // Check file extension
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext !== '.m3u8' && ext !== '.m3u') {
    return cb(new Error('Only M3U8 files are allowed'), false);
  }
  
  // Check mimetype (optional, as M3U8 files can have various mimetypes)
  const allowedMimetypes = [
    'application/vnd.apple.mpegurl',
    'application/x-mpegurl',
    'audio/x-mpegurl',
    'text/plain',
    'application/octet-stream'
  ];
  
  if (!allowedMimetypes.includes(file.mimetype)) {
    console.log(`Warning: Unexpected mimetype ${file.mimetype} for M3U8 file, but allowing it`);
  }
  
  cb(null, true);
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: M3U8_CONSTRAINTS.MAX_FILE_SIZE
  }
});

/**
 * Helper function to handle async route errors
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Parse M3U8 file and return preview
 */
const parseM3U8 = asyncHandler(async (req, res) => {
  // Handle file upload
  upload.single('m3u8File')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          error: `File too large. Maximum size is ${Math.round(M3U8_CONSTRAINTS.MAX_FILE_SIZE / 1024 / 1024)}MB`
        });
      }
      return res.status(400).json({
        success: false,
        error: err.message
      });
    }
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file provided'
      });
    }
    
    try {
      // Get existing channels for duplicate detection
      const existingChannels = await new Promise((resolve, reject) => {
        db.all('SELECT name, url FROM channels', (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        });
      });
      
      // Parse M3U8 file
      const parseResult = await parseM3U8Buffer(
        req.file.buffer,
        req.file.originalname,
        existingChannels
      );
      
      if (!parseResult.success) {
        return res.status(400).json({
          success: false,
          error: parseResult.error
        });
      }
      
      // Generate preview
      const preview = generateImportPreview(parseResult.validationResults);
      
      res.json({
        success: true,
        data: {
          fileName: parseResult.fileName,
          fileSize: parseResult.fileSize,
          parsedChannels: parseResult.parsedChannels,
          preview,
          validationResults: parseResult.validationResults
        }
      });
      
    } catch (error) {
      console.error('Error parsing M3U8 file:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error while parsing file'
      });
    }
  });
});

/**
 * Import channels from parsed M3U8 data
 */
const importChannels = asyncHandler(async (req, res) => {
  const { validChannels } = req.body;
  
  if (!validChannels || !Array.isArray(validChannels)) {
    return res.status(400).json({
      success: false,
      error: 'Valid channels array is required'
    });
  }
  
  if (validChannels.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'No channels to import'
    });
  }
  
  if (validChannels.length > M3U8_CONSTRAINTS.MAX_ENTRIES) {
    return res.status(400).json({
      success: false,
      error: `Too many channels to import. Maximum is ${M3U8_CONSTRAINTS.MAX_ENTRIES}`
    });
  }
  
  try {
    const importResult = await performBulkImport(validChannels);
    
    res.json({
      success: importResult.success,
      data: importResult.results,
      bulkOperationId: importResult.bulkOperationId
    });
    
  } catch (error) {
    console.error('Error importing channels:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error while importing channels'
    });
  }
});

/**
 * Start bulk transcoding for all channels or selected channels
 */
const startBulkTranscoding = asyncHandler(async (req, res) => {
  const { channelIds } = req.body;
  
  // Validate channelIds if provided
  if (channelIds && !Array.isArray(channelIds)) {
    return res.status(400).json({
      success: false,
      error: 'Channel IDs must be an array'
    });
  }
  
  if (channelIds && channelIds.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'No channels selected for transcoding'
    });
  }
  
  try {
    const transcodingResult = await performBulkTranscoding(channelIds);
    
    res.json({
      success: transcodingResult.success,
      data: transcodingResult.results,
      bulkOperationId: transcodingResult.bulkOperationId
    });
    
  } catch (error) {
    console.error('Error starting bulk transcoding:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error while starting bulk transcoding'
    });
  }
});

/**
 * Stop bulk transcoding for all active channels
 */
const stopBulkTranscoding = asyncHandler(async (req, res) => {
  try {
    const { performBulkTranscodingStop } = require('../services/bulk-transcoding');
    const transcodingResult = await performBulkTranscodingStop();
    
    res.json({
      success: transcodingResult.success,
      data: transcodingResult.results,
      bulkOperationId: transcodingResult.bulkOperationId
    });
    
  } catch (error) {
    console.error('Error stopping bulk transcoding:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error while stopping bulk transcoding'
    });
  }
});

/**
 * Get bulk operation status
 */
const getBulkOperationStatusController = asyncHandler(async (req, res) => {
  const { operationId } = req.params;
  
  if (!operationId || isNaN(operationId)) {
    return res.status(400).json({
      success: false,
      error: 'Valid operation ID is required'
    });
  }
  
  try {
    const operation = await getBulkOperationStatus(parseInt(operationId));
    
    if (!operation) {
      return res.status(404).json({
        success: false,
        error: 'Bulk operation not found'
      });
    }
    
    res.json({
      success: true,
      data: operation
    });
    
  } catch (error) {
    console.error('Error getting bulk operation status:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error while getting operation status'
    });
  }
});

/**
 * Get recent bulk operations
 */
const getRecentBulkOperationsController = asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  
  if (limit > 100) {
    return res.status(400).json({
      success: false,
      error: 'Limit cannot exceed 100'
    });
  }
  
  try {
    const operations = await getRecentBulkOperations(limit);
    
    res.json({
      success: true,
      data: operations
    });
    
  } catch (error) {
    console.error('Error getting recent bulk operations:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error while getting recent operations'
    });
  }
});

/**
 * Get import logs for a specific bulk operation
 */
const getImportLogs = asyncHandler(async (req, res) => {
  const { operationId } = req.params;
  
  if (!operationId || isNaN(operationId)) {
    return res.status(400).json({
      success: false,
      error: 'Valid operation ID is required'
    });
  }
  
  try {
    const logs = await new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM import_logs WHERE bulk_operation_id = ? ORDER BY created_at ASC',
        [parseInt(operationId)],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
    
    res.json({
      success: true,
      data: logs
    });
    
  } catch (error) {
    console.error('Error getting import logs:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error while getting import logs'
    });
  }
});

/**
 * Get channels that are eligible for transcoding
 */
const getTranscodingEligibleChannels = asyncHandler(async (req, res) => {
  try {
    const channels = await new Promise((resolve, reject) => {
      db.all(
        'SELECT id, name, type, category, transcoding_enabled, transcoding_status FROM channels WHERE transcoding_enabled = 0 ORDER BY name ASC',
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
    
    res.json({
      success: true,
      data: channels
    });
    
  } catch (error) {
    console.error('Error getting transcoding eligible channels:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error while getting channels'
    });
  }
});

/**
 * Get bulk operations statistics
 */
const getBulkOperationsStats = asyncHandler(async (req, res) => {
  try {
    const stats = await new Promise((resolve, reject) => {
      db.get(
        `SELECT 
          COUNT(*) as total_operations,
          SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running_operations,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_operations,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_operations,
          SUM(total_items) as total_items_processed,
          SUM(completed_items) as total_items_completed,
          SUM(failed_items) as total_items_failed
        FROM bulk_operations`,
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });
    
    res.json({
      success: true,
      data: stats
    });
    
  } catch (error) {
    console.error('Error getting bulk operations stats:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error while getting statistics'
    });
  }
});

/**
 * Safely delete all channels
 */
const deleteAllChannels = asyncHandler(async (req, res) => {
  try {
    // Get all channels first to check if any exist
    const channels = await new Promise((resolve, reject) => {
      db.all('SELECT id, name, transcoding_enabled, transcoding_status FROM channels', (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });

    if (channels.length === 0) {
      return res.json({
        success: true,
        data: {
          message: 'No channels to delete',
          stopped: 0,
          deleted: 0,
          errors: []
        }
      });
    }

    const results = {
      stopped: 0,
      deleted: 0,
      errors: []
    };

    // Step 1: Stop all active transcoding processes
    const activeTranscodingChannels = channels.filter(c => 
      c.transcoding_enabled && 
      ['active', 'starting', 'running'].includes(c.transcoding_status)
    );

    for (const channel of activeTranscodingChannels) {
      try {
        await transcodingService.stopTranscoding(channel.id, channel.name);
        results.stopped++;
      } catch (error) {
        console.error(`Error stopping transcoding for channel ${channel.id}:`, error);
        results.errors.push(`Failed to stop transcoding for channel: ${channel.name}`);
        // Continue with other channels
      }
    }

    // Step 2: Clean up transcoded files and directories
    const HLS_OUTPUT_BASE = process.env.HLS_OUTPUT_BASE || '/var/www/html/hls_stream';
    if (fs.existsSync(HLS_OUTPUT_BASE)) {
      try {
        const dirs = fs.readdirSync(HLS_OUTPUT_BASE);
        const channelDirs = dirs.filter(dir => dir.startsWith('channel_'));
        
        for (const dir of channelDirs) {
          const dirPath = path.join(HLS_OUTPUT_BASE, dir);
          try {
            fs.rmSync(dirPath, { recursive: true, force: true });
          } catch (error) {
            console.error(`Error removing directory ${dir}:`, error);
            results.errors.push(`Failed to clean up directory: ${dir}`);
          }
        }
      } catch (error) {
        console.error('Error cleaning up HLS directories:', error);
        results.errors.push('Failed to clean up some transcoded files');
      }
    }

    // Step 3: Clean up uploaded logo files
    const uploadsDir = path.join(__dirname, '../uploads');
    if (fs.existsSync(uploadsDir)) {
      try {
        const files = fs.readdirSync(uploadsDir);
        const channelFiles = files.filter(file => file.startsWith('channel-'));
        
        for (const file of channelFiles) {
          const filePath = path.join(uploadsDir, file);
          try {
            fs.unlinkSync(filePath);
          } catch (error) {
            console.error(`Error removing file ${file}:`, error);
            // Don't add to errors array for individual files
          }
        }
      } catch (error) {
        console.error('Error cleaning up upload files:', error);
        results.errors.push('Failed to clean up some uploaded files');
      }
    }

    // Step 4: Delete database entries
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM channels', function(err) {
        if (err) {
          reject(err);
        } else {
          results.deleted = this.changes;
          resolve();
        }
      });
    });

    // Step 5: Clean up related database entries
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM transcoding_jobs', (err) => {
        if (err) {
          console.error('Error cleaning up transcoding jobs:', err);
          results.errors.push('Failed to clean up transcoding jobs');
        }
        resolve();
      });
    });

    // Log the action
    const now = new Date().toISOString();
    db.run(
      'INSERT INTO actions (action_type, description, created_at) VALUES (?, ?, ?)',
      ['bulk_delete_channels', `Deleted all channels (${results.deleted} channels, ${results.stopped} stopped transcoding)`, now],
      (err) => {
        if (err) {
          console.error('Error logging bulk delete action:', err.message);
        }
      }
    );

    res.json({
      success: true,
      data: {
        message: `Successfully deleted ${results.deleted} channels`,
        stopped: results.stopped,
        deleted: results.deleted,
        errors: results.errors
      }
    });

  } catch (error) {
    console.error('Error in bulk delete operation:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error while deleting channels'
    });
  }
});

module.exports = {
  parseM3U8,
  importChannels,
  startBulkTranscoding,
  stopBulkTranscoding,
  getBulkOperationStatus: getBulkOperationStatusController,
  getRecentBulkOperations: getRecentBulkOperationsController,
  getImportLogs,
  getTranscodingEligibleChannels,
  getBulkOperationsStats,
  deleteAllChannels
};
