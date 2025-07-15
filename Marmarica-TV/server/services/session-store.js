const redis = require('redis');
const session = require('express-session');
const RedisStore = require('connect-redis')(session);

// Redis configuration
const REDIS_CONFIG = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || null,
  db: process.env.REDIS_DB || 0,
  keyPrefix: process.env.REDIS_KEY_PREFIX || 'marmarica:sess:',
  ttl: process.env.REDIS_TTL || 43200, // 12 hours
  retryDelayOnFailover: 100,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 3,
  lazyConnect: true
};

// Connection pool settings
const POOL_CONFIG = {
  max: 10,
  min: 2,
  acquireTimeoutMillis: 30000,
  createTimeoutMillis: 30000,
  destroyTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  reapIntervalMillis: 1000,
  createRetryIntervalMillis: 200
};

class RedisSessionStore {
  constructor() {
    this.client = null;
    this.store = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 1000;
  }

  // Initialize Redis connection
  async initialize() {
    try {
      console.log('Initializing Redis session store...');
      
      // Create Redis client
      this.client = redis.createClient({
        host: REDIS_CONFIG.host,
        port: REDIS_CONFIG.port,
        password: REDIS_CONFIG.password,
        db: REDIS_CONFIG.db,
        keyPrefix: REDIS_CONFIG.keyPrefix,
        retryDelayOnFailover: REDIS_CONFIG.retryDelayOnFailover,
        enableOfflineQueue: REDIS_CONFIG.enableOfflineQueue,
        maxRetriesPerRequest: REDIS_CONFIG.maxRetriesPerRequest,
        lazyConnect: REDIS_CONFIG.lazyConnect
      });

      // Set up event handlers
      this.setupEventHandlers();

      // Connect to Redis
      await this.connect();

      // Create Redis store
      this.store = new RedisStore({
        client: this.client,
        prefix: REDIS_CONFIG.keyPrefix,
        ttl: REDIS_CONFIG.ttl
      });

      console.log('Redis session store initialized successfully');
      return this.store;

    } catch (error) {
      console.error('Error initializing Redis session store:', error);
      throw error;
    }
  }

  // Setup event handlers
  setupEventHandlers() {
    this.client.on('connect', () => {
      console.log('Redis client connected');
      this.isConnected = true;
      this.reconnectAttempts = 0;
    });

    this.client.on('ready', () => {
      console.log('Redis client ready');
    });

    this.client.on('error', (error) => {
      console.error('Redis client error:', error);
      this.isConnected = false;
      this.handleConnectionError(error);
    });

    this.client.on('end', () => {
      console.log('Redis client connection ended');
      this.isConnected = false;
    });

    this.client.on('reconnecting', () => {
      console.log('Redis client reconnecting...');
      this.reconnectAttempts++;
    });

    this.client.on('warning', (warning) => {
      console.warn('Redis client warning:', warning);
    });
  }

  // Connect to Redis
  async connect() {
    try {
      if (this.isConnected) {
        console.log('Redis already connected');
        return;
      }

      console.log(`Connecting to Redis at ${REDIS_CONFIG.host}:${REDIS_CONFIG.port}`);
      await this.client.connect();
      
      // Test connection
      await this.client.ping();
      console.log('Redis connection test successful');

    } catch (error) {
      console.error('Error connecting to Redis:', error);
      throw error;
    }
  }

  // Handle connection errors
  handleConnectionError(error) {
    console.error('Redis connection error:', error);

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      console.log(`Attempting to reconnect to Redis (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      setTimeout(() => {
        this.connect().catch(err => {
          console.error('Redis reconnection failed:', err);
        });
      }, this.reconnectDelay * Math.pow(2, this.reconnectAttempts)); // Exponential backoff
    } else {
      console.error('Max Redis reconnection attempts reached');
    }
  }

  // Get session store
  getStore() {
    if (!this.store) {
      throw new Error('Redis session store not initialized');
    }
    return this.store;
  }

  // Get Redis client
  getClient() {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }
    return this.client;
  }

  // Check connection status
  isConnectionHealthy() {
    return this.isConnected && this.client && this.client.connected;
  }

  // Get connection info
  getConnectionInfo() {
    return {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts,
      config: {
        host: REDIS_CONFIG.host,
        port: REDIS_CONFIG.port,
        db: REDIS_CONFIG.db,
        keyPrefix: REDIS_CONFIG.keyPrefix,
        ttl: REDIS_CONFIG.ttl
      }
    };
  }

  // Clean up expired sessions manually
  async cleanupExpiredSessions() {
    try {
      if (!this.isConnectionHealthy()) {
        console.log('Redis not connected, skipping session cleanup');
        return;
      }

      const pattern = `${REDIS_CONFIG.keyPrefix}*`;
      const keys = await this.client.keys(pattern);
      
      let expiredCount = 0;
      
      for (const key of keys) {
        const ttl = await this.client.ttl(key);
        if (ttl === -2) { // Key doesn't exist
          expiredCount++;
        }
      }

      console.log(`Session cleanup: found ${keys.length} sessions, ${expiredCount} expired`);
      
      return {
        totalSessions: keys.length,
        expiredSessions: expiredCount
      };

    } catch (error) {
      console.error('Error cleaning up expired sessions:', error);
      return { error: error.message };
    }
  }

  // Get session statistics
  async getSessionStats() {
    try {
      if (!this.isConnectionHealthy()) {
        return { error: 'Redis not connected' };
      }

      const pattern = `${REDIS_CONFIG.keyPrefix}*`;
      const keys = await this.client.keys(pattern);
      
      const stats = {
        totalSessions: keys.length,
        activeSessions: 0,
        expiredSessions: 0,
        memoryUsage: 0
      };

      for (const key of keys) {
        const ttl = await this.client.ttl(key);
        if (ttl > 0) {
          stats.activeSessions++;
        } else if (ttl === -2) {
          stats.expiredSessions++;
        }
      }

      // Get memory usage
      const info = await this.client.info('memory');
      const memoryMatch = info.match(/used_memory:(\d+)/);
      if (memoryMatch) {
        stats.memoryUsage = parseInt(memoryMatch[1]);
      }

      return stats;

    } catch (error) {
      console.error('Error getting session stats:', error);
      return { error: error.message };
    }
  }

  // Graceful shutdown
  async shutdown() {
    try {
      console.log('Shutting down Redis session store...');
      
      if (this.client) {
        await this.client.quit();
        this.client = null;
      }
      
      this.store = null;
      this.isConnected = false;
      
      console.log('Redis session store shutdown completed');
      
    } catch (error) {
      console.error('Error shutting down Redis session store:', error);
    }
  }
}

// Fallback to memory store if Redis is not available
class FallbackSessionStore {
  constructor() {
    console.warn('Using fallback memory store - not recommended for production');
  }

  getStore() {
    // Return the default memory store (not recommended for production)
    return new session.MemoryStore();
  }

  isConnectionHealthy() {
    return true;
  }

  getConnectionInfo() {
    return {
      isConnected: true,
      type: 'memory',
      warning: 'Using memory store - not recommended for production'
    };
  }

  async cleanupExpiredSessions() {
    // Memory store handles this automatically
    return { message: 'Memory store handles cleanup automatically' };
  }

  async getSessionStats() {
    return { message: 'Stats not available for memory store' };
  }

  async shutdown() {
    console.log('Memory store shutdown (no action needed)');
  }
}

// Create session store instance
let sessionStoreInstance = null;

// Initialize session store
const initializeSessionStore = async () => {
  try {
    console.log('Initializing session store...');
    
    // Try Redis first
    try {
      sessionStoreInstance = new RedisSessionStore();
      await sessionStoreInstance.initialize();
      console.log('Session store initialized with Redis');
    } catch (error) {
      console.error('Failed to initialize Redis session store:', error);
      console.log('Falling back to memory store');
      sessionStoreInstance = new FallbackSessionStore();
    }
    
    return sessionStoreInstance;
    
  } catch (error) {
    console.error('Error initializing session store:', error);
    throw error;
  }
};

// Get session store instance
const getSessionStore = () => {
  if (!sessionStoreInstance) {
    throw new Error('Session store not initialized');
  }
  return sessionStoreInstance;
};

// Create session middleware
const createSessionMiddleware = (sessionStore) => {
  const store = sessionStore.getStore();
  
  return session({
    store: store,
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    name: 'marmarica.sid',
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && process.env.HTTPS === 'true',
      maxAge: REDIS_CONFIG.ttl * 1000, // Convert to milliseconds
      sameSite: 'lax'
    },
    rolling: true // Reset expiration on activity
  });
};

// Cleanup session store
const cleanupSessionStore = async () => {
  try {
    if (sessionStoreInstance) {
      await sessionStoreInstance.shutdown();
      sessionStoreInstance = null;
    }
  } catch (error) {
    console.error('Error cleaning up session store:', error);
  }
};

module.exports = {
  RedisSessionStore,
  FallbackSessionStore,
  initializeSessionStore,
  getSessionStore,
  createSessionMiddleware,
  cleanupSessionStore,
  REDIS_CONFIG
};
