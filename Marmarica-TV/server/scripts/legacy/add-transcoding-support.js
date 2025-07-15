const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('Adding transcoding support to database...');

// Add transcoding columns to channels table
db.run(`ALTER TABLE channels ADD COLUMN transcoding_enabled BOOLEAN NOT NULL DEFAULT 0`, (err) => {
  if (err && !err.message.includes('duplicate column name')) {
    console.error('Error adding transcoding_enabled column:', err.message);
  } else {
    console.log('Added transcoding_enabled column to channels table');
  }
});

db.run(`ALTER TABLE channels ADD COLUMN transcoded_url TEXT`, (err) => {
  if (err && !err.message.includes('duplicate column name')) {
    console.error('Error adding transcoded_url column:', err.message);
  } else {
    console.log('Added transcoded_url column to channels table');
  }
});

db.run(`ALTER TABLE channels ADD COLUMN transcoding_status TEXT NOT NULL DEFAULT 'inactive'`, (err) => {
  if (err && !err.message.includes('duplicate column name')) {
    console.error('Error adding transcoding_status column:', err.message);
  } else {
    console.log('Added transcoding_status column to channels table');
  }
});

// Add order_index column if it doesn't exist (for reordering)
db.run(`ALTER TABLE channels ADD COLUMN order_index INTEGER`, (err) => {
  if (err && !err.message.includes('duplicate column name')) {
    console.error('Error adding order_index column:', err.message);
  } else {
    console.log('Added order_index column to channels table');
  }
});

// Create transcoding_jobs table
db.run(`CREATE TABLE IF NOT EXISTS transcoding_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  ffmpeg_pid INTEGER,
  output_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'starting',
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (channel_id) REFERENCES channels (id) ON DELETE CASCADE
)`, (err) => {
  if (err) {
    console.error('Error creating transcoding_jobs table:', err.message);
  } else {
    console.log('Created transcoding_jobs table');
  }
});

// Update existing channels to have order_index
db.run(`UPDATE channels SET order_index = id WHERE order_index IS NULL`, (err) => {
  if (err) {
    console.error('Error updating order_index:', err.message);
  } else {
    console.log('Updated order_index for existing channels');
  }
});

console.log('Database migration completed!');

db.close((err) => {
  if (err) {
    console.error('Error closing database:', err.message);
  } else {
    console.log('Database connection closed');
  }
  process.exit(0);
});
