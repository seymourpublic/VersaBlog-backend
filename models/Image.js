// models/Image.js - Enhanced version
const mongoose = require('mongoose');

const ImageSchema = new mongoose.Schema({
  postId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Post',
    index: true // Index for faster queries
  },
  
  // URLs for different sizes
  url: { type: String, required: true }, // Original/full size
  thumbnailUrl: { type: String }, // 150x150 thumbnail
  mediumUrl: { type: String }, // Medium size (800px width)
  
  // Metadata
  altText: { type: String, default: '' },
  filename: { type: String }, // Original filename
  fileSize: { type: Number }, // File size in bytes
  mimetype: { type: String },
  
  // Dimensions
  width: { type: Number },
  height: { type: Number },
  
  // Upload info
  uploadedAt: { type: Date, default: Date.now },
  uploadedBy: { type: String }, // User ID or system identifier
  
  // SEO and accessibility
  title: { type: String }, // Image title for SEO
  caption: { type: String }, // Image caption
  description: { type: String }, // Longer description
  
  // Organization
  tags: [{ type: String }], // Image tags for organization
  category: { type: String }, // Image category (hero, gallery, thumbnail, etc.)
  
  // Status and processing
  status: { 
    type: String, 
    enum: ['processing', 'ready', 'failed'], 
    default: 'ready' 
  },
  processingInfo: {
    originalSize: { type: Number },
    compressionRatio: { type: Number },
    processedAt: { type: Date }
  },
  
  // Usage tracking
  usageCount: { type: Number, default: 0 }, // How many times used
  lastUsed: { type: Date },
  
  // S3 specific info
  s3Info: {
    bucket: { type: String },
    key: { type: String },
    etag: { type: String }
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
ImageSchema.index({ postId: 1, uploadedAt: -1 });
ImageSchema.index({ status: 1 });
ImageSchema.index({ mimetype: 1 });
ImageSchema.index({ tags: 1 });
ImageSchema.index({ category: 1 });

// Virtual for file size in human readable format
ImageSchema.virtual('fileSizeFormatted').get(function() {
  if (!this.fileSize) return null;
  
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = this.fileSize;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(1)} ${units[unitIndex]}`;
});

// Virtual for aspect ratio
ImageSchema.virtual('aspectRatio').get(function() {
  if (!this.width || !this.height) return null;
  return (this.width / this.height).toFixed(2);
});

// Virtual for responsive image srcset
ImageSchema.virtual('srcSet').get(function() {
  const sources = [];
  
  if (this.thumbnailUrl) sources.push(`${this.thumbnailUrl} 150w`);
  if (this.mediumUrl) sources.push(`${this.mediumUrl} 800w`);
  if (this.url) sources.push(`${this.url} 1920w`);
  
  return sources.join(', ');
});

// Method to increment usage count
ImageSchema.methods.recordUsage = function() {
  this.usageCount += 1;
  this.lastUsed = new Date();
  return this.save();
};

// Static method to find unused images
ImageSchema.statics.findUnused = function(daysSinceUpload = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysSinceUpload);
  
  return this.find({
    uploadedAt: { $lt: cutoffDate },
    $or: [
      { usageCount: 0 },
      { usageCount: { $exists: false } }
    ]
  });
};

// Static method to get storage statistics
ImageSchema.statics.getStorageStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalImages: { $sum: 1 },
        totalSize: { $sum: '$fileSize' },
        avgSize: { $avg: '$fileSize' },
        mimetypes: { $addToSet: '$mimetype' }
      }
    }
  ]);
  
  return stats[0] || {
    totalImages: 0,
    totalSize: 0,
    avgSize: 0,
    mimetypes: []
  };
};

// Pre-save middleware to update timestamps
ImageSchema.pre('save', function(next) {
  if (this.isNew) {
    this.uploadedAt = new Date();
  }
  next();
});

module.exports = mongoose.model('Image', ImageSchema);