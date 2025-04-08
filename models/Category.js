// This file defines the Category model for the blog application using Mongoose.
// It includes fields for name, slug, description, and parent category. The parent field is a reference to another Category document.
// The model also includes timestamps for created and updated dates.
// models/Category.js
const mongoose = require('mongoose');

const CategorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  slug: { type: String, required: true, unique: true },
  description: { type: String },
  parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null }
}, { timestamps: true });

module.exports = mongoose.model('Category', CategorySchema);
