// server.js - Fixed version without problematic dependencies
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { ApolloServer } = require('apollo-server-express');
const depthLimit = require('graphql-depth-limit');

// Import enhanced modules
const { typeDefs } = require('./graphql/schema');
const { resolvers, createContext } = require('./graphql/resolvers');
const { connectDB, getConnectionStatus } = require('./config/db');
const logger = require('./config/logger');
const { 
  errorHandler, 
  formatGraphQLError,
  AppError 
} = require('./utils/errors');

require('dotenv').config();

// Validate required environment variables
const requiredEnvVars = [
  'MONGODB_URI'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  logger.error('Missing required environment variables', { 
    missing: missingVars 
  });
  process.exit(1);
}

// Set default NODE_ENV if not provided
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'development';
  logger.warn('NODE_ENV not set, defaulting to development');
}

const app = express();

// Trust proxy for accurate IP addresses
app.set('trust proxy', true);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production',
  crossOriginEmbedderPolicy: false
}));

// Compression
app.use(compression());

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGINS ? 
    process.env.CORS_ORIGINS.split(',') : 
    ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-requested-with']
};
app.use(cors(corsOptions));

// Body parsing middleware
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use(logger.requestMiddleware);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 1000,
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Custom key generator to include user ID when available
  keyGenerator: (req) => {
    return req.user?.id || req.ip;
  },
  // Skip rate limiting for health checks
  skip: (req) => req.path === '/health'
});

app.use('/api/', limiter);
app.use('/graphql/', limiter);

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const dbStatus = getConnectionStatus();
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV,
      database: {
        connected: dbStatus.isConnected,
        host: dbStatus.host,
        readyState: dbStatus.readyState
      },
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
      },
      uptime: Math.round(process.uptime())
    };

    // Check database connectivity
    if (!dbStatus.isConnected) {
      healthStatus.status = 'unhealthy';
      return res.status(503).json(healthStatus);
    }

    res.json(healthStatus);
  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    res.status(503).json({
      status: 'unhealthy',
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

// Metrics endpoint (for monitoring)
app.get('/metrics', (req, res) => {
  const metrics = {
    timestamp: new Date().toISOString(),
    process: {
      pid: process.pid,
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      uptime: process.uptime()
    },
    database: getConnectionStatus()
  };
  
  res.json(metrics);
});

// Initialize Apollo Server
async function startApolloServer() {
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    context: createContext,
    
    // Enhanced error formatting
    formatError: (error) => {
      const formattedError = formatGraphQLError(error);
      
      // Log GraphQL errors
      logger.error('GraphQL error', {
        error: formattedError,
        query: error.source?.body,
        variables: error.variableValues,
        path: error.path
      });
      
      return formattedError;
    },
    
    // Security: Query complexity limiting (simplified)
    validationRules: [
      depthLimit(10) // Prevent deeply nested queries
      // Removed costAnalysis for now - can be added later with proper package
    ],
    
    // Performance monitoring
    plugins: [
      {
        requestDidStart() {
          return {
            willSendResponse(requestContext) {
              const { request, response } = requestContext;
              
              // Log slow queries
              const duration = Date.now() - (request.startTime || Date.now());
              if (duration > 1000) {
                logger.warn('Slow GraphQL query', {
                  duration,
                  query: request.query,
                  variables: request.variables,
                  operationName: request.operationName
                });
              }
              
              // Log performance metrics
              logger.performance('graphql_query', duration, {
                operationName: request.operationName,
                success: !response.errors?.length
              });
            },
            
            didResolveOperation(requestContext) {
              requestContext.request.startTime = Date.now();
            },
            
            didEncounterErrors(requestContext) {
              // Log GraphQL errors with context
              logger.error('GraphQL operation failed', {
                errors: requestContext.errors?.map(err => ({
                  message: err.message,
                  path: err.path,
                  code: err.extensions?.code
                })),
                query: requestContext.request.query,
                variables: requestContext.request.variables
              });
            }
          };
        }
      }
    ],
    
    // Development settings
    introspection: process.env.NODE_ENV !== 'production',
    playground: process.env.NODE_ENV !== 'production' ? {
      settings: {
        'request.credentials': 'include'
      }
    } : false,
    
    // Upload configuration
    uploads: {
      maxFileSize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5
    }
  });

  await server.start();
  
  // Apply middleware to Express app
  server.applyMiddleware({ 
    app, 
    path: '/graphql/v1',
    cors: false // We handle CORS globally
  });
  
  logger.info('Apollo Server initialized', {
    path: server.graphqlPath,
    introspection: server.introspection,
    playground: !!server.playground
  });
  
  return server;
}

// Mount API routes
const uploadRouter = require('./routes/upload');
app.use('/api/v1', uploadRouter);

// Test endpoint for logging
app.get('/test-logging', (req, res) => {
  logger.info('Test logging endpoint accessed', {
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  res.json({ 
    message: 'Logging test successful',
    requestId: req.requestId
  });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: 'API endpoint not found',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

// Global error handling middleware
app.use(errorHandler);

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack
  });
  
  // Graceful shutdown
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', {
    reason: reason?.message || reason,
    stack: reason?.stack,
    promise: promise.toString()
  });
  
  // Graceful shutdown
  process.exit(1);
});

// Graceful shutdown handling
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}, starting graceful shutdown`);
  
  // Stop accepting new connections
  if (global.server) {
    global.server.close(() => {
      logger.info('HTTP server closed');
      
      // Close database connection
      require('./config/db').disconnectDB()
        .then(() => {
          logger.info('Database connection closed');
          process.exit(0);
        })
        .catch((error) => {
          logger.error('Error closing database connection', { error: error.message });
          process.exit(1);
        });
    });
  } else {
    process.exit(0);
  }
  
  // Force close after 30 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start the application
async function startServer() {
  try {
    // Connect to database
    await connectDB();
    
    // Initialize Apollo Server
    const apolloServer = await startApolloServer();
    
    // Start HTTP server
    const PORT = process.env.PORT || 4000;
    const server = app.listen(PORT, () => {
      logger.info('Server started successfully', {
        port: PORT,
        environment: process.env.NODE_ENV,
        graphqlEndpoint: `http://localhost:${PORT}${apolloServer.graphqlPath}`,
        healthCheck: `http://localhost:${PORT}/health`,
        metricsEndpoint: `http://localhost:${PORT}/metrics`
      });
    });
    
    // Store server reference for graceful shutdown
    global.server = server;
    
    return server;
    
  } catch (error) {
    logger.error('Failed to start server', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

// Start the server
startServer();

module.exports = app;