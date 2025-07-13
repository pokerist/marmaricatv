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

// Helper function to get all news
function getAllNews() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM news ORDER BY created_at DESC', [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Helper function to process channel URL - return transcoded URL if enabled
function processChannelUrl(channel) {
  if (channel.transcoding_enabled && 
      channel.transcoded_url) {
    // Replace the original URL with the transcoded URL
    channel.url = channel.transcoded_url;
  }
  return channel;
}

// Helper function to get channels by types
function getChannelsByTypes(types) {
  return new Promise((resolve, reject) => {
    // Convert comma-separated types to array
    const typeArray = types.split(',');
    const placeholders = typeArray.map(() => '?').join(',');
    
    db.all(
      `SELECT * FROM channels WHERE type IN (${placeholders}) ORDER BY order_index ASC`,
      typeArray,
      (err, rows) => {
        if (err) reject(err);
        else {
          // Process each channel to return transcoded URL if active
          const processedRows = rows.map(channel => processChannelUrl(channel));
          resolve(processedRows);
        }
      }
    );
  });
}

// Check device status and return appropriate content
router.post('/check-device', async (req, res) => {
  const { duid } = req.body;
  
  if (!duid) {
    return res.status(400).json({ error: 'Device ID (DUID) is required' });
  }
  
  try {
    // Check if device exists
    db.get('SELECT * FROM devices WHERE duid = ?', [duid], async (err, device) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      // If device doesn't exist, register a new one
      if (!device) {
        return res.status(404).json({ 
          error: 'Device not registered',
          message: 'Device not registered. Please register your device first.'
        });
      }
      
      const now = new Date();
      const expiryDate = new Date(device.expiry_date);
      const news = await getAllNews();
      
      // Check device status
      if (device.status === 'active') {
        // Check if device is expired
        if (now > expiryDate) {
          // Update device status to expired
          db.run(
            'UPDATE devices SET status = "expired", updated_at = ? WHERE duid = ?',
            [now.toISOString(), duid],
            (err) => {
              if (err) console.error('Error updating device status:', err.message);
            }
          );
          
          logAction('device_expired', `Device expired: ${duid} (${device.owner_name})`);
          
          // Only return FTA and Local channels for expired devices
          const channels = await getChannelsByTypes('FTA,Local');
          
          return res.json({
            status: 'expired',
            message: 'Your subscription has ended. You can only view Free-To-Air and Local channels now.',
            data: {
              device: {
                duid: device.duid,
                owner_name: device.owner_name,
                status: 'expired',
                expiry_date: device.expiry_date
              },
              news,
              channels
            }
          });
        }
        
        // Active and not expired device - return all allowed channels
        const channels = await getChannelsByTypes(device.allowed_types);
        
        return res.json({
          status: 'active',
          message: 'Device active',
          data: {
            device: {
              duid: device.duid,
              owner_name: device.owner_name,
              status: device.status,
              expiry_date: device.expiry_date,
              allowed_types: device.allowed_types
            },
            news,
            channels
          }
        });
      } else if (device.status === 'disabled') {
        return res.json({
          status: 'disabled',
          message: 'Your device has been disabled by the administrator. Please contact support for more information.',
          data: {
            device: {
              duid: device.duid,
              owner_name: device.owner_name,
              status: device.status
            }
          }
        });
      } else if (device.status === 'expired') {
        // Only return FTA and Local channels for expired devices
        const channels = await getChannelsByTypes('FTA,Local');
        
        return res.json({
          status: 'expired',
          message: 'Your subscription has ended. You can only view Free-To-Air and Local channels now.',
          data: {
            device: {
              duid: device.duid,
              owner_name: device.owner_name,
              status: device.status,
              expiry_date: device.expiry_date
            },
            news,
            channels
          }
        });
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Register a new device
router.post('/register-device', (req, res) => {
  const { duid } = req.body;
  
  if (!duid) {
    return res.status(400).json({ error: 'Device ID (DUID) is required for registration' });
  }
  
  // Generate activation code (4 random digits)
  const activation_code = generateActivationCode();
  
  // Set default expiry date (1 year from now)
  const expiryDate = new Date();
  expiryDate.setFullYear(expiryDate.getFullYear() + 1);
  
  // Get current timestamp
  const now = new Date().toISOString();
  
  db.run(
    `INSERT INTO devices (
      duid, activation_code, owner_name, allowed_types, 
      expiry_date, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      duid, 
      activation_code, 
      '', // Empty owner_name, to be filled by admin later
      'FTA,Local', // Default allowed types
      expiryDate.toISOString().split('T')[0],
      'disabled', // Default status is disabled until activated
      now, 
      now
    ],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      // Log action
      logAction('device_registered', `New device registered with DUID: ${duid}`);
      
      // Return device info with activation code
      res.status(201).json({
        message: 'Device successfully created',
        data: {
          duid,
          activation_code,
          owner_name: '',
          status: 'disabled',
          expiry_date: expiryDate.toISOString().split('T')[0]
        }
      });
    }
  );
});

// Activate a device
router.post('/activate-device', (req, res) => {
  const { duid, activation_code } = req.body;
  
  if (!duid || !activation_code) {
    return res.status(400).json({ 
      error: 'Both device ID (DUID) and activation code are required' 
    });
  }
  
  db.get(
    'SELECT * FROM devices WHERE duid = ?', 
    [duid], 
    (err, device) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      if (!device) {
        return res.status(404).json({ error: 'Device not found' });
      }
      
      // Check activation code
      if (device.activation_code !== activation_code) {
        return res.status(400).json({ error: 'Invalid activation code' });
      }
      
      // Check if already activated
      if (device.status === 'active') {
        return res.status(400).json({ 
          error: 'Device is already activated',
          device: {
            duid: device.duid,
            owner_name: device.owner_name,
            status: device.status,
            expiry_date: device.expiry_date
          }
        });
      }
      
      // Update device status to active
      const now = new Date().toISOString();
      
      db.run(
        'UPDATE devices SET status = "active", updated_at = ? WHERE duid = ?',
        [now, duid],
        function(err) {
          if (err) {
            return res.status(500).json({ error: err.message });
          }
          
          if (this.changes === 0) {
            return res.status(404).json({ error: 'Device not found' });
          }
          
          // Log action
          logAction('device_activated', `Device activated: ${duid} (${device.owner_name})`);
          
          // Return updated device info
          res.json({
            message: 'Device activated successfully',
            data: {
              duid: device.duid,
              owner_name: device.owner_name,
              status: 'active',
              expiry_date: device.expiry_date,
              allowed_types: device.allowed_types
            }
          });
        }
      );
    }
  );
});

module.exports = router;
