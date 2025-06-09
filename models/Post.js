const mongoose = require('mongoose');
const slugify = require('slugify');

const PostSchema = new mongoose.Schema({
  title: { 
    type: String, 
    required: [true, 'Title is required'],
    maxlength: [200, 'Title cannot exceed 200 characters'],
    trim: true
  },
  content: { 
    type: String, 
    required: [true, 'Content is required'],
    minlength: [1, 'Content cannot be empty']
  },
  slug: { 
    type: String, 
    // REMOVED: unique: true (will be added via index() below)
    sparse: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: function(v) {
        return !v || /^[a-z0-9-]+$/.test(v);
      },
      message: 'Slug can only contain lowercase letters, numbers, and hyphens'
    }
  },
  status: { 
    type: String, 
    enum: {
      values: ['draft', 'published', 'archived', 'pending'],
      message: 'Status must be one of: draft, published, archived, pending'
    },
    default: 'draft'
  },
  publishedAt: { 
    type: Date,
    default: null,
    validate: {
      validator: function(v) {
        // If status is published, publishedAt should be set
        if (this.status === 'published' && !v) {
          return false;
        }
        return true;
      },
      message: 'Published posts must have a publishedAt date'
    }
  },
  version: { 
    type: Number, 
    default: 1,
    min: 1
  },
  // Array of category references with validation
  categories: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    validate: {
      validator: async function(categoryId) {
        const Category = mongoose.model('Category');
        const category = await Category.findById(categoryId);
        return !!category;
      },
      message: 'Referenced category does not exist'
    }
  }],
  // Array of tag references
  tags: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tag'
  }],
  // Author reference (when auth is implemented)
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // Make optional for now
  },
  // SEO fields
  metaDescription: {
    type: String,
    maxlength: [160, 'Meta description cannot exceed 160 characters']
  },
  featuredImage: {
    type: String,
    validate: {
      validator: function(v) {
        return !v || /^https?:\/\/.+/.test(v);
      },
      message: 'Featured image must be a valid URL'
    }
  },
  // View count for analytics
  viewCount: {
    type: Number,
    default: 0,
    min: 0
  },
  // Soft delete
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  }
}, { 
  timestamps: true, // Adds createdAt and updatedAt automatically
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes - defined ONLY here to avoid duplicates
PostSchema.index({ title: 'text', content: 'text' }); // Full-text search
PostSchema.index({ status: 1, publishedAt: -1 }); // Status and date queries
PostSchema.index({ categories: 1 }); // Category filtering
PostSchema.index({ tags: 1 }); // Tag filtering
PostSchema.index({ slug: 1 }, { unique: true, sparse: true }); // Slug lookup
PostSchema.index({ author: 1, status: 1 }); // Author's posts
PostSchema.index({ isDeleted: 1, status: 1 }); // Soft delete queries
PostSchema.index({ createdAt: -1 }); // Recent posts
PostSchema.index({ viewCount: -1 }); // Popular posts

// Virtual for reading time (rough estimate)
PostSchema.virtual('readingTime').get(function() {
  const wordsPerMinute = 200;
  const wordCount = this.content.split(/\s+/).length;
  return Math.ceil(wordCount / wordsPerMinute);
});

// Virtual for excerpt
PostSchema.virtual('excerpt').get(function() {
  return this.content.substring(0, 150) + (this.content.length > 150 ? '...' : '');
});

// Pre-save middleware to auto-generate slug
PostSchema.pre('save', function(next) {
  // Generate slug if not provided
  if (!this.slug && this.title) {
    this.slug = slugify(this.title, {
      lower: true,
      strict: true,
      remove: /[*+~.()'"!:@]/g
    });
  }
  
  // Set publishedAt when status changes to published
  if (this.status === 'published' && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  
  // Clear publishedAt if status is not published
  if (this.status !== 'published' && this.publishedAt) {
    this.publishedAt = null;
  }
  
  next();
});

// Pre-save middleware to handle slug conflicts
PostSchema.pre('save', async function(next) {
  if (this.isNew || this.isModified('slug')) {
    let uniqueSlug = this.slug;
    let counter = 1;
    
    while (await this.constructor.findOne({ 
      slug: uniqueSlug, 
      _id: { $ne: this._id },
      isDeleted: false 
    })) {
      uniqueSlug = `${this.slug}-${counter}`;
      counter++;
    }
    
    this.slug = uniqueSlug;
  }
  next();
});

// Static method for soft delete
PostSchema.statics.softDelete = function(id) {
  return this.findByIdAndUpdate(id, {
    isDeleted: true,
    deletedAt: new Date()
  });
};

// Static method to find non-deleted posts
PostSchema.statics.findActive = function(query = {}) {
  return this.find({ ...query, isDeleted: false });
};

// Instance method to publish post
PostSchema.methods.publish = function() {
  this.status = 'published';
  this.publishedAt = new Date();
  return this.save();
};

// Instance method to unpublish post
PostSchema.methods.unpublish = function() {
  this.status = 'draft';
  this.publishedAt = null;
  return this.save();
};

module.exports = mongoose.model('Post', PostSchema);
