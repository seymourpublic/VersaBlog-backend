// This file defines the Category model for the blog application using Mongoose.
// It includes fields for name, slug, description, and parent category. The parent field is a reference to another Category document.
// The model also includes timestamps for created and updated dates.
// models/Category.js - Enhanced with indexes and validation

const mongoose = require('mongoose');
const CategorySchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: [true, 'Category name is required'],
    unique: true,
    trim: true,
    maxlength: [100, 'Category name cannot exceed 100 characters'],
    minlength: [1, 'Category name must be at least 1 character']
  },
  slug: { 
    type: String, 
    required: [true, 'Category slug is required'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens'],
    maxlength: [100, 'Slug cannot exceed 100 characters']
  },
  description: { 
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  parent: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Category', 
    default: null,
    validate: {
      validator: function(value) {
        // Prevent self-referencing
        return !value || !this._id || value.toString() !== this._id.toString();
      },
      message: 'Category cannot be its own parent'
    }
  },
  // Additional fields
  color: {
    type: String,
    match: [/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex color code'],
    default: '#000000'
  },
  icon: {
    type: String,
    trim: true,
    maxlength: [50, 'Icon name cannot exceed 50 characters']
  },
  sortOrder: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ===== INDEXES =====
CategorySchema.index({ parent: 1, sortOrder: 1 }); // For hierarchical queries
CategorySchema.index({ slug: 1 }, { unique: true }); // For URL routing
CategorySchema.index({ name: 1 }); // For name-based searches
CategorySchema.index({ isActive: 1, sortOrder: 1 }); // For active categories
CategorySchema.index({ parent: 1, isActive: 1, sortOrder: 1 }); // Compound for subcategories

// ===== VIRTUAL FIELDS =====
CategorySchema.virtual('level').get(function() {
  // Calculate nesting level (0 for root categories)
  let level = 0;
  let current = this.parent;
  while (current && level < 10) { // Prevent infinite loops
    level++;
    current = current.parent;
  }
  return level;
});

// ===== MIDDLEWARE =====
CategorySchema.pre('save', function(next) {
  // Auto-generate slug if not provided
  if (!this.slug && this.name) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }
  next();
});

// Prevent circular references
CategorySchema.pre('save', async function(next) {
  if (!this.parent) return next();
  
  // Check for circular reference
  let current = await this.constructor.findById(this.parent);
  const visited = new Set([this._id.toString()]);
  
  while (current) {
    if (visited.has(current._id.toString())) {
      return next(new Error('Circular reference detected in category hierarchy'));
    }
    visited.add(current._id.toString());
    current = current.parent ? await this.constructor.findById(current.parent) : null;
  }
  
  next();
});

module.exports = mongoose.model('Category', CategorySchema);
