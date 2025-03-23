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

// Ensure upload directory exists before configuring multer
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  try {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log('Created uploads directory:', uploadDir);
  } catch (err) {
    console.error('Error creating uploads directory:', err);
  }
}

// Configure multer for file uploads with error handling
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    // Double-check that directory exists at time of upload
    if (!fs.existsSync(uploadDir)) {
      try {
        fs.mkdirSync(uploadDir, { recursive: true });
        console.log('Created uploads directory during upload');
      } catch (err) {
        return cb(new Error(`Failed to create upload directory: ${err.message}`));
      }
    }
    cb(null, uploadDir);
  },
  filename: function(req, file, cb) {
    try {
      // Create a unique filename with original extension
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname) || '.png'; // Default to .png if no extension
      cb(null, 'channel-' + uniqueSuffix + ext);
    } catch (err) {
      cb(new Error(`Error generating filename: ${err.message}`));
    }
  }
});

// File filter to allow only images
const fileFilter = (req, file, cb) => {
  try {
    // Accept all common image types
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  } catch (err) {
    cb(new Error(`Error in file filter: ${err.message}`));
  }
};

// Create multer upload with error handling
const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
}).single('logo');

// Helper function to handle errors with async/await
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(err => {
      console.error('Route error:', err);
      res.status(500).json({ error: err.message || 'Internal server error' });
    });
  };
}

// Get all channels with optional filtering
router.get('/', asyncHandler(async (req, res) => {
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
  
  // Add a query timeout
  const queryTimeout = setTimeout(() => {
    throw new Error('Query timeout after 5 seconds');
  }, 5000);
  
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      clearTimeout(queryTimeout);
      
      if (err) {
        console.error('Error fetching channels:', err.message);
        return reject(err);
      }
      
      res.json({ data: rows });
      resolve();
    });
  });
}));

// Get single channel by ID
router.get('/:id', asyncHandler(async (req, res) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM channels WHERE id = ?', [req.params.id], (err, row) => {
      if (err) {
        console.error('Error fetching channel:', err.message);
        return reject(err);
      }
      
      if (!row) {
        res.status(404).json({ error: 'Channel not found' });
        return resolve();
      }
      
      res.json({ data: row });
      resolve();
    });
  });
}));

// Create new channel
router.post('/', asyncHandler(async (req, res) => {
  const { name, url, type, category, has_news } = req.body;
  
  // Validation
  if (!name || !url || !type || !category) {
    res.status(400).json({ 
      error: 'Missing required fields: name, url, type, and category are required' 
    });
    return;
  }
  
  // Get current timestamp
  const now = new Date().toISOString();
  
  return new Promise((resolve, reject) => {
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
          console.error('Error creating channel:', err.message);
          return reject(err);
        }
        
        // Log action
        logAction('channel_added', `New channel added: ${name} (${type})`);
        
        // Return created channel
        db.get('SELECT * FROM channels WHERE id = ?', [this.lastID], (err, row) => {
          if (err) {
            console.error('Error retrieving created channel:', err.message);
            return reject(err);
          }
          
          res.status(201).json({ 
            message: 'Channel created successfully',
            data: row 
          });
          
          resolve();
        });
      }
    );
  });
}));

// Upload channel logo - completely rewritten with better error handling
router.post('/:id/logo', (req, res) => {
  // First check if channel exists before trying to upload
  db.get('SELECT * FROM channels WHERE id = ?', [req.params.id], (err, channel) => {
    if (err) {
      console.error('Error checking channel before upload:', err.message);
      return res.status(500).json({ error: 'Error accessing database' });
    }
    
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    
    // Process the upload with explicit error handling
    upload(req, res, function(err) {
      if (err) {
        console.error('Error in file upload:', err.message);
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'File too large. Maximum size is 5MB.' });
        }
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      }
      
      if (!req.file) {
        return res.status(400).json({ error: 'No file provided or invalid file type' });
      }
      
      // Delete old logo if it exists
      if (channel.logo_url) {
        const oldLogoPath = path.join(__dirname, '..', channel.logo_url.replace(/^\/uploads/, 'uploads'));
        if (fs.existsSync(oldLogoPath)) {
          try {
            fs.unlinkSync(oldLogoPath);
          } catch (err) {
            console.error('Error deleting old logo:', err);
            // Continue despite error deleting old file
          }
        }
      }
      
      // Calculate the new logo URL (correctly using path separators)
      const logoUrl = `/uploads/${req.file.filename}`;
      const now = new Date().toISOString();
      
      // Update the database with the new logo URL
      db.run(
        'UPDATE channels SET logo_url = ?, updated_at = ? WHERE id = ?',
        [logoUrl, now, req.params.id],
        function(err) {
          if (err) {
            console.error('Error updating logo URL in database:', err.message);
            
            // Try to delete the uploaded file if we can't update the database
            try {
              fs.unlinkSync(req.file.path);
            } catch (e) {
              console.error('Error deleting uploaded file after database error:', e);
            }
            
            return res.status(500).json({ error: 'Failed to update database with new logo URL' });
          }
          
          // Log the action
          logAction('channel_logo_updated', `Logo updated for channel: ${channel.name}`);
          
          // Return success response
          res.json({ 
            message: 'Channel logo uploaded successfully',
            logo_url: logoUrl
          });
        }
      );
    });
  });
});

// Update channel
router.put('/:id', asyncHandler(async (req, res) => {
  const { name, url, type, category, has_news } = req.body;
  const now = new Date().toISOString();
  
  // Check if channel exists
  const channel = await new Promise((resolve, reject) => {
    db.get('SELECT * FROM channels WHERE id = ?', [req.params.id], (err, row) => {
      if (err) {
        console.error('Error fetching channel for update:', err.message);
        return reject(err);
      }
      resolve(row);
    });
  });
  
  if (!channel) {
    res.status(404).json({ error: 'Channel not found' });
    return;
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
    res.status(400).json({ error: 'No valid fields to update' });
    return;
  }
  
  const sql = `UPDATE channels SET ${updates.join(', ')} WHERE id = ?`;
  
  await new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) {
        console.error('Error updating channel:', err.message);
        return reject(err);
      }
      
      if (this.changes === 0) {
        res.status(404).json({ error: 'Channel not found' });
        return resolve();
      }
      
      // Log action
      logAction('channel_updated', `Channel updated: ${channel.name}`);
      
      // Return updated channel
      db.get('SELECT * FROM channels WHERE id = ?', [req.params.id], (err, row) => {
        if (err) {
          console.error('Error retrieving updated channel:', err.message);
          return reject(err);
        }
        
        res.json({ 
          message: 'Channel updated successfully',
          data: row 
        });
        
        resolve();
      });
    });
  });
}));

// Delete channel
router.delete('/:id', asyncHandler(async (req, res) => {
  // Get channel info before deletion for logging
  const channel = await new Promise((resolve, reject) => {
    db.get('SELECT * FROM channels WHERE id = ?', [req.params.id], (err, row) => {
      if (err) {
        console.error('Error fetching channel for deletion:', err.message);
        return reject(err);
      }
      resolve(row);
    });
  });
  
  if (!channel) {
    res.status(404).json({ error: 'Channel not found' });
    return;
  }
  
  await new Promise((resolve, reject) => {
    db.run('DELETE FROM channels WHERE id = ?', [req.params.id], function(err) {
      if (err) {
        console.error('Error deleting channel:', err.message);
        return reject(err);
      }
      
      if (this.changes === 0) {
        res.status(404).json({ error: 'Channel not found' });
        return resolve();
      }
      
      // Delete logo file if it exists
      if (channel.logo_url) {
        const logoPath = path.join(__dirname, '..', channel.logo_url.replace(/^\/uploads/, 'uploads'));
        if (fs.existsSync(logoPath)) {
          try {
            fs.unlinkSync(logoPath);
          } catch (err) {
            console.error('Error deleting channel logo file:', err);
            // Continue despite file deletion error
          }
        }
      }
      
      // Log action
      logAction('channel_deleted', `Channel deleted: ${channel.name} (${channel.type})`);
      
      res.json({ 
        message: 'Channel deleted successfully',
        id: req.params.id 
      });
      
      resolve();
    });
  });
}));

module.exports = router;
