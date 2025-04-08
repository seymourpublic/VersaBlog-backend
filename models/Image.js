// This file defines the Image model for storing image data in MongoDB using Mongoose.
// It includes fields for post ID, URL, alt text, and upload date.
// models/Image.js
const mongoose = require('mongoose');

const ImageSchema = new mongoose.Schema({
  postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
  url: { type: String, required: true },
  altText: { type: String },
  uploadedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Image', ImageSchema);
