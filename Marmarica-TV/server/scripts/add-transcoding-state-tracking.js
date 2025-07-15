const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('Adding transcoding state tracking to database...');

// Add last_transcoding_state column to channels table
db.run(`ALTER TABLE channels ADD COLUMN last_transcoding_state TEXT DEFAULT 'idle'`, (err) => {
  if (err && !err.message.includes('duplicate column name')) {
    console.error('Error adding last_transcoding_state column:', err.message);
  } else {
    console.log('✓ Added last_transcoding_state column to channels table');
  }
});

// Update existing channels to have proper last_transcoding_state
db.run(`UPDATE channels SET last_transcoding_state = 
  CASE 
    WHEN transcoding_enabled = 1 AND transcoding_status = 'active' THEN 'active'
    WHEN transcoding_enabled = 1 AND transcoding_status IN ('starting', 'running') THEN 'active'
    WHEN transcoding_enabled = 1 AND transcoding_status = 'failed' THEN 'failed'
    ELSE 'idle'
  END
  WHERE last_transcoding_state = 'idle'`, (err) => {
  if (err) {
    console.error('Error updating last_transcoding_state:', err.message);
  } else {
    console.log('✓ Updated last_transcoding_state for existing channels');
  }
});

console.log('Database migration completed!');
console.log('');
console.log('Manual Action Required:');
console.log('Run this script on the production server:');
console.log('cd server && node scripts/add-transcoding-state-tracking.js');

db.close((err) => {
  if (err) {
    console.error('Error closing database:', err.message);
  } else {
    console.log('Database connection closed');
  }
  process.exit(0);
});
