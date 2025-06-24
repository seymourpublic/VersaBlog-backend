// This file defines the Post model for the blog application using Mongoose.
// It includes fields for title, content, slug, status, published date, updated date, version, and categories.
// The categories field is an array of ObjectId references to the Category model.
// models/Post.js - Enhanced with indexes and validation
const mongoose = require('mongoose');

const PostSchema = new mongoose.Schema({
  title: { 
    type: String, 
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters'],
    minlength: [1, 'Title must be at least 1 character']
  },
  content: { 
    type: String, 
    required: [true, 'Content is required'],
    maxlength: [50000, 'Content cannot exceed 50,000 characters']
  },
  slug: { 
    type: String,
    unique: true,
    sparse: true, // Allow null but ensure uniqueness when present
    trim: true,
    lowercase: true,
    match: [/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens'],
    maxlength: [100, 'Slug cannot exceed 100 characters']
  },
  status: { 
    type: String, 
    default: 'draft',
    enum: {
      values: ['draft', 'published', 'pending', 'archived'],
      message: 'Status must be one of: draft, published, pending, archived'
    }
  },
  publishedAt: { 
    type: Date,
    validate: {
      validator: function(value) {
        // Only validate if status is published
        if (this.status === 'published' && !value) {
          return false;
        }
        return true;
      },
      message: 'Published date is required when status is published'
    }
  },
  updatedAt: { type: Date, default: Date.now },
  version: { type: Number, default: 1, min: 1 },
  // Array of category references
  categories: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category'
  }],
  // SEO fields
  metaTitle: {
    type: String,
    trim: true,
    maxlength: [60, 'Meta title cannot exceed 60 characters']
  },
  metaDescription: {
    type: String,
    trim: true,
    maxlength: [160, 'Meta description cannot exceed 160 characters']
  },
  // Author information
  author: {
    type: String,
    trim: true,
    maxlength: [100, 'Author name cannot exceed 100 characters']
  },
  // Reading time in minutes
  readingTime: {
    type: Number,
    min: [0, 'Reading time cannot be negative']
  },
  // View count
  viewCount: {
    type: Number,
    default: 0,
    min: [0, 'View count cannot be negative']
  },
  // Featured flag
  featured: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ===== INDEXES FOR PERFORMANCE =====

// Full-text search index
PostSchema.index({ 
  title: 'text', 
  content: 'text',
  metaTitle: 'text',
  metaDescription: 'text'
}, {
  weights: {
    title: 10,
    metaTitle: 8,
    content: 5,
    metaDescription: 3
  },
  name: 'post_text_search'
});

// Primary query indexes
PostSchema.index({ status: 1, publishedAt: -1 }); // For published posts chronologically
PostSchema.index({ status: 1, featured: -1, publishedAt: -1 }); // For featured content
PostSchema.index({ categories: 1, status: 1, publishedAt: -1 }); // For category filtering
PostSchema.index({ slug: 1 }, { unique: true, sparse: true }); // For SEO-friendly URLs
PostSchema.index({ updatedAt: -1 }); // For recent updates
PostSchema.index({ viewCount: -1 }); // For popular content
PostSchema.index({ author: 1, status: 1 }); // For author-specific queries

// Compound indexes for complex queries
PostSchema.index({ status: 1, categories: 1, publishedAt: -1 }); // Category + status filtering
PostSchema.index({ featured: 1, status: 1, publishedAt: -1 }); // Featured content queries

// ===== VIRTUAL FIELDS =====
PostSchema.virtual('excerpt').get(function() {
  if (!this.content) return '';
  return this.content.substring(0, 200) + (this.content.length > 200 ? '...' : '');
});

PostSchema.virtual('isPublished').get(function() {
  return this.status === 'published' && this.publishedAt && this.publishedAt <= new Date();
});

// ===== MIDDLEWARE =====

// Pre-save middleware for slug generation and validation
PostSchema.pre('save', function(next) {
  // Auto-generate slug if not provided
  if (!this.slug && this.title) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .trim();
  }
  
  // Calculate reading time (assuming 200 words per minute)
  if (this.content) {
    const wordCount = this.content.split(/\s+/).length;
    this.readingTime = Math.ceil(wordCount / 200);
  }
  
  // Set publishedAt if status is published and not set
  if (this.status === 'published' && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  
  // Clear publishedAt if status is not published
  if (this.status !== 'published') {
    this.publishedAt = null;
  }
  
  next();
});

// ===== STATIC METHODS =====
PostSchema.statics.findPublished = function(limit = 10, skip = 0) {
  return this.find({ 
    status: 'published',
    publishedAt: { $lte: new Date() }
  })
  .sort({ publishedAt: -1 })
  .limit(limit)
  .skip(skip)
  .populate('categories');
};

PostSchema.statics.findByCategory = function(categoryId, limit = 10, skip = 0) {
  return this.find({ 
    categories: categoryId,
    status: 'published',
    publishedAt: { $lte: new Date() }
  })
  .sort({ publishedAt: -1 })
  .limit(limit)
  .skip(skip)
  .populate('categories');
};

module.exports = mongoose.model('Post', PostSchema);
