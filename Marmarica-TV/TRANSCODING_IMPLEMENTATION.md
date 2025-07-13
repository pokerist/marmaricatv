# IPTV Transcoding Implementation (LL-HLS)

This document describes the implementation of dynamic, on-demand transcoding support for live channels using FFmpeg and LL-HLS in the Marmarica TV admin panel.

## Overview

The transcoding feature allows administrators to:
- Enable/disable LL-HLS transcoding for individual channels
- Monitor transcoding status in real-time
- Manage transcoding jobs (start, stop, restart)
- View transcoded stream URLs
- Automatically restart transcoding on server startup

## Architecture

### Backend Components

#### 1. Database Schema Changes
- **channels table**: Added `transcoding_enabled`, `transcoded_url`, `transcoding_status`, `order_index` columns
- **transcoding_jobs table**: New table to track active transcoding processes

#### 2. Transcoding Service (`server/services/transcoding.js`)
- **Process Management**: Spawn, monitor, and manage FFmpeg processes
- **Directory Management**: Create and cleanup HLS output directories
- **Status Tracking**: Update database with transcoding status
- **Error Handling**: Restart failed processes automatically
- **Graceful Shutdown**: Clean termination of all processes

#### 3. API Endpoints (`server/routes/transcoding.js`)
- `GET /api/transcoding/jobs` - Get active transcoding jobs
- `GET /api/transcoding/status/:channelId` - Get channel transcoding status
- `POST /api/transcoding/start/:channelId` - Start transcoding
- `POST /api/transcoding/stop/:channelId` - Stop transcoding
- `POST /api/transcoding/restart/:channelId` - Restart transcoding
- `POST /api/transcoding/toggle/:channelId` - Toggle transcoding on/off
- `GET /api/transcoding/history/:channelId` - Get transcoding history
- `GET /api/transcoding/stats` - Get transcoding statistics

#### 4. Updated Channel Routes (`server/routes/channels.js`)
- Integrated transcoding service calls in create/update/delete operations
- Automatic transcoding management based on channel settings

### Frontend Components

#### 1. Channel Form (`client/src/pages/channels/ChannelForm.js`)
- **Transcoding Toggle**: Switch to enable/disable transcoding
- **Status Display**: Show current transcoding status with badges
- **Real-time Updates**: Display transcoding URL when available
- **User-friendly Interface**: Clear explanations and notifications

#### 2. Channel List (`client/src/pages/channels/ChannelsList.js`)
- **Status Column**: Visual indicators for transcoding status
- **Quick Controls**: Enable/disable/restart transcoding buttons
- **Status Badges**: Color-coded status indicators
- **Bulk Management**: Manage multiple channels efficiently

#### 3. API Service (`client/src/services/api.js`)
- **Transcoding API**: Complete API client for transcoding operations
- **Error Handling**: Robust error handling with user notifications
- **Retry Logic**: Automatic retry for failed requests

## FFmpeg Configuration

The implementation uses the following FFmpeg command for LL-HLS transcoding:

```bash
ffmpeg -i "<input_url>" \
  -c:v libx264 -preset veryfast -tune zerolatency -g 12 -keyint_min 12 -sc_threshold 0 \
  -c:a aac -b:a 128k \
  -f hls \
  -hls_time 0.5 \
  -hls_playlist_type event \
  -hls_flags independent_segments+delete_segments+append_list+split_by_time+program_date_time \
  -hls_segment_type fmp4 \
  -hls_segment_filename "/var/www/html/hls_stream/<channel_id>/output_%03d.m4s" \
  -hls_start_number_source epoch \
  -hls_list_size 6 \
  -hls_delete_threshold 1 \
  /var/www/html/hls_stream/<channel_id>/output.m3u8
```

### Key Parameters:
- **Low Latency**: 0.5 second segments with zerolatency tune
- **Efficient Encoding**: H.264 with veryfast preset
- **Adaptive Bitrate**: AAC audio at 128k
- **Segment Management**: Automatic cleanup of old segments
- **Format**: fMP4 segments for better compatibility

## File Structure

```
server/
├── services/
│   └── transcoding.js          # Core transcoding service
├── routes/
│   ├── transcoding.js          # Transcoding API routes
│   └── channels.js             # Updated channel routes
├── scripts/
│   └── add-transcoding-support.js  # Database migration
└── index.js                    # Updated server entry point

client/src/
├── services/
│   └── api.js                  # Updated API client
└── pages/channels/
    ├── ChannelForm.js          # Updated form with transcoding
    └── ChannelsList.js         # Updated list with transcoding
```

## Setup Instructions

### 1. Database Migration
Run the database migration script to add transcoding support:
```bash
cd server
node scripts/add-transcoding-support.js
```

### 2. Environment Variables
Add the following environment variables to your `.env` file:
```env
HLS_OUTPUT_BASE=/var/www/html/hls_stream
FFMPEG_PATH=ffmpeg
```

### 3. Directory Setup
Create the HLS output directory:
```bash
sudo mkdir -p /var/www/html/hls_stream
sudo chown -R www-data:www-data /var/www/html/hls_stream
```

### 4. FFmpeg Installation
Ensure FFmpeg is installed on your system:
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install ffmpeg

# CentOS/RHEL
sudo yum install ffmpeg
```

### 5. Server Restart
Restart the server to apply changes:
```bash
cd server
npm install  # If any new dependencies were added
npm start
```

## Usage

### Enabling Transcoding
1. Navigate to Channels → Add/Edit Channel
2. Toggle "Enable LL-HLS Transcoding"
3. Save the channel
4. Transcoding will start automatically

### Managing Transcoding
1. Go to Channels list
2. Use the Transcoding column to:
   - View current status
   - Start/stop transcoding
   - Restart failed processes

### Accessing Transcoded Streams
Transcoded streams are available at:
```
http://your-server.com/hls_stream/channel_[ID]/output.m3u8
```

## Status Indicators

- **🟢 Active**: Transcoding is running successfully
- **🟡 Starting**: Transcoding is initializing
- **🟡 Stopping**: Transcoding is being stopped
- **🔴 Failed**: Transcoding encountered an error
- **⚫ Inactive**: Transcoding is stopped
- **⚫ Disabled**: Transcoding is not enabled

## Monitoring & Troubleshooting

### Log Files
Monitor server logs for transcoding activity:
```bash
cd server
npm start 2>&1 | grep -i transcoding
```

### Common Issues

1. **FFmpeg Not Found**
   - Ensure FFmpeg is installed and in PATH
   - Set `FFMPEG_PATH` environment variable

2. **Permission Denied**
   - Check directory permissions for HLS output
   - Ensure server has write access

3. **Process Failures**
   - Check input stream availability
   - Verify FFmpeg parameters
   - Monitor system resources

### Performance Monitoring
The system logs transcoding activities and provides statistics through:
- Dashboard metrics
- Action logs
- Individual job status

## Security Considerations

- All transcoding endpoints require authentication
- Only administrators can enable/disable transcoding
- Input URLs are validated before processing
- Output directories are isolated per channel
- Automatic cleanup prevents disk space issues

## Future Enhancements

Potential improvements for future releases:

1. **Quality Profiles**: Multiple transcoding presets (low, medium, high)
2. **Resource Monitoring**: CPU/memory usage tracking
3. **Load Balancing**: Distribute transcoding across multiple servers
4. **Adaptive Bitrate**: Multiple quality streams
5. **Scheduling**: Time-based transcoding activation
6. **Webhooks**: External notifications for status changes

## API Reference

### Transcoding Endpoints

#### Toggle Transcoding
```javascript
POST /api/transcoding/toggle/:channelId
{
  "enabled": true
}
```

#### Get Status
```javascript
GET /api/transcoding/status/:channelId
```

#### Restart Transcoding
```javascript
POST /api/transcoding/restart/:channelId
```

### Response Format
```javascript
{
  "success": true,
  "message": "Operation completed successfully",
  "data": {
    "channelId": 1,
    "status": "active",
    "transcodedUrl": "/hls_stream/channel_1/output.m3u8"
  }
}
```

## Conclusion

This implementation provides a complete transcoding solution that:
- Integrates seamlessly with the existing admin panel
- Offers robust process management
- Provides real-time monitoring
- Ensures system reliability
- Maintains minimal impact on the user workflow

The system is designed to be scalable and maintainable, with clear separation of concerns and comprehensive error handling.
