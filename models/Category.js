const mongoose = require('mongoose');

const CategorySchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: [true, 'Category name is required'],
    // REMOVED: unique: true (will be added via index() below)
    trim: true,
    maxlength: [100, 'Category name cannot exceed 100 characters']
  },
  slug: { 
    type: String, 
    required: [true, 'Category slug is required'],
    // REMOVED: unique: true (will be added via index() below)
    lowercase: true,
    trim: true,
    validate: {
      validator: function(v) {
        return /^[a-z0-9-]+$/.test(v);
      },
      message: 'Slug can only contain lowercase letters, numbers, and hyphens'
    }
  },
  description: { 
    type: String,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  parent: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Category', 
    default: null,
    validate: {
      validator: async function(v) {
        if (!v) return true; // null/undefined is valid
        
        // Prevent self-reference
        if (v.toString() === this._id?.toString()) {
          return false;
        }
        
        // Check if parent exists
        const parent = await this.constructor.findById(v);
        if (!parent) return false;
        
        // Prevent circular references (max depth check)
        let currentParent = parent;
        let depth = 0;
        while (currentParent.parent && depth < 10) {
          if (currentParent.parent.toString() === this._id?.toString()) {
            return false; // Would create circular reference
          }
          currentParent = await this.constructor.findById(currentParent.parent);
          depth++;
        }
        
        return true;
      },
      message: 'Invalid parent category or circular reference detected'
    }
  },
  // Category metadata
  color: {
    type: String,
    validate: {
      validator: function(v) {
        return !v || /^#[0-9A-F]{6}$/i.test(v);
      },
      message: 'Color must be a valid hex color code'
    }
  },
  icon: String,
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

// Indexes - defined ONLY here to avoid duplicates
CategorySchema.index({ name: 1 }, { unique: true });
CategorySchema.index({ slug: 1 }, { unique: true });
CategorySchema.index({ parent: 1 });
CategorySchema.index({ isActive: 1, sortOrder: 1 });

// Virtual for subcategories
CategorySchema.virtual('subcategories', {
  ref: 'Category',
  localField: '_id',
  foreignField: 'parent'
});

// Virtual for post count
CategorySchema.virtual('postCount', {
  ref: 'Post',
  localField: '_id',
  foreignField: 'categories',
  count: true,
  match: { isDeleted: false, status: 'published' }
});

// Pre-save middleware to generate slug
CategorySchema.pre('save', function(next) {
  if (!this.slug && this.name) {
    this.slug = slugify(this.name, {
      lower: true,
      strict: true
    });
  }
  next();
});

// Static method to prevent deletion of categories with posts
CategorySchema.statics.safeDelete = async function(id) {
  const Post = mongoose.model('Post');
  
  // Check for posts using this category
  const postCount = await Post.countDocuments({ 
    categories: id, 
    isDeleted: false 
  });
  
  if (postCount > 0) {
    throw new Error(`Cannot delete category: ${postCount} posts are using it`);
  }
  
  // Check for subcategories
  const subcategoryCount = await this.countDocuments({ parent: id });
  if (subcategoryCount > 0) {
    throw new Error(`Cannot delete category: it has ${subcategoryCount} subcategories`);
  }
  
  return this.findByIdAndDelete(id);
};

module.exports = mongoose.model('Category', CategorySchema);