// File: models/Tag.js
// This file defines the Tag model for the blog application using Mongoose.
// It includes a field for the tag name, which is unique and required. The model is exported for use in other parts of the application.
// models/Tag.js
const mongoose = require('mongoose');

const TagSchema = new mongoose.Schema({
  name: { 
    type: String, 
    // REMOVED: unique: true (will be added via index() below)
    required: [true, 'Tag name is required'],
    trim: true,
    lowercase: true,
    maxlength: [50, 'Tag name cannot exceed 50 characters'],
    validate: {
      validator: function(v) {
        return /^[a-z0-9-\s]+$/.test(v);
      },
      message: 'Tag name can only contain lowercase letters, numbers, hyphens, and spaces'
    }
  },
  slug: {
    type: String,
    // REMOVED: unique: true (will be added via index() below)
    lowercase: true
  },
  description: {
    type: String,
    maxlength: [200, 'Description cannot exceed 200 characters']
  },
  color: {
    type: String,
    validate: {
      validator: function(v) {
        return !v || /^#[0-9A-F]{6}$/i.test(v);
      },
      message: 'Color must be a valid hex color code'
    }
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes - defined ONLY here to avoid duplicates
TagSchema.index({ name: 1 }, { unique: true });
TagSchema.index({ slug: 1 }, { unique: true });

// Virtual for post count
TagSchema.virtual('postCount', {
  ref: 'Post',
  localField: '_id',
  foreignField: 'tags',
  count: true,
  match: { isDeleted: false, status: 'published' }
});

// Pre-save middleware
TagSchema.pre('save', function(next) {
  if (!this.slug) {
    this.slug = slugify(this.name, {
      lower: true,
      strict: true
    });
  }
  next();
});

module.exports = mongoose.model('Tag', TagSchema);