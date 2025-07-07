const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { db } = require('../index');
const { createToken } = require('./middleware/auth');

// Login route
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Get admin from database
    db.get('SELECT * FROM admins WHERE username = ?', [username], async (err, admin) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }

      if (!admin) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Compare password
      const validPassword = await bcrypt.compare(password, admin.password);
      if (!validPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Create token
      const token = createToken(admin);

      // Set cookie
      res.cookie('adminToken', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 12 * 60 * 60 * 1000 // 12 hours
      });

      // Log the action
      const now = new Date().toISOString();
      db.run(
        'INSERT INTO actions (action_type, description, created_at) VALUES (?, ?, ?)',
        ['admin_login', `Admin ${username} logged in`, now]
      );

      res.json({ 
        message: 'Login successful',
        admin: {
          id: admin.id,
          username: admin.username
        }
      });
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout route
router.post('/logout', (req, res) => {
  res.clearCookie('adminToken');
  res.json({ message: 'Logged out successfully' });
});

// Change password route
router.post('/change-password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const adminId = req.admin?.id;

    if (!adminId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new passwords are required' });
    }

    // Get admin from database
    db.get('SELECT * FROM admins WHERE id = ?', [adminId], async (err, admin) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }

      if (!admin) {
        return res.status(404).json({ error: 'Admin not found' });
      }

      // Verify current password
      const validPassword = await bcrypt.compare(currentPassword, admin.password);
      if (!validPassword) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      // Hash new password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(newPassword, salt);

      // Update password in database
      const now = new Date().toISOString();
      db.run(
        'UPDATE admins SET password = ?, updated_at = ? WHERE id = ?',
        [hashedPassword, now, adminId],
        (err) => {
          if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Failed to update password' });
          }

          // Log the action
          db.run(
            'INSERT INTO actions (action_type, description, created_at) VALUES (?, ?, ?)',
            ['password_change', `Admin ${admin.username} changed their password`, now]
          );

          res.json({ message: 'Password updated successfully' });
        }
      );
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check auth status route
router.get('/check', (req, res) => {
  if (req.admin) {
    res.json({ 
      authenticated: true, 
      admin: {
        id: req.admin.id,
        username: req.admin.username
      }
    });
  } else {
    res.json({ authenticated: false });
  }
});

module.exports = router;
