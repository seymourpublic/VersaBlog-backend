// This file defines the Post model for the blog application using Mongoose.
// It includes fields for title, content, slug, status, published date, updated date, version, and categories.
// The categories field is an array of ObjectId references to the Category model.
// models/Post.js
const mongoose = require('mongoose');

const PostSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  slug: { type: String },
  status: { type: String, default: 'draft' },
  publishedAt: { type: Date },
  updatedAt: { type: Date, default: Date.now },
  version: { type: Number, default: 1 },
  // Array of category references
  categories: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category'
  }]
});

PostSchema.index({ title: 'text', content: 'text' });

module.exports = mongoose.model('Post', PostSchema);
