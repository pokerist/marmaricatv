require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const session = require('express-session');
const cookieParser = require('cookie-parser');

// Import enhanced services with fallback
let enhancedServices = {
  sessionStore: null,
  resourceMonitoring: null,
  enhancedTranscoding: null,
  migrations: null
};

// Try to load enhanced services
try {
  enhancedServices.sessionStore = require('./services/session-store');
  enhancedServices.resourceMonitoring = require('./services/resource-monitor');
  enhancedServices.enhancedTranscoding = require('./services/enhanced-transcoding');
  enhancedServices.migrations = require('./scripts/migrate-enhanced-transcoding');
  console.log('Enhanced services loaded successfully');
} catch (error) {
  console.warn('Enhanced services not available, falling back to basic functionality:', error.message);
}

// Initialize express app
const app = express();
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://192.168.1.15:3000';
const API_URL = process.env.API_URL || `http://192.168.1.15:${PORT}`;

// Middleware
app.use(cors({
  origin: CORS_ORIGIN,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Session configuration will be set up after session store initialization
let sessionStore = null;

// Set up basic session middleware immediately (will be replaced by enhanced version if available)
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false,
    maxAge: 12 * 60 * 60 * 1000 // 12 hours
  }
}));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, UPLOAD_DIR)));

// Serve HLS streams
const HLS_OUTPUT_BASE = process.env.HLS_OUTPUT_BASE || '/var/www/html/hls_stream';
app.use('/hls_stream', express.static(HLS_OUTPUT_BASE));

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
const authRoutes = require('./routes/auth');
const transcodingRoutes = require('./routes/transcoding');
const transcodingProfilesRoutes = require('./routes/transcoding-profiles');
const bulkOperationsRoutes = require('./routes/bulk-operations');
const enhancedTranscodingRoutes = require('./routes/enhanced-transcoding');
const optimizedTranscodingRoutes = require('./routes/optimized-transcoding');
const streamHealthRoutes = require('./routes/stream-health');
const simplifiedStreamHealthRoutes = require('./routes/simplified-stream-health');
const profileTemplatesRoutes = require('./routes/profile-templates');
const smartTranscodingRoutes = require('./routes/smart-transcoding');

// Initialize auth table
const { initializeAuthTable } = require('./controllers/auth');
initializeAuthTable();

// Auth middleware
const { isAuthenticated } = require('./middleware/auth');

// Use routes
app.use('/api/auth', authRoutes);
app.use('/api/devices', isAuthenticated, deviceRoutes);
app.use('/api/channels', isAuthenticated, channelRoutes);
app.use('/api/news', isAuthenticated, newsRoutes);
app.use('/api/dashboard', isAuthenticated, dashboardRoutes);
app.use('/api/transcoding', isAuthenticated, transcodingRoutes);
app.use('/api/transcoding-profiles', isAuthenticated, transcodingProfilesRoutes);
app.use('/api/bulk-operations', isAuthenticated, bulkOperationsRoutes);
app.use('/api/enhanced-transcoding', isAuthenticated, enhancedTranscodingRoutes);
app.use('/api/optimized-transcoding', isAuthenticated, optimizedTranscodingRoutes);
app.use('/api/stream-health', isAuthenticated, simplifiedStreamHealthRoutes);
app.use('/api/stream-health-legacy', isAuthenticated, streamHealthRoutes);
app.use('/api/profile-templates', isAuthenticated, profileTemplatesRoutes);
app.use('/api/smart-transcoding', isAuthenticated, smartTranscodingRoutes);
app.use('/api/client', clientRoutes); // Client routes remain open

// Health check route
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Server is running' });
});

// Serve React build files in production
if (NODE_ENV === 'production') {
  // Serve static files from React build
  const buildPath = path.join(__dirname, '../client/build');
  app.use(express.static(buildPath));
  
  // Handle client-side routing - serve index.html for non-API routes
  app.get('*', (req, res) => {
    // Only serve index.html for non-API routes
    if (!req.path.startsWith('/api/') && !req.path.startsWith('/uploads/') && !req.path.startsWith('/hls_stream/')) {
      res.sendFile(path.join(buildPath, 'index.html'));
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  });
  
  console.log(`Frontend served from: ${buildPath}`);
} else {
  console.log('Development mode - Frontend should be served separately');
}

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

// Initialize simplified services
const simplifiedTranscodingService = require('./services/simplified-transcoding');
const simplifiedStreamHealthService = require('./services/simplified-stream-health');

// Keep enhanced services for fallback (if needed)
const transcodingService = require('./services/transcoding');

// Simplified server initialization
async function initializeSimplifiedServices() {
  try {
    console.log('Initializing simplified services...');
    
    // 1. Initialize simplified transcoding service
    try {
      console.log('Initializing simplified transcoding service...');
      simplifiedTranscodingService.setDatabase(db);
      await simplifiedTranscodingService.initializeSimplifiedTranscoding();
      console.log('Simplified transcoding service initialized');
    } catch (error) {
      console.warn('Simplified transcoding initialization failed, falling back to legacy:', error.message);
      // Fallback to legacy transcoding
      console.log('Initializing legacy transcoding service...');
      await transcodingService.initializeTranscoding();
    }
    
    // 2. Initialize simplified stream health monitoring
    try {
      console.log('Initializing simplified stream health monitoring...');
      simplifiedStreamHealthService.setDatabase(db);
      await simplifiedStreamHealthService.initializeStreamHealthMonitoring();
      console.log('Simplified stream health monitoring initialized');
    } catch (error) {
      console.warn('Simplified stream health monitoring initialization failed:', error.message);
    }
    
    // 3. Keep enhanced services for expert users (optional)
    if (enhancedServices.enhancedTranscoding) {
      try {
        console.log('Initializing enhanced transcoding for expert features...');
        enhancedServices.enhancedTranscoding.setDatabase(db);
        // Don't auto-initialize, keep available for expert use
        console.log('Enhanced transcoding available for expert users');
      } catch (error) {
        console.warn('Enhanced transcoding setup failed:', error.message);
      }
    }
    
    console.log('Simplified services initialized successfully!');
    
  } catch (error) {
    console.error('Error initializing simplified services:', error);
    // Don't exit, continue with basic functionality
    console.log('Continuing with basic functionality...');
  }
}

// Start server
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API available at ${API_URL}/api`);
  console.log(`CORS enabled for origin: ${CORS_ORIGIN}`);
  
  // Check for expired devices on startup
  checkExpiredDevices();
  
  // Set up a periodic check for expired devices (every hour)
  setInterval(checkExpiredDevices, 60 * 60 * 1000);
  
  // Initialize simplified services
  await initializeSimplifiedServices();
});

// Simplified shutdown handling
async function gracefulShutdown() {
  console.log('Received shutdown signal, shutting down gracefully...');
  
  try {
    // 1. Cleanup simplified transcoding service
    try {
      console.log('Cleaning up simplified transcoding...');
      await simplifiedTranscodingService.cleanupSimplifiedTranscoding();
    } catch (error) {
      console.warn('Simplified transcoding cleanup failed, trying legacy:', error.message);
      // Fallback to legacy transcoding cleanup
      try {
        console.log('Cleaning up legacy transcoding...');
        await transcodingService.cleanup();
      } catch (legacyError) {
        console.warn('Legacy transcoding cleanup also failed:', legacyError.message);
      }
    }
    
    // 2. Cleanup simplified stream health monitoring
    try {
      console.log('Cleaning up simplified stream health monitoring...');
      await simplifiedStreamHealthService.cleanupStreamHealthMonitoring();
    } catch (error) {
      console.warn('Simplified stream health monitoring cleanup failed:', error.message);
    }
    
    // 3. Close database connection
    console.log('Closing database connection...');
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err.message);
      } else {
        console.log('Database connection closed');
      }
      console.log('Graceful shutdown completed');
      process.exit(0);
    });
    
  } catch (error) {
    console.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
