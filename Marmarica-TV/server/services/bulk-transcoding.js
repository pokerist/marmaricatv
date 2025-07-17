const { db } = require('../index');
const transcodingService = require('./transcoding');

/**
 * Helper function to log actions
 * @param {string} actionType - Type of action
 * @param {string} description - Description of action
 */
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

/**
 * Creates a bulk operation record
 * @param {string} operationType - Type of operation
 * @param {number} totalItems - Total number of items
 * @returns {Promise<number>} - Bulk operation ID
 */
const createBulkOperation = (operationType, totalItems) => {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    
    db.run(
      'INSERT INTO bulk_operations (operation_type, total_items, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [operationType, totalItems, 'running', now, now],
      function(err) {
        if (err) {
          console.error('Error creating bulk operation:', err.message);
          reject(err);
        } else {
          resolve(this.lastID);
        }
      }
    );
  });
};

/**
 * Updates bulk operation status
 * @param {number} operationId - Bulk operation ID
 * @param {Object} updates - Updates to apply
 * @returns {Promise<void>}
 */
const updateBulkOperation = (operationId, updates) => {
  return new Promise((resolve, reject) => {
    const now = new Date().toISOString();
    const fields = [];
    const values = [];
    
    if (updates.completed_items !== undefined) {
      fields.push('completed_items = ?');
      values.push(updates.completed_items);
    }
    
    if (updates.failed_items !== undefined) {
      fields.push('failed_items = ?');
      values.push(updates.failed_items);
    }
    
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    
    if (updates.error_message !== undefined) {
      fields.push('error_message = ?');
      values.push(updates.error_message);
    }
    
    fields.push('updated_at = ?');
    values.push(now);
    values.push(operationId);
    
    const sql = `UPDATE bulk_operations SET ${fields.join(', ')} WHERE id = ?`;
    
    db.run(sql, values, function(err) {
      if (err) {
        console.error('Error updating bulk operation:', err.message);
        reject(err);
      } else {
        resolve();
      }
    });
  });
};

/**
 * Gets bulk operation status
 * @param {number} operationId - Bulk operation ID
 * @returns {Promise<Object>} - Bulk operation details
 */
const getBulkOperationStatus = (operationId) => {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM bulk_operations WHERE id = ?',
      [operationId],
      (err, row) => {
        if (err) {
          console.error('Error getting bulk operation:', err.message);
          reject(err);
        } else {
          resolve(row);
        }
      }
    );
  });
};

/**
 * Gets all active bulk operations
 * @returns {Promise<Array>} - Array of active bulk operations
 */
const getActiveBulkOperations = () => {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM bulk_operations WHERE status = ? ORDER BY created_at DESC',
      ['running'],
      (err, rows) => {
        if (err) {
          console.error('Error getting active bulk operations:', err.message);
          reject(err);
        } else {
          resolve(rows);
        }
      }
    );
  });
};

/**
 * Gets recent bulk operations
 * @param {number} limit - Number of operations to return
 * @returns {Promise<Array>} - Array of recent bulk operations
 */
const getRecentBulkOperations = (limit = 10) => {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM bulk_operations ORDER BY created_at DESC LIMIT ?',
      [limit],
      (err, rows) => {
        if (err) {
          console.error('Error getting recent bulk operations:', err.message);
          reject(err);
        } else {
          resolve(rows);
        }
      }
    );
  });
};

/**
 * Imports channels from validated M3U8 data
 * @param {Array} validChannels - Array of validated channel objects
 * @param {number} bulkOperationId - Bulk operation ID for tracking
 * @returns {Promise<Object>} - Import results
 */
const importChannels = async (validChannels, bulkOperationId) => {
  const results = {
    total: validChannels.length,
    imported: 0,
    failed: 0,
    errors: []
  };
  
  // Get highest order_index for proper ordering
  const maxOrderIndex = await new Promise((resolve, reject) => {
    db.get(
      'SELECT MAX(order_index) as max_order FROM channels',
      (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row.max_order || 0);
        }
      }
    );
  });
  
  let currentOrderIndex = maxOrderIndex;
  
  for (const channel of validChannels) {
    try {
      currentOrderIndex++;
      
      // Create import log entry
      const importLogId = await new Promise((resolve, reject) => {
        const now = new Date().toISOString();
        db.run(
          'INSERT INTO import_logs (bulk_operation_id, channel_name, channel_url, status, created_at) VALUES (?, ?, ?, ?, ?)',
          [bulkOperationId, channel.name, channel.url, 'processing', now],
          function(err) {
            if (err) {
              reject(err);
            } else {
              resolve(this.lastID);
            }
          }
        );
      });
      
      // Insert channel
      const channelId = await new Promise((resolve, reject) => {
        const now = new Date().toISOString();
        db.run(
          `INSERT INTO channels (
            name, url, type, category, has_news, 
            transcoding_enabled, transcoding_status, order_index, 
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            channel.name,
            channel.url,
            channel.type,
            channel.category,
            channel.has_news ? 1 : 0,
            channel.transcoding_enabled ? 1 : 0,
            'inactive',
            currentOrderIndex,
            now,
            now
          ],
          function(err) {
            if (err) {
              reject(err);
            } else {
              resolve(this.lastID);
            }
          }
        );
      });
      
      // Update import log with success
      await new Promise((resolve, reject) => {
        db.run(
          'UPDATE import_logs SET status = ?, channel_id = ? WHERE id = ?',
          ['success', channelId, importLogId],
          (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          }
        );
      });
      
      // Start transcoding if enabled
      if (channel.transcoding_enabled) {
        try {
          await transcodingService.startTranscoding(channelId, channel.url, channel.name);
        } catch (transcodingError) {
          console.error(`Error starting transcoding for imported channel ${channel.name}:`, transcodingError);
          // Don't fail the import if transcoding fails
        }
      }
      
      results.imported++;
      
    } catch (error) {
      console.error(`Error importing channel ${channel.name}:`, error);
      
      // Update import log with error
      try {
        await new Promise((resolve, reject) => {
          db.run(
            'UPDATE import_logs SET status = ?, error_message = ? WHERE id = ?',
            ['failed', error.message, importLogId],
            (err) => {
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            }
          );
        });
      } catch (logError) {
        console.error('Error updating import log:', logError);
      }
      
      results.failed++;
      results.errors.push({
        channel: channel.name,
        error: error.message
      });
    }
  }
  
  return results;
};

/**
 * Performs bulk channel import operation
 * @param {Array} validChannels - Array of validated channel objects
 * @returns {Promise<Object>} - Import operation results
 */
const performBulkImport = async (validChannels) => {
  try {
    // Create bulk operation record
    const bulkOperationId = await createBulkOperation('import', validChannels.length);
    
    // Log the start of bulk import
    logAction('bulk_import_started', `Started bulk import of ${validChannels.length} channels`);
    
    // Import channels
    const importResults = await importChannels(validChannels, bulkOperationId);
    
    // Update bulk operation status
    await updateBulkOperation(bulkOperationId, {
      completed_items: importResults.imported,
      failed_items: importResults.failed,
      status: importResults.failed === 0 ? 'completed' : 'completed_with_errors',
      error_message: importResults.errors.length > 0 ? 
        `${importResults.errors.length} channels failed to import` : null
    });
    
    // Log completion
    logAction('bulk_import_completed', 
      `Bulk import completed: ${importResults.imported} imported, ${importResults.failed} failed`);
    
    return {
      success: true,
      bulkOperationId,
      results: importResults
    };
    
  } catch (error) {
    console.error('Error performing bulk import:', error);
    
    // Update bulk operation status if we have an ID
    if (bulkOperationId) {
      try {
        await updateBulkOperation(bulkOperationId, {
          status: 'failed',
          error_message: error.message
        });
      } catch (updateError) {
        console.error('Error updating bulk operation status:', updateError);
      }
    }
    
    logAction('bulk_import_failed', `Bulk import failed: ${error.message}`);
    
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Starts transcoding for all channels
 * @param {Array} channelIds - Array of channel IDs to transcode (optional, defaults to all)
 * @param {number} profileId - Optional profile ID to assign to all channels
 * @returns {Promise<Object>} - Transcoding operation results
 */
const performBulkTranscoding = async (channelIds = null, profileId = null) => {
  try {
    // Get channels to transcode
    const channels = await new Promise((resolve, reject) => {
      let sql = 'SELECT * FROM channels WHERE transcoding_enabled = 0';
      const params = [];
      
      if (channelIds && channelIds.length > 0) {
        const placeholders = channelIds.map(() => '?').join(',');
        sql += ` AND id IN (${placeholders})`;
        params.push(...channelIds);
      }
      
      db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
    
    if (channels.length === 0) {
      return {
        success: true,
        results: {
          total: 0,
          processed: 0,
          failed: 0,
          errors: []
        }
      };
    }
    
    // Create bulk operation record
    const bulkOperationId = await createBulkOperation('bulk_transcoding', channels.length);
    
    // Log the start of bulk transcoding
    logAction('bulk_transcoding_started', `Started bulk transcoding of ${channels.length} channels${profileId ? ` with profile ID: ${profileId}` : ''}`);
    
    const results = {
      total: channels.length,
      processed: 0,
      failed: 0,
      errors: []
    };
    
    // Process each channel
    for (const channel of channels) {
      try {
        // Enable transcoding for the channel and optionally set profile
        await new Promise((resolve, reject) => {
          const now = new Date().toISOString();
          let sql = 'UPDATE channels SET transcoding_enabled = 1, updated_at = ?';
          let params = [now];
          
          // If profile ID is specified, assign it to the channel
          if (profileId) {
            sql += ', transcoding_profile_id = ?';
            params.push(profileId);
          }
          
          sql += ' WHERE id = ?';
          params.push(channel.id);
          
          db.run(sql, params, (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
        
        // Start transcoding (will use the assigned profile or default)
        await transcodingService.startTranscoding(channel.id, channel.url, channel.name);
        
        results.processed++;
        
      } catch (error) {
        console.error(`Error starting transcoding for channel ${channel.name}:`, error);
        results.failed++;
        results.errors.push({
          channel: channel.name,
          error: error.message
        });
      }
    }
    
    // Update bulk operation status
    await updateBulkOperation(bulkOperationId, {
      completed_items: results.processed,
      failed_items: results.failed,
      status: results.failed === 0 ? 'completed' : 'completed_with_errors',
      error_message: results.errors.length > 0 ? 
        `${results.errors.length} channels failed to start transcoding` : null
    });
    
    // Log completion
    logAction('bulk_transcoding_completed', 
      `Bulk transcoding completed: ${results.processed} processed, ${results.failed} failed`);
    
    return {
      success: true,
      bulkOperationId,
      results
    };
    
  } catch (error) {
    console.error('Error performing bulk transcoding:', error);
    
    logAction('bulk_transcoding_failed', `Bulk transcoding failed: ${error.message}`);
    
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Stops transcoding for all active channels
 * @returns {Promise<Object>} - Transcoding stop operation results
 */
const performBulkTranscodingStop = async () => {
  try {
    // Get channels with active transcoding
    const channels = await new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM channels WHERE transcoding_enabled = 1 AND transcoding_status IN (?, ?, ?)',
        ['active', 'starting', 'running'],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
    
    if (channels.length === 0) {
      return {
        success: true,
        results: {
          total: 0,
          processed: 0,
          failed: 0,
          errors: []
        }
      };
    }
    
    // Create bulk operation record
    const bulkOperationId = await createBulkOperation('bulk_transcoding_stop', channels.length);
    
    // Log the start of bulk transcoding stop
    logAction('bulk_transcoding_stop_started', `Started bulk transcoding stop for ${channels.length} channels`);
    
    const results = {
      total: channels.length,
      processed: 0,
      failed: 0,
      errors: []
    };
    
    // Process each channel
    for (const channel of channels) {
      try {
        // Stop transcoding for the channel
        await transcodingService.stopTranscoding(channel.id, channel.name);
        
        // Disable transcoding for the channel
        await new Promise((resolve, reject) => {
          const now = new Date().toISOString();
          db.run(
            'UPDATE channels SET transcoding_enabled = 0, transcoding_status = ?, updated_at = ? WHERE id = ?',
            ['inactive', now, channel.id],
            (err) => {
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            }
          );
        });
        
        results.processed++;
        
      } catch (error) {
        console.error(`Error stopping transcoding for channel ${channel.name}:`, error);
        results.failed++;
        results.errors.push({
          channel: channel.name,
          error: error.message
        });
      }
    }
    
    // Update bulk operation status
    await updateBulkOperation(bulkOperationId, {
      completed_items: results.processed,
      failed_items: results.failed,
      status: results.failed === 0 ? 'completed' : 'completed_with_errors',
      error_message: results.errors.length > 0 ? 
        `${results.errors.length} channels failed to stop transcoding` : null
    });
    
    // Log completion
    logAction('bulk_transcoding_stop_completed', 
      `Bulk transcoding stop completed: ${results.processed} processed, ${results.failed} failed`);
    
    return {
      success: true,
      bulkOperationId,
      results
    };
    
  } catch (error) {
    console.error('Error performing bulk transcoding stop:', error);
    
    logAction('bulk_transcoding_stop_failed', `Bulk transcoding stop failed: ${error.message}`);
    
    return {
      success: false,
      error: error.message
    };
  }
};

module.exports = {
  createBulkOperation,
  updateBulkOperation,
  getBulkOperationStatus,
  getActiveBulkOperations,
  getRecentBulkOperations,
  performBulkImport,
  performBulkTranscoding,
  performBulkTranscodingStop
};
