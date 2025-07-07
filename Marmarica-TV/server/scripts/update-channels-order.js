require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Initialize SQLite database
const dbPath = path.join(__dirname, '..', 'database.sqlite');
const db = new sqlite3.Database(dbPath);

async function updateChannelsTable() {
  try {
    console.log('\n=== Updating Channels Table for Order Support ===\n');

    // Add display_order column if it doesn't exist
    await new Promise((resolve, reject) => {
      db.run(`
        ALTER TABLE channels 
        ADD COLUMN display_order INTEGER
      `, (err) => {
        if (err) {
          // Column might already exist
          console.log('display_order column already exists or error:', err.message);
        } else {
          console.log('Added display_order column to channels table');
        }
        resolve();
      });
    });

    // Initialize display_order for existing channels
    await new Promise((resolve, reject) => {
      db.run(`
        UPDATE channels 
        SET display_order = id 
        WHERE display_order IS NULL
      `, (err) => {
        if (err) {
          console.error('Error initializing display_order:', err.message);
          reject(err);
        } else {
          console.log('Initialized display_order for existing channels');
          resolve();
        }
      });
    });

    // Create index on display_order for better performance
    await new Promise((resolve, reject) => {
      db.run(`
        CREATE INDEX IF NOT EXISTS idx_channels_display_order 
        ON channels(display_order)
      `, (err) => {
        if (err) {
          console.error('Error creating index:', err.message);
          reject(err);
        } else {
          console.log('Created index on display_order column');
          resolve();
        }
      });
    });

    console.log('\nChannels table update completed successfully!');

  } catch (error) {
    console.error('Error updating channels table:', error.message);
  } finally {
    db.close();
  }
}

// Run the update
updateChannelsTable();
