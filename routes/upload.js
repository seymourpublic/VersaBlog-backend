// routes/upload.js
const express = require('express');
const multer = require('multer');
const s3 = require('../config/awsConfig');
const router = express.Router();

// Use in-memory storage for file uploads
const upload = multer({ storage: multer.memoryStorage() });

// POST /api/v1/upload
router.post('/upload', upload.single('file'), (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'No file provided' });
  }
  
  const params = {
    Bucket: process.env.AWS_S3_BUCKET, // Your S3 bucket name
    Key: `${Date.now()}_${file.originalname}`,
    Body: file.buffer,
    ContentType: file.mimetype
  };

  s3.upload(params, (err, data) => {
    if (err) {
      console.error('S3 Upload Error:', err);
      return res.status(500).json({ error: 'Error uploading file' });
    }
    res.json({ url: data.Location });
  });
});

module.exports = router;
