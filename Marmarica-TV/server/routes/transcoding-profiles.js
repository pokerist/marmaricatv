const express = require('express');
const router = express.Router();
const { db } = require('../index');

// Helper function to log actions
const logAction = (actionType, description) => {
  const now = new Date().toISOString();
  db.run(
    'INSERT INTO actions (action_type, description, created_at) VALUES (?, ?, ?)',
    [actionType, description, now],
    (err) => {
      if (err) {
        console.error('Error logging action:', err.message);
      }
    }
  );
};

// Helper function for async route handling
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(err => {
      console.error('Route error:', err);
      res.status(500).json({ error: err.message || 'Internal server error' });
    });
  };
}

// Get all transcoding profiles
router.get('/', asyncHandler(async (req, res) => {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM transcoding_profiles ORDER BY is_default DESC, name ASC',
      (err, rows) => {
        if (err) {
          console.error('Error fetching transcoding profiles:', err.message);
          reject(err);
        } else {
          res.json({ data: rows });
          resolve();
        }
      }
    );
  });
}));

// Get single transcoding profile by ID
router.get('/:id', asyncHandler(async (req, res) => {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM transcoding_profiles WHERE id = ?',
      [req.params.id],
      (err, row) => {
        if (err) {
          console.error('Error fetching transcoding profile:', err.message);
          reject(err);
        } else if (!row) {
          res.status(404).json({ error: 'Transcoding profile not found' });
          resolve();
        } else {
          res.json({ data: row });
          resolve();
        }
      }
    );
  });
}));

// Create new transcoding profile
router.post('/', asyncHandler(async (req, res) => {
  const {
    name,
    description,
    video_codec,
    audio_codec,
    video_bitrate,
    audio_bitrate,
    resolution,
    preset,
    tune,
    gop_size,
    keyint_min,
    hls_time,
    hls_list_size,
    hls_segment_type,
    hls_flags,
    hls_segment_filename,
    manifest_filename,
    additional_params,
    is_default
  } = req.body;

  // Validation
  if (!name || !video_codec || !audio_codec || !preset) {
    res.status(400).json({ 
      error: 'Missing required fields: name, video_codec, audio_codec, and preset are required' 
    });
    return;
  }

  const now = new Date().toISOString();

  return new Promise((resolve, reject) => {
    // If this is being set as default, unset other defaults first
    if (is_default) {
      db.run(
        'UPDATE transcoding_profiles SET is_default = 0, updated_at = ?',
        [now],
        (err) => {
          if (err) {
            console.error('Error updating default profiles:', err.message);
            reject(err);
            return;
          }
          createProfile();
        }
      );
    } else {
      createProfile();
    }

    function createProfile() {
      db.run(
        `INSERT INTO transcoding_profiles (
          name, description, video_codec, audio_codec, video_bitrate, audio_bitrate,
          resolution, preset, tune, gop_size, keyint_min, hls_time, hls_list_size,
          hls_segment_type, hls_flags, hls_segment_filename, manifest_filename,
          additional_params, is_default, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          name,
          description || null,
          video_codec,
          audio_codec,
          video_bitrate || '2000k',
          audio_bitrate || '128k',
          resolution || 'original',
          preset,
          tune || null,
          gop_size || 50,
          keyint_min || 50,
          hls_time || 4,
          hls_list_size || 3,
          hls_segment_type || 'fmp4',
          hls_flags || 'delete_segments+split_by_time+independent_segments',
          hls_segment_filename || 'output_%d.m4s',
          manifest_filename || 'output.m3u8',
          additional_params || null,
          is_default ? 1 : 0,
          now,
          now
        ],
        function(err) {
          if (err) {
            console.error('Error creating transcoding profile:', err.message);
            if (err.message.includes('UNIQUE constraint failed')) {
              res.status(400).json({ error: 'Profile name already exists' });
            } else {
              reject(err);
            }
            return;
          }

          const profileId = this.lastID;
          logAction('profile_created', `Created transcoding profile: ${name}`);

          // Return created profile
          db.get(
            'SELECT * FROM transcoding_profiles WHERE id = ?',
            [profileId],
            (err, row) => {
              if (err) {
                console.error('Error retrieving created profile:', err.message);
                reject(err);
              } else {
                res.status(201).json({
                  message: 'Transcoding profile created successfully',
                  data: row
                });
                resolve();
              }
            }
          );
        }
      );
    }
  });
}));

// Update transcoding profile
router.put('/:id', asyncHandler(async (req, res) => {
  const {
    name,
    description,
    video_codec,
    audio_codec,
    video_bitrate,
    audio_bitrate,
    resolution,
    preset,
    tune,
    gop_size,
    keyint_min,
    hls_time,
    hls_list_size,
    hls_segment_type,
    hls_flags,
    hls_segment_filename,
    manifest_filename,
    additional_params,
    is_default
  } = req.body;

  const now = new Date().toISOString();

  return new Promise((resolve, reject) => {
    // Check if profile exists
    db.get(
      'SELECT * FROM transcoding_profiles WHERE id = ?',
      [req.params.id],
      (err, profile) => {
        if (err) {
          console.error('Error fetching profile for update:', err.message);
          reject(err);
          return;
        }

        if (!profile) {
          res.status(404).json({ error: 'Transcoding profile not found' });
          resolve();
          return;
        }

        // If this is being set as default, unset other defaults first
        if (is_default && !profile.is_default) {
          db.run(
            'UPDATE transcoding_profiles SET is_default = 0, updated_at = ?',
            [now],
            (err) => {
              if (err) {
                console.error('Error updating default profiles:', err.message);
                reject(err);
                return;
              }
              updateProfile();
            }
          );
        } else {
          updateProfile();
        }

        function updateProfile() {
          const updates = [];
          const params = [];

          if (name !== undefined) {
            updates.push('name = ?');
            params.push(name);
          }
          if (description !== undefined) {
            updates.push('description = ?');
            params.push(description);
          }
          if (video_codec !== undefined) {
            updates.push('video_codec = ?');
            params.push(video_codec);
          }
          if (audio_codec !== undefined) {
            updates.push('audio_codec = ?');
            params.push(audio_codec);
          }
          if (video_bitrate !== undefined) {
            updates.push('video_bitrate = ?');
            params.push(video_bitrate);
          }
          if (audio_bitrate !== undefined) {
            updates.push('audio_bitrate = ?');
            params.push(audio_bitrate);
          }
          if (resolution !== undefined) {
            updates.push('resolution = ?');
            params.push(resolution);
          }
          if (preset !== undefined) {
            updates.push('preset = ?');
            params.push(preset);
          }
          if (tune !== undefined) {
            updates.push('tune = ?');
            params.push(tune);
          }
          if (gop_size !== undefined) {
            updates.push('gop_size = ?');
            params.push(gop_size);
          }
          if (keyint_min !== undefined) {
            updates.push('keyint_min = ?');
            params.push(keyint_min);
          }
          if (hls_time !== undefined) {
            updates.push('hls_time = ?');
            params.push(hls_time);
          }
          if (hls_list_size !== undefined) {
            updates.push('hls_list_size = ?');
            params.push(hls_list_size);
          }
          if (hls_segment_type !== undefined) {
            updates.push('hls_segment_type = ?');
            params.push(hls_segment_type);
          }
          if (hls_flags !== undefined) {
            updates.push('hls_flags = ?');
            params.push(hls_flags);
          }
          if (hls_segment_filename !== undefined) {
            updates.push('hls_segment_filename = ?');
            params.push(hls_segment_filename);
          }
          if (manifest_filename !== undefined) {
            updates.push('manifest_filename = ?');
            params.push(manifest_filename);
          }
          if (additional_params !== undefined) {
            updates.push('additional_params = ?');
            params.push(additional_params);
          }
          if (is_default !== undefined) {
            updates.push('is_default = ?');
            params.push(is_default ? 1 : 0);
          }

          updates.push('updated_at = ?');
          params.push(now);
          params.push(req.params.id);

          if (updates.length === 1) {
            res.status(400).json({ error: 'No valid fields to update' });
            resolve();
            return;
          }

          const sql = `UPDATE transcoding_profiles SET ${updates.join(', ')} WHERE id = ?`;

          db.run(sql, params, function(err) {
            if (err) {
              console.error('Error updating transcoding profile:', err.message);
              if (err.message.includes('UNIQUE constraint failed')) {
                res.status(400).json({ error: 'Profile name already exists' });
              } else {
                reject(err);
              }
              return;
            }

            if (this.changes === 0) {
              res.status(404).json({ error: 'Transcoding profile not found' });
              resolve();
              return;
            }

            logAction('profile_updated', `Updated transcoding profile: ${name || profile.name}`);

            // Return updated profile
            db.get(
              'SELECT * FROM transcoding_profiles WHERE id = ?',
              [req.params.id],
              (err, row) => {
                if (err) {
                  console.error('Error retrieving updated profile:', err.message);
                  reject(err);
                } else {
                  res.json({
                    message: 'Transcoding profile updated successfully',
                    data: row
                  });
                  resolve();
                }
              }
            );
          });
        }
      }
    );
  });
}));

// Delete transcoding profile
router.delete('/:id', asyncHandler(async (req, res) => {
  return new Promise((resolve, reject) => {
    // Check if profile exists and get its info
    db.get(
      'SELECT * FROM transcoding_profiles WHERE id = ?',
      [req.params.id],
      (err, profile) => {
        if (err) {
          console.error('Error fetching profile for deletion:', err.message);
          reject(err);
          return;
        }

        if (!profile) {
          res.status(404).json({ error: 'Transcoding profile not found' });
          resolve();
          return;
        }

        // Check if this is the default profile
        if (profile.is_default) {
          res.status(400).json({ error: 'Cannot delete the default profile' });
          resolve();
          return;
        }

        // Check if any channels are using this profile
        db.get(
          'SELECT COUNT(*) as count FROM channels WHERE transcoding_profile_id = ?',
          [req.params.id],
          (err, result) => {
            if (err) {
              console.error('Error checking profile usage:', err.message);
              reject(err);
              return;
            }

            if (result.count > 0) {
              res.status(400).json({ 
                error: `Cannot delete profile. It is being used by ${result.count} channel(s)` 
              });
              resolve();
              return;
            }

            // Delete the profile
            db.run(
              'DELETE FROM transcoding_profiles WHERE id = ?',
              [req.params.id],
              function(err) {
                if (err) {
                  console.error('Error deleting transcoding profile:', err.message);
                  reject(err);
                  return;
                }

                if (this.changes === 0) {
                  res.status(404).json({ error: 'Transcoding profile not found' });
                  resolve();
                  return;
                }

                logAction('profile_deleted', `Deleted transcoding profile: ${profile.name}`);

                res.json({
                  message: 'Transcoding profile deleted successfully',
                  id: req.params.id
                });
                resolve();
              }
            );
          }
        );
      }
    );
  });
}));

// Set default profile
router.post('/:id/set-default', asyncHandler(async (req, res) => {
  const now = new Date().toISOString();

  return new Promise((resolve, reject) => {
    // Check if profile exists
    db.get(
      'SELECT * FROM transcoding_profiles WHERE id = ?',
      [req.params.id],
      (err, profile) => {
        if (err) {
          console.error('Error fetching profile:', err.message);
          reject(err);
          return;
        }

        if (!profile) {
          res.status(404).json({ error: 'Transcoding profile not found' });
          resolve();
          return;
        }

        // First, unset all defaults
        db.run(
          'UPDATE transcoding_profiles SET is_default = 0, updated_at = ?',
          [now],
          (err) => {
            if (err) {
              console.error('Error unsetting defaults:', err.message);
              reject(err);
              return;
            }

            // Set the new default
            db.run(
              'UPDATE transcoding_profiles SET is_default = 1, updated_at = ? WHERE id = ?',
              [now, req.params.id],
              function(err) {
                if (err) {
                  console.error('Error setting default profile:', err.message);
                  reject(err);
                  return;
                }

                logAction('profile_set_default', `Set default transcoding profile: ${profile.name}`);

                res.json({
                  message: 'Default profile updated successfully',
                  data: { ...profile, is_default: true, updated_at: now }
                });
                resolve();
              }
            );
          }
        );
      }
    );
  });
}));

// Get profile usage statistics
router.get('/:id/usage', asyncHandler(async (req, res) => {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT 
        COUNT(*) as total_channels,
        SUM(CASE WHEN transcoding_enabled = 1 THEN 1 ELSE 0 END) as enabled_channels,
        SUM(CASE WHEN transcoding_status = 'active' THEN 1 ELSE 0 END) as active_channels
       FROM channels 
       WHERE transcoding_profile_id = ?`,
      [req.params.id],
      (err, row) => {
        if (err) {
          console.error('Error fetching profile usage:', err.message);
          reject(err);
        } else {
          res.json({ data: row });
          resolve();
        }
      }
    );
  });
}));

module.exports = router;
