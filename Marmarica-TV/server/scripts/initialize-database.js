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
      
      // Add Phase 2A enhanced features
      await this.addPhase2AFeatures();
      
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
        hls_segment_type TEXT NOT NULL DEFAULT 'fmp4',
        hls_flags TEXT NOT NULL DEFAULT 'delete_segments+split_by_time+independent_segments',
        hls_segment_filename TEXT DEFAULT 'output_%d.m4s',
        manifest_filename TEXT DEFAULT 'output.m3u8',
        additional_params TEXT,
        is_default BOOLEAN DEFAULT 0,
        template_id INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (template_id) REFERENCES profile_templates(id)
      )
    `);

    // Add profile_id column to channels table
    await this.addColumn('channels', 'transcoding_profile_id', 'INTEGER REFERENCES transcoding_profiles(id)');

    // Add new HLS/fMP4 schema columns for existing databases
    await this.addColumn('transcoding_profiles', 'hls_segment_type', 'TEXT NOT NULL DEFAULT \'fmp4\'');
    await this.addColumn('transcoding_profiles', 'hls_flags', 'TEXT NOT NULL DEFAULT \'delete_segments+split_by_time+independent_segments\'');
    await this.addColumn('transcoding_profiles', 'hls_segment_filename', 'TEXT DEFAULT \'output_%d.m4s\'');
    await this.addColumn('transcoding_profiles', 'manifest_filename', 'TEXT DEFAULT \'output.m3u8\'');

    // Insert default profiles
    await this.insertDefaultProfiles();

    // Update existing channels with default profile
    await this.updateChannelsWithDefaultProfile();
  }

  async addPhase2AFeatures() {
    log.section('🚀 Phase 2A Enhanced Features');
    
    // Add enhanced columns to channels table
    await this.addColumn('channels', 'offline_reason', 'TEXT');
    await this.addColumn('channels', 'dead_source_count', 'INTEGER DEFAULT 0');
    await this.addColumn('channels', 'last_dead_source_event', 'TEXT');
    await this.addColumn('channels', 'profile_recommendation', 'TEXT');
    await this.addColumn('channels', 'profile_auto_switch', 'BOOLEAN DEFAULT 0');
    await this.addColumn('channels', 'last_profile_change', 'TEXT');
    await this.addColumn('channels', 'stream_health_status', 'TEXT DEFAULT \'unknown\'');
    await this.addColumn('channels', 'last_health_check', 'TEXT');
    await this.addColumn('channels', 'avg_response_time', 'INTEGER DEFAULT 0');
    await this.addColumn('channels', 'uptime_percentage', 'REAL DEFAULT 0');

    // Add enhanced columns to actions table
    await this.addColumn('actions', 'channel_id', 'INTEGER');
    await this.addColumn('actions', 'additional_data', 'TEXT');

    // Add profile_id to transcoding_jobs table
    await this.addColumn('transcoding_jobs', 'profile_id', 'INTEGER');

    // Create dead_source_events table
    await this.createTable('dead_source_events', `
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
      )
    `);

    // Create profile_migrations table
    await this.createTable('profile_migrations', `
      CREATE TABLE IF NOT EXISTS profile_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_profile_id INTEGER,
        to_profile_id INTEGER NOT NULL,
        affected_channels INTEGER NOT NULL,
        successful_channels INTEGER DEFAULT 0,
        failed_channels INTEGER DEFAULT 0,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        error_message TEXT,
        FOREIGN KEY (from_profile_id) REFERENCES transcoding_profiles(id),
        FOREIGN KEY (to_profile_id) REFERENCES transcoding_profiles(id)
      )
    `);

    // Create channel_restart_queue table
    await this.createTable('channel_restart_queue', `
      CREATE TABLE IF NOT EXISTS channel_restart_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id INTEGER NOT NULL,
        profile_id INTEGER NOT NULL,
        priority INTEGER DEFAULT 0,
        scheduled_for TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (channel_id) REFERENCES channels(id),
        FOREIGN KEY (profile_id) REFERENCES transcoding_profiles(id)
      )
    `);

    // Create resource_history table
    await this.createTable('resource_history', `
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
      )
    `);

    // Create resource_alerts table
    await this.createTable('resource_alerts', `
      CREATE TABLE IF NOT EXISTS resource_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        alert_type TEXT NOT NULL,
        message TEXT NOT NULL,
        value REAL NOT NULL,
        threshold REAL NOT NULL,
        created_at TEXT NOT NULL
      )
    `);

    // Create stream_health_history table
    await this.createTable('stream_health_history', `
      CREATE TABLE IF NOT EXISTS stream_health_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        availability_status TEXT NOT NULL,
        response_time INTEGER,
        http_status_code INTEGER,
        error_message TEXT,
        retry_count INTEGER DEFAULT 0,
        detection_method TEXT NOT NULL,
        additional_data TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (channel_id) REFERENCES channels(id)
      )
    `);

    // Create stream_health_alerts table
    await this.createTable('stream_health_alerts', `
      CREATE TABLE IF NOT EXISTS stream_health_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id INTEGER NOT NULL,
        alert_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        message TEXT NOT NULL,
        triggered_at TEXT NOT NULL,
        acknowledged_at TEXT,
        resolved_at TEXT,
        auto_resolved BOOLEAN DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (channel_id) REFERENCES channels(id)
      )
    `);

    // Create profile_templates table
    await this.createTable('profile_templates', `
      CREATE TABLE IF NOT EXISTS profile_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        content_type TEXT NOT NULL,
        recommended_for TEXT,
        video_codec TEXT NOT NULL DEFAULT 'libx264',
        audio_codec TEXT NOT NULL DEFAULT 'aac',
        video_bitrate TEXT DEFAULT '2000k',
        audio_bitrate TEXT DEFAULT '128k',
        resolution TEXT DEFAULT 'original',
        preset TEXT DEFAULT 'ultrafast',
        tune TEXT,
        gop_size INTEGER DEFAULT 25,
        keyint_min INTEGER DEFAULT 25,
        hls_time INTEGER DEFAULT 2,
        hls_list_size INTEGER DEFAULT 3,
        hls_segment_type TEXT DEFAULT 'mpegts',
        hls_flags TEXT DEFAULT 'delete_segments+append_list+omit_endlist',
        hls_segment_filename TEXT DEFAULT 'output_%d.m4s',
        manifest_filename TEXT DEFAULT 'output.m3u8',
        additional_params TEXT,
        is_ll_hls BOOLEAN DEFAULT 0,
        priority INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // Create transcoding_analytics table
    await this.createTable('transcoding_analytics', `
      CREATE TABLE IF NOT EXISTS transcoding_analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id INTEGER NOT NULL,
        profile_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        total_uptime INTEGER DEFAULT 0,
        total_downtime INTEGER DEFAULT 0,
        restart_count INTEGER DEFAULT 0,
        error_count INTEGER DEFAULT 0,
        avg_cpu_usage REAL DEFAULT 0,
        avg_memory_usage REAL DEFAULT 0,
        total_data_processed INTEGER DEFAULT 0,
        quality_score REAL DEFAULT 0,
        viewer_count INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (channel_id) REFERENCES channels(id),
        FOREIGN KEY (profile_id) REFERENCES transcoding_profiles(id)
      )
    `);

    // Create profile_performance_metrics table
    await this.createTable('profile_performance_metrics', `
      CREATE TABLE IF NOT EXISTS profile_performance_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id INTEGER NOT NULL,
        channel_id INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        cpu_usage REAL NOT NULL,
        memory_usage REAL NOT NULL,
        encoding_speed REAL,
        bitrate_efficiency REAL,
        quality_score REAL,
        error_rate REAL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (profile_id) REFERENCES transcoding_profiles(id),
        FOREIGN KEY (channel_id) REFERENCES channels(id)
      )
    `);

    // Insert default profile templates
    await this.insertDefaultProfileTemplates();

    // Create performance indexes
    await this.createPhase2AIndexes();
  }

  async insertDefaultProfileTemplates() {
    const now = new Date().toISOString();
    
    const defaultTemplates = [
      {
        name: 'HD Sports',
        description: 'High motion sports content with low latency',
        content_type: 'sports',
        recommended_for: '["Sports", "Entertainment"]',
        video_bitrate: '4000k',
        audio_bitrate: '192k',
        resolution: '720p',
        preset: 'ultrafast',
        tune: 'zerolatency',
        hls_time: 1,
        is_ll_hls: 1,
        priority: 1
      },
      {
        name: 'HD Movies',
        description: 'High quality movies and entertainment',
        content_type: 'movies',
        recommended_for: '["Movies", "Entertainment"]',
        video_bitrate: '3000k',
        audio_bitrate: '128k',
        resolution: '720p',
        preset: 'fast',
        tune: 'film',
        hls_time: 4,
        is_ll_hls: 0,
        priority: 2
      },
      {
        name: 'SD News',
        description: 'Optimized for talking heads and news content',
        content_type: 'news',
        recommended_for: '["News", "Religious"]',
        video_bitrate: '1000k',
        audio_bitrate: '96k',
        resolution: '480p',
        preset: 'ultrafast',
        tune: 'stillimage',
        hls_time: 6,
        is_ll_hls: 0,
        priority: 3
      },
      {
        name: 'SD General',
        description: 'Standard definition for general content',
        content_type: 'general',
        recommended_for: '["General", "Family", "Kids"]',
        video_bitrate: '1500k',
        audio_bitrate: '128k',
        resolution: '480p',
        preset: 'fast',
        tune: null,
        hls_time: 4,
        is_ll_hls: 0,
        priority: 4
      },
      {
        name: 'Ultra Low Latency',
        description: 'Minimal latency for live events',
        content_type: 'sports',
        recommended_for: '["Sports", "News"]',
        video_bitrate: '2000k',
        audio_bitrate: '128k',
        resolution: '720p',
        preset: 'ultrafast',
        tune: 'zerolatency',
        hls_time: 1,
        is_ll_hls: 1,
        priority: 5
      }
    ];

    for (const template of defaultTemplates) {
      await this.insertProfileTemplate(template, now);
    }
  }

  async insertProfileTemplate(template, timestamp) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT OR IGNORE INTO profile_templates (
          name, description, content_type, recommended_for, video_bitrate, audio_bitrate,
          resolution, preset, tune, hls_time, is_ll_hls, priority, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      this.db.run(sql, [
        template.name, template.description, template.content_type, template.recommended_for,
        template.video_bitrate, template.audio_bitrate, template.resolution, template.preset,
        template.tune, template.hls_time, template.is_ll_hls, template.priority,
        timestamp, timestamp
      ], function(err) {
        if (err) {
          log.error(`Failed to insert profile template ${template.name}: ${err.message}`);
          reject(err);
        } else {
          if (this.changes > 0) {
            log.success(`Inserted profile template: ${template.name}`);
          } else {
            log.warning(`Profile template ${template.name} already exists`);
          }
          resolve();
        }
      });
    });
  }

  async createPhase2AIndexes() {
    log.section('📊 Creating Performance Indexes');
    
    // Channel indexes
    await this.createIndex('idx_channels_transcoding_status', 'channels', 'transcoding_status');
    await this.createIndex('idx_channels_dead_source_event', 'channels', 'last_dead_source_event');
    await this.createIndex('idx_channels_health_status', 'channels', 'stream_health_status');
    await this.createIndex('idx_channels_profile_id', 'channels', 'transcoding_profile_id');
    
    // Transcoding jobs indexes
    await this.createIndex('idx_transcoding_jobs_channel_id', 'transcoding_jobs', 'channel_id');
    await this.createIndex('idx_transcoding_jobs_status', 'transcoding_jobs', 'status');
    await this.createIndex('idx_transcoding_jobs_profile_id', 'transcoding_jobs', 'profile_id');
    
    // Phase 2A feature indexes
    await this.createIndex('idx_dead_source_events_channel_id', 'dead_source_events', 'channel_id');
    await this.createIndex('idx_dead_source_events_created_at', 'dead_source_events', 'created_at');
    await this.createIndex('idx_profile_migrations_status', 'profile_migrations', 'status');
    await this.createIndex('idx_resource_history_timestamp', 'resource_history', 'timestamp');
    await this.createIndex('idx_resource_alerts_created_at', 'resource_alerts', 'created_at');
    await this.createIndex('idx_actions_channel_id', 'actions', 'channel_id');
    await this.createIndex('idx_actions_created_at', 'actions', 'created_at');
    await this.createIndex('idx_actions_type', 'actions', 'action_type');
    await this.createIndex('idx_stream_health_history_channel_id', 'stream_health_history', 'channel_id');
    await this.createIndex('idx_stream_health_history_timestamp', 'stream_health_history', 'timestamp');
    await this.createIndex('idx_stream_health_alerts_channel_id', 'stream_health_alerts', 'channel_id');
    await this.createIndex('idx_stream_health_alerts_triggered_at', 'stream_health_alerts', 'triggered_at');
    await this.createIndex('idx_profile_templates_content_type', 'profile_templates', 'content_type');
    await this.createIndex('idx_transcoding_analytics_channel_id', 'transcoding_analytics', 'channel_id');
    await this.createIndex('idx_transcoding_analytics_date', 'transcoding_analytics', 'date');
    await this.createIndex('idx_profile_performance_metrics_profile_id', 'profile_performance_metrics', 'profile_id');
    await this.createIndex('idx_profile_performance_metrics_timestamp', 'profile_performance_metrics', 'timestamp');
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
        hls_segment_type: 'fmp4',
        hls_flags: 'delete_segments+split_by_time+independent_segments',
        hls_segment_filename: 'output_%d.m4s',
        manifest_filename: 'output.m3u8',
        additional_params: '-hls_delete_threshold 1',
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
        hls_segment_type: 'fmp4',
        hls_flags: 'delete_segments+split_by_time+independent_segments',
        hls_segment_filename: 'output_%d.m4s',
        manifest_filename: 'output.m3u8',
        additional_params: '-hls_delete_threshold 1',
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
        hls_segment_type: 'fmp4',
        hls_flags: 'delete_segments+split_by_time+independent_segments',
        hls_segment_filename: 'output_%d.m4s',
        manifest_filename: 'output.m3u8',
        additional_params: '-hls_delete_threshold 1',
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
          hls_segment_type, hls_flags, hls_segment_filename, manifest_filename,
          additional_params, is_default, template_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      this.db.run(sql, [
        profile.name, profile.description, profile.video_codec, profile.audio_codec,
        profile.video_bitrate, profile.audio_bitrate, profile.resolution, profile.preset,
        profile.tune, profile.gop_size, profile.keyint_min, profile.hls_time,
        profile.hls_list_size, profile.hls_segment_type || 'fmp4', 
        profile.hls_flags || 'delete_segments+split_by_time+independent_segments',
        profile.hls_segment_filename || 'output_%d.m4s',
        profile.manifest_filename || 'output.m3u8',
        profile.additional_params, profile.is_default, profile.template_id || null, timestamp, timestamp
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
      'transcoding_jobs', 'bulk_operations', 'import_logs', 'transcoding_profiles',
      'dead_source_events', 'profile_migrations', 'channel_restart_queue', 'resource_history', 'resource_alerts',
      'stream_health_history', 'stream_health_alerts', 'profile_templates', 'transcoding_analytics', 'profile_performance_metrics'
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
    
    // Verify Phase 2A columns exist
    await this.verifyColumn('transcoding_profiles', 'template_id');
    await this.verifyColumn('channels', 'profile_recommendation');
    await this.verifyColumn('channels', 'stream_health_status');
    
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
