# Marmarica TV - Simplified Deployment Guide

## Overview

This guide will help you deploy the simplified Marmarica TV IPTV management system from scratch. The system has been streamlined to focus on core functionality while maintaining reliability.

## What's New - Simplified Approach

### ✅ Improvements Made:
- **Simplified Transcoding**: Uses a single, optimized FFmpeg template with LL-HLS support
- **Real Health Monitoring**: Stream health now reflects actual status (not always 50%)
- **Automatic Failure Handling**: Stream status updates automatically when streams fail
- **Memory Efficient**: Optimized cleanup and resource management
- **Consistent Operation**: Maintains transcoding regardless of stream errors
- **Better UX**: Streams that fail are automatically marked as offline

### 🔧 Default FFmpeg Template:
The system now uses this optimized template by default:
```bash
ffmpeg -fflags nobuffer -flags low_delay \
       -i "INPUT_URL" \
       -c:v libx264 -preset ultrafast -tune zerolatency -crf 23 \
       -g 15 -keyint_min 15 \
       -c:a aac -b:a 64k \
       -hls_time 0.5 -hls_list_size 1 -hls_flags delete_segments+append_list+omit_endlist+independent_segments \
       -hls_playlist_type event \
       -start_number 1 \
       -f hls "output.m3u8"
```

## System Requirements

- **OS**: Ubuntu 20.04+ or Debian 11+
- **RAM**: 8GB minimum, 16GB+ recommended
- **Storage**: 50GB+ free space
- **CPU**: 4+ cores recommended
- **Network**: Stable internet connection

## Quick Installation

### Step 1: Download and Prepare
```bash
# Clone the repository
git clone https://github.com/pokerist/marmaricatv.git
cd marmaricatv

# Make deployment script executable
chmod +x deploy.sh
```

### Step 2: Run Automated Deployment
```bash
# Run the deployment script
./deploy.sh
```

The script will:
1. Auto-detect your server IP
2. Install all dependencies (Node.js, FFmpeg, Redis, etc.)
3. Set up the simplified services
4. Configure HLS streaming
5. Create admin user
6. Start all services

### Step 3: Access the System
After deployment completes, you can access:
- **Admin Panel**: `http://YOUR_SERVER_IP:5000/login`
- **API Health**: `http://YOUR_SERVER_IP:5000/api/health`
- **HLS Streams**: `http://YOUR_SERVER_IP/hls_stream/channel_XX/output.m3u8`

## Manual Installation (Advanced Users)

If you prefer manual installation:

### 1. Install Dependencies
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install FFmpeg
sudo apt install -y ffmpeg

# Install Redis
sudo apt install -y redis-server

# Install PM2
sudo npm install -g pm2

# Install Nginx
sudo apt install -y nginx
```

### 2. Set Up Project
```bash
# Install backend dependencies
cd server
npm install

# Install frontend dependencies
cd ../client
npm install
```

### 3. Configure Environment
```bash
# Create server/.env
cp server/.env.example server/.env
# Edit server/.env with your settings

# Create client/.env
cp client/.env.example client/.env
# Edit client/.env with your API URL
```

### 4. Initialize Database
```bash
cd server
node scripts/initialize-database.js
node scripts/manage-admin.js create admin
```

### 5. Build and Start
```bash
# Build frontend
cd client
npm run build

# Start with PM2
cd ..
pm2 start ecosystem.config.js
pm2 save
```

## Configuration

### Environment Variables (server/.env)
```env
NODE_ENV=production
PORT=5000
CORS_ORIGIN=http://YOUR_SERVER_IP:5000
HLS_OUTPUT_BASE=/var/www/html/hls_stream
FFMPEG_PATH=ffmpeg
```

### Environment Variables (client/.env)
```env
REACT_APP_API_URL=http://YOUR_SERVER_IP:5000/api
REACT_APP_UPLOADS_URL=http://YOUR_SERVER_IP:5000/uploads
```

## Usage

### Adding Channels
1. Login to admin panel
2. Go to "Channels" section
3. Add new channel with:
   - Name
   - Stream URL (TV Headend format supported)
   - Enable transcoding if needed
4. System will automatically analyze the stream and apply appropriate settings

### Transcoding
- **Automatic**: System analyzes streams via ffprobe and applies optimal settings
- **Manual**: Expert users can create custom transcoding profiles
- **Default**: Uses the optimized LL-HLS template for all streams

### Stream Health
- Automatically monitors all streams
- Updates status in real-time
- Provides uptime percentages
- Alerts for failed streams

## Troubleshooting

### Common Issues

1. **Streams not working**:
   ```bash
   # Check transcoding logs
   pm2 logs marmarica-tv-server
   
   # Check HLS directory permissions
   ls -la /var/www/html/hls_stream/
   
   # Test direct stream access
   curl -I http://YOUR_SERVER_IP/hls_stream/channel_1/output.m3u8
   ```

2. **Health monitoring shows wrong status**:
   ```bash
   # Check stream health service
   curl http://YOUR_SERVER_IP:5000/api/stream-health/overview
   
   # Force manual health check
   curl -X POST http://YOUR_SERVER_IP:5000/api/stream-health/monitor-all
   ```

3. **High memory usage**:
   ```bash
   # Check cleanup service
   curl -X POST http://YOUR_SERVER_IP:5000/api/transcoding/cleanup
   ```

### Service Management

```bash
# Check PM2 status
pm2 status

# Restart services
pm2 restart marmarica-tv-server

# View logs
pm2 logs marmarica-tv-server

# Check Nginx
sudo systemctl status nginx

# Reload Nginx
sudo systemctl reload nginx
```

### Database Operations

```bash
cd server

# Reset admin password
node scripts/manage-admin.js reset-password admin

# View database
sqlite3 database.sqlite
.tables
SELECT * FROM channels;
```

## Backup and Maintenance

### Backup
```bash
# Create backup
tar -czf backup-$(date +%Y%m%d).tar.gz \
    --exclude='node_modules' \
    --exclude='build' \
    server/ client/ *.md *.json *.js

# Backup database only
cp server/database.sqlite backup-db-$(date +%Y%m%d).sqlite
```

### Maintenance
```bash
# Update Node.js packages
cd server && npm update
cd ../client && npm update

# Clean up old segments
curl -X POST http://YOUR_SERVER_IP:5000/api/transcoding/cleanup

# Clean up old health history
curl -X POST http://YOUR_SERVER_IP:5000/api/stream-health/cleanup
```

## API Endpoints

### Health Monitoring
- `GET /api/stream-health/overview` - Get health overview
- `GET /api/stream-health/channel/{id}` - Get channel health
- `POST /api/stream-health/monitor-all` - Trigger monitoring

### Transcoding
- `GET /api/transcoding/jobs` - Get active jobs
- `POST /api/transcoding/start/{channelId}` - Start transcoding
- `POST /api/transcoding/stop/{channelId}` - Stop transcoding
- `POST /api/transcoding/cleanup` - Clean up old files

### Channels
- `GET /api/channels` - List all channels
- `POST /api/channels` - Create new channel
- `PUT /api/channels/{id}` - Update channel
- `DELETE /api/channels/{id}` - Delete channel

## Security

### Firewall Setup
```bash
# Allow required ports
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP (HLS)
sudo ufw allow 5000/tcp # Express app
sudo ufw enable
```

### SSL/HTTPS (Optional)
```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d your-domain.com
```

## Support

For issues or questions:
1. Check the logs: `pm2 logs marmarica-tv-server`
2. Verify services: `pm2 status`
3. Test API endpoints using curl
4. Review configuration files

## Changelog

### v2.0 - Simplified Edition
- Simplified transcoding with single optimized template
- Real-time stream health monitoring
- Automatic failure handling
- Memory-efficient operations
- Better UX with automatic status updates
- Streamlined deployment process

---

**Note**: This simplified version focuses on core functionality while maintaining reliability. Expert users can still access advanced features through the API, but the default experience is much simpler and more reliable.
