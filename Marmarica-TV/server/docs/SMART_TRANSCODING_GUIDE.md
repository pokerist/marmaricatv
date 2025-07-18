# Smart Transcoding System Guide

## Overview

The Smart Transcoding System is an advanced FFmpeg-based live HLS transcoding pipeline that intelligently addresses codec parameter issues and provides automatic fallback mechanisms for problematic input streams.

## Problem Statement

The original issue was that FFmpeg would fail with the error:
```
Could not write header (incorrect codec parameters ?): Invalid argument
```

This typically occurred when:
- Input streams lacked early SPS/PPS headers
- Using `-hls_segment_type fmp4` format
- Streams had initial decoding issues

## Solution

The Smart Transcoding System addresses this by:

1. **Segment Type Migration**: Automatically converts from `fmp4` to `mpegts` format
2. **Stream Analysis**: Analyzes input streams to determine optimal encoding parameters
3. **Intelligent Fallback**: Provides multiple fallback levels when transcoding fails
4. **Adaptive Profiles**: Generates dynamic transcoding profiles based on stream characteristics

## Key Components

### 1. Stream Analyzer (`services/stream-analyzer.js`)
- **Purpose**: Analyzes input streams using FFprobe
- **Functions**:
  - Video/audio codec detection
  - Bitrate analysis
  - Resolution detection
  - Stream health assessment
  - Format compatibility checking

### 2. Dynamic Profile Generator (`services/dynamic-profile-generator.js`)
- **Purpose**: Creates transcoding profiles based on stream analysis
- **Functions**:
  - Optimal bitrate calculation
  - Codec selection
  - Resolution scaling
  - HLS parameter optimization
  - Fallback profile generation

### 3. Fallback Manager (`services/fallback-manager.js`)
- **Purpose**: Manages fallback strategies when transcoding fails
- **Functions**:
  - Progressive fallback levels
  - Error pattern recognition
  - Success tracking and learning
  - Retry logic with delays

### 4. Smart Transcoding Engine (`services/smart-transcoding.js`)
- **Purpose**: Orchestrates the entire smart transcoding process
- **Functions**:
  - Integration with existing transcoding service
  - Profile caching and management
  - Process monitoring and recovery
  - Database integration

## Key Changes Made

### 1. Segment Type Migration
**Before:**
```bash
-hls_segment_type fmp4
-hls_segment_filename /var/www/html/hls_stream/channel_56/output_%d.m4s
```

**After:**
```bash
-hls_segment_type mpegts
-hls_segment_filename /var/www/html/hls_stream/channel_56/output_%d.ts
```

### 2. Database Schema Updates
- Added `stream_analysis_cache` table for caching stream analysis results
- Added `fallback_tracking` table for tracking fallback attempts
- Added smart transcoding columns to existing tables
- Updated default segment types to `mpegts`

### 3. API Endpoints
New endpoints under `/api/smart-transcoding/`:
- `POST /analyze/:channelId` - Analyze stream
- `POST /profile/:channelId` - Generate dynamic profile
- `POST /start/:channelId` - Start smart transcoding
- `POST /stop/:channelId` - Stop smart transcoding
- `GET /stats` - Get system statistics
- `GET /fallback/:channelId` - Get fallback statistics

## Configuration

### Environment Variables

```bash
# Smart Transcoding Configuration
ENABLE_SMART_TRANSCODING=true
HLS_OUTPUT_BASE=/var/www/html/hls_stream
FFMPEG_PATH=ffmpeg
SERVER_BASE_URL=http://192.168.1.15:5000

# Analysis Configuration
STREAM_ANALYSIS_TIMEOUT=30000
ANALYSIS_CACHE_DURATION=3600000

# Fallback Configuration
MAX_FALLBACK_LEVEL=3
FALLBACK_DELAY_L1=2000
FALLBACK_DELAY_L2=5000
FALLBACK_DELAY_L3=10000
```

### Database Configuration

The system automatically creates the following tables:
- `stream_analysis_cache`
- `fallback_tracking`
- `smart_transcoding_config`

## Usage

### 1. Initialize Smart Transcoding

```bash
# Initialize the database schema
curl -X POST http://localhost:5000/api/smart-transcoding/init
```

### 2. Analyze a Stream

```bash
# Analyze stream for channel 1
curl -X POST http://localhost:5000/api/smart-transcoding/analyze/1 \
  -H "Content-Type: application/json" \
  -d '{"forceRefresh": false}'
```

### 3. Generate Dynamic Profile

```bash
# Generate profile for channel 1
curl -X POST http://localhost:5000/api/smart-transcoding/profile/1 \
  -H "Content-Type: application/json" \
  -d '{"options": {"targetBitrate": "2M", "resolution": "720p"}}'
```

### 4. Start Smart Transcoding

```bash
# Start transcoding for channel 1
curl -X POST http://localhost:5000/api/smart-transcoding/start/1 \
  -H "Content-Type: application/json" \
  -d '{"options": {"enableFallback": true}}'
```

### 5. Use with Traditional Transcoding

```bash
# Start transcoding with smart mode enabled
curl -X POST http://localhost:5000/api/transcoding/start/1 \
  -H "Content-Type: application/json" \
  -d '{"useSmartTranscoding": true}'
```

## Fallback Levels

The system provides three fallback levels:

### Level 1: Codec Optimization
- Switch to more compatible codecs (H.264 baseline)
- Reduce quality settings
- Adjust GOP size

### Level 2: Resolution Scaling
- Reduce output resolution
- Lower bitrate targets
- Simplify encoding parameters

### Level 3: Emergency Mode
- Minimal quality settings
- Copy codecs where possible
- Maximum compatibility mode

## Monitoring and Statistics

### System Statistics
```bash
curl http://localhost:5000/api/smart-transcoding/stats
```

Response:
```json
{
  "success": true,
  "data": {
    "system": {
      "activeProcesses": 5,
      "smartModeEnabled": true,
      "cacheStats": {...},
      "fallbackStats": {...}
    },
    "database": {
      "total_jobs": 150,
      "smart_jobs": 75,
      "fallback_jobs": 12,
      "avg_confidence": 0.85
    }
  }
}
```

### Channel Health
```bash
curl http://localhost:5000/api/smart-transcoding/health/1
```

## Troubleshooting

### Common Issues

#### 1. FFmpeg Still Failing
**Symptoms**: Transcoding fails even with smart mode
**Solutions**:
- Check FFmpeg version and codec support
- Verify input stream accessibility
- Review fallback settings
- Check logs for specific error patterns

#### 2. High CPU Usage
**Symptoms**: System performance degradation
**Solutions**:
- Adjust analysis timeout settings
- Reduce concurrent transcoding processes
- Optimize profile generation parameters
- Enable analysis caching

#### 3. Segment Type Issues
**Symptoms**: Players can't load segments
**Solutions**:
- Verify web server configuration for .ts files
- Check MIME type mappings
- Ensure proper file permissions
- Validate HLS manifest format

### Debug Mode

Enable debug logging:
```bash
NODE_ENV=development DEBUG=smart-transcoding* npm start
```

### Database Cleanup

```bash
# Clean up old analysis cache
curl -X DELETE http://localhost:5000/api/smart-transcoding/cache/1

# Reset fallback tracking
curl -X POST http://localhost:5000/api/smart-transcoding/fallback/reset/1
```

## Performance Optimization

### 1. Analysis Caching
- Cache duration: 1 hour by default
- Reduces repeated analysis of stable streams
- Automatic cache invalidation on stream changes

### 2. Profile Reuse
- Successful profiles are remembered
- Automatic profile recommendation
- Reduced processing time for known streams

### 3. Batch Operations
- Bulk transcoding support
- Staggered process starts
- Resource usage optimization

## Integration with Existing System

The smart transcoding system integrates seamlessly with the existing transcoding infrastructure:

1. **Backward Compatibility**: Traditional transcoding still works
2. **Gradual Migration**: Channels can be migrated individually
3. **Fallback Support**: Falls back to traditional transcoding on failure
4. **Profile Migration**: Existing profiles are automatically updated

## Security Considerations

1. **Input Validation**: All URLs and parameters are validated
2. **Process Isolation**: Each transcoding process runs independently
3. **Resource Limits**: CPU and memory usage monitoring
4. **Error Handling**: Graceful degradation on failures

## Future Enhancements

1. **Machine Learning**: Adaptive profile learning
2. **Load Balancing**: Multiple transcoding servers
3. **Advanced Analytics**: Stream quality metrics
4. **Real-time Monitoring**: Live performance dashboards

## Support and Maintenance

### Log Files
- Application logs: Check server console output
- FFmpeg logs: Stored in transcoding job records
- Analysis logs: Cached in database

### Maintenance Tasks
- Regular cleanup of old cache entries
- Performance monitoring and optimization
- Database maintenance and backups
- FFmpeg version updates

For additional support, check the application logs and database records for detailed error information.
