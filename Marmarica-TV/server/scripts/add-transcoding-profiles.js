const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../database.sqlite');

// ANSI color codes for better output
const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

const log = {
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}❌${colors.reset} ${msg}`),
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`)
};

const db = new sqlite3.Database(dbPath);

// Create transcoding profiles table
const createTranscodingProfilesTable = () => {
  return new Promise((resolve, reject) => {
    const sql = `
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
    `;
    
    db.run(sql, (err) => {
      if (err) {
        log.error(`Failed to create transcoding_profiles table: ${err.message}`);
        reject(err);
      } else {
        log.success('Created transcoding_profiles table');
        resolve();
      }
    });
  });
};

// Insert default profiles
const insertDefaultProfiles = () => {
  return new Promise((resolve, reject) => {
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
        hls_list_size: 3,
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
        hls_list_size: 3,
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
        is_default: 0
      }
    ];
    
    let completed = 0;
    const total = defaultProfiles.length;
    
    defaultProfiles.forEach(profile => {
      const sql = `
        INSERT OR IGNORE INTO transcoding_profiles (
          name, description, video_codec, audio_codec, video_bitrate, audio_bitrate,
          resolution, preset, tune, gop_size, keyint_min, hls_time, hls_list_size,
          is_default, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      db.run(sql, [
        profile.name, profile.description, profile.video_codec, profile.audio_codec,
        profile.video_bitrate, profile.audio_bitrate, profile.resolution, profile.preset,
        profile.tune, profile.gop_size, profile.keyint_min, profile.hls_time,
        profile.hls_list_size, profile.is_default, now, now
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
          completed++;
          
          if (completed === total) {
            resolve();
          }
        }
      });
    });
  });
};

// Add profile_id column to channels table
const addProfileIdToChannels = () => {
  return new Promise((resolve, reject) => {
    const sql = 'ALTER TABLE channels ADD COLUMN transcoding_profile_id INTEGER REFERENCES transcoding_profiles(id)';
    
    db.run(sql, (err) => {
      if (err) {
        if (err.message.includes('duplicate column name')) {
          log.warning('Column transcoding_profile_id already exists in channels table');
          resolve();
        } else {
          log.error(`Failed to add transcoding_profile_id column: ${err.message}`);
          reject(err);
        }
      } else {
        log.success('Added transcoding_profile_id column to channels table');
        resolve();
      }
    });
  });
};

// Update existing channels to use default profile
const updateChannelsWithDefaultProfile = () => {
  return new Promise((resolve, reject) => {
    // First get the default profile ID
    db.get('SELECT id FROM transcoding_profiles WHERE is_default = 1', (err, row) => {
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
      
      db.run(sql, [defaultProfileId], function(err) {
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
};

// Main execution
const main = async () => {
  try {
    log.info('Adding transcoding profiles support...');
    
    await createTranscodingProfilesTable();
    await insertDefaultProfiles();
    await addProfileIdToChannels();
    await updateChannelsWithDefaultProfile();
    
    log.success('Transcoding profiles support added successfully!');
    
  } catch (error) {
    log.error(`Fatal error: ${error.message}`);
    process.exit(1);
  } finally {
    db.close((err) => {
      if (err) {
        log.error(`Error closing database: ${err.message}`);
      } else {
        log.info('Database connection closed');
      }
    });
  }
};

main();
