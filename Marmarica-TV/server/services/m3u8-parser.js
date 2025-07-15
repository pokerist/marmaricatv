const fs = require('fs');
const path = require('path');
const { validateFileSize, validateBulkImport } = require('./input-validator');

/**
 * Parses M3U8 file content and extracts channel information
 * @param {string} content - Raw M3U8 file content
 * @returns {Array} - Array of channel objects
 */
const parseM3U8Content = (content) => {
  const channels = [];
  const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  let currentChannel = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip comments and empty lines
    if (line.startsWith('#') && !line.startsWith('#EXTINF')) {
      continue;
    }
    
    // Parse channel information from #EXTINF line
    if (line.startsWith('#EXTINF')) {
      currentChannel = parseExtinfLine(line);
      continue;
    }
    
    // If we have channel info and this line is a URL, create channel entry
    if (currentChannel && isValidUrl(line)) {
      channels.push({
        name: currentChannel.name,
        url: line,
        category: currentChannel.category || 'General',
        type: currentChannel.type || 'FTA',
        has_news: false,
        transcoding_enabled: false
      });
      currentChannel = null;
    }
  }
  
  return channels;
};

/**
 * Parses #EXTINF line to extract channel information
 * @param {string} line - EXTINF line
 * @returns {Object} - Channel information object
 */
const parseExtinfLine = (line) => {
  const channel = {
    name: '',
    category: 'General',
    type: 'FTA'
  };
  
  // Basic EXTINF format: #EXTINF:duration,title
  const match = line.match(/#EXTINF:([^,]*),(.+)/);
  if (!match) {
    return channel;
  }
  
  let title = match[2].trim();
  
  // Extract category from various formats
  // Format: [Category] Channel Name
  const categoryMatch = title.match(/^\[([^\]]+)\]\s*(.+)/);
  if (categoryMatch) {
    channel.category = mapCategory(categoryMatch[1].trim());
    title = categoryMatch[2].trim();
  }
  
  // Format: Category: Channel Name
  const categoryColonMatch = title.match(/^([^:]+):\s*(.+)/);
  if (categoryColonMatch && !categoryMatch) {
    const potentialCategory = categoryColonMatch[1].trim();
    if (isValidCategory(potentialCategory)) {
      channel.category = mapCategory(potentialCategory);
      title = categoryColonMatch[2].trim();
    }
  }
  
  // Extract type from title (BeIN, Local, etc.)
  channel.type = extractChannelType(title);
  
  // Clean up the title
  channel.name = cleanChannelName(title);
  
  return channel;
};

/**
 * Maps category names to standardized categories
 * @param {string} category - Original category name
 * @returns {string} - Standardized category name
 */
const mapCategory = (category) => {
  const categoryMap = {
    'religion': 'Religious',
    'religious': 'Religious',
    'islam': 'Religious',
    'islamic': 'Religious',
    'news': 'News',
    'movie': 'Movies',
    'movies': 'Movies',
    'film': 'Movies',
    'films': 'Movies',
    'sport': 'Sports',
    'sports': 'Sports',
    'entertainment': 'Entertainment',
    'variety': 'Entertainment',
    'music': 'Music',
    'kids': 'Kids',
    'children': 'Kids',
    'cartoon': 'Kids',
    'family': 'Family',
    'documentary': 'Documentary',
    'docu': 'Documentary',
    'general': 'General',
    'misc': 'General',
    'other': 'General'
  };
  
  const normalized = category.toLowerCase().trim();
  return categoryMap[normalized] || 'General';
};

/**
 * Checks if a category is valid
 * @param {string} category - Category to check
 * @returns {boolean} - True if valid category
 */
const isValidCategory = (category) => {
  const commonCategories = [
    'news', 'sport', 'sports', 'movie', 'movies', 'entertainment', 
    'music', 'kids', 'children', 'religious', 'religion', 'documentary',
    'family', 'general'
  ];
  
  return commonCategories.includes(category.toLowerCase().trim());
};

/**
 * Extracts channel type from title
 * @param {string} title - Channel title
 * @returns {string} - Channel type (FTA, BeIN, Local)
 */
const extractChannelType = (title) => {
  const titleLower = title.toLowerCase();
  
  if (titleLower.includes('bein') || titleLower.includes('be in')) {
    return 'BeIN';
  }
  
  if (titleLower.includes('local') || titleLower.includes('arab') || titleLower.includes('egypt')) {
    return 'Local';
  }
  
  return 'FTA';
};

/**
 * Cleans channel name by removing prefixes and suffixes
 * @param {string} name - Original channel name
 * @returns {string} - Cleaned channel name
 */
const cleanChannelName = (name) => {
  let cleaned = name.trim();
  
  // Remove common prefixes
  const prefixes = ['HD', 'FHD', '4K', 'UHD', 'SD'];
  const suffixes = ['HD', 'FHD', '4K', 'UHD', 'SD', 'TV', 'CHANNEL'];
  
  // Remove prefixes
  for (const prefix of prefixes) {
    const regex = new RegExp(`^${prefix}\\s+`, 'i');
    cleaned = cleaned.replace(regex, '');
  }
  
  // Remove suffixes
  for (const suffix of suffixes) {
    const regex = new RegExp(`\\s+${suffix}$`, 'i');
    cleaned = cleaned.replace(regex, '');
  }
  
  // Remove extra whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  return cleaned;
};

/**
 * Basic URL validation
 * @param {string} url - URL to validate
 * @returns {boolean} - True if valid URL format
 */
const isValidUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

/**
 * Parses M3U8 file and returns validated channel data
 * @param {string} filePath - Path to M3U8 file
 * @param {Array} existingChannels - Array of existing channels for duplicate detection
 * @returns {Promise<Object>} - Parsing results
 */
const parseM3U8File = async (filePath, existingChannels = []) => {
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error('File not found');
    }
    
    // Get file stats
    const stats = fs.statSync(filePath);
    
    // Validate file size
    const fileSizeValidation = validateFileSize(stats.size);
    if (!fileSizeValidation.isValid) {
      throw new Error(fileSizeValidation.error);
    }
    
    // Read file content
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Parse M3U8 content
    const parsedChannels = parseM3U8Content(content);
    
    // Validate parsed channels
    const validationResults = validateBulkImport(parsedChannels, existingChannels);
    
    // Clean up temporary file
    try {
      fs.unlinkSync(filePath);
    } catch (cleanupError) {
      console.error('Error cleaning up temporary file:', cleanupError);
    }
    
    return {
      success: true,
      fileName: path.basename(filePath),
      fileSize: stats.size,
      parsedChannels: parsedChannels.length,
      validationResults,
      error: null
    };
    
  } catch (error) {
    // Clean up temporary file on error
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (cleanupError) {
      console.error('Error cleaning up temporary file after error:', cleanupError);
    }
    
    return {
      success: false,
      fileName: path.basename(filePath),
      fileSize: 0,
      parsedChannels: 0,
      validationResults: null,
      error: error.message
    };
  }
};

/**
 * Parses M3U8 content from buffer (for direct upload processing)
 * @param {Buffer} buffer - File buffer
 * @param {string} originalName - Original file name
 * @param {Array} existingChannels - Array of existing channels for duplicate detection
 * @returns {Promise<Object>} - Parsing results
 */
const parseM3U8Buffer = async (buffer, originalName, existingChannels = []) => {
  try {
    // Validate file size
    const fileSizeValidation = validateFileSize(buffer.length);
    if (!fileSizeValidation.isValid) {
      throw new Error(fileSizeValidation.error);
    }
    
    // Convert buffer to string
    const content = buffer.toString('utf8');
    
    // Parse M3U8 content
    const parsedChannels = parseM3U8Content(content);
    
    // Validate parsed channels
    const validationResults = validateBulkImport(parsedChannels, existingChannels);
    
    return {
      success: true,
      fileName: originalName,
      fileSize: buffer.length,
      parsedChannels: parsedChannels.length,
      validationResults,
      error: null
    };
    
  } catch (error) {
    return {
      success: false,
      fileName: originalName,
      fileSize: buffer.length,
      parsedChannels: 0,
      validationResults: null,
      error: error.message
    };
  }
};

/**
 * Generates a preview of parsed channels for user confirmation
 * @param {Object} validationResults - Results from validateBulkImport
 * @returns {Object} - Preview data
 */
const generateImportPreview = (validationResults) => {
  const preview = {
    summary: validationResults.summary,
    sampleValid: validationResults.validEntries.slice(0, 5),
    sampleInvalid: validationResults.invalidEntries.slice(0, 5),
    sampleDuplicates: validationResults.duplicates.slice(0, 5),
    recommendations: []
  };
  
  // Generate recommendations
  if (validationResults.summary.invalid > 0) {
    preview.recommendations.push({
      type: 'warning',
      message: `${validationResults.summary.invalid} entries have validation errors and will be skipped.`
    });
  }
  
  if (validationResults.summary.duplicates > 0) {
    preview.recommendations.push({
      type: 'info',
      message: `${validationResults.summary.duplicates} entries are duplicates and will be skipped.`
    });
  }
  
  if (validationResults.summary.valid === 0) {
    preview.recommendations.push({
      type: 'error',
      message: 'No valid entries found. Please check your M3U8 file format.'
    });
  }
  
  return preview;
};

module.exports = {
  parseM3U8File,
  parseM3U8Buffer,
  parseM3U8Content,
  generateImportPreview
};
