const express = require('express');
const router = express.Router();
const { db } = require('../index');

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

// Helper function to generate random 4-digit activation code
function generateActivationCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// Helper function to check if a date is expired
function isExpired(dateStr) {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Handle different date formats
    let formattedDateStr = dateStr;
    if (dateStr.includes('/')) {
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        formattedDateStr = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
      }
    }
    
    console.log(`Comparing dates: Today=${today}, Device expiry=${formattedDateStr}`);
    return formattedDateStr < today;
  } catch (err) {
    console.error('Error checking expiry date:', err);
    return false;
  }
}

// Function to check and update a device's status if it's expired
async function checkAndUpdateExpiryStatus(device) {
  if (!device) return null;
  
  // Already expired, no need to check
  if (device.status === 'expired') return device;
  
  // Check if expired
  if (isExpired(device.expiry_date)) {
    console.log(`Device ${device.duid} has expired (${device.expiry_date}). Updating status.`);
    
    return new Promise((resolve, reject) => {
      const now = new Date().toISOString();
      
      db.run(
        'UPDATE devices SET status = ?, updated_at = ? WHERE id = ?',
        ['expired', now, device.id],
        function(err) {
          if (err) {
            console.error(`Error updating device ${device.id} status:`, err.message);
            resolve(device); // Return original device if update fails
          } else {
            // Log action
            logAction('device_expired', `Device ${device.duid} (${device.owner_name}) automatically marked as expired`);
            
            // Return updated device
            device.status = 'expired';
            device.updated_at = now;
            resolve(device);
          }
        }
      );
    });
  }
  
  return device;
}

// Background expiry check (runs every minute but doesn't block requests)
const runBackgroundExpiryCheck = () => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Find devices with expiry dates in the past but not marked as expired
    db.all(
      `SELECT * FROM devices WHERE date(expiry_date) < date(?) AND status != 'expired' LIMIT 25`,
      [today],
      (err, devices) => {
        if (err) {
          console.error('Error in background expiry check:', err.message);
          return;
        }
        
        if (devices && devices.length > 0) {
          console.log(`Found ${devices.length} devices that should be expired. Processing...`);
          
          // Process devices sequentially to avoid database contention
          let i = 0;
          const updateNext = () => {
            if (i < devices.length) {
              const device = devices[i];
              
              // Update device status
              const now = new Date().toISOString();
              db.run(
                'UPDATE devices SET status = ?, updated_at = ? WHERE id = ?',
                ['expired', now, device.id],
                function(err) {
                  if (err) {
                    console.error(`Error updating device ${device.id}:`, err.message);
                  } else {
                    console.log(`Device ${device.duid} marked as expired in background check`);
                    
                    // Log action
                    db.run(
                      'INSERT INTO actions (action_type, description, created_at) VALUES (?, ?, ?)',
                      ['device_expired', `Device ${device.duid} (${device.owner_name}) marked as expired in background check`, now]
                    );
                  }
                  
                  // Process next device regardless of success/failure
                  i++;
                  setTimeout(updateNext, 100); // Small delay to prevent server overload
                }
              );
            }
          };
          
          // Start processing
          updateNext();
        }
      }
    );
  } catch (e) {
    console.error('Unhandled error in background expiry check:', e);
  }
};

// Run background check immediately and then every minute
runBackgroundExpiryCheck();
setInterval(runBackgroundExpiryCheck, 60000);

// Get all devices with optional filtering
router.get('/', (req, res) => {
  try {
    const { status, expiring } = req.query;
    let sql = 'SELECT * FROM devices';
    const params = [];
    
    // Apply filters if provided
    if (status) {
      sql += ' WHERE status = ?';
      params.push(status);
    }
    
    // Add expiring filter (devices expiring within 7 days)
    if (expiring === 'true') {
      const now = new Date();
      const sevenDaysLater = new Date(now);
      sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
      
      sql += status ? ' AND' : ' WHERE';
      sql += ' expiry_date <= ? AND expiry_date >= ? AND status = "active"';
      params.push(sevenDaysLater.toISOString().split('T')[0]);
      params.push(now.toISOString().split('T')[0]);
    }
    
    sql += ' ORDER BY created_at DESC';
    
    // Run the query with a timeout to prevent hanging
    const queryTimeout = setTimeout(() => {
      console.error('Device listing query timed out');
      res.status(408).json({ error: 'Query timed out, please try again' });
    }, 5000);
    
    db.all(sql, params, (err, rows) => {
      clearTimeout(queryTimeout);
      
      if (err) {
        console.error('Error fetching devices:', err.message);
        return res.status(500).json({ error: err.message });
      }
      
      // Run a background check for expired devices without blocking response
      setTimeout(() => {
        runBackgroundExpiryCheck();
      }, 100);
      
      res.json({ data: rows });
    });
  } catch (e) {
    console.error('Unhandled error in device list endpoint:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single device by ID
router.get('/:id', async (req, res) => {
  try {
    db.get('SELECT * FROM devices WHERE id = ?', [req.params.id], async (err, device) => {
      if (err) {
        console.error('Error fetching device:', err.message);
        return res.status(500).json({ error: err.message });
      }
      
      if (!device) {
        return res.status(404).json({ error: 'Device not found' });
      }
      
      // Check if device is expired and update if needed
      const updatedDevice = await checkAndUpdateExpiryStatus(device);
      
      res.json({ data: updatedDevice });
    });
  } catch (e) {
    console.error('Unhandled error in get device endpoint:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new device
router.post('/', (req, res) => {
  try {
    const { owner_name, allowed_types } = req.body;
    
    // Validation
    if (!owner_name) {
      return res.status(400).json({ error: 'Owner name is required' });
    }
    
    // Generate unique DUID (using timestamp + random string)
    const timestamp = new Date().getTime().toString(16);
    const randomStr = Math.random().toString(16).substring(2, 6);
    const duid = `${timestamp}${randomStr}`.toUpperCase();
    
    // Generate activation code (4 random digits)
    const activation_code = generateActivationCode();
    
    // Set default expiry date (1 year from now)
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);
    
    // Get current timestamp
    const now = new Date().toISOString();
    
    // Default allowed types if not provided
    const deviceAllowedTypes = allowed_types || 'FTA,Local';

    db.run(
      `INSERT INTO devices (
        duid, activation_code, owner_name, allowed_types, 
        expiry_date, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        duid, 
        activation_code, 
        owner_name, 
        deviceAllowedTypes, 
        expiryDate.toISOString().split('T')[0],
        'disabled', 
        now, 
        now
      ],
      function(err) {
        if (err) {
          console.error('Error creating device:', err.message);
          return res.status(500).json({ error: err.message });
        }
        
        // Log action
        logAction('device_created', `New device created for ${owner_name} with DUID: ${duid}`);
        
        // Return created device
        db.get('SELECT * FROM devices WHERE id = ?', [this.lastID], (err, row) => {
          if (err) {
            console.error('Error retrieving created device:', err.message);
            return res.status(500).json({ error: err.message });
          }
          res.status(201).json({ 
            message: 'Device created successfully',
            data: row 
          });
        });
      }
    );
  } catch (e) {
    console.error('Unhandled error in create device endpoint:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update device
router.put('/:id', async (req, res) => {
  try {
    let { owner_name, allowed_types, expiry_date, status } = req.body;
    const now = new Date().toISOString();
    
    // Get current device data for comparison
    db.get('SELECT * FROM devices WHERE id = ?', [req.params.id], async (err, device) => {
      if (err) {
        console.error('Error fetching device for update:', err.message);
        return res.status(500).json({ error: err.message });
      }
      
      if (!device) {
        return res.status(404).json({ error: 'Device not found' });
      }
      
      // Check expiry status
      const dateToCheck = expiry_date || device.expiry_date;
      
      // If device has expired, force status to 'expired'
      if (isExpired(dateToCheck)) {
        status = 'expired';
        console.log(`Device ${device.duid} has expired date (${dateToCheck}). Setting status to expired.`);
        
        // If user tried to set a different status, log a warning
        if (req.body.status && req.body.status !== 'expired') {
          console.warn(`Attempted to set expired device ${device.duid} to ${req.body.status}, overriding to 'expired'`);
        }
      }
      
      // Prepare update fields
      const updates = [];
      const params = [];
      
      if (owner_name !== undefined) {
        updates.push('owner_name = ?');
        params.push(owner_name);
      }
      
      if (allowed_types !== undefined) {
        updates.push('allowed_types = ?');
        params.push(allowed_types);
      }
      
      if (expiry_date !== undefined) {
        updates.push('expiry_date = ?');
        params.push(expiry_date);
      }
      
      if (status !== undefined) {
        updates.push('status = ?');
        params.push(status);
      }
      
      updates.push('updated_at = ?');
      params.push(now);
      params.push(req.params.id);
      
      if (updates.length === 1) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }
      
      const sql = `UPDATE devices SET ${updates.join(', ')} WHERE id = ?`;
      
      db.run(sql, params, function(err) {
        if (err) {
          console.error('Error updating device:', err.message);
          return res.status(500).json({ error: err.message });
        }
        
        if (this.changes === 0) {
          return res.status(404).json({ error: 'Device not found' });
        }
        
        // Log status change if applicable
        if (status !== undefined && status !== device.status) {
          logAction('device_status_changed', `Device ${device.duid} status changed from ${device.status} to ${status}`);
        }
        
        // Return updated device
        db.get('SELECT * FROM devices WHERE id = ?', [req.params.id], (err, row) => {
          if (err) {
            console.error('Error retrieving updated device:', err.message);
            return res.status(500).json({ error: err.message });
          }
          res.json({ 
            message: 'Device updated successfully',
            data: row 
          });
        });
      });
    });
  } catch (e) {
    console.error('Unhandled error in update device endpoint:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete device
router.delete('/:id', (req, res) => {
  try {
    // Get device info before deletion for logging
    db.get('SELECT * FROM devices WHERE id = ?', [req.params.id], (err, device) => {
      if (err) {
        console.error('Error fetching device for deletion:', err.message);
        return res.status(500).json({ error: err.message });
      }
      
      if (!device) {
        return res.status(404).json({ error: 'Device not found' });
      }
      
      db.run('DELETE FROM devices WHERE id = ?', [req.params.id], function(err) {
        if (err) {
          console.error('Error deleting device:', err.message);
          return res.status(500).json({ error: err.message });
        }
        
        if (this.changes === 0) {
          return res.status(404).json({ error: 'Device not found' });
        }
        
        // Log action
        logAction('device_deleted', `Device deleted: ${device.duid} (${device.owner_name})`);
        
        res.json({ 
          message: 'Device deleted successfully',
          id: req.params.id 
        });
      });
    });
  } catch (e) {
    console.error('Unhandled error in delete device endpoint:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
