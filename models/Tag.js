// File: models/Tag.js
// This file defines the Tag model for the blog application using Mongoose.
// It includes a field for the tag name, which is unique and required. The model is exported for use in other parts of the application.
// models/Tag.js
const mongoose = require('mongoose');

const TagSchema = new mongoose.Schema({
  name: { type: String, unique: true, required: true }
});

module.exports = mongoose.model('Tag', TagSchema);
