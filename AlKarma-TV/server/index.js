const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

// Initialize express app
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API available at http://localhost:${PORT}/api`);
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
