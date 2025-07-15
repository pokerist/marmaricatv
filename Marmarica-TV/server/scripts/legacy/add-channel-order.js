const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, '../database.sqlite'));

// Add order_index column and initialize values
const migration = async () => {
  return new Promise((resolve, reject) => {
    // Start a transaction
    db.serialize(() => {
      try {
        // 1. Check if order_index column exists
        db.get("PRAGMA table_info(channels)", (err, row) => {
          if (err) {
            console.error('Error checking table info:', err);
            reject(err);
            return;
          }

          // 2. Add order_index column if it doesn't exist
          db.run(`
            ALTER TABLE channels 
            ADD COLUMN order_index INTEGER
          `, (err) => {
            if (err && !err.message.includes('duplicate column name')) {
              console.error('Error adding order_index column:', err);
              reject(err);
              return;
            }

            // 3. Get all channels ordered by name
            db.all(`
              SELECT id 
              FROM channels 
              ORDER BY name ASC
            `, [], (err, channels) => {
              if (err) {
                console.error('Error fetching channels:', err);
                reject(err);
                return;
              }

              // 4. Update order_index for each channel
              channels.forEach((channel, index) => {
                db.run(`
                  UPDATE channels 
                  SET order_index = ? 
                  WHERE id = ?
                `, [index + 1, channel.id], (err) => {
                  if (err) {
                    console.error(`Error updating order_index for channel ${channel.id}:`, err);
                    reject(err);
                    return;
                  }
                });
              });

              // 5. Create an index on order_index for better performance
              db.run(`
                CREATE INDEX IF NOT EXISTS idx_channels_order 
                ON channels(order_index)
              `, (err) => {
                if (err) {
                  console.error('Error creating index:', err);
                  reject(err);
                  return;
                }
                console.log('Migration completed successfully');
                resolve();
              });
            });
          });
        });
      } catch (error) {
        console.error('Migration failed:', error);
        reject(error);
      }
    });
  });
};

// Run migration
migration()
  .then(() => {
    console.log('Channel order migration completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Channel order migration failed:', error);
    process.exit(1);
  });
