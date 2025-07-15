const { URL } = require('url');

// Security constraints for M3U8 import
const M3U8_CONSTRAINTS = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_ENTRIES: 1000,
  MAX_NAME_LENGTH: 100,
  MAX_URL_LENGTH: 2048,
  ALLOWED_PROTOCOLS: ['http:', 'https:', 'udp:'],
  BLOCKED_DOMAINS: ['localhost', '127.0.0.1', '0.0.0.0', 'local'],
  ALLOWED_EXTENSIONS: ['.m3u8', '.ts', '.mp4', '.flv', '.m4s', '.mkv', '.avi', '.mov', '.webm'],
  BLOCKED_EXTENSIONS: ['.exe', '.bat', '.sh', '.cmd', '.scr', '.pif', '.php', '.html', '.htm', '.js', '.css'],
  ALLOWED_CATEGORIES: [
    'Religious', 'News', 'Movies', 'Family', 'Sports',
    'Entertainment', 'Kids', 'Documentary', 'Music', 'General'
  ]
};

/**
 * Validates and sanitizes channel name
 * @param {string} name - Channel name to validate
 * @returns {Object} - {isValid: boolean, sanitized: string, error: string}
 */
const validateChannelName = (name) => {
  if (!name || typeof name !== 'string') {
    return { isValid: false, sanitized: '', error: 'Channel name is required' };
  }

  // Remove dangerous characters and trim
  let sanitized = name
    .trim()
    .replace(/[<>\"'&]/g, '') // Remove HTML/script dangerous chars
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .substring(0, M3U8_CONSTRAINTS.MAX_NAME_LENGTH);

  if (sanitized.length === 0) {
    return { isValid: false, sanitized: '', error: 'Channel name cannot be empty after sanitization' };
  }

  if (sanitized.length < 2) {
    return { isValid: false, sanitized: '', error: 'Channel name must be at least 2 characters long' };
  }

  return { isValid: true, sanitized, error: null };
};

/**
 * Validates and sanitizes channel URL
 * @param {string} url - Channel URL to validate
 * @returns {Object} - {isValid: boolean, sanitized: string, error: string}
 */
const validateChannelUrl = (url) => {
  if (!url || typeof url !== 'string') {
    return { isValid: false, sanitized: '', error: 'Channel URL is required' };
  }

  // Basic sanitization
  let sanitized = url.trim();

  // Check length
  if (sanitized.length > M3U8_CONSTRAINTS.MAX_URL_LENGTH) {
    return { isValid: false, sanitized: '', error: 'URL is too long' };
  }

  // Check for blocked extensions first
  const hasBlockedExtension = M3U8_CONSTRAINTS.BLOCKED_EXTENSIONS.some(ext => 
    sanitized.toLowerCase().includes(ext)
  );
  if (hasBlockedExtension) {
    return { isValid: false, sanitized: '', error: 'URL contains blocked file extension' };
  }

  try {
    const urlObj = new URL(sanitized);
    
    // Check if URL has an allowed extension (for streaming URLs)
    const pathname = urlObj.pathname.toLowerCase();
    const hasAllowedExtension = M3U8_CONSTRAINTS.ALLOWED_EXTENSIONS.some(ext => 
      pathname.endsWith(ext)
    );
    
    // Only require allowed extensions for URLs that look like direct file links
    // Allow URLs without extensions (like API endpoints) to pass through
    if (pathname.includes('.') && !hasAllowedExtension) {
      return { 
        isValid: false, 
        sanitized: '', 
        error: `URL must have a valid streaming extension. Allowed: ${M3U8_CONSTRAINTS.ALLOWED_EXTENSIONS.join(', ')}` 
      };
    }
    
    // Check protocol
    if (!M3U8_CONSTRAINTS.ALLOWED_PROTOCOLS.includes(urlObj.protocol)) {
      return { 
        isValid: false, 
        sanitized: '', 
        error: `Protocol ${urlObj.protocol} is not allowed. Allowed protocols: ${M3U8_CONSTRAINTS.ALLOWED_PROTOCOLS.join(', ')}` 
      };
    }

    // Check for blocked domains
    const hostname = urlObj.hostname.toLowerCase();
    const isBlocked = M3U8_CONSTRAINTS.BLOCKED_DOMAINS.some(domain => 
      hostname === domain || hostname.endsWith(`.${domain}`)
    );
    if (isBlocked) {
      return { isValid: false, sanitized: '', error: 'URL domain is blocked' };
    }

    // Check for private IP ranges (basic check)
    if (hostname.match(/^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)/)) {
      return { isValid: false, sanitized: '', error: 'Private IP addresses are not allowed' };
    }

    return { isValid: true, sanitized: urlObj.href, error: null };
  } catch (error) {
    return { isValid: false, sanitized: '', error: 'Invalid URL format' };
  }
};

/**
 * Validates channel category
 * @param {string} category - Channel category to validate
 * @returns {Object} - {isValid: boolean, sanitized: string, error: string}
 */
const validateChannelCategory = (category) => {
  if (!category || typeof category !== 'string') {
    return { isValid: true, sanitized: 'General', error: null }; // Default to General
  }

  const sanitized = category.trim();
  
  if (M3U8_CONSTRAINTS.ALLOWED_CATEGORIES.includes(sanitized)) {
    return { isValid: true, sanitized, error: null };
  }

  return { isValid: true, sanitized: 'General', error: null }; // Default to General if invalid
};

/**
 * Validates channel type
 * @param {string} type - Channel type to validate
 * @returns {Object} - {isValid: boolean, sanitized: string, error: string}
 */
const validateChannelType = (type) => {
  const allowedTypes = ['FTA', 'BeIN', 'Local'];
  
  if (!type || typeof type !== 'string') {
    return { isValid: true, sanitized: 'FTA', error: null }; // Default to FTA
  }

  const sanitized = type.trim();
  
  if (allowedTypes.includes(sanitized)) {
    return { isValid: true, sanitized, error: null };
  }

  return { isValid: true, sanitized: 'FTA', error: null }; // Default to FTA if invalid
};

/**
 * Validates a single channel entry
 * @param {Object} channelData - Channel data to validate
 * @returns {Object} - {isValid: boolean, sanitized: Object, errors: Array}
 */
const validateChannelEntry = (channelData) => {
  const errors = [];
  const sanitized = {};

  // Validate name
  const nameValidation = validateChannelName(channelData.name);
  if (!nameValidation.isValid) {
    errors.push(`Name: ${nameValidation.error}`);
  }
  sanitized.name = nameValidation.sanitized;

  // Validate URL
  const urlValidation = validateChannelUrl(channelData.url);
  if (!urlValidation.isValid) {
    errors.push(`URL: ${urlValidation.error}`);
  }
  sanitized.url = urlValidation.sanitized;

  // Validate category
  const categoryValidation = validateChannelCategory(channelData.category);
  sanitized.category = categoryValidation.sanitized;

  // Validate type
  const typeValidation = validateChannelType(channelData.type);
  sanitized.type = typeValidation.sanitized;

  // Set defaults for other fields
  sanitized.has_news = Boolean(channelData.has_news);
  sanitized.transcoding_enabled = Boolean(channelData.transcoding_enabled);

  return {
    isValid: errors.length === 0,
    sanitized,
    errors
  };
};

/**
 * Validates file size
 * @param {number} fileSize - File size in bytes
 * @returns {Object} - {isValid: boolean, error: string}
 */
const validateFileSize = (fileSize) => {
  if (!fileSize || typeof fileSize !== 'number') {
    return { isValid: false, error: 'Invalid file size' };
  }

  if (fileSize > M3U8_CONSTRAINTS.MAX_FILE_SIZE) {
    return { 
      isValid: false, 
      error: `File size ${Math.round(fileSize / 1024 / 1024)}MB exceeds maximum allowed size of ${Math.round(M3U8_CONSTRAINTS.MAX_FILE_SIZE / 1024 / 1024)}MB` 
    };
  }

  return { isValid: true, error: null };
};

/**
 * Validates number of entries
 * @param {number} entryCount - Number of entries
 * @returns {Object} - {isValid: boolean, error: string}
 */
const validateEntryCount = (entryCount) => {
  if (!entryCount || typeof entryCount !== 'number') {
    return { isValid: false, error: 'Invalid entry count' };
  }

  if (entryCount > M3U8_CONSTRAINTS.MAX_ENTRIES) {
    return { 
      isValid: false, 
      error: `Number of entries ${entryCount} exceeds maximum allowed ${M3U8_CONSTRAINTS.MAX_ENTRIES}` 
    };
  }

  if (entryCount === 0) {
    return { isValid: false, error: 'No valid entries found in file' };
  }

  return { isValid: true, error: null };
};

/**
 * Detects duplicate channels based on name and URL
 * @param {Array} channels - Array of channel objects
 * @param {Array} existingChannels - Array of existing channel objects from database
 * @returns {Object} - {duplicates: Array, unique: Array}
 */
const detectDuplicates = (channels, existingChannels = []) => {
  const duplicates = [];
  const unique = [];
  const seen = new Set();

  // Create lookup maps for existing channels
  const existingByName = new Map();
  const existingByUrl = new Map();
  
  existingChannels.forEach(channel => {
    existingByName.set(channel.name.toLowerCase(), channel);
    existingByUrl.set(channel.url.toLowerCase(), channel);
  });

  channels.forEach((channel, index) => {
    const nameKey = channel.name.toLowerCase();
    const urlKey = channel.url.toLowerCase();
    const combinedKey = `${nameKey}||${urlKey}`;

    // Check against existing database entries
    if (existingByName.has(nameKey) || existingByUrl.has(urlKey)) {
      duplicates.push({
        ...channel,
        index,
        reason: 'Already exists in database',
        existing: existingByName.get(nameKey) || existingByUrl.get(urlKey)
      });
      return;
    }

    // Check against current import batch
    if (seen.has(combinedKey)) {
      duplicates.push({
        ...channel,
        index,
        reason: 'Duplicate in import file'
      });
      return;
    }

    seen.add(combinedKey);
    unique.push({ ...channel, index });
  });

  return { duplicates, unique };
};

/**
 * Validates bulk channel import data
 * @param {Array} channels - Array of channel objects to validate
 * @param {Array} existingChannels - Array of existing channels from database
 * @returns {Object} - Validation results
 */
const validateBulkImport = (channels, existingChannels = []) => {
  const results = {
    isValid: true,
    totalEntries: channels.length,
    validEntries: [],
    invalidEntries: [],
    duplicates: [],
    summary: {
      valid: 0,
      invalid: 0,
      duplicates: 0
    }
  };

  // Validate entry count
  const entryCountValidation = validateEntryCount(channels.length);
  if (!entryCountValidation.isValid) {
    results.isValid = false;
    results.globalError = entryCountValidation.error;
    return results;
  }

  // Validate each channel entry
  channels.forEach((channel, index) => {
    const validation = validateChannelEntry(channel);
    
    if (validation.isValid) {
      results.validEntries.push({
        ...validation.sanitized,
        originalIndex: index
      });
    } else {
      results.invalidEntries.push({
        originalIndex: index,
        data: channel,
        errors: validation.errors
      });
    }
  });

  // Detect duplicates among valid entries
  const duplicateCheck = detectDuplicates(results.validEntries, existingChannels);
  results.validEntries = duplicateCheck.unique;
  results.duplicates = duplicateCheck.duplicates;

  // Update summary
  results.summary.valid = results.validEntries.length;
  results.summary.invalid = results.invalidEntries.length;
  results.summary.duplicates = results.duplicates.length;

  // Overall validation result
  results.isValid = results.validEntries.length > 0;

  return results;
};

module.exports = {
  M3U8_CONSTRAINTS,
  validateChannelName,
  validateChannelUrl,
  validateChannelCategory,
  validateChannelType,
  validateChannelEntry,
  validateFileSize,
  validateEntryCount,
  detectDuplicates,
  validateBulkImport
};
