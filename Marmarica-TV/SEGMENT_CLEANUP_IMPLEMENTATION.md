# IPTV Segment Cleanup Implementation

## Overview
This implementation fixes the critical issue where FFmpeg was not properly deleting HLS segments (.m4s files), causing segment folders to fill up rapidly and creating excessively long playlists.

## Problem Solved
- **Issue**: FFmpeg was generating HLS segments but not deleting old ones
- **Symptoms**: Continuous disk space growth, long .m3u8 playlists, potential playback issues
- **Root Cause**: Missing or incorrect FFmpeg cleanup flags in command generation

## Solution Implementation

### 1. Database Enhancement
Updated the database initialization (`server/scripts/initialize-database.js`) to include mandatory cleanup parameters in all default transcoding profiles:

```javascript
additional_params: '-hls_flags delete_segments+program_date_time+independent_segments+split_by_time -hls_delete_threshold 1'
```

**Key Changes:**
- Modified `insertDefaultProfiles()` to include cleanup flags
- Updated `insertProfile()` to handle the `additional_params` field
- Set minimum `hls_list_size` to 4 for all profiles

### 2. Transcoding Service Enhancement
Enhanced the transcoding service (`server/services/transcoding.js`) with profile-aware command generation:

**New Functions Added:**
- `getTranscodingProfile(profileId)` - Retrieves transcoding profiles from database
- `ensureMandatoryCleanupFlags(command)` - Enforces mandatory cleanup flags
- `generateFFmpegCommand(inputUrl, channelId, profileId)` - Profile-based command generation

**Key Features:**
- **Profile Integration**: Loads user-defined profiles and applies settings
- **Mandatory Flag Enforcement**: Always includes required cleanup flags regardless of profile
- **Segment Filename Fix**: Uses `output_%d.m4s` pattern for proper cleanup
- **Safety Overrides**: Ensures cleanup flags cannot be disabled

### 3. Mandatory Cleanup Flags
The system now enforces these non-negotiable flags:

```bash
-hls_flags delete_segments+program_date_time+independent_segments+split_by_time
-hls_list_size 4  # (minimum, user can set higher)
-hls_delete_threshold 1
-hls_segment_filename output_%d.m4s
```

### 4. Bulk Operations Enhancement
Updated bulk transcoding (`server/services/bulk-transcoding.js`) to support profile assignment:

- Added optional `profileId` parameter to `performBulkTranscoding()`
- Channels can be assigned specific profiles during bulk operations
- Maintains backward compatibility with existing functionality

### 5. Profile-Based Configuration
The system now supports full profile-based transcoding:

**Profile Parameters Applied:**
- Video codec, audio codec, bitrates
- Resolution scaling, presets, tune settings
- GOP size, keyframe intervals
- HLS timing and list size
- Custom additional parameters

**Safety Features:**
- Automatic fallback to default profile if none specified
- Mandatory cleanup flags always enforced
- Minimum segment retention (4 segments)
- Validation of profile settings

## Implementation Details

### FFmpeg Command Structure
The generated FFmpeg command now follows this pattern:

```bash
ffmpeg -i <input_url> \
  -c:v libx264 -preset veryfast -tune zerolatency \
  -b:v 2000k -b:a 128k \
  -g 50 -keyint_min 50 -sc_threshold 0 \
  -c:a aac -f hls \
  -hls_time 4 -hls_playlist_type event \
  -hls_segment_type mpegts \
  -hls_segment_filename output_%d.m4s \
  -hls_start_number_source epoch \
  -hls_list_size 4 \
  -hls_flags delete_segments+program_date_time+independent_segments+split_by_time \
  -hls_delete_threshold 1 \
  output.m3u8
```

### Cleanup Mechanism
1. **FFmpeg Native Cleanup**: Uses built-in FFmpeg flags for automatic segment deletion
2. **Periodic Cleanup**: Existing cleanup scheduler continues as backup
3. **Startup Cleanup**: Cleans stale segments on service restart
4. **Orphaned Directory Cleanup**: Removes directories for inactive channels

### Database Schema
The transcoding profiles table includes:
- `additional_params` field for custom FFmpeg parameters
- Mandatory cleanup flags pre-configured in default profiles
- Profile assignment in channels table (`transcoding_profile_id`)

## Testing and Validation

### Test Script
Created `server/test-segment-cleanup.js` to validate implementation:
- Verifies default profile has cleanup flags
- Tests FFmpeg command generation
- Validates all profile configurations
- Confirms cleanup settings

### Usage
```bash
cd server
node test-segment-cleanup.js
```

## Deployment Instructions

### 1. Database Update
Run the database initialization to update profiles:
```bash
cd server
node scripts/initialize-database.js
```

### 2. Service Restart
Restart the transcoding service to apply changes:
```bash
pm2 restart marmarica-tv
# or
node index.js
```

### 3. Verify Implementation
Run the test script to confirm functionality:
```bash
node test-segment-cleanup.js
```

## Benefits

### Immediate Benefits
- **Automatic Segment Cleanup**: Old segments are deleted automatically
- **Controlled Playlist Length**: Playlists maintain only recent segments
- **Reduced Disk Usage**: Prevents unlimited segment accumulation
- **Improved Performance**: Shorter playlists load faster

### Long-term Benefits
- **Scalable Solution**: Works with any number of channels
- **Profile Flexibility**: Users can customize transcoding while maintaining cleanup
- **System Reliability**: Prevents disk space exhaustion
- **Maintenance Reduction**: Less manual cleanup required

## Compatibility

### Backward Compatibility
- Existing channels continue to work without changes
- Current transcoding jobs are unaffected
- API endpoints remain the same
- No breaking changes to client applications

### Profile Migration
- Existing channels are automatically assigned the default profile
- Custom profiles can be created and assigned
- Bulk operations support profile assignment

## Configuration Options

### Environment Variables
```bash
# Cleanup intervals (existing)
CLEANUP_INTERVAL=300000     # 5 minutes
MAX_SEGMENT_AGE=30000       # 30 seconds
HLS_LIST_SIZE=4             # Minimum segments to keep
ORPHANED_DIR_CLEANUP_AGE=3600000  # 1 hour

# FFmpeg configuration
FFMPEG_PATH=/usr/bin/ffmpeg
HLS_OUTPUT_BASE=/var/www/html/hls_stream
```

### Profile Customization
Administrators can create custom profiles through the admin interface with:
- Custom encoding settings
- Specific quality presets
- Tailored cleanup parameters
- Channel-specific configurations

## Monitoring and Maintenance

### Log Messages
The system now logs:
- Profile usage for each channel
- Cleanup flag enforcement
- Segment deletion activities
- Profile-based transcoding events

### Health Checks
- Verify segment directories don't exceed size limits
- Monitor playlist lengths
- Check cleanup flag presence in active processes
- Validate profile assignments

## Security Considerations

### Mandatory Flags
- Cleanup flags cannot be disabled by user profiles
- System-level safety settings override user customizations
- Segment deletion is enforced regardless of profile settings

### Profile Validation
- Profiles are validated before use
- Malicious parameters are filtered
- Default fallbacks prevent system failures

## Future Enhancements

### Potential Improvements
1. **Real-time Monitoring**: Dashboard for segment cleanup metrics
2. **Advanced Profiles**: More granular control over cleanup behavior
3. **Automatic Tuning**: Dynamic adjustment based on storage capacity
4. **Performance Metrics**: Detailed analytics on cleanup effectiveness

### API Extensions
- Profile management endpoints
- Bulk profile assignment
- Cleanup statistics reporting
- Real-time transcoding status with profile info

## Troubleshooting

### Common Issues
1. **Segments Still Accumulating**: Check FFmpeg logs for cleanup flag presence
2. **Profile Not Found**: Verify database contains default profile
3. **Permission Errors**: Ensure FFmpeg can delete segment files
4. **Disk Space Issues**: Run manual cleanup and check configuration

### Debugging Steps
1. Check profile configuration in database
2. Verify FFmpeg command includes cleanup flags
3. Monitor segment directory sizes
4. Review transcoding logs for errors

## Conclusion

This implementation provides a robust, scalable solution for HLS segment cleanup that:
- Fixes the immediate segment accumulation problem
- Maintains full compatibility with existing systems
- Provides flexible profile-based configuration
- Ensures mandatory cleanup cannot be disabled
- Supports both single-channel and bulk operations

The solution is production-ready and can be deployed immediately to resolve the segment cleanup issues in any IPTV transcoding environment.
