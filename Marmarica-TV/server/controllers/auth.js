const bcrypt = require('bcrypt');
const { db } = require('../index');

/**
 * Initialize admins table if it doesn't exist
 */
const initializeAuthTable = () => {
  db.run(`CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`, (err) => {
    if (err) {
      console.error('Error creating admins table:', err.message);
    } else {
      console.log('Admins table initialized');
    }
  });
};

/**
 * Handle admin login
 */
const login = (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Username and password are required'
    });
  }

  // Find admin by username
  db.get('SELECT * FROM admins WHERE username = ?', [username], async (err, admin) => {
    if (err) {
      console.error('Database error during login:', err);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Error during login'
      });
    }

    if (!admin) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid credentials'
      });
    }

    // Compare password
    try {
      const match = await bcrypt.compare(password, admin.password);
      
      if (!match) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid credentials'
        });
      }

      // Set session
      req.session.isAuthenticated = true;
      req.session.adminId = admin.id;
      req.session.username = admin.username;

      // Return success without sensitive data
      res.json({
        message: 'Login successful',
        admin: {
          id: admin.id,
          username: admin.username
        }
      });

    } catch (error) {
      console.error('Error comparing passwords:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Error during login'
      });
    }
  });
};

/**
 * Handle admin logout
 */
const logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Error during logout'
      });
    }

    res.json({ message: 'Logged out successfully' });
  });
};

/**
 * Get current admin session info
 */
const getSession = (req, res) => {
  if (req.session && req.session.isAuthenticated) {
    res.json({
      isAuthenticated: true,
      admin: {
        id: req.session.adminId,
        username: req.session.username
      }
    });
  } else {
    res.json({
      isAuthenticated: false,
      admin: null
    });
  }
};

// Export controller functions
module.exports = {
  initializeAuthTable,
  login,
  logout,
  getSession
};
