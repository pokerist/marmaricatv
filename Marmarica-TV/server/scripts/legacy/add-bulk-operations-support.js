const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('Adding bulk operations support to database...');

// Create bulk_operations table for tracking bulk import/transcoding operations
db.run(`CREATE TABLE IF NOT EXISTS bulk_operations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_type TEXT NOT NULL,
  total_items INTEGER NOT NULL,
  completed_items INTEGER DEFAULT 0,
  failed_items INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running',
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`, (err) => {
  if (err) {
    console.error('Error creating bulk_operations table:', err.message);
  } else {
    console.log('✓ Created bulk_operations table');
  }
});

// Create import_logs table for detailed import tracking and error reporting
db.run(`CREATE TABLE IF NOT EXISTS import_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bulk_operation_id INTEGER,
  channel_name TEXT,
  channel_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  channel_id INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY (bulk_operation_id) REFERENCES bulk_operations (id) ON DELETE CASCADE,
  FOREIGN KEY (channel_id) REFERENCES channels (id) ON DELETE SET NULL
)`, (err) => {
  if (err) {
    console.error('Error creating import_logs table:', err.message);
  } else {
    console.log('✓ Created import_logs table');
  }
});

// Create indexes for better performance
db.run(`CREATE INDEX IF NOT EXISTS idx_bulk_operations_status ON bulk_operations(status)`, (err) => {
  if (err) {
    console.error('Error creating bulk_operations status index:', err.message);
  } else {
    console.log('✓ Created bulk_operations status index');
  }
});

db.run(`CREATE INDEX IF NOT EXISTS idx_import_logs_bulk_operation ON import_logs(bulk_operation_id)`, (err) => {
  if (err) {
    console.error('Error creating import_logs bulk_operation index:', err.message);
  } else {
    console.log('✓ Created import_logs bulk_operation index');
  }
});

db.run(`CREATE INDEX IF NOT EXISTS idx_import_logs_status ON import_logs(status)`, (err) => {
  if (err) {
    console.error('Error creating import_logs status index:', err.message);
  } else {
    console.log('✓ Created import_logs status index');
  }
});

console.log('Database migration completed!');
console.log('');
console.log('Manual Action Required:');
console.log('Run this script on the production server:');
console.log('cd server && node scripts/add-bulk-operations-support.js');

db.close((err) => {
  if (err) {
    console.error('Error closing database:', err.message);
  } else {
    console.log('Database connection closed');
  }
  process.exit(0);
});
