// utils/errors.js - Custom error classes and error handling utilities
const logger = require('../config/logger');

// Base application error
class AppError extends Error {
  constructor(message, statusCode = 500, code = null, details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();

    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      status: this.status,
      code: this.code,
      details: this.details,
      timestamp: this.timestamp,
      ...(process.env.NODE_ENV !== 'production' && { stack: this.stack })
    };
  }
}

// Specific error classes
class ValidationError extends AppError {
  constructor(message, field = null, value = null) {
    super(message, 400, 'VALIDATION_ERROR', { field, value });
  }
}

class NotFoundError extends AppError {
  constructor(resource, id = null) {
    super(`${resource} not found`, 404, 'NOT_FOUND', { resource, id });
  }
}

class ConflictError extends AppError {
  constructor(message, field = null) {
    super(message, 409, 'CONFLICT', { field });
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'FORBIDDEN');
  }
}

class DatabaseError extends AppError {
  constructor(message, operation = null, collection = null) {
    super(message, 500, 'DATABASE_ERROR', { operation, collection });
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

class FileUploadError extends AppError {
  constructor(message, fileType = null, size = null) {
    super(message, 400, 'FILE_UPLOAD_ERROR', { fileType, size });
  }
}

// Error handler for async functions
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// MongoDB error parser
const handleMongoError = (error) => {
  if (error.code === 11000) {
    // Duplicate key error
    const field = Object.keys(error.keyPattern || {})[0] || 'field';
    const value = error.keyValue?.[field] || 'unknown';
    return new ConflictError(`${field} '${value}' already exists`, field);
  }

  if (error.name === 'ValidationError') {
    const errors = Object.values(error.errors).map(err => ({
      field: err.path,
      message: err.message,
      value: err.value
    }));
    return new ValidationError('Validation failed', null, errors);
  }

  if (error.name === 'CastError') {
    return new ValidationError(`Invalid ${error.path}: ${error.value}`);
  }

  if (error.name === 'DocumentNotFoundError') {
    return new NotFoundError('Document');
  }

  return new DatabaseError(error.message);
};

// GraphQL error formatter
const formatGraphQLError = (error) => {
  // Extract the original error
  const originalError = error.originalError || error;

  // If it's already an AppError, return formatted version
  if (originalError instanceof AppError) {
    return {
      message: originalError.message,
      code: originalError.code,
      statusCode: originalError.statusCode,
      details: originalError.details,
      timestamp: originalError.timestamp,
      ...(process.env.NODE_ENV !== 'production' && {
        stack: originalError.stack,
        path: error.path
      })
    };
  }

  // Handle MongoDB errors
  if (originalError.name?.includes('Mongo') || originalError.code === 11000) {
    const appError = handleMongoError(originalError);
    return formatGraphQLError({ originalError: appError });
  }

  // Handle GraphQL validation errors
  if (error.message?.includes('Variable') || error.message?.includes('syntax')) {
    return {
      message: 'Invalid request format',
      code: 'GRAPHQL_VALIDATION_ERROR',
      statusCode: 400,
      details: { originalMessage: error.message },
      timestamp: new Date().toISOString()
    };
  }

  // Generic error
  return {
    message: process.env.NODE_ENV === 'production' 
      ? 'An internal error occurred' 
      : originalError.message,
    code: 'INTERNAL_ERROR',
    statusCode: 500,
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV !== 'production' && {
      stack: originalError.stack,
      path: error.path
    })
  };
};

// Express error handling middleware
const errorHandler = (error, req, res, next) => {
  let err = error;

  // Log the error
  logger.error('Error occurred', {
    error: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id,
    requestId: req.requestId,
    body: req.body,
    params: req.params,
    query: req.query
  });

  // Handle MongoDB errors
  if (err.name?.includes('Mongo') || err.code === 11000) {
    err = handleMongoError(err);
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    err = new UnauthorizedError('Invalid token');
  }

  if (err.name === 'TokenExpiredError') {
    err = new UnauthorizedError('Token expired');
  }

  // Handle Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    err = new FileUploadError('File too large');
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    err = new FileUploadError('Unexpected file field');
  }

  // Handle rate limiting
  if (err.type === 'entity.too.large') {
    err = new ValidationError('Request payload too large');
  }

  // Ensure it's an AppError
  if (!(err instanceof AppError)) {
    err = new AppError(
      process.env.NODE_ENV === 'production' 
        ? 'Something went wrong' 
        : err.message,
      500,
      'INTERNAL_ERROR'
    );
  }

  // Send error response
  res.status(err.statusCode).json({
    success: false,
    error: {
      message: err.message,
      code: err.code,
      details: err.details,
      timestamp: err.timestamp,
      requestId: req.requestId,
      ...(process.env.NODE_ENV !== 'production' && {
        stack: err.stack
      })
    }
  });
};

// Validation helper
const validateInput = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      allowUnknown: false,
      stripUnknown: true
    });

    if (error) {
      const details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));
      
      throw new ValidationError('Validation failed', null, details);
    }

    req.body = value;
    next();
  };
};

// Performance monitoring wrapper
const withPerformanceLog = (operation) => {
  return async (fn, ...args) => {
    const start = Date.now();
    try {
      const result = await fn(...args);
      const duration = Date.now() - start;
      
      logger.performance(operation, duration, {
        success: true,
        resultType: typeof result
      });
      
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      
      logger.performance(operation, duration, {
        success: false,
        error: error.message
      });
      
      throw error;
    }
  };
};

module.exports = {
  // Error classes
  AppError,
  ValidationError,
  NotFoundError,
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
  DatabaseError,
  RateLimitError,
  FileUploadError,
  
  // Utilities
  asyncHandler,
  handleMongoError,
  formatGraphQLError,
  errorHandler,
  validateInput,
  withPerformanceLog
};