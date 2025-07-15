# Legacy Database Migration Scripts

**⚠️ These scripts are DEPRECATED and should NOT be used in new installations.**

## Overview

These scripts were used for incremental database migrations before the unified `initialize-database.js` script was created. They are preserved here for historical reference and debugging purposes only.

## Deprecated Scripts

### 1. `add-transcoding-support.js`
- **Purpose**: Added transcoding functionality to the database
- **Added**: `transcoding_enabled`, `transcoded_url`, `transcoding_status` columns to channels table
- **Created**: `transcoding_jobs` table
- **Superseded by**: `initialize-database.js` (transcoding support section)

### 2. `add-channel-order.js`
- **Purpose**: Added channel ordering functionality
- **Added**: `order_index` column to channels table
- **Created**: Index for better performance
- **Superseded by**: `initialize-database.js` (channel ordering section)

### 3. `add-transcoding-state-tracking.js`
- **Purpose**: Added persistent transcoding state tracking
- **Added**: `last_transcoding_state` column to channels table
- **Updated**: Existing channels with proper state values
- **Superseded by**: `initialize-database.js` (state tracking section)

### 4. `add-bulk-operations-support.js`
- **Purpose**: Added bulk operations and import tracking
- **Created**: `bulk_operations` and `import_logs` tables
- **Added**: Performance indexes
- **Superseded by**: `initialize-database.js` (bulk operations section)

## Migration History

These scripts were designed to be run in sequence:
1. First run `node index.js` to create base tables
2. Then run each migration script in order
3. Finally create admin user and start the application

## Current Process

**✅ Use this instead:**
```bash
node scripts/initialize-database.js
```

The unified script:
- Creates all tables and columns in one operation
- Is idempotent (safe to run multiple times)
- Provides better error handling and logging
- Eliminates the need for multiple migration steps
- Includes comprehensive verification

## If You Need to Use These Scripts

**⚠️ Warning**: Only use these scripts if you're debugging migration issues or need to understand the historical development process.

If you must use them:
1. Ensure you have a database backup
2. Run them in the exact order listed above
3. Check for errors after each script
4. Verify the final schema matches expectations

## Schema Reference

The complete schema created by these scripts is now handled by `initialize-database.js`. For the current schema definition, refer to the main initialization script.

## Support

For any issues with database initialization, use the unified script instead:
```bash
cd server
node scripts/initialize-database.js
```

For troubleshooting, check the main documentation:
- `README.md` - General setup instructions
- `DEPLOYMENT_GUIDE.md` - Detailed deployment steps

---

**Last Updated**: January 2025  
**Status**: DEPRECATED - Do not use for new installations
