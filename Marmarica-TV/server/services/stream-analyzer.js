const { spawn } = require('child_process');
const path = require('path');

class StreamAnalyzer {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 60 * 60 * 1000; // 1 hour
    this.analysisTimeout = 15000; // 15 seconds
  }

  // Analyze stream using ffprobe
  async analyzeStream(inputUrl, useCache = true) {
    // Check cache first
    if (useCache && this.cache.has(inputUrl)) {
      const cached = this.cache.get(inputUrl);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        console.log(`Using cached analysis for: ${inputUrl}`);
        return cached.analysis;
      }
    }

    console.log(`Analyzing stream: ${inputUrl}`);
    
    try {
      const analysis = await this.performFFprobeAnalysis(inputUrl);
      
      // Cache the result
      this.cache.set(inputUrl, {
        analysis,
        timestamp: Date.now()
      });
      
      return analysis;
      
    } catch (error) {
      console.error('Stream analysis failed:', error);
      
      // Return basic fallback analysis
      return {
        success: false,
        error: error.message,
        streams: [],
        format: {},
        recommendation: this.getBasicFallbackRecommendation()
      };
    }
  }

  // Perform FFprobe analysis
  async performFFprobeAnalysis(inputUrl) {
    return new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_streams',
        '-show_format',
        '-analyzeduration', '3000000',
        '-probesize', '3000000',
        '-timeout', '10000000',
        inputUrl
      ]);

      let stdout = '';
      let stderr = '';
      
      ffprobe.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      ffprobe.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      // Set timeout
      const timeoutId = setTimeout(() => {
        ffprobe.kill('SIGTERM');
        reject(new Error('FFprobe analysis timeout'));
      }, this.analysisTimeout);
      
      ffprobe.on('close', (code) => {
        clearTimeout(timeoutId);
        
        if (code === 0) {
          try {
            const probeData = JSON.parse(stdout);
            const analysis = this.parseFFprobeData(probeData);
            resolve(analysis);
          } catch (parseError) {
            reject(new Error(`Failed to parse FFprobe output: ${parseError.message}`));
          }
        } else {
          reject(new Error(`FFprobe failed with code ${code}: ${stderr}`));
        }
      });
      
      ffprobe.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
    });
  }

  // Parse FFprobe data into structured analysis
  parseFFprobeData(probeData) {
    const analysis = {
      success: true,
      streams: probeData.streams || [],
      format: probeData.format || {},
      video: null,
      audio: null,
      recommendation: null,
      stability: {
        hasCleanHeaders: true,
        hasTimestamps: true,
        isStable: true,
        issues: []
      }
    };

    // Find video stream
    analysis.video = this.findVideoStream(analysis.streams);
    
    // Find audio stream  
    analysis.audio = this.findAudioStream(analysis.streams);
    
    // Assess stream stability
    analysis.stability = this.assessStreamStability(analysis);
    
    // Generate recommendation
    analysis.recommendation = this.generateRecommendation(analysis);
    
    return analysis;
  }

  // Find primary video stream
  findVideoStream(streams) {
    const videoStream = streams.find(s => s.codec_type === 'video');
    
    if (!videoStream) return null;
    
    return {
      codec: videoStream.codec_name,
      profile: videoStream.profile,
      level: videoStream.level,
      width: videoStream.width,
      height: videoStream.height,
      frameRate: this.parseFrameRate(videoStream.r_frame_rate),
      bitrate: parseInt(videoStream.bit_rate) || null,
      pixelFormat: videoStream.pix_fmt,
      hasExtraData: !!videoStream.extradata,
      isAnnexB: videoStream.codec_name === 'h264' && 
                (videoStream.extradata_size > 0 || videoStream.profile),
      tags: videoStream.tags || {}
    };
  }

  // Find primary audio stream
  findAudioStream(streams) {
    const audioStream = streams.find(s => s.codec_type === 'audio');
    
    if (!audioStream) return null;
    
    return {
      codec: audioStream.codec_name,
      sampleRate: parseInt(audioStream.sample_rate),
      channels: audioStream.channels,
      bitrate: parseInt(audioStream.bit_rate) || null,
      profile: audioStream.profile,
      tags: audioStream.tags || {}
    };
  }

  // Parse frame rate string
  parseFrameRate(frameRateStr) {
    if (!frameRateStr) return null;
    
    const parts = frameRateStr.split('/');
    if (parts.length === 2) {
      const numerator = parseInt(parts[0]);
      const denominator = parseInt(parts[1]);
      return denominator > 0 ? numerator / denominator : null;
    }
    
    return parseFloat(frameRateStr) || null;
  }

  // Assess stream stability for transcoding
  assessStreamStability(analysis) {
    const stability = {
      hasCleanHeaders: true,
      hasTimestamps: true,
      isStable: true,
      issues: [],
      score: 1.0
    };

    // Check for H.264 specific issues
    if (analysis.video?.codec === 'h264') {
      // Check for SPS/PPS availability
      if (!analysis.video.hasExtraData && !analysis.video.isAnnexB) {
        stability.hasCleanHeaders = false;
        stability.issues.push('Missing SPS/PPS headers');
        stability.score -= 0.3;
      }
      
      // Check for unusual profiles
      if (analysis.video.profile && 
          !['baseline', 'main', 'high'].includes(analysis.video.profile.toLowerCase())) {
        stability.issues.push(`Unusual H.264 profile: ${analysis.video.profile}`);
        stability.score -= 0.1;
      }
    }

    // Check for container issues
    if (analysis.format.format_name?.includes('mpegts') && 
        analysis.format.probe_score < 100) {
      stability.issues.push('Low container probe score');
      stability.score -= 0.2;
    }

    // Check for missing timestamps
    if (!analysis.format.start_time || analysis.format.start_time === 'N/A') {
      stability.hasTimestamps = false;
      stability.issues.push('Missing or invalid timestamps');
      stability.score -= 0.2;
    }

    // Overall stability assessment
    stability.isStable = stability.score >= 0.7;
    
    return stability;
  }

  // Generate transcoding recommendation
  generateRecommendation(analysis) {
    const recommendation = {
      segmentType: 'mpegts', // Default to mpegts for stability
      videoCodec: 'libx264',
      audioCodec: 'aac',
      preset: 'ultrafast',
      tune: 'zerolatency',
      profile: 'baseline',
      level: '3.1',
      resolution: 'original',
      framerate: 'original',
      videoBitrate: 'original',
      audioBitrate: '128k',
      keyframeInterval: 2,
      hlsTime: 2,
      hlsListSize: 3,
      additionalFlags: [],
      confidence: 0.8
    };

    // Adjust based on input analysis
    if (analysis.video) {
      // Resolution handling
      if (analysis.video.width && analysis.video.height) {
        if (analysis.video.width > 1920 || analysis.video.height > 1080) {
          recommendation.resolution = '1080p';
          recommendation.videoBitrate = '4000k';
        } else if (analysis.video.width > 1280 || analysis.video.height > 720) {
          recommendation.resolution = '720p';
          recommendation.videoBitrate = '2500k';
        } else {
          recommendation.resolution = 'original';
        }
      }

      // Bitrate handling
      if (analysis.video.bitrate) {
        const inputBitrate = Math.round(analysis.video.bitrate / 1000);
        if (inputBitrate > 8000) {
          recommendation.videoBitrate = '4000k';
        } else if (inputBitrate > 4000) {
          recommendation.videoBitrate = '2500k';
        } else if (inputBitrate > 1000) {
          recommendation.videoBitrate = `${Math.round(inputBitrate * 0.8)}k`;
        }
      }

      // Frame rate optimization
      if (analysis.video.frameRate) {
        if (analysis.video.frameRate > 30) {
          recommendation.framerate = '30';
        } else if (analysis.video.frameRate > 25) {
          recommendation.framerate = '25';
        }
      }

      // Codec-specific optimizations
      if (analysis.video.codec === 'h264' && analysis.stability.isStable) {
        // For stable H.264, we might use fmp4 segments
        if (analysis.stability.score > 0.9) {
          recommendation.segmentType = 'fmp4';
          recommendation.confidence = 0.9;
        }
      }
    }

    // Audio optimization
    if (analysis.audio) {
      if (analysis.audio.codec === 'aac') {
        recommendation.audioCodec = 'copy';
      } else if (analysis.audio.codec === 'mp3') {
        recommendation.audioCodec = 'copy';
      }
      
      // Preserve original audio bitrate if reasonable
      if (analysis.audio.bitrate && analysis.audio.bitrate <= 192000) {
        recommendation.audioBitrate = `${Math.round(analysis.audio.bitrate / 1000)}k`;
      }
    }

    // Stability-based adjustments
    if (!analysis.stability.isStable) {
      recommendation.segmentType = 'mpegts'; // Force mpegts for unstable streams
      recommendation.preset = 'ultrafast';
      recommendation.tune = 'zerolatency';
      recommendation.additionalFlags.push('-avoid_negative_ts', 'make_zero');
      recommendation.additionalFlags.push('-fflags', '+genpts+igndts');
      recommendation.confidence = 0.6;
    }

    return recommendation;
  }

  // Get basic fallback recommendation when analysis fails
  getBasicFallbackRecommendation() {
    return {
      segmentType: 'mpegts',
      videoCodec: 'libx264',
      audioCodec: 'aac',
      preset: 'ultrafast',
      tune: 'zerolatency',
      profile: 'baseline',
      level: '3.1',
      resolution: '720p',
      framerate: '25',
      videoBitrate: '2000k',
      audioBitrate: '128k',
      keyframeInterval: 2,
      hlsTime: 2,
      hlsListSize: 3,
      additionalFlags: ['-avoid_negative_ts', 'make_zero', '-fflags', '+genpts+igndts'],
      confidence: 0.4
    };
  }

  // Clear cache
  clearCache() {
    this.cache.clear();
  }

  // Get cache statistics
  getCacheStats() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys())
    };
  }
}

module.exports = StreamAnalyzer;
