const { db } = require('../index');

// Database schema updates for smart transcoding features
class SmartTranscodingSchema {
  constructor() {
    this.db = db;
  }

  // Initialize all smart transcoding schema updates
  async initializeSmartTranscodingSchema() {
    console.log('Initializing smart transcoding schema...');
    
    try {
      // Add new columns to existing channels table
      await this.addChannelColumns();
      
      // Create stream analysis cache table
      await this.createStreamAnalysisCacheTable();
      
      // Create fallback tracking table
      await this.createFallbackTrackingTable();
      
      // Create smart transcoding jobs table
      await this.createSmartTranscodingJobsTable();
      
      // Update existing profiles to use mpegts by default
      await this.updateDefaultSegmentTypes();
      
      console.log('Smart transcoding schema initialized successfully');
      
    } catch (error) {
      console.error('Error initializing smart transcoding schema:', error);
      throw error;
    }
  }

  // Add new columns to channels table
  async addChannelColumns() {
    console.log('Adding smart transcoding columns to channels table...');
    
    const newColumns = [
      {
        name: 'stream_analysis_cache',
        type: 'TEXT',
        description: 'Cached stream analysis data'
      },
      {
        name: 'last_working_profile_id',
        type: 'INTEGER',
        description: 'ID of last successfully working profile'
      },
      {
        name: 'stream_stability_score',
        type: 'REAL DEFAULT 0.5',
        description: 'Stream stability score (0-1)'
      },
      {
        name: 'smart_transcoding_enabled',
        type: 'BOOLEAN DEFAULT 1',
        description: 'Enable smart transcoding analysis'
      },
      {
        name: 'fallback_level',
        type: 'INTEGER DEFAULT 0',
        description: 'Current fallback level'
      },
      {
        name: 'last_analysis_timestamp',
        type: 'DATETIME',
        description: 'When stream was last analyzed'
      }
    ];

    for (const column of newColumns) {
      try {
        await this.addColumn('channels', column.name, column.type);
        console.log(`Added column: channels.${column.name}`);
      } catch (error) {
        if (error.message.includes('duplicate column name')) {
          console.log(`Column channels.${column.name} already exists`);
        } else {
          throw error;
        }
      }
    }
  }

  // Create stream analysis cache table
  async createStreamAnalysisCacheTable() {
    console.log('Creating stream_analysis_cache table...');
    
    const sql = `
      CREATE TABLE IF NOT EXISTS stream_analysis_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id INTEGER NOT NULL,
        input_url TEXT NOT NULL,
        analysis_data TEXT NOT NULL,
        last_analyzed DATETIME NOT NULL,
        is_valid BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
        UNIQUE(channel_id, input_url)
      )
    `;

    await this.executeSQL(sql);
    
    // Create index for performance
    await this.executeSQL(`
      CREATE INDEX IF NOT EXISTS idx_stream_analysis_cache_channel 
      ON stream_analysis_cache(channel_id, last_analyzed)
    `);
    
    console.log('stream_analysis_cache table created successfully');
  }

  // Create fallback tracking table
  async createFallbackTrackingTable() {
    console.log('Creating fallback_tracking table...');
    
    const sql = `
      CREATE TABLE IF NOT EXISTS fallback_tracking (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id INTEGER NOT NULL,
        fallback_level INTEGER NOT NULL,
        original_profile_id INTEGER,
        fallback_profile_data TEXT,
        error_message TEXT,
        attempt_timestamp DATETIME NOT NULL,
        success BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
        FOREIGN KEY (original_profile_id) REFERENCES transcoding_profiles(id) ON DELETE SET NULL
      )
    `;

    await this.executeSQL(sql);
    
    // Create index for performance
    await this.executeSQL(`
      CREATE INDEX IF NOT EXISTS idx_fallback_tracking_channel 
      ON fallback_tracking(channel_id, attempt_timestamp)
    `);
    
    console.log('fallback_tracking table created successfully');
  }

  // Create smart transcoding jobs table (extends existing transcoding_jobs)
  async createSmartTranscodingJobsTable() {
    console.log('Adding smart transcoding columns to transcoding_jobs table...');
    
    const newColumns = [
      {
        name: 'is_smart_job',
        type: 'BOOLEAN DEFAULT 0',
        description: 'Whether this job used smart transcoding'
      },
      {
        name: 'analysis_data',
        type: 'TEXT',
        description: 'Stream analysis data used for this job'
      },
      {
        name: 'dynamic_profile_data',
        type: 'TEXT',
        description: 'Dynamic profile data if generated'
      },
      {
        name: 'fallback_level',
        type: 'INTEGER DEFAULT 0',
        description: 'Fallback level used for this job'
      },
      {
        name: 'confidence_score',
        type: 'REAL',
        description: 'Confidence score of the profile used'
      }
    ];

    for (const column of newColumns) {
      try {
        await this.addColumn('transcoding_jobs', column.name, column.type);
        console.log(`Added column: transcoding_jobs.${column.name}`);
      } catch (error) {
        if (error.message.includes('duplicate column name')) {
          console.log(`Column transcoding_jobs.${column.name} already exists`);
        } else {
          throw error;
        }
      }
    }
  }

  // Update default segment types to use mpegts
  async updateDefaultSegmentTypes() {
    console.log('Updating default segment types to mpegts...');
    
    // Update existing profiles that use fmp4 to use mpegts
    await this.executeSQL(`
      UPDATE transcoding_profiles 
      SET hls_segment_type = 'mpegts',
          hls_segment_filename = REPLACE(hls_segment_filename, '.m4s', '.ts')
      WHERE hls_segment_type = 'fmp4'
    `);
    
    // Update default profile templates
    await this.executeSQL(`
      UPDATE transcoding_profiles 
      SET hls_segment_type = 'mpegts',
          hls_segment_filename = 'output_%d.ts'
      WHERE hls_segment_type IS NULL OR hls_segment_type = ''
    `);
    
    console.log('Default segment types updated successfully');
  }

  // Helper method to add column with error handling
  async addColumn(tableName, columnName, columnType) {
    return new Promise((resolve, reject) => {
      const sql = `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`;
      
      this.db.run(sql, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  // Helper method to execute SQL
  async executeSQL(sql) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  // Create smart transcoding configuration table
  async createSmartTranscodingConfigTable() {
    console.log('Creating smart_transcoding_config table...');
    
    const sql = `
      CREATE TABLE IF NOT EXISTS smart_transcoding_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        config_key TEXT UNIQUE NOT NULL,
        config_value TEXT NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    await this.executeSQL(sql);
    
    // Insert default configuration
    const defaultConfigs = [
      {
        key: 'smart_mode_enabled',
        value: 'true',
        description: 'Enable smart transcoding analysis'
      },
      {
        key: 'analysis_cache_duration',
        value: '3600000',
        description: 'Analysis cache duration in milliseconds (1 hour)'
      },
      {
        key: 'max_fallback_level',
        value: '3',
        description: 'Maximum fallback level before marking as permanent failure'
      },
      {
        key: 'fallback_delay_l1',
        value: '2000',
        description: 'Delay before first fallback attempt (ms)'
      },
      {
        key: 'fallback_delay_l2',
        value: '5000',
        description: 'Delay before second fallback attempt (ms)'
      },
      {
        key: 'fallback_delay_l3',
        value: '10000',
        description: 'Delay before third fallback attempt (ms)'
      },
      {
        key: 'default_segment_type',
        value: 'mpegts',
        description: 'Default HLS segment type for new profiles'
      }
    ];

    for (const config of defaultConfigs) {
      await this.executeSQL(`
        INSERT OR IGNORE INTO smart_transcoding_config (config_key, config_value, description)
        VALUES (?, ?, ?)
      `, [config.key, config.value, config.description]);
    }
    
    console.log('smart_transcoding_config table created successfully');
  }

  // Clean up old analysis cache entries
  async cleanupOldAnalysisCache(maxAge = 24 * 60 * 60 * 1000) { // 24 hours
    console.log('Cleaning up old analysis cache entries...');
    
    const cutoffTime = new Date(Date.now() - maxAge).toISOString();
    
    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM stream_analysis_cache WHERE last_analyzed < ?',
        [cutoffTime],
        function(err) {
          if (err) {
            reject(err);
          } else {
            console.log(`Cleaned up ${this.changes} old analysis cache entries`);
            resolve(this.changes);
          }
        }
      );
    });
  }

  // Get smart transcoding statistics
  async getSmartTranscodingStats() {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          COUNT(*) as total_jobs,
          COUNT(CASE WHEN is_smart_job = 1 THEN 1 END) as smart_jobs,
          COUNT(CASE WHEN fallback_level > 0 THEN 1 END) as fallback_jobs,
          AVG(confidence_score) as avg_confidence,
          COUNT(CASE WHEN status = 'completed' AND is_smart_job = 1 THEN 1 END) as smart_successes,
          COUNT(CASE WHEN status = 'failed' AND is_smart_job = 1 THEN 1 END) as smart_failures
        FROM transcoding_jobs
        WHERE created_at > datetime('now', '-7 days')
      `;

      this.db.get(sql, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  // Migrate existing transcoding jobs to smart format
  async migrateExistingJobs() {
    console.log('Migrating existing transcoding jobs...');
    
    // Mark all existing jobs as non-smart
    await this.executeSQL(`
      UPDATE transcoding_jobs 
      SET is_smart_job = 0, fallback_level = 0 
      WHERE is_smart_job IS NULL
    `);
    
    console.log('Existing transcoding jobs migrated successfully');
  }

  // Create indexes for performance
  async createPerformanceIndexes() {
    console.log('Creating performance indexes...');
    
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_channels_smart_enabled ON channels(smart_transcoding_enabled)',
      'CREATE INDEX IF NOT EXISTS idx_channels_stability_score ON channels(stream_stability_score)',
      'CREATE INDEX IF NOT EXISTS idx_transcoding_jobs_smart ON transcoding_jobs(is_smart_job, created_at)',
      'CREATE INDEX IF NOT EXISTS idx_transcoding_jobs_fallback ON transcoding_jobs(fallback_level, status)',
      'CREATE INDEX IF NOT EXISTS idx_fallback_tracking_success ON fallback_tracking(success, attempt_timestamp)'
    ];

    for (const indexSQL of indexes) {
      await this.executeSQL(indexSQL);
    }
    
    console.log('Performance indexes created successfully');
  }

  // Validate schema integrity
  async validateSchema() {
    console.log('Validating smart transcoding schema...');
    
    const requiredTables = [
      'stream_analysis_cache',
      'fallback_tracking',
      'smart_transcoding_config'
    ];

    for (const table of requiredTables) {
      const exists = await this.tableExists(table);
      if (!exists) {
        throw new Error(`Required table ${table} does not exist`);
      }
    }
    
    console.log('Schema validation completed successfully');
  }

  // Check if table exists
  async tableExists(tableName) {
    return new Promise((resolve, reject) => {
      this.db.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        [tableName],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(!!row);
          }
        }
      );
    });
  }

  // Run all schema updates
  async runAllUpdates() {
    console.log('Running all smart transcoding schema updates...');
    
    await this.initializeSmartTranscodingSchema();
    await this.createSmartTranscodingConfigTable();
    await this.migrateExistingJobs();
    await this.createPerformanceIndexes();
    await this.validateSchema();
    
    console.log('All smart transcoding schema updates completed successfully');
  }
}

// Export for use in initialization
module.exports = SmartTranscodingSchema;

// Run if called directly
if (require.main === module) {
  const schemaManager = new SmartTranscodingSchema();
  schemaManager.runAllUpdates()
    .then(() => {
      console.log('Smart transcoding schema setup completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Smart transcoding schema setup failed:', error);
      process.exit(1);
    });
}
