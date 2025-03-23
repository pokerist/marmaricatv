const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
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

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads');
    // Ensure upload directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function(req, file, cb) {
    // Create a unique filename with original extension
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'channel-' + uniqueSuffix + ext);
  }
});

// File filter to allow only images
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Get all channels with optional filtering
router.get('/', (req, res) => {
  const { type, category, has_news } = req.query;
  let sql = 'SELECT * FROM channels';
  const params = [];
  const conditions = [];
  
  // Apply filters if provided
  if (type) {
    conditions.push('type = ?');
    params.push(type);
  }
  
  if (category) {
    conditions.push('category = ?');
    params.push(category);
  }
  
  if (has_news !== undefined) {
    conditions.push('has_news = ?');
    params.push(has_news === 'true' ? 1 : 0);
  }
  
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  
  sql += ' ORDER BY name ASC';
  
  db.all(sql, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ data: rows });
  });
});

// Get single channel by ID
router.get('/:id', (req, res) => {
  db.get('SELECT * FROM channels WHERE id = ?', [req.params.id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    res.json({ data: row });
  });
});

// Create new channel
router.post('/', (req, res) => {
  const { name, url, type, category, has_news } = req.body;
  
  // Validation
  if (!name || !url || !type || !category) {
    return res.status(400).json({ 
      error: 'Missing required fields: name, url, type, and category are required' 
    });
  }
  
  // Get current timestamp
  const now = new Date().toISOString();
  
  db.run(
    `INSERT INTO channels (
      name, url, logo_url, type, category, 
      has_news, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name, 
      url, 
      null, // logo_url will be updated later if needed
      type, 
      category,
      has_news ? 1 : 0,
      now, 
      now
    ],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      // Log action
      logAction('channel_added', `New channel added: ${name} (${type})`);
      
      // Return created channel
      db.get('SELECT * FROM channels WHERE id = ?', [this.lastID], (err, row) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ 
          message: 'Channel created successfully',
          data: row 
        });
      });
    }
  );
});

// Upload channel logo
router.post('/:id/logo', upload.single('logo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded or invalid file type' });
  }
  
  // Get channel to check if it exists
  db.get('SELECT * FROM channels WHERE id = ?', [req.params.id], (err, channel) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!channel) {
      // Remove uploaded file if channel doesn't exist
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Error deleting file:', err);
      });
      return res.status(404).json({ error: 'Channel not found' });
    }
    
    // Delete old logo if it exists
    if (channel.logo_url) {
      const oldLogoPath = path.join(__dirname, '..', channel.logo_url.replace(/^\/uploads/, 'uploads'));
      if (fs.existsSync(oldLogoPath)) {
        fs.unlink(oldLogoPath, (err) => {
          if (err) console.error('Error deleting old logo:', err);
        });
      }
    }
    
    // Update logo URL in database
    const logoUrl = `/uploads/${req.file.filename}`;
    const now = new Date().toISOString();
    
    db.run(
      'UPDATE channels SET logo_url = ?, updated_at = ? WHERE id = ?',
      [logoUrl, now, req.params.id],
      function(err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        
        // Log action
        logAction('channel_logo_updated', `Logo updated for channel: ${channel.name}`);
        
        res.json({ 
          message: 'Channel logo uploaded successfully',
          logo_url: logoUrl
        });
      }
    );
  });
});

// Update channel
router.put('/:id', (req, res) => {
  const { name, url, type, category, has_news } = req.body;
  const now = new Date().toISOString();
  
  // Check if channel exists
  db.get('SELECT * FROM channels WHERE id = ?', [req.params.id], (err, channel) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    
    // Prepare update fields
    const updates = [];
    const params = [];
    
    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }
    
    if (url !== undefined) {
      updates.push('url = ?');
      params.push(url);
    }
    
    if (type !== undefined) {
      updates.push('type = ?');
      params.push(type);
    }
    
    if (category !== undefined) {
      updates.push('category = ?');
      params.push(category);
    }
    
    if (has_news !== undefined) {
      updates.push('has_news = ?');
      params.push(has_news ? 1 : 0);
    }
    
    updates.push('updated_at = ?');
    params.push(now);
    params.push(req.params.id);
    
    if (updates.length === 1) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    const sql = `UPDATE channels SET ${updates.join(', ')} WHERE id = ?`;
    
    db.run(sql, params, function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Channel not found' });
      }
      
      // Log action
      logAction('channel_updated', `Channel updated: ${channel.name}`);
      
      // Return updated channel
      db.get('SELECT * FROM channels WHERE id = ?', [req.params.id], (err, row) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({ 
          message: 'Channel updated successfully',
          data: row 
        });
      });
    });
  });
});

// Delete channel
router.delete('/:id', (req, res) => {
  // Get channel info before deletion for logging
  db.get('SELECT * FROM channels WHERE id = ?', [req.params.id], (err, channel) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    
    db.run('DELETE FROM channels WHERE id = ?', [req.params.id], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Channel not found' });
      }
      
      // Delete logo file if it exists
      if (channel.logo_url) {
        const logoPath = path.join(__dirname, '..', channel.logo_url.replace(/^\/uploads/, 'uploads'));
        if (fs.existsSync(logoPath)) {
          fs.unlink(logoPath, (err) => {
            if (err) console.error('Error deleting channel logo:', err);
          });
        }
      }
      
      // Log action
      logAction('channel_deleted', `Channel deleted: ${channel.name} (${channel.type})`);
      
      res.json({ 
        message: 'Channel deleted successfully',
        id: req.params.id 
      });
    });
  });
});

module.exports = router;
