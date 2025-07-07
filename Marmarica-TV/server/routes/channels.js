const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { db } = require('../index');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'channel-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage });

// Get all channels (ordered by display_order)
router.get('/', (req, res) => {
  const { type, category, has_news } = req.query;
  let sql = 'SELECT * FROM channels';
  const params = [];
  const conditions = [];

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

  sql += ' ORDER BY display_order ASC, name ASC';

  db.all(sql, params, (err, channels) => {
    if (err) {
      console.error('Error fetching channels:', err);
      return res.status(500).json({ error: 'Failed to fetch channels' });
    }
    res.json(channels);
  });
});

// Get a single channel
router.get('/:id', (req, res) => {
  db.get('SELECT * FROM channels WHERE id = ?', [req.params.id], (err, channel) => {
    if (err) {
      console.error('Error fetching channel:', err);
      return res.status(500).json({ error: 'Failed to fetch channel' });
    }
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    res.json(channel);
  });
});

// Create a new channel
router.post('/', (req, res) => {
  const { name, url, type, category, has_news } = req.body;
  const now = new Date().toISOString();

  // Get the maximum display_order and add 1
  db.get('SELECT MAX(display_order) as maxOrder FROM channels', [], (err, result) => {
    if (err) {
      console.error('Error getting max order:', err);
      return res.status(500).json({ error: 'Failed to create channel' });
    }

    const newOrder = (result.maxOrder || 0) + 1;

    db.run(
      `INSERT INTO channels (name, url, type, category, has_news, display_order, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, url, type, category, has_news ? 1 : 0, newOrder, now, now],
      function(err) {
        if (err) {
          console.error('Error creating channel:', err);
          return res.status(500).json({ error: 'Failed to create channel' });
        }

        // Log the action
        db.run(
          'INSERT INTO actions (action_type, description, created_at) VALUES (?, ?, ?)',
          ['channel_created', `Channel "${name}" was created`, now]
        );

        res.status(201).json({
          id: this.lastID,
          name,
          url,
          type,
          category,
          has_news,
          display_order: newOrder,
          created_at: now,
          updated_at: now
        });
      }
    );
  });
});

// Update a channel
router.put('/:id', (req, res) => {
  const { name, url, type, category, has_news } = req.body;
  const now = new Date().toISOString();

  db.run(
    `UPDATE channels 
     SET name = ?, url = ?, type = ?, category = ?, has_news = ?, updated_at = ?
     WHERE id = ?`,
    [name, url, type, category, has_news ? 1 : 0, now, req.params.id],
    function(err) {
      if (err) {
        console.error('Error updating channel:', err);
        return res.status(500).json({ error: 'Failed to update channel' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Channel not found' });
      }

      // Log the action
      db.run(
        'INSERT INTO actions (action_type, description, created_at) VALUES (?, ?, ?)',
        ['channel_updated', `Channel "${name}" was updated`, now]
      );

      res.json({ message: 'Channel updated successfully' });
    }
  );
});

// Delete a channel
router.delete('/:id', (req, res) => {
  const now = new Date().toISOString();

  // Get channel name for logging
  db.get('SELECT name FROM channels WHERE id = ?', [req.params.id], (err, channel) => {
    if (err) {
      console.error('Error fetching channel:', err);
      return res.status(500).json({ error: 'Failed to delete channel' });
    }
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }

    db.run('DELETE FROM channels WHERE id = ?', [req.params.id], function(err) {
      if (err) {
        console.error('Error deleting channel:', err);
        return res.status(500).json({ error: 'Failed to delete channel' });
      }

      // Log the action
      db.run(
        'INSERT INTO actions (action_type, description, created_at) VALUES (?, ?, ?)',
        ['channel_deleted', `Channel "${channel.name}" was deleted`, now]
      );

      // Reorder remaining channels to close the gap
      db.run(
        `UPDATE channels 
         SET display_order = (
           SELECT COUNT(*) 
           FROM channels AS c2 
           WHERE c2.display_order <= channels.display_order AND c2.id != ?
         )`,
        [req.params.id]
      );

      res.json({ message: 'Channel deleted successfully' });
    });
  });
});

// Upload channel logo
router.post('/:id/logo', upload.single('logo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const logo_url = req.file.filename;
  const now = new Date().toISOString();

  db.run(
    'UPDATE channels SET logo_url = ?, updated_at = ? WHERE id = ?',
    [logo_url, now, req.params.id],
    function(err) {
      if (err) {
        console.error('Error updating channel logo:', err);
        return res.status(500).json({ error: 'Failed to update channel logo' });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Channel not found' });
      }

      // Log the action
      db.run(
        'INSERT INTO actions (action_type, description, created_at) VALUES (?, ?, ?)',
        ['channel_logo_updated', `Logo updated for channel ID ${req.params.id}`, now]
      );

      res.json({ 
        message: 'Logo uploaded successfully',
        logo_url: logo_url
      });
    }
  );
});

// Update channel order
router.post('/reorder', (req, res) => {
  const { orderedIds } = req.body;
  const now = new Date().toISOString();

  if (!Array.isArray(orderedIds)) {
    return res.status(400).json({ error: 'orderedIds must be an array' });
  }

  // Start a transaction
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    try {
      // Update each channel's order
      orderedIds.forEach((id, index) => {
        db.run(
          'UPDATE channels SET display_order = ?, updated_at = ? WHERE id = ?',
          [index + 1, now, id]
        );
      });

      // Log the action
      db.run(
        'INSERT INTO actions (action_type, description, created_at) VALUES (?, ?, ?)',
        ['channels_reordered', 'Channel display order was updated', now]
      );

      db.run('COMMIT');
      res.json({ message: 'Channel order updated successfully' });
    } catch (error) {
      db.run('ROLLBACK');
      console.error('Error reordering channels:', error);
      res.status(500).json({ error: 'Failed to update channel order' });
    }
  });
});

module.exports = router;
