// config/db.js - Fixed database connection configuration
const mongoose = require('mongoose');
const logger = require('./logger');
require('dotenv').config();

class DatabaseManager {
  constructor() {
    this.isConnected = false;
    this.connectionAttempts = 0;
    this.maxRetries = 5;
    this.retryDelay = 5000; // 5 seconds
    this.healthCheckInterval = null;
    
    // Bind methods to preserve context
    this.connect = this.connect.bind(this);
    this.disconnect = this.disconnect.bind(this);
    this.healthCheck = this.healthCheck.bind(this);
  }

  async connect() {
    const mongoUri = process.env.MONGODB_URI;
    
    if (!mongoUri) {
      const error = new Error('MONGODB_URI environment variable is not set');
      logger.error('Database configuration error', { error: error.message });
      throw error;
    }

    // Fixed connection options - removed unsupported options
    const options = {
      // Connection pool settings
      maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE) || 10,
      minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE) || 1,
      
      // Timeout settings
      serverSelectionTimeoutMS: 30000, // 30 seconds
      socketTimeoutMS: 45000, // 45 seconds
      connectTimeoutMS: 30000, // 30 seconds
      
      // Heartbeat settings
      heartbeatFrequencyMS: 10000, // 10 seconds
      
      // Write concern
      writeConcern: {
        w: 'majority',
        j: true,
        wtimeout: 5000
      },
      
      // Read preference
      readPreference: 'primary',
      
      // Compression
      compressors: ['zlib'],
      
      // Application name for monitoring
      appName: 'VersaBlog-Backend'
      
      // REMOVED: bufferMaxEntries (deprecated)
      // REMOVED: bufferCommands (deprecated in favor of Mongoose defaults)
    };

    try {
      this.connectionAttempts++;
      
      logger.info('Attempting database connection', {
        attempt: this.connectionAttempts,
        maxRetries: this.maxRetries,
        uri: mongoUri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@') // Hide password in logs
      });

      await mongoose.connect(mongoUri, options);
      
      this.isConnected = true;
      this.connectionAttempts = 0; // Reset on successful connection
      
      logger.info('Database connected successfully', {
        host: mongoose.connection.host,
        port: mongoose.connection.port,
        name: mongoose.connection.name,
        readyState: mongoose.connection.readyState
      });

      // Start health check monitoring
      this.startHealthCheck();
      
      return true;
      
    } catch (error) {
      this.isConnected = false;
      
      logger.error('Database connection failed', {
        error: error.message,
        attempt: this.connectionAttempts,
        maxRetries: this.maxRetries,
        stack: error.stack
      });

      // Retry logic
      if (this.connectionAttempts < this.maxRetries) {
        logger.info('Retrying database connection', {
          nextAttemptIn: this.retryDelay,
          attempt: this.connectionAttempts + 1
        });
        
        await this.delay(this.retryDelay);
        return this.connect(); // Recursive retry
      } else {
        const finalError = new Error(`Failed to connect to database after ${this.maxRetries} attempts`);
        logger.error('Database connection exhausted', {
          error: finalError.message,
          totalAttempts: this.connectionAttempts
        });
        
        // In production, you might want to exit the process
        if (process.env.NODE_ENV === 'production') {
          logger.error('Exiting process due to database connection failure');
          process.exit(1);
        }
        
        throw finalError;
      }
    }
  }

  async disconnect() {
    try {
      this.stopHealthCheck();
      
      if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
        logger.info('Database disconnected successfully');
      }
      
      this.isConnected = false;
    } catch (error) {
      logger.error('Error disconnecting from database', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async healthCheck() {
    try {
      // Ping the database
      await mongoose.connection.db.admin().ping();
      
      if (!this.isConnected) {
        this.isConnected = true;
        logger.info('Database health check: Connection restored');
      }
      
      // Log detailed connection stats periodically (every 5 minutes)
      const now = Date.now();
      if (!this.lastStatsLog || now - this.lastStatsLog > 300000) {
        const stats = {
          readyState: mongoose.connection.readyState,
          host: mongoose.connection.host,
          port: mongoose.connection.port,
          collections: Object.keys(mongoose.connection.collections).length
        };
        
        logger.debug('Database health check: OK', stats);
        this.lastStatsLog = now;
      }
      
    } catch (error) {
      if (this.isConnected) {
        this.isConnected = false;
        logger.error('Database health check: Connection lost', {
          error: error.message
        });
        
        // Attempt to reconnect
        logger.info('Attempting to reconnect to database');
        try {
          await this.connect();
        } catch (reconnectError) {
          logger.error('Failed to reconnect during health check', {
            error: reconnectError.message
          });
        }
      }
    }
  }

  startHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    // Run health check every 30 seconds
    this.healthCheckInterval = setInterval(this.healthCheck, 30000);
    logger.debug('Database health check monitoring started');
  }

  stopHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      logger.debug('Database health check monitoring stopped');
    }
  }

  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      readyState: mongoose.connection.readyState,
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      name: mongoose.connection.name
    };
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Setup connection event listeners
const setupEventListeners = () => {
  mongoose.connection.on('connected', () => {
    logger.info('Mongoose connected to MongoDB');
  });

  mongoose.connection.on('error', (error) => {
    logger.error('Mongoose connection error', {
      error: error.message,
      stack: error.stack
    });
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('Mongoose disconnected from MongoDB');
  });

  mongoose.connection.on('reconnected', () => {
    logger.info('Mongoose reconnected to MongoDB');
  });

  mongoose.connection.on('timeout', () => {
    logger.error('Mongoose connection timeout');
  });

  mongoose.connection.on('close', () => {
    logger.info('Mongoose connection closed');
  });

  // Handle application termination
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, closing database connection');
    await dbManager.disconnect();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, closing database connection');
    await dbManager.disconnect();
    process.exit(0);
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', async (error) => {
    logger.error('Uncaught exception', {
      error: error.message,
      stack: error.stack
    });
    await dbManager.disconnect();
    process.exit(1);
  });

  process.on('unhandledRejection', async (reason, promise) => {
    logger.error('Unhandled promise rejection', {
      reason: reason?.message || reason,
      stack: reason?.stack
    });
    await dbManager.disconnect();
    process.exit(1);
  });
};

// Create database manager instance
const dbManager = new DatabaseManager();

// Setup event listeners
setupEventListeners();

// Export both the connect function and the manager instance
module.exports = {
  connectDB: dbManager.connect,
  disconnectDB: dbManager.disconnect,
  getConnectionStatus: dbManager.getConnectionStatus.bind(dbManager),
  dbManager
};

// Alternative simple export for backwards compatibility
module.exports.default = dbManager.connect;