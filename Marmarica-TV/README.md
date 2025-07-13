# AlKarma TV IPTV Admin Panel

Admin panel for managing IPTV devices, channels, and news for AlKarma TV.

## Prerequisites

- Node.js 14+ and npm installed
- PM2 installed globally (`npm install -g pm2`)
- Git for version control
- Ubuntu server for deployment

## Channel Sorting Feature

The admin panel now includes drag-and-drop channel sorting functionality that preserves device-specific channel permissions.

### Features

- Drag-and-drop interface for reordering channels
- Persistent channel order across all device types
- Device-specific channel filtering remains unchanged
- Real-time order updates with visual feedback
- Order preserved across admin and client APIs

### Database Migration

Before using the channel sorting feature, run the database migration:

```bash
# From the server directory
node scripts/add-channel-order.js

# Verify the migration
sqlite3 database.sqlite "SELECT name, order_index FROM channels ORDER BY order_index ASC;"
```

The migration will:
1. Add an order_index column to the channels table
2. Initialize order based on current name-based sorting
3. Create an index for better performance

### Using Channel Sorting

1. Access the Channels Management page
2. Drag channels to desired positions using the grab handle
3. Click "Save Order" to persist the changes
4. The new order will be reflected in all channel lists, including device APIs

### API Changes

New endpoint added:
```
POST /api/admin/channels/reorder
Body: { orderedIds: number[] }
Response: { message: string, data: number[] }
```

Modified endpoints (now return channels ordered by order_index):
- GET /api/channels
- GET /api/client/check-device (channels in response)

### Modified Files

Backend:
- server/routes/channels.js (added reorder endpoint)
- server/routes/client.js (updated ordering)
- server/scripts/add-channel-order.js (new migration script)

Frontend:
- client/package.json (added react-beautiful-dnd)
- client/src/pages/channels/ChannelsList.js (added drag-drop UI)
- client/src/services/api.js (added reorderChannels method)

## Authentication System Overview

The admin panel includes secure authentication to protect administrative routes while keeping client device APIs open.

### Features

- Secure admin login with session management
- Protected admin routes with role-based access
- Open client device APIs (no authentication required)
- Password hashing with bcrypt
- HTTP-only session cookies
- 12-hour session expiry
- No SSL requirement (HTTP only)

## Deployment Guide

Follow these steps in order to properly deploy the system.

### 1. Initial Setup

```bash
# Clone the repository
git clone https://github.com/pokerist/marmaricatv.git
cd marmaricatv/Marmarica-TV

# Install dependencies
cd server && npm install
cd ../client && npm install
```

### 2. Environment Configuration

#### Development Environment

1. Create server/.env file:
```env
# Server Configuration
NODE_ENV=development
PORT=5000
SESSION_SECRET=your-secure-random-string  # Change this!

# CORS Configuration
CORS_ORIGIN=http://192.168.100.232:3000
API_URL=http://192.168.100.232:5000

# Optional
UPLOAD_DIR=uploads  # Default: uploads
```

2. Create client/.env file:
```env
# API Configuration
REACT_APP_API_URL=http://192.168.100.232:5000/api
REACT_APP_API_TIMEOUT=8000
REACT_APP_API_RETRIES=2

# Upload URL
REACT_APP_UPLOADS_URL=http://192.168.100.232:5000/uploads
```

#### Production Environment

1. Update server/.env:
```env
# Server Configuration
NODE_ENV=production
PORT=5000
SESSION_SECRET=your-secure-random-string  # Change this!

# CORS Configuration
CORS_ORIGIN=http://192.168.100.232
API_URL=http://192.168.100.232

# Optional
UPLOAD_DIR=uploads
```

2. Update client/.env:
```env
# API Configuration
REACT_APP_API_URL=http://192.168.100.232/api
REACT_APP_API_TIMEOUT=8000
REACT_APP_API_RETRIES=2

# Upload URL
REACT_APP_UPLOADS_URL=http://192.168.100.232/uploads
```

### 3. Database Initialization

The database must be initialized before creating admin users:

```bash
# Start the server temporarily to create database tables
cd ../server
node index.js

# Wait for the message "Database tables initialized"
# Then press Ctrl+C to stop the server
```

Verify the database was created:
```bash
ls -l database.sqlite  # Should show the database file
```

### 4. Admin User Creation

IMPORTANT: Only run these commands after the database has been initialized in step 3.

```bash

# Create admin with random password
node scripts/manage-admin.js create admin

# OR set a specific password
node scripts/manage-admin.js set-password admin Smart@2025#
```

The credentials will be saved in `server/admin-credentials.txt`

Verify the admin was created:
```bash
sqlite3 database.sqlite "SELECT username FROM admins;"
# Should show: admin
```

### 5. PM2 Configuration

1. Update ecosystem.config.js:
```javascript
module.exports = {
  apps: [{
    name: 'marmarica-tv-server',
    script: 'server/index.js',
    env: {
      NODE_ENV: 'production',
      PORT: 5000,
      SESSION_SECRET: 'Qw73o9Gx#h!sZm42nXvtp8bLaT@E0RuQj'  // Same as in .env
    }
  }]
}
```

2. Build and start:
```bash
# Build frontend
cd ../client
npm run build

# Start server with PM2
cd ..
pm2 start ecosystem.config.js
```

3. Verify deployment:
```bash
# Check server status
pm2 status

# Check logs for errors
pm2 logs marmarica-tv-server
```
# save current pm2 state
pm2 save --force

# if you need to stop all >>> pm2 delete all

### 6. Running in Development Mode

1. Ensure environment files are configured correctly:
   - server/.env should have NODE_ENV=development
   - CORS_ORIGIN should match your frontend URL
   - API_URL should include the port number

2. Start the backend server:
```bash
cd server
npm run dev  # Uses nodemon for auto-reload
```

3. Verify the server output:
   - Should see "Server running on port 5000"
   - Should see "CORS enabled for origin: http://192.168.100.232:3000"
   - Should see database initialization messages

4. Start the frontend development server:
```bash
cd client
npm start    # Runs on http://192.168.100.232:3000
```

5. Access the admin panel:
   - Open http://192.168.100.232:3000 in your browser
   - You should see the login page
   - Check browser console for API configuration message
   - Log in with the admin credentials

6. Test client APIs:
```bash
# Should return channel list
curl http://192.168.100.232:5000/api/client/channels
```

7. Troubleshooting:
   - If you see CORS errors, verify CORS_ORIGIN matches your frontend URL exactly
   - If API calls fail, check that API_URL in server/.env matches REACT_APP_API_URL in client/.env
   - Make sure both servers are running (backend on :5000, frontend on :3000)

### 7. Production Deployment

1. Access the admin panel:
   - Open http://192.168.100.232:3000 in your browser
   - You should see the login page
   - Log in with the admin credentials

2. Test client APIs:
   ```bash
   # Should return channel list
   curl http://192.168.100.232/api/client/channels
   ```

## Admin User Management

### Creating Additional Admins

```bash
cd server
node scripts/manage-admin.js create <username>
```

The credentials will be saved in `server/admin-credentials.txt`

### Password Reset

```bash
# Generate new random password
node scripts/manage-admin.js create <username>

# OR set specific password
node scripts/manage-admin.js set-password <username> <new-password>
```

### Emergency Password Reset

If you need to reset a password directly in the database:

1. Generate a bcrypt hash:
```bash
node -e "const bcrypt = require('bcrypt'); bcrypt.hash('new-password', 10, (err, hash) => console.log(hash));"
```

2. Update the database:
```bash
sqlite3 database.sqlite "UPDATE admins SET password = 'generated-hash' WHERE username = 'admin';"
```

## Troubleshooting

### "no such table: admins" Error

This means the database tables haven't been initialized. Follow these steps:

1. Ensure you're in the server directory:
```bash
cd server
```

2. Start the server to initialize tables:
```bash
node index.js
# Wait for "Database tables initialized" message
# Press Ctrl+C to stop
```

3. Try the admin creation command again

### Other Common Issues

1. "EADDRINUSE" error:
```bash
# Find process using the port
sudo lsof -i :5000
# Kill the process
sudo kill -9 <PID>
```

2. Permission issues:
```bash
# Fix ownership
sudo chown -R $USER:$USER .
# Fix permissions
chmod -R 755 .
```

## Security Notes

- All admin routes require authentication
- Client device routes (/api/client/*) remain open
- Sessions expire after 12 hours
- Passwords are hashed with bcrypt
- No SSL/HTTPS configuration (as per requirements)

## Modified Files

Backend:
- server/package.json (added auth dependencies)
- server/index.js (added session handling)
- server/middleware/auth.js (new)
- server/controllers/auth.js (new)
- server/routes/auth.js (new)
- server/scripts/manage-admin.js (new)

Frontend:
- client/src/App.js (added auth routes)
- client/src/contexts/AuthContext.js (new)
- client/src/components/PrivateRoute.js (new)
- client/src/pages/auth/Login.js (new)
- client/src/services/api.js (updated for auth)
- client/src/components/layouts/MainLayout.js (added logout)
- client/src/index.css (added auth styles)
