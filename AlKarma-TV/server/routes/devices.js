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

// Get all devices with optional filtering
router.get('/', (req, res) => {
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
  
  db.all(sql, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ data: rows });
  });
});

// Get single device by ID
router.get('/:id', (req, res) => {
  db.get('SELECT * FROM devices WHERE id = ?', [req.params.id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'Device not found' });
    }
    res.json({ data: row });
  });
});

// Create new device
router.post('/', (req, res) => {
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
        return res.status(500).json({ error: err.message });
      }
      
      // Log action
      logAction('device_created', `New device created for ${owner_name} with DUID: ${duid}`);
      
      // Return created device
      db.get('SELECT * FROM devices WHERE id = ?', [this.lastID], (err, row) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ 
          message: 'Device created successfully',
          data: row 
        });
      });
    }
  );
});

// Update device
router.put('/:id', (req, res) => {
  const { owner_name, allowed_types, expiry_date, status } = req.body;
  const now = new Date().toISOString();
  
  // Get current device data for comparison
  db.get('SELECT * FROM devices WHERE id = ?', [req.params.id], (err, device) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
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
          return res.status(500).json({ error: err.message });
        }
        res.json({ 
          message: 'Device updated successfully',
          data: row 
        });
      });
    });
  });
});

// Delete device
router.delete('/:id', (req, res) => {
  // Get device info before deletion for logging
  db.get('SELECT * FROM devices WHERE id = ?', [req.params.id], (err, device) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }
    
    db.run('DELETE FROM devices WHERE id = ?', [req.params.id], function(err) {
      if (err) {
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
});

module.exports = router;
