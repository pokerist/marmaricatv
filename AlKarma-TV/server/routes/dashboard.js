const express = require('express');
const router = express.Router();
const { db } = require('../index');

// Get dashboard data
router.get('/', (req, res) => {
  const dashboardData = {};
  
  // Get devices count
  const getDevicesCount = new Promise((resolve, reject) => {
    db.get('SELECT COUNT(*) as total FROM devices', [], (err, row) => {
      if (err) reject(err);
      else {
        dashboardData.deviceCount = row.total;
        
        // Get devices by status
        db.all(
          'SELECT status, COUNT(*) as count FROM devices GROUP BY status',
          [],
          (err, rows) => {
            if (err) reject(err);
            else {
              dashboardData.devicesByStatus = rows.reduce((acc, curr) => {
                acc[curr.status] = curr.count;
                return acc;
              }, {});
              resolve();
            }
          }
        );
      }
    });
  });
  
  // Get channels count
  const getChannelsCount = new Promise((resolve, reject) => {
    db.get('SELECT COUNT(*) as total FROM channels', [], (err, row) => {
      if (err) reject(err);
      else {
        dashboardData.channelCount = row.total;
        
        // Get channels by type
        db.all(
          'SELECT type, COUNT(*) as count FROM channels GROUP BY type',
          [],
          (err, rows) => {
            if (err) reject(err);
            else {
              dashboardData.channelsByType = rows.reduce((acc, curr) => {
                acc[curr.type] = curr.count;
                return acc;
              }, {});
              resolve();
            }
          }
        );
      }
    });
  });
  
  // Get news count
  const getNewsCount = new Promise((resolve, reject) => {
    db.get('SELECT COUNT(*) as total FROM news', [], (err, row) => {
      if (err) reject(err);
      else {
        dashboardData.newsCount = row.total;
        resolve();
      }
    });
  });
  
  // Get devices about to expire within 7 days
  const getExpiringDevices = new Promise((resolve, reject) => {
    const now = new Date();
    const sevenDaysLater = new Date(now);
    sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
    
    // Convert dates to strings for SQL comparison
    const nowStr = now.toISOString().split('T')[0];
    const futureStr = sevenDaysLater.toISOString().split('T')[0];
    
    console.log(`Checking for devices expiring between ${nowStr} and ${futureStr}`);
    
    db.all(
      `SELECT * FROM devices 
       WHERE date(expiry_date) <= date(?) 
       AND date(expiry_date) >= date(?)
       AND status != 'expired'
       ORDER BY expiry_date ASC`,
      [futureStr, nowStr],
      (err, rows) => {
        if (err) reject(err);
        else {
          console.log(`Found ${rows.length} devices about to expire`);
          dashboardData.expiringDevices = rows;
          resolve();
        }
      }
    );
  });
  
  // Get recent actions
  const getRecentActions = new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM actions ORDER BY created_at DESC LIMIT 10',
      [],
      (err, rows) => {
        if (err) reject(err);
        else {
          dashboardData.recentActions = rows;
          resolve();
        }
      }
    );
  });
  
  // Execute all queries and return combined data
  Promise.all([
    getDevicesCount,
    getChannelsCount,
    getNewsCount,
    getExpiringDevices,
    getRecentActions
  ])
    .then(() => {
      res.json({ data: dashboardData });
    })
    .catch(err => {
      res.status(500).json({ error: err.message });
    });
});

// Get recent actions
router.get('/actions', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  
  db.all(
    'SELECT * FROM actions ORDER BY created_at DESC LIMIT ?',
    [limit],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ data: rows });
    }
  );
});

// Get expiring devices
router.get('/expiring-devices', (req, res) => {
  const now = new Date();
  const days = parseInt(req.query.days) || 7;
  const futureDate = new Date(now);
  futureDate.setDate(futureDate.getDate() + days);
  
  // Convert dates to strings for SQL comparison
  const nowStr = now.toISOString().split('T')[0];
  const futureStr = futureDate.toISOString().split('T')[0];
  
  db.all(
    `SELECT * FROM devices 
     WHERE date(expiry_date) <= date(?) 
     AND date(expiry_date) >= date(?)
     AND status != 'expired'
     ORDER BY expiry_date ASC`,
    [futureStr, nowStr],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({ data: rows });
    }
  );
});

// Clear action history
router.delete('/actions', (req, res) => {
  db.run('DELETE FROM actions', [], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    res.json({ 
      message: 'Action history cleared successfully',
      rowsAffected: this.changes 
    });
  });
});

module.exports = router;
