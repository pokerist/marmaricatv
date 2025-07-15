const express = require('express');
const router = express.Router();
const {
  parseM3U8,
  importChannels,
  startBulkTranscoding,
  getBulkOperationStatus,
  getRecentBulkOperations,
  getImportLogs,
  getTranscodingEligibleChannels,
  getBulkOperationsStats
} = require('../controllers/bulk-operations');

/**
 * @route POST /api/bulk-operations/parse-m3u8
 * @description Parse M3U8 file and return preview
 * @access Private (requires authentication)
 */
router.post('/parse-m3u8', parseM3U8);

/**
 * @route POST /api/bulk-operations/import-channels
 * @description Import channels from parsed M3U8 data
 * @access Private (requires authentication)
 */
router.post('/import-channels', importChannels);

/**
 * @route POST /api/bulk-operations/start-bulk-transcoding
 * @description Start bulk transcoding for all channels or selected channels
 * @access Private (requires authentication)
 */
router.post('/start-bulk-transcoding', startBulkTranscoding);

/**
 * @route GET /api/bulk-operations/status/:operationId
 * @description Get bulk operation status
 * @access Private (requires authentication)
 */
router.get('/status/:operationId', getBulkOperationStatus);

/**
 * @route GET /api/bulk-operations/recent
 * @description Get recent bulk operations
 * @access Private (requires authentication)
 */
router.get('/recent', getRecentBulkOperations);

/**
 * @route GET /api/bulk-operations/import-logs/:operationId
 * @description Get import logs for a specific bulk operation
 * @access Private (requires authentication)
 */
router.get('/import-logs/:operationId', getImportLogs);

/**
 * @route GET /api/bulk-operations/transcoding-eligible
 * @description Get channels that are eligible for transcoding
 * @access Private (requires authentication)
 */
router.get('/transcoding-eligible', getTranscodingEligibleChannels);

/**
 * @route GET /api/bulk-operations/stats
 * @description Get bulk operations statistics
 * @access Private (requires authentication)
 */
router.get('/stats', getBulkOperationsStats);

/**
 * @route POST /api/bulk-operations/delete-all-channels
 * @description Safely delete all channels (stop transcoding first)
 * @access Private (requires authentication)
 */
router.post('/delete-all-channels', require('../controllers/bulk-operations').deleteAllChannels);

module.exports = router;
