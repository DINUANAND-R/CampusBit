const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { inspectVideoFile } = require('../utils/videoInspection');

// Directory where listing media (images and videos) are stored
const uploadDir = path.join(__dirname, '..', 'uploads', 'listings');

// Ensure directory exists safely
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Allowed MIME types and corresponding extensions
const IMAGE_MIME_MAP = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

const VIDEO_MIME_MAP = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
};

const ALL_MIME_MAP = {
  ...IMAGE_MIME_MAP,
  ...VIDEO_MIME_MAP,
};

// Storage configuration with collision-resistant UUID filenames
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique UUID filename — never trust original filename or extension
    const mime = file.mimetype.toLowerCase();
    const ext = ALL_MIME_MAP[mime] || path.extname(file.originalname).toLowerCase() || (file.fieldname === 'video' ? '.mp4' : '.jpg');
    const uniqueName = `${crypto.randomUUID()}${ext}`;
    cb(null, uniqueName);
  },
});

// File filter (initial MIME check)
const fileFilter = (req, file, cb) => {
  const mime = file.mimetype.toLowerCase();
  if (file.fieldname === 'images') {
    if (IMAGE_MIME_MAP[mime]) {
      cb(null, true);
    } else {
      const err = new Error('Invalid file type: only JPEG, PNG, and WebP images are allowed');
      err.code = 'INVALID_FILE_TYPE';
      cb(err, false);
    }
  } else if (file.fieldname === 'video') {
    if (VIDEO_MIME_MAP[mime]) {
      cb(null, true);
    } else {
      const err = new Error('Invalid video format: only MP4 and WebM videos are allowed');
      err.code = 'INVALID_VIDEO_TYPE';
      cb(err, false);
    }
  } else {
    // For general compatibility
    if (ALL_MIME_MAP[mime]) {
      cb(null, true);
    } else {
      const err = new Error('Invalid file type');
      err.code = 'INVALID_FILE_TYPE';
      cb(err, false);
    }
  }
};

// Multer instance: supports images (up to 5) and video (1), max overall file size 50 MB
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB maximum per file
    files: 6,                   // 5 images + 1 video max
  },
});

/**
 * Validates image file content using magic byte signatures.
 * Returns the detected extension ('jpg', 'png', 'webp') or null.
 */
const validateMagicBytes = (filePath) => {
  try {
    const buffer = Buffer.alloc(12);
    const fd = fs.openSync(filePath, 'r');
    try {
      fs.readSync(fd, buffer, 0, 12, 0);
    } finally {
      fs.closeSync(fd);
    }

    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'jpg';
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    ) {
      return 'png';
    }

    // WebP: RIFF .... WEBP
    if (
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    ) {
      return 'webp';
    }

    return null;
  } catch (err) {
    console.error('Error reading magic bytes:', err);
    return null;
  }
};

/**
 * Safely delete an array or object of Multer files or paths from disk
 */
const deleteUploadedFiles = async (files) => {
  if (!files) return;
  const list = [];
  if (Array.isArray(files)) {
    list.push(...files);
  } else if (typeof files === 'object') {
    if (Array.isArray(files.images)) list.push(...files.images);
    if (Array.isArray(files.video)) list.push(...files.video);
  }

  for (const file of list) {
    const filePath = typeof file === 'string'
      ? (path.isAbsolute(file) ? file : path.join(uploadDir, path.basename(file)))
      : (file.path || path.join(uploadDir, file.filename));

    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
    } catch (err) {
      console.error(`Failed to delete file ${filePath}:`, err.message);
    }
  }
};

/**
 * Safely delete a single listing file by filename (prevents directory traversal
 * and ensures file is not still referenced by another listing).
 */
const deleteListingFile = async (filename) => {
  if (!filename || typeof filename !== 'string') return;
  const safeFilename = path.basename(filename);
  const filePath = path.join(uploadDir, safeFilename);
  try {
    const Listing = require('../models/Listing');
    const [imageRef, videoRef] = await Promise.all([
      Listing.countDocuments({ 'images.filename': safeFilename }),
      Listing.countDocuments({ 'video.filename': safeFilename }),
    ]);

    if (imageRef === 0 && videoRef === 0 && fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  } catch (err) {
    console.error(`Failed to delete file ${safeFilename}:`, err.message);
  }
};

/**
 * Reusable Express middleware handling upload.fields([
 *   { name: 'images', maxCount: 5 },
 *   { name: 'video', maxCount: 1 }
 * ])
 * with Multer error handling, image size checks (5MB), video size checks (50MB),
 * magic bytes verification, and video duration inspection (max 60s).
 */
const uploadListingImages = (req, res, next) => {
  const handler = upload.fields([
    { name: 'images', maxCount: 5 },
    { name: 'video', maxCount: 1 },
  ]);

  handler(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'File size exceeds maximum allowed upload limit' });
      }
      if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ message: 'Upload limit exceeded: maximum 5 images and 1 video allowed' });
      }
      if (err.code === 'INVALID_FILE_TYPE' || err.code === 'INVALID_VIDEO_TYPE') {
        return res.status(400).json({ message: err.message });
      }
      return res.status(400).json({ message: err.message || 'File upload error' });
    }

    // Extract images and video
    const imageFiles = req.files?.images || (Array.isArray(req.files) ? req.files.filter((f) => f.fieldname === 'images' || !f.fieldname) : []);
    const videoFiles = req.files?.video || (Array.isArray(req.files) ? req.files.filter((f) => f.fieldname === 'video') : []);

    // Create combined array with attached .images and .video properties for full backwards-compatibility
    const combinedFiles = [...imageFiles, ...videoFiles];
    combinedFiles.images = imageFiles;
    combinedFiles.video = videoFiles;
    req.files = combinedFiles;

    // 1. Validate images (5MB limit & magic bytes)
    for (const file of imageFiles) {
      if (file.size > 5 * 1024 * 1024) {
        await deleteUploadedFiles(req.files);
        return res.status(400).json({ message: 'File size exceeds 5 MB limit per image' });
      }

      const detected = validateMagicBytes(file.path);
      if (!detected) {
        await deleteUploadedFiles(req.files);
        return res.status(400).json({
          message: `File "${file.originalname}" has invalid content. Only authentic JPEG, PNG, and WebP images are allowed.`,
        });
      }
    }

    // 2. Validate video if uploaded
    if (videoFiles.length > 0) {
      const vFile = videoFiles[0];

      if (vFile.size > 50 * 1024 * 1024) {
        await deleteUploadedFiles(req.files);
        return res.status(400).json({ message: 'Video file size exceeds maximum 50 MB limit' });
      }

      const videoInspection = await inspectVideoFile(vFile.path, 60, 50 * 1024 * 1024);
      if (!videoInspection.valid) {
        await deleteUploadedFiles(req.files);
        return res.status(400).json({
          message: videoInspection.error || 'Invalid video file. Only valid MP4 and WebM videos up to 60 seconds are allowed.',
        });
      }

      // Attach inspection result to file for controller use
      vFile.videoMeta = videoInspection;
    }

    next();
  });
};

module.exports = {
  uploadListingImages,
  uploadListingMedia: uploadListingImages,
  deleteUploadedFiles,
  deleteListingFile,
  uploadDir,
};
