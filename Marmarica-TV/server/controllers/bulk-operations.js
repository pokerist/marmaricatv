const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db } = require('../index');
const { parseM3U8Buffer, generateImportPreview } = require('../services/m3u8-parser');
const { performBulkImport, performBulkTranscoding, getBulkOperationStatus, getRecentBulkOperations } = require('../services/bulk-transcoding');
const { M3U8_CONSTRAINTS } = require('../services/input-validator');

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

module.exports = {
  parseM3U8,
  importChannels,
  startBulkTranscoding,
  getBulkOperationStatus: getBulkOperationStatusController,
  getRecentBulkOperations: getRecentBulkOperationsController,
  getImportLogs,
  getTranscodingEligibleChannels,
  getBulkOperationsStats
};
