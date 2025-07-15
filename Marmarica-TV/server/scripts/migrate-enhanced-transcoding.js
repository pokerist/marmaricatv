const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database path
const dbPath = path.join(__dirname, '../database.sqlite');

// Create database connection
const db = new sqlite3.Database(dbPath);

// Migration queries
const migrations = [
  // Add new columns to existing tables
  {
    name: 'Add enhanced columns to channels table',
    query: `
      ALTER TABLE channels ADD COLUMN offline_reason TEXT;
      ALTER TABLE channels ADD COLUMN dead_source_count INTEGER DEFAULT 0;
      ALTER TABLE channels ADD COLUMN last_dead_source_event TEXT;
    `,
    skipIfExists: true
  },
  
  // Add enhanced columns to actions table
  {
    name: 'Add enhanced columns to actions table',
    query: `
      ALTER TABLE actions ADD COLUMN channel_id INTEGER;
      ALTER TABLE actions ADD COLUMN additional_data TEXT;
    `,
    skipIfExists: true
  },
  
  // Add profile_id to transcoding_jobs table
  {
    name: 'Add profile_id to transcoding_jobs table',
    query: `
      ALTER TABLE transcoding_jobs ADD COLUMN profile_id INTEGER;
    `,
    skipIfExists: true
  },
  
  // Create dead_source_events table
  {
    name: 'Create dead_source_events table',
    query: `
      CREATE TABLE IF NOT EXISTS dead_source_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id INTEGER NOT NULL,
        error_count INTEGER NOT NULL,
        error_patterns TEXT NOT NULL,
        profile_level INTEGER NOT NULL,
        cooldown_until TEXT NOT NULL,
        retry_count INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (channel_id) REFERENCES channels(id)
      );
    `
  },
  
  // Create profile_migrations table
  {
    name: 'Create profile_migrations table',
    query: `
      CREATE TABLE IF NOT EXISTS profile_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_profile_id INTEGER,
        to_profile_id INTEGER NOT NULL,
        affected_channels INTEGER NOT NULL,
        successful_channels INTEGER DEFAULT 0,
        failed_channels INTEGER DEFAULT 0,
        status TEXT NOT NULL, -- 'running', 'completed', 'failed', 'cancelled'
        started_at TEXT NOT NULL,
        completed_at TEXT,
        error_message TEXT,
        FOREIGN KEY (from_profile_id) REFERENCES transcoding_profiles(id),
        FOREIGN KEY (to_profile_id) REFERENCES transcoding_profiles(id)
      );
    `
  },
  
  // Create channel_restart_queue table
  {
    name: 'Create channel_restart_queue table',
    query: `
      CREATE TABLE IF NOT EXISTS channel_restart_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id INTEGER NOT NULL,
        profile_id INTEGER NOT NULL,
        priority INTEGER DEFAULT 0,
        scheduled_for TEXT NOT NULL,
        status TEXT NOT NULL, -- 'pending', 'processing', 'completed', 'failed'
        created_at TEXT NOT NULL,
        FOREIGN KEY (channel_id) REFERENCES channels(id),
        FOREIGN KEY (profile_id) REFERENCES transcoding_profiles(id)
      );
    `
  },
  
  // Create resource_history table
  {
    name: 'Create resource_history table',
    query: `
      CREATE TABLE IF NOT EXISTS resource_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        cpu_usage REAL NOT NULL,
        memory_usage REAL NOT NULL,
        disk_usage REAL NOT NULL,
        memory_total INTEGER NOT NULL,
        memory_used INTEGER NOT NULL,
        disk_total INTEGER NOT NULL,
        disk_used INTEGER NOT NULL,
        cpu_health TEXT NOT NULL,
        memory_health TEXT NOT NULL,
        disk_health TEXT NOT NULL,
        overall_health TEXT NOT NULL
      );
    `
  },
  
  // Create resource_alerts table
  {
    name: 'Create resource_alerts table',
    query: `
      CREATE TABLE IF NOT EXISTS resource_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        alert_type TEXT NOT NULL,
        message TEXT NOT NULL,
        value REAL NOT NULL,
        threshold REAL NOT NULL,
        created_at TEXT NOT NULL
      );
    `
  },
  
  // Create indexes for performance
  {
    name: 'Create indexes for performance',
    query: `
      CREATE INDEX IF NOT EXISTS idx_channels_transcoding_status ON channels(transcoding_status);
      CREATE INDEX IF NOT EXISTS idx_channels_dead_source_event ON channels(last_dead_source_event);
      CREATE INDEX IF NOT EXISTS idx_transcoding_jobs_channel_id ON transcoding_jobs(channel_id);
      CREATE INDEX IF NOT EXISTS idx_transcoding_jobs_status ON transcoding_jobs(status);
      CREATE INDEX IF NOT EXISTS idx_transcoding_jobs_profile_id ON transcoding_jobs(profile_id);
      CREATE INDEX IF NOT EXISTS idx_dead_source_events_channel_id ON dead_source_events(channel_id);
      CREATE INDEX IF NOT EXISTS idx_dead_source_events_created_at ON dead_source_events(created_at);
      CREATE INDEX IF NOT EXISTS idx_profile_migrations_status ON profile_migrations(status);
      CREATE INDEX IF NOT EXISTS idx_resource_history_timestamp ON resource_history(timestamp);
      CREATE INDEX IF NOT EXISTS idx_resource_alerts_created_at ON resource_alerts(created_at);
      CREATE INDEX IF NOT EXISTS idx_actions_channel_id ON actions(channel_id);
      CREATE INDEX IF NOT EXISTS idx_actions_created_at ON actions(created_at);
      CREATE INDEX IF NOT EXISTS idx_actions_type ON actions(action_type);
    `
  }
];

// Function to check if column exists
function columnExists(tableName, columnName) {
  return new Promise((resolve, reject) => {
    db.get(`PRAGMA table_info(${tableName})`, (err, result) => {
      if (err) {
        reject(err);
      } else {
        db.all(`PRAGMA table_info(${tableName})`, (err, columns) => {
          if (err) {
            reject(err);
          } else {
            const exists = columns.some(col => col.name === columnName);
            resolve(exists);
          }
        });
      }
    });
  });
}

// Function to run a single migration
async function runMigration(migration) {
  return new Promise((resolve, reject) => {
    console.log(`Running migration: ${migration.name}`);
    
    // Handle ALTER TABLE statements that might fail if column already exists
    if (migration.skipIfExists && migration.query.includes('ALTER TABLE')) {
      const queries = migration.query.split(';').filter(q => q.trim());
      
      const runQueries = async () => {
        for (const query of queries) {
          if (query.trim()) {
            try {
              await new Promise((res, rej) => {
                db.run(query, (err) => {
                  if (err) {
                    // Ignore "duplicate column" errors
                    if (err.message.includes('duplicate column')) {
                      console.log(`  Column already exists, skipping...`);
                      res();
                    } else {
                      rej(err);
                    }
                  } else {
                    res();
                  }
                });
              });
            } catch (error) {
              console.error(`  Error in query: ${query}`);
              throw error;
            }
          }
        }
      };
      
      runQueries().then(resolve).catch(reject);
    } else {
      // Regular migration
      db.run(migration.query, (err) => {
        if (err) {
          console.error(`  Error: ${err.message}`);
          reject(err);
        } else {
          console.log(`  ✓ Migration completed successfully`);
          resolve();
        }
      });
    }
  });
}

// Main migration function
async function runMigrations() {
  console.log('Starting enhanced transcoding database migrations...');
  
  try {
    // Run migrations sequentially
    for (const migration of migrations) {
      await runMigration(migration);
    }
    
    console.log('All migrations completed successfully!');
    
    // Log action
    const now = new Date().toISOString();
    db.run(
      'INSERT INTO actions (action_type, description, created_at) VALUES (?, ?, ?)',
      ['database_migration', 'Enhanced transcoding database migrations completed', now],
      (err) => {
        if (err) {
          console.error('Error logging migration action:', err.message);
        }
      }
    );
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err.message);
      } else {
        console.log('Database connection closed.');
      }
    });
  }
}

// Run migrations if this script is executed directly
if (require.main === module) {
  runMigrations();
}

module.exports = { runMigrations, migrations };
