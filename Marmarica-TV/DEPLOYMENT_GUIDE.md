# Marmarica TV - Complete Deployment Guide

This guide provides step-by-step instructions for deploying the Marmarica TV IPTV Management Panel from scratch on a new server.

## 🚀 Quick Start Checklist

- [ ] Server meets minimum requirements
- [ ] Node.js 18+ installed
- [ ] FFmpeg installed and configured
- [ ] PM2 installed globally
- [ ] Repository cloned and dependencies installed
- [ ] Environment variables configured
- [ ] Database initialized and migrated
- [ ] Admin user created
- [ ] Transcoding directories configured
- [ ] Application started with PM2
- [ ] Nginx configured (optional)

## 📋 Prerequisites

### System Requirements
- **OS**: Ubuntu 20.04+ (or similar Linux distribution)
- **RAM**: 4GB minimum, 8GB recommended
- **Storage**: 50GB+ (depending on transcoding needs)
- **Network**: Stable internet connection
- **CPU**: 2+ cores recommended for transcoding

### Required Software
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install FFmpeg
sudo apt install -y ffmpeg

# Install PM2 globally
npm install -g pm2

# Install Git
sudo apt install -y git

# Install SQLite3 (for database management)
sudo apt install -y sqlite3

# Install Nginx (optional, for production)
sudo apt install -y nginx
```

## 🛠️ Step-by-Step Installation

### Step 1: Repository Setup

```bash
# Clone repository
git clone https://github.com/pokerist/marmaricatv.git
cd marmaricatv/Marmarica-TV

# Verify directory structure
ls -la
# Should see: client/, server/, README.md, etc.
```

### Step 2: Install Dependencies

```bash
# Install backend dependencies
cd server
npm install

# Verify installation
npm list --depth=0

# Install frontend dependencies
cd ../client
npm install

# Verify installation
npm list --depth=0

# Return to root directory
cd ..
```

### Step 3: Environment Configuration

#### Server Environment
```bash
# Create server environment file
cd server
cp .env.example .env  # If exists, or create new .env

# Edit server/.env
nano .env
```

Add the following configuration:
```env
# Server Configuration
NODE_ENV=production
PORT=5000
SESSION_SECRET=your-very-secure-random-string-change-this

# Database
DATABASE_PATH=./database.sqlite

# CORS and API URLs
CORS_ORIGIN=http://155.138.231.215:3000
API_URL=http://155.138.231.215:5000
SERVER_BASE_URL=http://155.138.231.215:5000

# File Upload
UPLOAD_DIR=uploads
MAX_FILE_SIZE=5242880

# Transcoding Configuration
FFMPEG_PATH=ffmpeg
HLS_OUTPUT_BASE=/var/www/html/hls_stream
CLEANUP_INTERVAL=300000
MAX_SEGMENT_AGE=30000
MAX_CHANNEL_DIR_SIZE=104857600
HLS_LIST_SIZE=3
ORPHANED_DIR_CLEANUP_AGE=3600000
```

#### Client Environment
```bash
# Create client environment file
cd ../client
cp .env.example .env  # If exists, or create new .env

# Edit client/.env
nano .env
```

Add the following configuration:
```env
# API Configuration
REACT_APP_API_URL=http://155.138.231.215:5000/api
REACT_APP_API_TIMEOUT=8000
REACT_APP_API_RETRIES=2

# Upload Configuration
REACT_APP_UPLOADS_URL=http://155.138.231.215:5000/uploads
REACT_APP_MAX_UPLOAD_SIZE=5242880
```

### Step 4: Database Initialization

```bash
# Navigate to server directory
cd ../server

# Initialize complete database schema with unified script
node scripts/initialize-database.js
```

**Expected Output:**
```
🚀 Starting Marmarica TV Database Initialization...

📊 Database Connection
✓ Connected to SQLite database

📋 Base Tables
✓ Created table devices
✓ Created table channels
✓ Created table news
✓ Created table actions
✓ Created table admins

🔧 Transcoding Support
✓ Added column transcoding_enabled to channels
✓ Added column transcoded_url to channels
✓ Added column transcoding_status to channels
✓ Created table transcoding_jobs

📊 Channel Ordering
✓ Added column order_index to channels
✓ Updated order_index for existing channels
✓ Created index idx_channels_order

🔄 State Tracking
✓ Added column last_transcoding_state to channels
✓ Updated last_transcoding_state for existing channels

📦 Bulk Operations Support
✓ Created table bulk_operations
✓ Created table import_logs
✓ Created index idx_bulk_operations_status
✓ Created index idx_import_logs_bulk_operation
✓ Created index idx_import_logs_status

📁 Directory Setup
✓ Created uploads directory
✓ HLS stream directory exists

✅ Database Verification
✓ Database integrity check passed
✓ All required tables and columns verified

📊 Summary
✓ Successful operations: 20
⚠ Warnings: 0
❌ Errors: 0

🎉 Database initialization completed successfully!
   Ready to start the application.

Next steps:
  1. Create admin user: node scripts/manage-admin.js create admin
  2. Start the server: node index.js
  3. Or use PM2: pm2 start ecosystem.config.js
```

**Verification:**
```bash
# Verify all tables exist
sqlite3 database.sqlite "SELECT name FROM sqlite_master WHERE type='table';"
# Should return: devices, channels, news, actions, admins, transcoding_jobs, bulk_operations, import_logs

# Verify channels table has all required columns
sqlite3 database.sqlite "PRAGMA table_info(channels);"
# Should include: transcoding_enabled, transcoded_url, transcoding_status, order_index, last_transcoding_state

# Check database integrity
sqlite3 database.sqlite "PRAGMA integrity_check;"
# Should return: ok
```

#### Troubleshooting Database Initialization

**If the script fails:**
```bash
# Check database file permissions
ls -la database.sqlite
chmod 664 database.sqlite

# Remove corrupted database and retry
rm database.sqlite
node scripts/initialize-database.js
```

**If you see warnings about existing tables/columns:**
- This is normal and expected - the script is idempotent
- Warnings mean the database already has some components
- The script will skip existing items and continue

**For permission errors:**
```bash
# Ensure uploads directory is writable
chmod 755 uploads

# Ensure HLS directory exists and is writable
sudo mkdir -p /var/www/html/hls_stream
sudo chown -R $USER:$USER /var/www/html/hls_stream
sudo chmod -R 755 /var/www/html/hls_stream
```

### Step 5: Admin User Creation

```bash
# Create admin user with random password
node scripts/manage-admin.js create admin

# OR create with specific password
node scripts/manage-admin.js set-password admin Smart@2025

# Check admin-credentials.txt for login details
cat admin-credentials.txt
```

### Step 6: Storage Configuration

```bash
# Create HLS output directory
sudo mkdir -p /var/www/html/hls_stream
sudo chown -R $USER:$USER /var/www/html/hls_stream
sudo chmod -R 755 /var/www/html/hls_stream

# Create and configure uploads directory
mkdir -p uploads
chmod 755 uploads

# Verify directory permissions
ls -la uploads/
ls -la /var/www/html/hls_stream/
```

### Step 7: Build Frontend

```bash
# Navigate to client directory
cd ../client

# Build production version
npm run build

# Verify build
ls -la build/
```

### Step 8: PM2 Configuration

```bash
# Navigate to root directory
cd ..

# Create PM2 ecosystem file
nano ecosystem.config.js
```

Add the following configuration:
```javascript
module.exports = {
  apps: [{
    name: 'marmarica-tv-server',
    script: 'server/index.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 5000,
      SESSION_SECRET: 'your-very-secure-random-string-change-this'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    max_restarts: 10,
    min_uptime: '10s',
    max_memory_restart: '1G'
  }]
};
```

### Step 9: Start Application

```bash
# Create logs directory
mkdir -p logs

# Start with PM2
pm2 start ecosystem.config.js

# Check status
pm2 status
pm2 logs marmarica-tv-server

# Save PM2 configuration
pm2 save

# Setup PM2 startup script
pm2 startup
# Follow the instructions printed by the command
```

## 🔧 Production Optimization

### Nginx Configuration (Recommended)

```bash
# Create Nginx configuration
sudo nano /etc/nginx/sites-available/marmarica-tv
```

Add the following configuration:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Client-side routing support
    location / {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;
        
        # WebSocket support (if needed)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # HLS streaming files
    location /hls_stream {
        alias /var/www/html/hls_stream;
        expires 1s;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Pragma "no-cache";
        add_header Access-Control-Allow-Origin "*";
        add_header Access-Control-Allow-Methods "GET, POST, OPTIONS";
        add_header Access-Control-Allow-Headers "Origin, X-Requested-With, Content-Type, Accept, Authorization";
        
        # Handle CORS preflight requests
        if ($request_method = 'OPTIONS') {
            add_header Access-Control-Allow-Origin "*";
            add_header Access-Control-Allow-Methods "GET, POST, OPTIONS";
            add_header Access-Control-Allow-Headers "Origin, X-Requested-With, Content-Type, Accept, Authorization";
            add_header Access-Control-Max-Age 86400;
            add_header Content-Type "text/plain charset=UTF-8";
            add_header Content-Length 0;
            return 204;
        }
    }

    # Static file uploads
    location /uploads {
        alias /path/to/marmarica-tv/server/uploads;
        expires 30d;
        add_header Cache-Control "public, immutable";
        add_header Access-Control-Allow-Origin "*";
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Gzip compression
    gzip on;
    gzip_comp_level 6;
    gzip_min_length 1000;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
}
```

Enable the site:
```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/marmarica-tv /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
sudo systemctl enable nginx
```

### Firewall Configuration

```bash
# Configure UFW firewall
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS (if using SSL)
sudo ufw allow 5000/tcp # Node.js (if not using Nginx)

# Enable firewall
sudo ufw enable
sudo ufw status
```

## ✅ Verification Steps

### 1. Database Verification
```bash
cd server

# Check all required tables exist
sqlite3 database.sqlite "SELECT name FROM sqlite_master WHERE type='table';"
# Should show: devices, channels, news, actions, admins, transcoding_jobs, bulk_operations, import_logs

# Verify channels table has all required columns
sqlite3 database.sqlite "PRAGMA table_info(channels);"
# Should include: transcoding_enabled, transcoded_url, transcoding_status, last_transcoding_state, order_index

# Verify bulk operations tables exist
sqlite3 database.sqlite "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('bulk_operations', 'import_logs');"
# Should return: bulk_operations, import_logs

# Check database integrity
sqlite3 database.sqlite "PRAGMA integrity_check;"
# Should return: ok
```

### 2. Admin Authentication Test
```bash
# Check admin credentials
cat server/admin-credentials.txt

# Test login via API
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your-password"}'
# Should return success with session cookie

# Test admin session
curl -X GET http://localhost:5000/api/auth/session \
  -H "Cookie: connect.sid=your-session-id"
# Should return admin user info
```

### 3. Core API Endpoints Test
```bash
# Test dashboard endpoint
curl -X GET http://localhost:5000/api/dashboard \
  -H "Cookie: connect.sid=your-session-id"
# Should return dashboard data

# Test channels endpoint
curl -X GET http://localhost:5000/api/channels \
  -H "Cookie: connect.sid=your-session-id"
# Should return channels array

# Test devices endpoint
curl -X GET http://localhost:5000/api/devices \
  -H "Cookie: connect.sid=your-session-id"
# Should return devices array

# Test news endpoint
curl -X GET http://localhost:5000/api/news \
  -H "Cookie: connect.sid=your-session-id"
# Should return news array
```

### 4. Phase 2A Features Test
```bash
# Test bulk operations stats
curl -X GET http://localhost:5000/api/bulk-operations/stats \
  -H "Cookie: connect.sid=your-session-id"
# Should return bulk operations statistics

# Test transcoding eligible channels
curl -X GET http://localhost:5000/api/bulk-operations/transcoding-eligible \
  -H "Cookie: connect.sid=your-session-id"
# Should return channels eligible for transcoding

# Test recent bulk operations
curl -X GET http://localhost:5000/api/bulk-operations/recent \
  -H "Cookie: connect.sid=your-session-id"
# Should return recent bulk operations
```

### 5. Client API Test
```bash
# Test client device check (should fail for non-existent device)
curl -X POST http://localhost:5000/api/client/check-device \
  -H "Content-Type: application/json" \
  -d '{"duid":"TEST123"}'
# Should return 404 with "Device not registered"

# Test client device registration
curl -X POST http://localhost:5000/api/client/register-device \
  -H "Content-Type: application/json" \
  -d '{"duid":"TEST123456"}'
# Should return success with activation code
```

### 6. Transcoding System Test
```bash
# Check FFmpeg installation
ffmpeg -version
# Should display FFmpeg version info

# Check HLS directory permissions
ls -la /var/www/html/hls_stream/
# Should be writable by the application user

# Test transcoding endpoints
curl -X GET http://localhost:5000/api/transcoding/stats \
  -H "Cookie: connect.sid=your-session-id"
# Should return transcoding statistics

curl -X GET http://localhost:5000/api/transcoding/jobs \
  -H "Cookie: connect.sid=your-session-id"
# Should return active transcoding jobs
```

### 7. File Upload Test
```bash
# Check upload directory
ls -la server/uploads/
# Should be writable by the application user

# Test file upload endpoint (requires multipart form)
curl -X POST http://localhost:5000/api/channels/1/logo \
  -H "Cookie: connect.sid=your-session-id" \
  -F "logo=@/path/to/test/image.jpg"
# Should return success or appropriate error
```

### 8. Application Health Check
```bash
# Check PM2 status
pm2 status
# Should show marmarica-tv-server as "online"

# Check application logs
pm2 logs marmarica-tv-server --lines 50
# Should show no critical errors

# Test health endpoint
curl http://localhost:5000/api/health
# Should return: {"status":"OK","message":"Server is running"}

# Test if transcoding service initialized
pm2 logs marmarica-tv-server | grep -i "transcoding"
# Should show "Transcoding service initialized"
```

### 9. Frontend Access Test
```bash
# Test direct frontend access
curl -I http://localhost:5000/
# Should return 200 OK with HTML content

# Test API accessibility
curl -I http://localhost:5000/api/health
# Should return 200 OK with JSON content

# Test static files
curl -I http://localhost:5000/uploads/
# Should return 200 OK or 403 Forbidden (directory listing)

# Test HLS stream directory
curl -I http://localhost:5000/hls_stream/
# Should return 200 OK or 403 Forbidden
```

### 10. Complete System Integration Test
```bash
# Run comprehensive test script
cat > test-system.sh << 'EOF'
#!/bin/bash
echo "Testing Marmarica TV System..."

# Test 1: Database
echo "1. Testing database..."
sqlite3 server/database.sqlite "SELECT COUNT(*) FROM sqlite_master WHERE type='table';" || echo "❌ Database test failed"

# Test 2: Health endpoint
echo "2. Testing health endpoint..."
curl -s http://localhost:5000/api/health | grep -q "OK" && echo "✅ Health OK" || echo "❌ Health failed"

# Test 3: PM2 status
echo "3. Testing PM2 status..."
pm2 status marmarica-tv-server | grep -q "online" && echo "✅ PM2 OK" || echo "❌ PM2 failed"

# Test 4: FFmpeg
echo "4. Testing FFmpeg..."
ffmpeg -version > /dev/null 2>&1 && echo "✅ FFmpeg OK" || echo "❌ FFmpeg failed"

# Test 5: Directories
echo "5. Testing directories..."
[ -d "/var/www/html/hls_stream" ] && echo "✅ HLS directory OK" || echo "❌ HLS directory failed"
[ -d "server/uploads" ] && echo "✅ Upload directory OK" || echo "❌ Upload directory failed"

echo "System test completed!"
EOF

chmod +x test-system.sh
./test-system.sh
```

## 🔄 Post-Deployment Tasks

### 1. Security Hardening
```bash
# Update all packages
sudo apt update && sudo apt upgrade -y

# Configure automatic security updates
sudo apt install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

### 2. Monitoring Setup
```bash
# Install htop for system monitoring
sudo apt install htop

# Setup log rotation
sudo nano /etc/logrotate.d/marmarica-tv
```

Add log rotation configuration:
```
/path/to/marmarica-tv/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 644 user group
    postrotate
        pm2 reload marmarica-tv-server
    endscript
}
```

### 3. Backup Strategy
```bash
# Create backup script
nano backup-marmarica.sh
```

Add backup script:
```bash
#!/bin/bash
BACKUP_DIR="/home/backups/marmarica-tv"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup database
cp /path/to/marmarica-tv/server/database.sqlite $BACKUP_DIR/database_$DATE.sqlite

# Backup uploads
tar -czf $BACKUP_DIR/uploads_$DATE.tar.gz -C /path/to/marmarica-tv/server uploads/

# Backup configuration
cp /path/to/marmarica-tv/server/.env $BACKUP_DIR/server_env_$DATE.backup
cp /path/to/marmarica-tv/client/.env $BACKUP_DIR/client_env_$DATE.backup

# Remove old backups (keep last 30 days)
find $BACKUP_DIR -name "*.sqlite" -mtime +30 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete
find $BACKUP_DIR -name "*.backup" -mtime +30 -delete

echo "Backup completed: $DATE"
```

Make script executable and add to cron:
```bash
chmod +x backup-marmarica.sh
crontab -e
# Add: 0 2 * * * /path/to/backup-marmarica.sh
```

## 🚨 Troubleshooting

### Common Issues and Solutions

#### 1. Database Connection Error
```bash
# Check database file permissions
ls -la server/database.sqlite
sudo chown $USER:$USER server/database.sqlite
chmod 664 server/database.sqlite
```

#### 2. FFmpeg Not Found
```bash
# Check FFmpeg installation
which ffmpeg
ffmpeg -version

# If not found, install:
sudo apt install ffmpeg
```

#### 3. Permission Denied for HLS Directory
```bash
# Fix permissions
sudo chown -R $USER:$USER /var/www/html/hls_stream
sudo chmod -R 755 /var/www/html/hls_stream
```

#### 4. PM2 Process Crashes
```bash
# Check logs
pm2 logs marmarica-tv-server

# Restart with more memory
pm2 restart marmarica-tv-server --max-memory-restart 2G
```

#### 5. High CPU Usage
```bash
# Check running processes
htop
ps aux | grep ffmpeg

# Monitor transcoding jobs
pm2 monit
```

## 📞 Support

For technical issues during deployment:
1. Check the logs: `pm2 logs marmarica-tv-server`
2. Verify environment variables are set correctly
3. Ensure all dependencies are installed
4. Check file permissions for uploads and HLS directories
5. Verify database integrity with SQLite commands

## 🎉 Success Criteria

Your deployment is successful when all of the following are working:

### Core System
- [ ] Admin panel accessible at configured URL
- [ ] Admin login works with created credentials
- [ ] PM2 shows application as "online"
- [ ] All database migrations completed successfully
- [ ] Database integrity check passes
- [ ] FFmpeg is installed and accessible
- [ ] HLS output directory has correct permissions

### Basic Features
- [ ] Channel management (CRUD operations) works
- [ ] Device management (CRUD operations) works
- [ ] News management (CRUD operations) works
- [ ] Dashboard displays statistics correctly
- [ ] File upload functionality works
- [ ] Logo upload for channels works

### Phase 1 Features ✅
- [ ] Original URLs display in channel edit forms
- [ ] Transcoded URLs display separately as read-only
- [ ] Transcoding service starts and stops properly
- [ ] System restarts maintain transcoding state
- [ ] `last_transcoding_state` column exists in channels table
- [ ] Previously active channels restart automatically after reboot

### Phase 2A Features ✅
- [ ] M3U8 file upload interface works
- [ ] M3U8 parsing and validation works
- [ ] Duplicate detection prevents re-imports
- [ ] Bulk channel import works
- [ ] Bulk transcoding modal loads eligible channels
- [ ] "Transcode All" functionality works
- [ ] Bulk operations tracking works
- [ ] `bulk_operations` and `import_logs` tables exist

### API Endpoints
- [ ] Health endpoint returns OK status
- [ ] Admin authentication endpoints work
- [ ] Channel API endpoints respond correctly
- [ ] Device API endpoints respond correctly
- [ ] News API endpoints respond correctly
- [ ] Dashboard API endpoints respond correctly
- [ ] Transcoding API endpoints respond correctly
- [ ] Bulk operations API endpoints respond correctly
- [ ] Client API endpoints respond correctly

### Transcoding System
- [ ] FFmpeg processes can be spawned
- [ ] HLS streams are accessible via direct URL
- [ ] Transcoding status updates correctly
- [ ] Transcoded URLs are generated properly
- [ ] Transcoding cleanup works automatically
- [ ] Storage monitoring functions correctly

### Client Integration
- [ ] Device registration works
- [ ] Device activation works
- [ ] Device status checking works
- [ ] Content filtering by device type works
- [ ] Expired device handling works correctly

### File Management
- [ ] Upload directory is writable
- [ ] HLS stream directory is writable
- [ ] File cleanup processes work
- [ ] Storage limits are enforced
- [ ] Backup procedures are in place

### Performance & Monitoring
- [ ] System resource usage is reasonable
- [ ] Log files are being generated
- [ ] Error handling works properly
- [ ] Performance monitoring is functional
- [ ] Automated cleanup prevents disk space issues

### Security
- [ ] Admin authentication is secure
- [ ] Session management works
- [ ] Input validation prevents injection
- [ ] File upload security works
- [ ] API rate limiting is functional (if implemented)

### Integration Testing
- [ ] Complete system integration test passes
- [ ] All documented API endpoints are accessible
- [ ] Frontend-backend communication works
- [ ] Database operations are reliable
- [ ] External dependencies (FFmpeg) are functional

**Deployment Complete**: When all items above are checked ✅

---

**Deployment Guide Version**: 2.0.0  
**Last Updated**: January 2025  
**Tested On**: Ubuntu 20.04, Node.js 18+
