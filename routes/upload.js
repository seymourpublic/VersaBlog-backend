// routes/upload.js - Enhanced version
const express = require('express');
const multer = require('multer');
const sharp = require('sharp'); // npm install sharp
const crypto = require('crypto');
const path = require('path');
const s3 = require('../config/awsConfig');
const logger = require('../config/logger');
const Image = require('../models/Image');
const router = express.Router();

// Enhanced multer configuration
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 5 // Max 5 files at once
  },
  fileFilter: (req, file, cb) => {
    // Enhanced file type validation
    const allowedTypes = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'image/svg+xml': 'svg'
    };
    
    if (allowedTypes[file.mimetype]) {
      file.extension = allowedTypes[file.mimetype];
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Allowed: ${Object.keys(allowedTypes).join(', ')}`), false);
    }
  }
});

// Image processing function
async function processImage(buffer, mimetype, options = {}) {
  // Skip processing for GIFs and SVGs to preserve animations/vector format
  if (mimetype === 'image/gif' || mimetype === 'image/svg+xml') {
    return { original: buffer };
  }

  const {
    quality = 85,
    maxWidth = 1920,
    maxHeight = 1080,
    createThumbnail = true,
    createMedium = true
  } = options;

  const results = {};
  
  try {
    // Original optimized version
    const originalSharp = sharp(buffer);
    const metadata = await originalSharp.metadata();
    
    // Only resize if image is larger than max dimensions
    let processedOriginal = originalSharp;
    if (metadata.width > maxWidth || metadata.height > maxHeight) {
      processedOriginal = processedOriginal.resize(maxWidth, maxHeight, {
        fit: 'inside',
        withoutEnlargement: true
      });
    }
    
    results.original = await processedOriginal
      .jpeg({ quality, progressive: true })
      .toBuffer();

    // Medium size (50% of original, max 800px width)
    if (createMedium) {
      results.medium = await sharp(buffer)
        .resize(800, 600, { 
          fit: 'inside', 
          withoutEnlargement: true 
        })
        .jpeg({ quality: 80, progressive: true })
        .toBuffer();
    }

    // Thumbnail (150x150, cropped to center)
    if (createThumbnail) {
      results.thumbnail = await sharp(buffer)
        .resize(150, 150, { 
          fit: 'cover',
          position: 'center'
        })
        .jpeg({ quality: 75 })
        .toBuffer();
    }

    return results;
  } catch (error) {
    logger.error('Image processing failed:', error);
    // Fallback to original buffer
    return { original: buffer };
  }
}

// Generate unique filename
function generateFilename(originalName, suffix = '') {
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(8).toString('hex');
  const ext = path.extname(originalName).toLowerCase();
  const baseName = path.basename(originalName, ext).replace(/[^a-zA-Z0-9]/g, '-');
  
  return `${timestamp}-${randomString}-${baseName}${suffix}${ext}`;
}

// Upload to S3 with retry logic
async function uploadToS3(buffer, filename, contentType, retries = 3) {
  const params = {
    Bucket: process.env.AWS_S3_BUCKET,
    Key: `images/${filename}`,
    Body: buffer,
    ContentType: contentType,
    CacheControl: 'max-age=31536000', // 1 year cache
    Metadata: {
      'uploaded-by': 'versablog-backend',
      'upload-timestamp': new Date().toISOString()
    }
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await s3.upload(params).promise();
      return result;
    } catch (error) {
      logger.warn(`S3 upload attempt ${attempt} failed:`, error.message);
      if (attempt === retries) {
        throw error;
      }
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
}

// POST /api/v1/upload - Single file upload (backward compatible)
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ 
        error: 'No file provided',
        code: 'NO_FILE'
      });
    }

    // Processing options from query params
    const options = {
      quality: parseInt(req.query.quality) || 85,
      maxWidth: parseInt(req.query.maxWidth) || 1920,
      maxHeight: parseInt(req.query.maxHeight) || 1080,
      createThumbnail: req.query.thumbnail !== 'false',
      createMedium: req.query.medium !== 'false'
    };

    // Process image
    const processedImages = await processImage(file.buffer, file.mimetype, options);
    
    const uploadPromises = [];
    const urls = {};

    // Upload all versions
    for (const [size, buffer] of Object.entries(processedImages)) {
      const suffix = size === 'original' ? '' : `-${size}`;
      const filename = generateFilename(file.originalname, suffix);
      
      uploadPromises.push(
        uploadToS3(buffer, filename, file.mimetype)
          .then(result => {
            urls[size] = result.Location;
          })
      );
    }

    await Promise.all(uploadPromises);

    // Save to database if postId provided
    let imageRecord = null;
    if (req.body.postId) {
      imageRecord = new Image({
        postId: req.body.postId,
        url: urls.original,
        altText: req.body.altText || '',
        thumbnailUrl: urls.thumbnail,
        mediumUrl: urls.medium,
        uploadedAt: new Date()
      });
      await imageRecord.save();
    }

    // Return comprehensive response
    res.json({
      success: true,
      // Backward compatible - main URL
      url: urls.original,
      // Enhanced response
      urls: urls,
      filename: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
      imageId: imageRecord?._id,
      metadata: {
        uploadedAt: new Date().toISOString(),
        processedSizes: Object.keys(urls)
      }
    });

  } catch (error) {
    logger.error('Upload failed:', {
      error: error.message,
      stack: error.stack,
      filename: req.file?.originalname
    });

    res.status(500).json({ 
      error: error.message,
      code: 'UPLOAD_FAILED'
    });
  }
});

// POST /api/v1/upload/multiple - Multiple file upload
router.post('/upload/multiple', upload.array('files', 5), async (req, res) => {
  try {
    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ 
        error: 'No files provided',
        code: 'NO_FILES'
      });
    }

    const results = [];
    const errors = [];

    // Process each file
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      try {
        const options = {
          quality: parseInt(req.query.quality) || 85,
          maxWidth: parseInt(req.query.maxWidth) || 1920,
          maxHeight: parseInt(req.query.maxHeight) || 1080,
          createThumbnail: req.query.thumbnail !== 'false',
          createMedium: req.query.medium !== 'false'
        };

        const processedImages = await processImage(file.buffer, file.mimetype, options);
        const uploadPromises = [];
        const urls = {};

        for (const [size, buffer] of Object.entries(processedImages)) {
          const suffix = size === 'original' ? '' : `-${size}`;
          const filename = generateFilename(file.originalname, suffix);
          
          uploadPromises.push(
            uploadToS3(buffer, filename, file.mimetype)
              .then(result => {
                urls[size] = result.Location;
              })
          );
        }

        await Promise.all(uploadPromises);

        // Save to database if postId provided
        let imageRecord = null;
        if (req.body.postId) {
          imageRecord = new Image({
            postId: req.body.postId,
            url: urls.original,
            altText: req.body.altText || '',
            thumbnailUrl: urls.thumbnail,
            mediumUrl: urls.medium,
            uploadedAt: new Date()
          });
          await imageRecord.save();
        }

        results.push({
          success: true,
          url: urls.original,
          urls: urls,
          filename: file.originalname,
          size: file.size,
          mimetype: file.mimetype,
          imageId: imageRecord?._id,
          index: i
        });

      } catch (error) {
        logger.error(`Failed to process file ${file.originalname}:`, error);
        errors.push({
          filename: file.originalname,
          error: error.message,
          index: i
        });
      }
    }

    res.json({
      success: results.length > 0,
      results: results,
      errors: errors,
      summary: {
        total: files.length,
        successful: results.length,
        failed: errors.length
      }
    });

  } catch (error) {
    logger.error('Multiple upload failed:', error);
    res.status(500).json({ 
      error: error.message,
      code: 'MULTIPLE_UPLOAD_FAILED'
    });
  }
});

// GET /api/v1/upload/progress/:uploadId - Upload progress tracking
const uploadProgress = new Map();

router.get('/progress/:uploadId', (req, res) => {
  const progress = uploadProgress.get(req.params.uploadId) || { percent: 0, status: 'not_found' };
  res.json(progress);
});

// DELETE /api/v1/upload/:imageId - Delete uploaded image
router.delete('/:imageId', async (req, res) => {
  try {
    const imageRecord = await Image.findById(req.params.imageId);
    if (!imageRecord) {
      return res.status(404).json({
        error: 'Image not found',
        code: 'IMAGE_NOT_FOUND'
      });
    }

    // Extract S3 key from URL
    const urlParts = imageRecord.url.split('/');
    const s3Key = urlParts.slice(-2).join('/'); // images/filename

    // Delete from S3
    const deleteParams = {
      Bucket: process.env.AWS_S3_BUCKET,
      Key: s3Key
    };

    await s3.deleteObject(deleteParams).promise();

    // Delete from database
    await Image.findByIdAndDelete(req.params.imageId);

    res.json({
      success: true,
      message: 'Image deleted successfully'
    });

  } catch (error) {
    logger.error('Image deletion failed:', error);
    res.status(500).json({
      error: error.message,
      code: 'DELETE_FAILED'
    });
  }
});

// GET /api/v1/upload/images/:postId - Get all images for a post
router.get('/images/:postId', async (req, res) => {
  try {
    const images = await Image.find({ postId: req.params.postId })
      .sort({ uploadedAt: -1 });

    res.json({
      success: true,
      images: images,
      count: images.length
    });

  } catch (error) {
    logger.error('Failed to fetch post images:', error);
    res.status(500).json({
      error: error.message,
      code: 'FETCH_FAILED'
    });
  }
});

module.exports = router;