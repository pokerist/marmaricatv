const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '../database.sqlite');

// ANSI color codes for better output
const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

// Logging helpers
const log = {
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}❌${colors.reset} ${msg}`),
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  section: (msg) => console.log(`\n${colors.cyan}${colors.bold}${msg}${colors.reset}`),
  header: (msg) => console.log(`\n${colors.bold}🚀 ${msg}${colors.reset}`)
};

class DatabaseInitializer {
  constructor() {
    this.db = null;
    this.errors = [];
    this.warnings = [];
    this.successes = [];
  }

  async initialize() {
    try {
      log.header('Starting Marmarica TV Database Initialization...');
      
      // Connect to database
      await this.connectToDatabase();
      
      // Initialize base tables
      await this.initializeBaseTables();
      
      // Apply transcoding support
      await this.addTranscodingSupport();
      
      // Add channel ordering
      await this.addChannelOrdering();
      
      // Add transcoding state tracking
      await this.addTranscodingStateTracking();
      
      // Add bulk operations support
      await this.addBulkOperationsSupport();
      
      // Add transcoding profiles support
      await this.addTranscodingProfiles();
      
      // Create directories
      await this.createDirectories();
      
      // Verify database integrity
      await this.verifyDatabase();
      
      // Show summary
      this.showSummary();
      
    } catch (error) {
      log.error(`Fatal error during initialization: ${error.message}`);
      process.exit(1);
    } finally {
      if (this.db) {
        await this.closeDatabase();
      }
    }
  }

  async connectToDatabase() {
    log.section('📊 Database Connection');
    
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          log.error(`Failed to connect to database: ${err.message}`);
          reject(err);
        } else {
          log.success('Connected to SQLite database');
          resolve();
        }
      });
    });
  }

  async initializeBaseTables() {
    log.section('📋 Base Tables');
    
    // Create devices table
    await this.createTable('devices', `
      CREATE TABLE IF NOT EXISTS devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        duid TEXT UNIQUE NOT NULL,
        activation_code TEXT NOT NULL,
        owner_name TEXT NOT NULL,
        allowed_types TEXT NOT NULL DEFAULT 'FTA,Local',
        expiry_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'disabled',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // Create channels table
    await this.createTable('channels', `
      CREATE TABLE IF NOT EXISTS channels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        logo_url TEXT,
        type TEXT NOT NULL,
        category TEXT NOT NULL,
        has_news BOOLEAN NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // Create news table
    await this.createTable('news', `
      CREATE TABLE IF NOT EXISTS news (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // Create actions table
    await this.createTable('actions', `
      CREATE TABLE IF NOT EXISTS actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action_type TEXT NOT NULL,
        description TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);

    // Create admins table
    await this.createTable('admins', `
      CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
  }

  async addTranscodingSupport() {
    log.section('🔧 Transcoding Support');
    
    // Add transcoding columns to channels table
    await this.addColumn('channels', 'transcoding_enabled', 'BOOLEAN NOT NULL DEFAULT 0');
    await this.addColumn('channels', 'transcoded_url', 'TEXT');
    await this.addColumn('channels', 'transcoding_status', 'TEXT NOT NULL DEFAULT \'inactive\'');

    // Create transcoding_jobs table
    await this.createTable('transcoding_jobs', `
      CREATE TABLE IF NOT EXISTS transcoding_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id INTEGER NOT NULL,
        ffmpeg_pid INTEGER,
        output_path TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'starting',
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (channel_id) REFERENCES channels (id) ON DELETE CASCADE
      )
    `);
  }

  async addChannelOrdering() {
    log.section('📊 Channel Ordering');
    
    // Add order_index column
    await this.addColumn('channels', 'order_index', 'INTEGER');

    // Update existing channels with order_index values
    await this.executeQuery(
      'UPDATE channels SET order_index = id WHERE order_index IS NULL',
      [],
      'Updated order_index for existing channels'
    );

    // Create index for better performance
    await this.createIndex('idx_channels_order', 'channels', 'order_index');
  }

  async addTranscodingStateTracking() {
    log.section('🔄 State Tracking');
    
    // Add last_transcoding_state column
    await this.addColumn('channels', 'last_transcoding_state', 'TEXT DEFAULT \'idle\'');

    // Update existing channels with proper last_transcoding_state
    await this.executeQuery(`
      UPDATE channels SET last_transcoding_state = 
        CASE 
          WHEN transcoding_enabled = 1 AND transcoding_status = 'active' THEN 'active'
          WHEN transcoding_enabled = 1 AND transcoding_status IN ('starting', 'running') THEN 'active'
          WHEN transcoding_enabled = 1 AND transcoding_status = 'failed' THEN 'failed'
          ELSE 'idle'
        END
        WHERE last_transcoding_state = 'idle'
    `, [], 'Updated last_transcoding_state for existing channels');
  }

  async addBulkOperationsSupport() {
    log.section('📦 Bulk Operations Support');
    
    // Create bulk_operations table
    await this.createTable('bulk_operations', `
      CREATE TABLE IF NOT EXISTS bulk_operations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        operation_type TEXT NOT NULL,
        total_items INTEGER NOT NULL,
        completed_items INTEGER DEFAULT 0,
        failed_items INTEGER DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'running',
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // Create import_logs table
    await this.createTable('import_logs', `
      CREATE TABLE IF NOT EXISTS import_logs (
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
      )
    `);

    // Create performance indexes
    await this.createIndex('idx_bulk_operations_status', 'bulk_operations', 'status');
    await this.createIndex('idx_import_logs_bulk_operation', 'import_logs', 'bulk_operation_id');
    await this.createIndex('idx_import_logs_status', 'import_logs', 'status');
  }

  async addTranscodingProfiles() {
    log.section('🎛️ Transcoding Profiles');
    
    // Create transcoding_profiles table
    await this.createTable('transcoding_profiles', `
      CREATE TABLE IF NOT EXISTS transcoding_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        video_codec TEXT NOT NULL DEFAULT 'libx264',
        audio_codec TEXT NOT NULL DEFAULT 'aac',
        video_bitrate TEXT DEFAULT '2000k',
        audio_bitrate TEXT DEFAULT '128k',
        resolution TEXT DEFAULT 'original',
        preset TEXT NOT NULL DEFAULT 'veryfast',
        tune TEXT DEFAULT 'zerolatency',
        gop_size INTEGER DEFAULT 50,
        keyint_min INTEGER DEFAULT 50,
        hls_time INTEGER DEFAULT 4,
        hls_list_size INTEGER DEFAULT 3,
        additional_params TEXT,
        is_default BOOLEAN DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // Add profile_id column to channels table
    await this.addColumn('channels', 'transcoding_profile_id', 'INTEGER REFERENCES transcoding_profiles(id)');

    // Insert default profiles
    await this.insertDefaultProfiles();

    // Update existing channels with default profile
    await this.updateChannelsWithDefaultProfile();
  }

  async insertDefaultProfiles() {
    const now = new Date().toISOString();
    
    const defaultProfiles = [
      {
        name: 'Fast (Low Quality)',
        description: 'Fast transcoding with lower quality, suitable for testing',
        video_codec: 'libx264',
        audio_codec: 'aac',
        video_bitrate: '800k',
        audio_bitrate: '96k',
        resolution: '720p',
        preset: 'ultrafast',
        tune: 'zerolatency',
        gop_size: 30,
        keyint_min: 30,
        hls_time: 6,
        hls_list_size: 4,
        additional_params: '-hls_flags delete_segments+program_date_time+independent_segments+split_by_time -hls_delete_threshold 1',
        is_default: 1
      },
      {
        name: 'Balanced',
        description: 'Balanced quality and speed, recommended for most use cases',
        video_codec: 'libx264',
        audio_codec: 'aac',
        video_bitrate: '2000k',
        audio_bitrate: '128k',
        resolution: '1080p',
        preset: 'veryfast',
        tune: 'zerolatency',
        gop_size: 50,
        keyint_min: 50,
        hls_time: 4,
        hls_list_size: 4,
        additional_params: '-hls_flags delete_segments+program_date_time+independent_segments+split_by_time -hls_delete_threshold 1',
        is_default: 0
      },
      {
        name: 'High Quality',
        description: 'High quality transcoding with slower processing',
        video_codec: 'libx264',
        audio_codec: 'aac',
        video_bitrate: '4000k',
        audio_bitrate: '192k',
        resolution: '1080p',
        preset: 'fast',
        tune: 'film',
        gop_size: 60,
        keyint_min: 60,
        hls_time: 4,
        hls_list_size: 4,
        additional_params: '-hls_flags delete_segments+program_date_time+independent_segments+split_by_time -hls_delete_threshold 1',
        is_default: 0
      }
    ];

    for (const profile of defaultProfiles) {
      await this.insertProfile(profile, now);
    }
  }

  async insertProfile(profile, timestamp) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT OR IGNORE INTO transcoding_profiles (
          name, description, video_codec, audio_codec, video_bitrate, audio_bitrate,
          resolution, preset, tune, gop_size, keyint_min, hls_time, hls_list_size,
          additional_params, is_default, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      this.db.run(sql, [
        profile.name, profile.description, profile.video_codec, profile.audio_codec,
        profile.video_bitrate, profile.audio_bitrate, profile.resolution, profile.preset,
        profile.tune, profile.gop_size, profile.keyint_min, profile.hls_time,
        profile.hls_list_size, profile.additional_params, profile.is_default, timestamp, timestamp
      ], function(err) {
        if (err) {
          log.error(`Failed to insert profile ${profile.name}: ${err.message}`);
          reject(err);
        } else {
          if (this.changes > 0) {
            log.success(`Inserted default profile: ${profile.name}`);
          } else {
            log.warning(`Profile ${profile.name} already exists`);
          }
          resolve();
        }
      });
    });
  }

  async updateChannelsWithDefaultProfile() {
    return new Promise((resolve, reject) => {
      // First get the default profile ID
      this.db.get('SELECT id FROM transcoding_profiles WHERE is_default = 1', (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        
        if (!row) {
          log.warning('No default profile found, skipping channel updates');
          resolve();
          return;
        }
        
        const defaultProfileId = row.id;
        
        // Update channels that don't have a profile assigned
        const sql = `
          UPDATE channels 
          SET transcoding_profile_id = ? 
          WHERE transcoding_enabled = 1 AND transcoding_profile_id IS NULL
        `;
        
        this.db.run(sql, [defaultProfileId], function(err) {
          if (err) {
            log.error(`Failed to update channels with default profile: ${err.message}`);
            reject(err);
          } else {
            if (this.changes > 0) {
              log.success(`Updated ${this.changes} channels with default profile`);
            } else {
              log.info('No channels needed profile assignment');
            }
            resolve();
          }
        });
      });
    });
  }

  async createDirectories() {
    log.section('📁 Directory Setup');
    
    // Create uploads directory
    const uploadsDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
      log.success('Created uploads directory');
    } else {
      log.warning('Uploads directory already exists');
    }

    // Check HLS stream directory
    const hlsDir = process.env.HLS_OUTPUT_BASE || '/var/www/html/hls_stream';
    if (!fs.existsSync(hlsDir)) {
      log.warning(`HLS stream directory does not exist: ${hlsDir}`);
      log.info('You may need to create it manually with proper permissions');
    } else {
      log.success('HLS stream directory exists');
    }
  }

  async verifyDatabase() {
    log.section('✅ Database Verification');
    
    // Check database integrity
    await this.executeQuery('PRAGMA integrity_check', [], 'Database integrity check passed');
    
    // Verify all required tables exist
    const requiredTables = [
      'devices', 'channels', 'news', 'actions', 'admins',
      'transcoding_jobs', 'bulk_operations', 'import_logs', 'transcoding_profiles'
    ];
    
    for (const table of requiredTables) {
      await this.verifyTable(table);
    }
    
    // Verify key columns exist
    await this.verifyColumn('channels', 'transcoding_enabled');
    await this.verifyColumn('channels', 'transcoded_url');
    await this.verifyColumn('channels', 'transcoding_status');
    await this.verifyColumn('channels', 'order_index');
    await this.verifyColumn('channels', 'last_transcoding_state');
    await this.verifyColumn('channels', 'transcoding_profile_id');
    
    log.success('Database schema verification completed');
  }

  // Helper methods
  async createTable(tableName, sql) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, (err) => {
        if (err) {
          if (err.message.includes('already exists')) {
            log.warning(`Table ${tableName} already exists`);
            this.warnings.push(`Table ${tableName} already exists`);
          } else {
            log.error(`Failed to create table ${tableName}: ${err.message}`);
            this.errors.push(`Failed to create table ${tableName}: ${err.message}`);
            reject(err);
            return;
          }
        } else {
          log.success(`Created table ${tableName}`);
          this.successes.push(`Created table ${tableName}`);
        }
        resolve();
      });
    });
  }

  async addColumn(tableName, columnName, columnDef) {
    return new Promise((resolve, reject) => {
      this.db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`, (err) => {
        if (err) {
          if (err.message.includes('duplicate column name')) {
            log.warning(`Column ${columnName} already exists in ${tableName}`);
            this.warnings.push(`Column ${columnName} already exists in ${tableName}`);
          } else {
            log.error(`Failed to add column ${columnName} to ${tableName}: ${err.message}`);
            this.errors.push(`Failed to add column ${columnName}: ${err.message}`);
            reject(err);
            return;
          }
        } else {
          log.success(`Added column ${columnName} to ${tableName}`);
          this.successes.push(`Added column ${columnName} to ${tableName}`);
        }
        resolve();
      });
    });
  }

  async createIndex(indexName, tableName, columnName) {
    return new Promise((resolve, reject) => {
      this.db.run(`CREATE INDEX IF NOT EXISTS ${indexName} ON ${tableName}(${columnName})`, (err) => {
        if (err) {
          log.error(`Failed to create index ${indexName}: ${err.message}`);
          this.errors.push(`Failed to create index ${indexName}: ${err.message}`);
          reject(err);
        } else {
          log.success(`Created index ${indexName}`);
          this.successes.push(`Created index ${indexName}`);
          resolve();
        }
      });
    });
  }

  async executeQuery(sql, params, successMsg) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, (err) => {
        if (err) {
          log.error(`Query failed: ${err.message}`);
          this.errors.push(`Query failed: ${err.message}`);
          reject(err);
        } else {
          if (successMsg) {
            log.success(successMsg);
            this.successes.push(successMsg);
          }
          resolve();
        }
      });
    });
  }

  async verifyTable(tableName) {
    return new Promise((resolve, reject) => {
      this.db.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        [tableName],
        (err, row) => {
          if (err) {
            log.error(`Error verifying table ${tableName}: ${err.message}`);
            reject(err);
          } else if (row) {
            log.success(`Table ${tableName} exists`);
            resolve();
          } else {
            log.error(`Table ${tableName} does not exist`);
            reject(new Error(`Table ${tableName} does not exist`));
          }
        }
      );
    });
  }

  async verifyColumn(tableName, columnName) {
    return new Promise((resolve, reject) => {
      this.db.all(`PRAGMA table_info(${tableName})`, (err, rows) => {
        if (err) {
          log.error(`Error checking columns for ${tableName}: ${err.message}`);
          reject(err);
        } else {
          const columnExists = rows.some(row => row.name === columnName);
          if (columnExists) {
            log.success(`Column ${tableName}.${columnName} exists`);
            resolve();
          } else {
            log.error(`Column ${tableName}.${columnName} does not exist`);
            reject(new Error(`Column ${tableName}.${columnName} does not exist`));
          }
        }
      });
    });
  }

  async closeDatabase() {
    return new Promise((resolve) => {
      this.db.close((err) => {
        if (err) {
          log.error(`Error closing database: ${err.message}`);
        } else {
          log.info('Database connection closed');
        }
        resolve();
      });
    });
  }

  showSummary() {
    log.section('📊 Summary');
    
    console.log(`${colors.green}✓ Successful operations: ${this.successes.length}${colors.reset}`);
    console.log(`${colors.yellow}⚠ Warnings: ${this.warnings.length}${colors.reset}`);
    console.log(`${colors.red}❌ Errors: ${this.errors.length}${colors.reset}`);
    
    if (this.errors.length > 0) {
      console.log(`\n${colors.red}${colors.bold}Errors encountered:${colors.reset}`);
      this.errors.forEach(error => console.log(`  ${colors.red}• ${error}${colors.reset}`));
      console.log(`\n${colors.red}${colors.bold}❌ Database initialization failed!${colors.reset}`);
      process.exit(1);
    } else {
      console.log(`\n${colors.green}${colors.bold}🎉 Database initialization completed successfully!${colors.reset}`);
      console.log(`${colors.cyan}   Ready to start the application.${colors.reset}`);
      console.log(`\n${colors.blue}Next steps:${colors.reset}`);
      console.log(`  1. Create admin user: ${colors.cyan}node scripts/manage-admin.js create admin${colors.reset}`);
      console.log(`  2. Start the server: ${colors.cyan}node index.js${colors.reset}`);
      console.log(`  3. Or use PM2: ${colors.cyan}pm2 start ecosystem.config.js${colors.reset}`);
    }
  }
}

// Run the initialization
const initializer = new DatabaseInitializer();
initializer.initialize().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
