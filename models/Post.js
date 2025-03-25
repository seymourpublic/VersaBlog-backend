// models/Post.js
const mongoose = require('mongoose');

const PostSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  slug: { type: String },
  status: { type: String, default: 'draft' },
  publishedAt: { type: Date },
  updatedAt: { type: Date, default: Date.now },
  version: { type: Number, default: 1 } // Increment on each update
});

module.exports = mongoose.model('Post', PostSchema);
