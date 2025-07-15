# Marmarica TV IPTV Management Panel

A comprehensive admin panel for managing IPTV devices, channels, and content for Marmarica TV broadcasting platform.

## 📋 Table of Contents

- [Project Overview](#project-overview)
- [Features](#features)
- [Architecture](#architecture)
- [Installation](#installation)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Development](#development)
- [API Documentation](#api-documentation)
- [Maintenance](#maintenance)
- [Troubleshooting](#troubleshooting)

## 🎯 Project Overview

The Marmarica TV IPTV Management Panel is a full-stack web application designed to manage IPTV streaming operations. It provides a secure admin interface for managing channels, devices, and content while offering public APIs for client applications.

### Key Components

- **Admin Panel**: React-based web interface for system management
- **Backend API**: Node.js/Express server with SQLite database
- **Transcoding Service**: FFmpeg-based HLS transcoding system
- **Client APIs**: Public endpoints for device authentication and content delivery
- **Authentication**: Secure session-based admin authentication

## ✨ Features

### Channel Management
- Add, edit, and delete IPTV channels
- Drag-and-drop channel reordering
- Logo upload and management
- Channel categorization and filtering
- Bulk operations support

### Transcoding System
- Real-time MPEG-TS to HLS transcoding
- Automatic segment cleanup
- Persistent transcoding state tracking
- System restart recovery
- Storage monitoring and optimization

### Device Management
- Device registration and authentication
- Expiry date tracking
- Usage statistics
- Device type filtering

### Content Management
- News and announcements system
- Content categorization
- Publication scheduling

### Security
- Secure admin authentication
- Session management
- Role-based access control
- Input validation and sanitization

## 🏗️ Architecture

### Backend
- **Framework**: Node.js with Express
- **Database**: SQLite for lightweight deployment
- **Authentication**: Session-based with bcrypt
- **File Storage**: Local filesystem with multer
- **Transcoding**: FFmpeg with HLS output
- **Process Management**: PM2 for production

### Frontend
- **Framework**: React 18 with functional components
- **Routing**: React Router v6
- **State Management**: React Context API
- **UI Library**: React Bootstrap
- **Form Handling**: Formik with Yup validation
- **HTTP Client**: Axios with interceptors

### Infrastructure
- **Reverse Proxy**: Nginx (recommended for production)
- **SSL/TLS**: Optional (HTTP-only configuration supported)
- **Storage**: Local filesystem with automatic cleanup
- **Logging**: Console-based with action tracking

## 🚀 Installation

### Prerequisites

```bash
# Required software
Node.js 18+ 
npm 8+
FFmpeg 4.4+
PM2 (for production)
Git

# System requirements
Ubuntu 20.04+ (or similar Linux distribution)
4GB+ RAM
50GB+ storage (depending on transcoding needs)
```

### Step-by-Step Installation

1. **Clone the Repository**
   ```bash
   git clone https://github.com/pokerist/marmaricatv.git
   cd marmaricatv/Marmarica-TV
   ```

2. **Install Dependencies**
   ```bash
   # Backend dependencies
   cd server
   npm install
   
   # Frontend dependencies
   cd ../client
   npm install
   cd ..
   ```

3. **Database Setup**
   ```bash
   # Initialize database tables
   cd server
   node index.js
   # Wait for "Database tables initialized" message, then Ctrl+C
   ```

4. **Run Database Migrations**
   ```bash
   # Add transcoding support
   node scripts/add-transcoding-support.js
   
   # Add channel ordering
   node scripts/add-channel-order.js
   
   # Add transcoding state tracking
   node scripts/add-transcoding-state-tracking.js
   ```

5. **Create Admin User**
   ```bash
   # Generate admin credentials
   node scripts/manage-admin.js create admin
   
   # Or set specific password
   node scripts/manage-admin.js set-password admin YourSecurePassword123
   ```

## ⚙️ Configuration

### Environment Variables

Create `.env` files in both `server/` and `client/` directories:

#### Server Configuration (`server/.env`)
```env
# Server Configuration
NODE_ENV=production
PORT=5000
SESSION_SECRET=your-very-secure-random-string

# Database
DATABASE_PATH=./database.sqlite

# CORS and API
CORS_ORIGIN=http://your-domain.com
API_URL=http://your-domain.com
SERVER_BASE_URL=http://your-domain.com

# File Upload
UPLOAD_DIR=uploads
MAX_FILE_SIZE=5242880

# Transcoding
FFMPEG_PATH=ffmpeg
HLS_OUTPUT_BASE=/var/www/html/hls_stream
CLEANUP_INTERVAL=300000
MAX_SEGMENT_AGE=30000
MAX_CHANNEL_DIR_SIZE=104857600
```

#### Client Configuration (`client/.env`)
```env
# API Configuration
REACT_APP_API_URL=http://your-domain.com/api
REACT_APP_API_TIMEOUT=8000
REACT_APP_API_RETRIES=2

# Upload Configuration
REACT_APP_UPLOADS_URL=http://your-domain.com/uploads
REACT_APP_MAX_UPLOAD_SIZE=5242880
```

### FFmpeg Configuration

Ensure FFmpeg is installed and accessible:
```bash
# Install FFmpeg
sudo apt update
sudo apt install ffmpeg

# Verify installation
ffmpeg -version
```

### Storage Configuration

```bash
# Create HLS output directory
sudo mkdir -p /var/www/html/hls_stream
sudo chown -R $USER:$USER /var/www/html/hls_stream
sudo chmod -R 755 /var/www/html/hls_stream

# Create upload directory
mkdir -p server/uploads
chmod 755 server/uploads
```

## 🚀 Deployment

### Development Deployment

```bash
# Start backend server
cd server
npm run dev

# Start frontend development server (in new terminal)
cd client
npm start
```

Access the application at `http://localhost:3000`

### Production Deployment

1. **Build Frontend**
   ```bash
   cd client
   npm run build
   ```

2. **Configure PM2**
   ```bash
   # Create PM2 ecosystem file
   cp ecosystem.config.js.example ecosystem.config.js
   # Edit with your configuration
   ```

3. **Start with PM2**
   ```bash
   # Start the application
   pm2 start ecosystem.config.js
   
   # Save PM2 configuration
   pm2 save
   pm2 startup
   ```

4. **Nginx Configuration** (Recommended)
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       
       location / {
           proxy_pass http://localhost:5000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
       
       location /hls_stream {
           alias /var/www/html/hls_stream;
           expires 1s;
           add_header Cache-Control "no-cache, no-store, must-revalidate";
       }
       
       location /uploads {
           alias /path/to/server/uploads;
           expires 30d;
           add_header Cache-Control "public, immutable";
       }
   }
   ```

## 🔧 Development

### Development Server

```bash
# Backend development server with auto-reload
cd server
npm run dev

# Frontend development server
cd client
npm start
```

### Code Structure

```
server/
├── controllers/         # Route handlers
├── middleware/         # Authentication & validation
├── models/            # Database models
├── routes/            # API routes
├── services/          # Business logic
├── scripts/           # Database migrations & utilities
└── uploads/           # File uploads

client/
├── src/
│   ├── components/    # Reusable UI components
│   ├── pages/         # Page components
│   ├── services/      # API services
│   ├── contexts/      # React contexts
│   └── utils/         # Utility functions
└── public/            # Static assets
```

### Available Scripts

#### Backend
- `npm run dev` - Development server with nodemon
- `npm start` - Production server
- `npm test` - Run tests (if configured)

#### Frontend
- `npm start` - Development server
- `npm run build` - Production build
- `npm test` - Run tests
- `npm run eject` - Eject from Create React App

## 📊 Maintenance

### Database Maintenance

```bash
# Backup database
cp server/database.sqlite server/database.backup.sqlite

# Check database integrity
sqlite3 server/database.sqlite "PRAGMA integrity_check;"

# Vacuum database (optimize)
sqlite3 server/database.sqlite "VACUUM;"
```

### Log Management

```bash
# View PM2 logs
pm2 logs marmarica-tv-server

# Clear logs
pm2 flush

# Monitor application
pm2 monit
```

### Storage Cleanup

```bash
# Manual cleanup of HLS segments
find /var/www/html/hls_stream -name "*.m4s" -mtime +1 -delete
find /var/www/html/hls_stream -name "*.ts" -mtime +1 -delete

# Check disk usage
du -sh /var/www/html/hls_stream/*
```

### System Health Checks

```bash
# Check application status
pm2 status

# Check system resources
htop

# Check disk space
df -h

# Check FFmpeg processes
ps aux | grep ffmpeg
```

## 🛠️ Troubleshooting

### Common Issues

#### Database Connection Errors
```bash
# Check database file permissions
ls -la server/database.sqlite
chmod 664 server/database.sqlite

# Reinitialize database if corrupted
rm server/database.sqlite
node server/index.js
```

#### Transcoding Issues
```bash
# Check FFmpeg installation
ffmpeg -version

# Check HLS output directory permissions
ls -la /var/www/html/hls_stream
sudo chown -R $USER:$USER /var/www/html/hls_stream
```

#### Authentication Problems
```bash
# Reset admin password
cd server
node scripts/manage-admin.js set-password admin NewPassword123
```

#### File Upload Issues
```bash
# Check upload directory permissions
ls -la server/uploads
chmod 755 server/uploads
```

### Performance Optimization

#### Database Optimization
```bash
# Add indexes for better performance
sqlite3 server/database.sqlite "CREATE INDEX IF NOT EXISTS idx_channels_type ON channels(type);"
sqlite3 server/database.sqlite "CREATE INDEX IF NOT EXISTS idx_channels_category ON channels(category);"
```

#### Memory Management
```bash
# Monitor memory usage
pm2 monit

# Restart application if memory issues
pm2 restart marmarica-tv-server
```

### Error Codes

| Code | Description | Solution |
|------|-------------|----------|
| 500  | Internal server error | Check server logs |
| 404  | Resource not found | Verify URL and data |
| 403  | Authentication failed | Check credentials |
| 400  | Bad request | Validate input data |

## 📝 Manual Actions Required

After code deployment, the following actions must be performed on the production server:

### Database Migration
```bash
cd server
node scripts/add-transcoding-state-tracking.js
```

### Environment Setup
1. Update `.env` files with production values
2. Restart PM2 processes: `pm2 restart all`
3. Verify transcoding directory permissions

### Testing
1. Test admin login functionality
2. Verify channel transcoding works
3. Check file upload capabilities
4. Test device authentication APIs

## 🔐 Security Notes

- All passwords are hashed using bcrypt
- Sessions expire after 12 hours
- Admin routes require authentication
- Client APIs remain publicly accessible
- File uploads are validated and size-limited
- SQL injection protection through parameterized queries

## 📄 License

This project is proprietary software for Marmarica TV operations.

## 🤝 Support

For technical support and deployment assistance, contact the development team.

---

**Version**: 2.0.0  
**Last Updated**: January 2025  
**Compatible Node.js**: 18+  
**Database**: SQLite 3.x
