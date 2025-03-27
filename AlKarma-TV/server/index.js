require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

// Initialize express app
const app = express();
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || 'localhost';
const NODE_ENV = process.env.NODE_ENV || 'development';
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, UPLOAD_DIR)));

// Log server configuration
console.log(`Server starting in ${NODE_ENV} mode`);
console.log(`Port: ${PORT}`);
console.log(`Upload directory: ${UPLOAD_DIR}`);

// Initialize SQLite database
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to database:', err.message);
  } else {
    console.log('Connected to the SQLite database');
    initializeDatabase();
  }
});

// Initialize database tables if they don't exist
function initializeDatabase() {
  // Create devices table
  db.run(`CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    duid TEXT UNIQUE NOT NULL,
    activation_code TEXT NOT NULL,
    owner_name TEXT NOT NULL,
    allowed_types TEXT NOT NULL DEFAULT 'FTA,Local',
    expiry_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'disabled',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`, (err) => {
    if (err) {
      console.error('Error creating devices table:', err.message);
    } else {
      console.log('Devices table initialized');
    }
  });

  // Create channels table
  db.run(`CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    logo_url TEXT,
    type TEXT NOT NULL,
    category TEXT NOT NULL,
    has_news BOOLEAN NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`, (err) => {
    if (err) {
      console.error('Error creating channels table:', err.message);
    } else {
      console.log('Channels table initialized');
    }
  });

  // Create news table
  db.run(`CREATE TABLE IF NOT EXISTS news (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`, (err) => {
    if (err) {
      console.error('Error creating news table:', err.message);
    } else {
      console.log('News table initialized');
    }
  });

  // Create actions table for logging system activities
  db.run(`CREATE TABLE IF NOT EXISTS actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action_type TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`, (err) => {
    if (err) {
      console.error('Error creating actions table:', err.message);
    } else {
      console.log('Actions table initialized');
    }
  });

  // Create uploads directory if it doesn't exist
  const uploadsDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('Uploads directory created');
  }
}

// Export db for use in controllers
module.exports.db = db;

// Import routes
const deviceRoutes = require('./routes/devices');
const channelRoutes = require('./routes/channels');
const newsRoutes = require('./routes/news');
const dashboardRoutes = require('./routes/dashboard');
const clientRoutes = require('./routes/client');

// Use routes
app.use('/api/devices', deviceRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/client', clientRoutes);

// Health check route
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Server is running' });
});

// Function to check for expired devices and update their status
function checkExpiredDevices() {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Log that we're checking for expired devices
    console.log(`Checking for expired devices as of ${today}`);
    
    // Helper function to handle a single device update with proper error handling
    const updateDeviceStatus = (device) => {
      return new Promise((resolve, reject) => {
        db.run(
          'UPDATE devices SET status = ?, updated_at = ? WHERE id = ?',
          ['expired', new Date().toISOString(), device.id],
          function(err) {
            if (err) {
              console.error(`Error updating device ${device.id} status:`, err.message);
              reject(err);
            } else {
              console.log(`Device ${device.duid} marked as expired`);
              
              // Log the action
              const now = new Date().toISOString();
              db.run(
                'INSERT INTO actions (action_type, description, created_at) VALUES (?, ?, ?)',
                ['device_expired', `Device ${device.duid} (${device.owner_name}) has expired`, now],
                (err) => {
                  if (err) {
                    console.error('Error logging action:', err.message);
                    // Don't reject here, as the main operation succeeded
                  }
                  resolve();
                }
              );
            }
          }
        );
      });
    };
    
    // Query for expired devices
    db.all(
      `SELECT * FROM devices WHERE date(expiry_date) < date(?) AND status != 'expired'`,
      [today],
      async (err, devices) => {
        if (err) {
          console.error('Error checking for expired devices:', err.message);
          return;
        }
        
        if (devices.length > 0) {
          console.log(`Found ${devices.length} devices that have expired`);
          
          // Update each expired device, but do it sequentially to avoid race conditions
          for (const device of devices) {
            try {
              await updateDeviceStatus(device);
            } catch (error) {
              console.error(`Failed to update device ${device.id}:`, error);
              // Continue with other devices even if one fails
            }
          }
          console.log('Finished processing expired devices');
        } else {
          console.log('No newly expired devices found');
        }
      }
    );
  } catch (error) {
    console.error('Unhandled error in checkExpiredDevices:', error);
  }
}

// Start server
app.listen(PORT, HOST, () => {
  console.log(`Server running on ${HOST}:${PORT}`);
  console.log(`API available at http://${HOST}:${PORT}/api`);
  
  // Check for expired devices on startup
  checkExpiredDevices();
  
  // Set up a periodic check for expired devices (every hour)
  setInterval(checkExpiredDevices, 60 * 60 * 1000);
});

// Handle shutdown gracefully
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error(err.message);
    }
    console.log('Database connection closed');
    process.exit(0);
  });
});
