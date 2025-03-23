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

// Get all news with optional filtering
router.get('/', (req, res) => {
  let sql = 'SELECT * FROM news';
  const params = [];
  
  // Add search filter if provided
  if (req.query.search) {
    sql += ' WHERE title LIKE ? OR body LIKE ?';
    const searchTerm = `%${req.query.search}%`;
    params.push(searchTerm, searchTerm);
  }
  
  sql += ' ORDER BY created_at DESC';
  
  db.all(sql, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ data: rows });
  });
});

// Get single news item by ID
router.get('/:id', (req, res) => {
  db.get('SELECT * FROM news WHERE id = ?', [req.params.id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'News item not found' });
    }
    res.json({ data: row });
  });
});

// Create new news item
router.post('/', (req, res) => {
  const { title, body } = req.body;
  
  // Validation
  if (!title || !body) {
    return res.status(400).json({ error: 'Title and body are required' });
  }
  
  // Get current timestamp
  const now = new Date().toISOString();
  
  db.run(
    'INSERT INTO news (title, body, created_at, updated_at) VALUES (?, ?, ?, ?)',
    [title, body, now, now],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      // Log action
      logAction('news_added', `New news item added: ${title}`);
      
      // Return created news item
      db.get('SELECT * FROM news WHERE id = ?', [this.lastID], (err, row) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ 
          message: 'News item created successfully',
          data: row 
        });
      });
    }
  );
});

// Update news item
router.put('/:id', (req, res) => {
  const { title, body } = req.body;
  const now = new Date().toISOString();
  
  // Check if news item exists
  db.get('SELECT * FROM news WHERE id = ?', [req.params.id], (err, news) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!news) {
      return res.status(404).json({ error: 'News item not found' });
    }
    
    // Prepare update fields
    const updates = [];
    const params = [];
    
    if (title !== undefined) {
      updates.push('title = ?');
      params.push(title);
    }
    
    if (body !== undefined) {
      updates.push('body = ?');
      params.push(body);
    }
    
    updates.push('updated_at = ?');
    params.push(now);
    params.push(req.params.id);
    
    if (updates.length === 1) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    const sql = `UPDATE news SET ${updates.join(', ')} WHERE id = ?`;
    
    db.run(sql, params, function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ error: 'News item not found' });
      }
      
      // Log action
      logAction('news_updated', `News item updated: ${news.title}`);
      
      // Return updated news item
      db.get('SELECT * FROM news WHERE id = ?', [req.params.id], (err, row) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({ 
          message: 'News item updated successfully',
          data: row 
        });
      });
    });
  });
});

// Delete news item
router.delete('/:id', (req, res) => {
  // Get news info before deletion for logging
  db.get('SELECT * FROM news WHERE id = ?', [req.params.id], (err, news) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!news) {
      return res.status(404).json({ error: 'News item not found' });
    }
    
    db.run('DELETE FROM news WHERE id = ?', [req.params.id], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ error: 'News item not found' });
      }
      
      // Log action
      logAction('news_deleted', `News item deleted: ${news.title}`);
      
      res.json({ 
        message: 'News item deleted successfully',
        id: req.params.id 
      });
    });
  });
});

module.exports = router;
