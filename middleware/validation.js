// middleware/validation.js
const Joi = require('joi');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss');

// ===== VALIDATION SCHEMAS =====

const postSchema = Joi.object({
  title: Joi.string()
    .trim()
    .min(1)
    .max(200)
    .required()
    .messages({
      'string.empty': 'Title is required',
      'string.min': 'Title must be at least 1 character',
      'string.max': 'Title cannot exceed 200 characters'
    }),
  
  content: Joi.string()
    .min(1)
    .max(50000)
    .required()
    .messages({
      'string.empty': 'Content is required',
      'string.max': 'Content cannot exceed 50,000 characters'
    }),
  
  slug: Joi.string()
    .trim()
    .lowercase()
    .pattern(/^[a-z0-9-]+$/)
    .max(100)
    .optional()
    .messages({
      'string.pattern.base': 'Slug can only contain lowercase letters, numbers, and hyphens',
      'string.max': 'Slug cannot exceed 100 characters'
    }),
  
  status: Joi.string()
    .valid('draft', 'published', 'pending', 'archived')
    .default('draft')
    .messages({
      'any.only': 'Status must be one of: draft, published, pending, archived'
    }),
  
  categories: Joi.array()
    .items(Joi.string().custom((value, helpers) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.error('any.invalid');
      }
      return value;
    }, 'ObjectId validation'))
    .max(5)
    .optional()
    .messages({
      'array.max': 'Cannot assign more than 5 categories',
      'any.invalid': 'Invalid category ID format'
    }),
  
  metaTitle: Joi.string()
    .trim()
    .max(60)
    .optional()
    .messages({
      'string.max': 'Meta title cannot exceed 60 characters'
    }),
  
  metaDescription: Joi.string()
    .trim()
    .max(160)
    .optional()
    .messages({
      'string.max': 'Meta description cannot exceed 160 characters'
    }),
  
  author: Joi.string()
    .trim()
    .max(100)
    .optional()
    .messages({
      'string.max': 'Author name cannot exceed 100 characters'
    }),
  
  featured: Joi.boolean().optional()
});

const categorySchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(1)
    .max(100)
    .required()
    .messages({
      'string.empty': 'Category name is required',
      'string.min': 'Category name must be at least 1 character',
      'string.max': 'Category name cannot exceed 100 characters'
    }),
  
  slug: Joi.string()
    .trim()
    .lowercase()
    .pattern(/^[a-z0-9-]+$/)
    .max(100)
    .required()
    .messages({
      'string.empty': 'Category slug is required',
      'string.pattern.base': 'Slug can only contain lowercase letters, numbers, and hyphens',
      'string.max': 'Slug cannot exceed 100 characters'
    }),
  
  description: Joi.string()
    .trim()
    .max(500)
    .optional()
    .allow('')
    .messages({
      'string.max': 'Description cannot exceed 500 characters'
    }),
  
  parentId: Joi.string()
    .custom((value, helpers) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.error('any.invalid');
      }
      return value;
    }, 'ObjectId validation')
    .optional()
    .messages({
      'any.invalid': 'Invalid parent category ID format'
    }),
  
  color: Joi.string()
    .pattern(/^#[0-9A-Fa-f]{6}$/)
    .optional()
    .messages({
      'string.pattern.base': 'Color must be a valid hex color code (e.g., #FF0000)'
    }),
  
  icon: Joi.string()
    .trim()
    .max(50)
    .optional()
    .messages({
      'string.max': 'Icon name cannot exceed 50 characters'
    }),
  
  sortOrder: Joi.number()
    .integer()
    .min(0)
    .optional()
    .messages({
      'number.min': 'Sort order must be a positive number'
    }),
  
  isActive: Joi.boolean().optional()
});

const tagSchema = Joi.object({
  name: Joi.string()
    .trim()
    .lowercase()
    .min(1)
    .max(50)
    .pattern(/^[a-z0-9\s-]+$/)
    .required()
    .messages({
      'string.empty': 'Tag name is required',
      'string.min': 'Tag name must be at least 1 character',
      'string.max': 'Tag name cannot exceed 50 characters',
      'string.pattern.base': 'Tag name can only contain letters, numbers, spaces, and hyphens'
    }),
  
  description: Joi.string()
    .trim()
    .max(200)
    .optional()
    .allow('')
    .messages({
      'string.max': 'Tag description cannot exceed 200 characters'
    }),
  
  color: Joi.string()
    .pattern(/^#[0-9A-Fa-f]{6}$/)
    .optional()
    .messages({
      'string.pattern.base': 'Color must be a valid hex color code (e.g., #FF0000)'
    })
});

const filterSchema = Joi.object({
  searchText: Joi.string()
    .trim()
    .max(200)
    .optional()
    .messages({
      'string.max': 'Search text cannot exceed 200 characters'
    }),
  
  categoryId: Joi.string()
    .custom((value, helpers) => {
      if (!mongoose.Types.ObjectId.isValid(value)) {
        return helpers.error('any.invalid');
      }
      return value;
    }, 'ObjectId validation')
    .optional()
    .messages({
      'any.invalid': 'Invalid category ID format'
    }),
  
  status: Joi.string()
    .valid('draft', 'published', 'pending', 'archived')
    .optional()
    .messages({
      'any.only': 'Status must be one of: draft, published, pending, archived'
    }),
  
  publishedAfter: Joi.date()
    .iso()
    .optional()
    .messages({
      'date.format': 'Published after date must be in ISO format'
    }),
  
  publishedBefore: Joi.date()
    .iso()
    .optional()
    .messages({
      'date.format': 'Published before date must be in ISO format'
    }),
  
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(10)
    .optional()
    .messages({
      'number.min': 'Limit must be at least 1',
      'number.max': 'Limit cannot exceed 100'
    }),
  
  offset: Joi.number()
    .integer()
    .min(0)
    .default(0)
    .optional()
    .messages({
      'number.min': 'Offset must be 0 or greater'
    })
});

// ===== VALIDATION MIDDLEWARE FUNCTIONS =====

const createValidator = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });
    
    if (error) {
      const validationErrors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));
      
      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: validationErrors
      });
    }
    
    // Replace req.body with validated and sanitized data
    req.body = value;
    next();
  };
};

const createQueryValidator = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
      convert: true
    });
    
    if (error) {
      const validationErrors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));
      
      return res.status(400).json({
        error: 'Query validation failed',
        code: 'QUERY_VALIDATION_ERROR',
        details: validationErrors
      });
    }
    
    req.query = value;
    next();
  };
};

// ===== SECURITY MIDDLEWARE =====

// Rate limiting configurations
const createRateLimit = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      error: message,
      code: 'RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Skip rate limiting for certain IPs or conditions
      const trustedIPs = (process.env.TRUSTED_IPS || '').split(',');
      return trustedIPs.includes(req.ip);
    }
  });
};

// Different rate limits for different endpoints
const generalRateLimit = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  100, // 100 requests per window
  'Too many requests from this IP, please try again later'
);

const uploadRateLimit = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  20, // 20 uploads per window
  'Too many upload requests from this IP, please try again later'
);

const createRateLimit = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  50, // 50 create operations per window
  'Too many create requests from this IP, please try again later'
);

// XSS protection
const sanitizeInput = (req, res, next) => {
  // Sanitize string fields in body
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  
  // Sanitize query parameters
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query);
  }
  
  next();
};

const sanitizeObject = (obj) => {
  const sanitized = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      // Basic XSS protection
      sanitized[key] = xss(value, {
        whiteList: {}, // No HTML tags allowed
        stripIgnoreTag: true,
        stripIgnoreTagBody: ['script']
      });
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map(item => 
        typeof item === 'string' ? xss(item, { whiteList: {} }) : item
      );
    } else if (value && typeof value === 'object') {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
};

// Content validation for rich text
const validateRichContent = (req, res, next) => {
  if (req.body.content) {
    // Allow specific HTML tags for rich content
    const allowedTags = {
      'p': [],
      'br': [],
      'strong': [],
      'em': [],
      'u': [],
      'h1': [],
      'h2': [],
      'h3': [],
      'h4': [],
      'h5': [],
      'h6': [],
      'ul': [],
      'ol': [],
      'li': [],
      'blockquote': [],
      'a': ['href', 'title'],
      'img': ['src', 'alt', 'title', 'width', 'height'],
      'code': [],
      'pre': []
    };
    
    req.body.content = xss(req.body.content, {
      whiteList: allowedTags,
      stripIgnoreTag: true,
      stripIgnoreTagBody: ['script', 'style']
    });
  }
  
  next();
};

// ID parameter validation
const validateObjectId = (paramName) => {
  return (req, res, next) => {
    const id = req.params[paramName];
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        error: `Invalid ${paramName} format`,
        code: 'INVALID_OBJECT_ID'
      });
    }
    
    next();
  };
};

// ===== EXPORT MIDDLEWARE =====

module.exports = {
  // Validation middlewares
  validatePost: createValidator(postSchema),
  validateCategory: createValidator(categorySchema),
  validateTag: createValidator(tagSchema),
  validateFilter: createQueryValidator(filterSchema),
  
  // Security middlewares
  helmet: helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: false
  }),
  
  generalRateLimit,
  uploadRateLimit,
  createRateLimit,
  
  mongoSanitize: mongoSanitize({
    replaceWith: '_'
  }),
  
  sanitizeInput,
  validateRichContent,
  validateObjectId,
  
  // Custom validation schemas for direct use
  schemas: {
    postSchema,
    categorySchema,
    tagSchema,
    filterSchema
  }
};