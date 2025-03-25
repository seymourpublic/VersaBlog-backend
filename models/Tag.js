// models/Tag.js
const mongoose = require('mongoose');

const TagSchema = new mongoose.Schema({
  name: { type: String, unique: true, required: true }
});

module.exports = mongoose.model('Tag', TagSchema);
