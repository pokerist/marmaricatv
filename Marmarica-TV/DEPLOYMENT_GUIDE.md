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
CORS_ORIGIN=http://your-server-ip:3000
API_URL=http://your-server-ip:5000
SERVER_BASE_URL=http://your-server-ip:5000

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
REACT_APP_API_URL=http://your-server-ip:5000/api
REACT_APP_API_TIMEOUT=8000
REACT_APP_API_RETRIES=2

# Upload Configuration
REACT_APP_UPLOADS_URL=http://your-server-ip:5000/uploads
REACT_APP_MAX_UPLOAD_SIZE=5242880
```

### Step 4: Database Initialization

```bash
# Navigate to server directory
cd ../server

# Initialize database (this creates the database.sqlite file)
node index.js
# Wait for these messages:
# "Connected to the SQLite database"
# "Devices table initialized"
# "Channels table initialized"
# "News table initialized"
# "Actions table initialized"
# "Uploads directory created"
# "Database tables initialized"
# Then press Ctrl+C to stop
```

### Step 5: Database Migrations

Run the following migration scripts in order:

```bash
# Add transcoding support
node scripts/add-transcoding-support.js
# Expected output: "Added transcoding_enabled column to channels table"

# Add channel ordering
node scripts/add-channel-order.js
# Expected output: "Added order_index column to channels table"

# Add transcoding state tracking (NEW)
node scripts/add-transcoding-state-tracking.js
# Expected output: "Added last_transcoding_state column to channels table"
```

### Step 6: Admin User Creation

```bash
# Create admin user with random password
node scripts/manage-admin.js create admin

# OR create with specific password
node scripts/manage-admin.js set-password admin YourSecurePassword123

# Check admin-credentials.txt for login details
cat admin-credentials.txt
```

### Step 7: Storage Configuration

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

### Step 8: Build Frontend

```bash
# Navigate to client directory
cd ../client

# Build production version
npm run build

# Verify build
ls -la build/
```

### Step 9: PM2 Configuration

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

### Step 10: Start Application

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
sqlite3 database.sqlite "SELECT name FROM sqlite_master WHERE type='table';"
# Should show: devices, channels, news, actions, admins, transcoding_jobs

sqlite3 database.sqlite "PRAGMA table_info(channels);"
# Should include: transcoding_enabled, transcoded_url, transcoding_status, last_transcoding_state
```

### 2. Admin Authentication Test
```bash
# Check admin credentials
cat server/admin-credentials.txt

# Test login via API
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your-password"}'
```

### 3. File Upload Test
```bash
# Check upload directory
ls -la server/uploads/
# Should be writable by the application user
```

### 4. Transcoding Test
```bash
# Check FFmpeg
ffmpeg -version

# Check HLS directory
ls -la /var/www/html/hls_stream/
# Should be writable by the application user
```

### 5. Application Health Check
```bash
# Check PM2 status
pm2 status

# Check application logs
pm2 logs marmarica-tv-server --lines 50

# Test health endpoint
curl http://localhost:5000/api/health
# Should return: {"status":"OK","message":"Server is running"}
```

### 6. Frontend Access
```bash
# If using Nginx
curl -I http://your-server-ip/

# If direct access
curl -I http://your-server-ip:5000/
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

Your deployment is successful when:
- [ ] Admin panel accessible at configured URL
- [ ] Admin login works with created credentials
- [ ] Channel management (CRUD operations) works
- [ ] File upload functionality works
- [ ] Transcoding service starts and stops properly
- [ ] Client API endpoints respond correctly
- [ ] System restarts maintain transcoding state
- [ ] HLS streams are accessible via direct URL
- [ ] All database migrations completed successfully
- [ ] PM2 shows application as "online"

---

**Deployment Guide Version**: 2.0.0  
**Last Updated**: January 2025  
**Tested On**: Ubuntu 20.04, Node.js 18+
