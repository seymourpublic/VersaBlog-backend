// File: models/Tag.js
// This file defines the Tag model for the blog application using Mongoose.
// It includes a field for the tag name, which is unique and required. The model is exported for use in other parts of the application.
// models/Tag.js
// models/Tag.js - Enhanced with validation
const mongoose = require('mongoose');

const TagSchema = new mongoose.Schema({
  name: { 
    type: String, 
    unique: true, 
    required: [true, 'Tag name is required'],
    trim: true,
    lowercase: true,
    maxlength: [50, 'Tag name cannot exceed 50 characters'],
    minlength: [1, 'Tag name must be at least 1 character'],
    match: [/^[a-z0-9\s-]+$/, 'Tag name can only contain letters, numbers, spaces, and hyphens']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [200, 'Tag description cannot exceed 200 characters']
  },
  color: {
    type: String,
    match: [/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex color code'],
    default: '#6b7280'
  },
  usageCount: {
    type: Number,
    default: 0,
    min: [0, 'Usage count cannot be negative']
  }
}, {
  timestamps: true
});

// ===== INDEXES =====
TagSchema.index({ name: 1 }, { unique: true });
TagSchema.index({ usageCount: -1 }); // For popular tags
TagSchema.index({ name: 'text' }); // For tag search

// ===== METHODS =====
TagSchema.methods.incrementUsage = function() {
  this.usageCount += 1;
  return this.save();
};

TagSchema.methods.decrementUsage = function() {
  this.usageCount = Math.max(0, this.usageCount - 1);
  return this.save();
};

module.exports = mongoose.model('Tag', TagSchema);