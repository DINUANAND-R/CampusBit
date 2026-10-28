const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

// Directory where listing images are stored
const uploadDir = path.join(__dirname, '..', 'uploads', 'listings');

// Ensure directory exists safely
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Allowed MIME types and corresponding extensions
const MIME_EXT_MAP = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

// Storage configuration with collision-resistant UUID filenames
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique UUID filename — never trust original filename or extension
    const ext = MIME_EXT_MAP[file.mimetype.toLowerCase()] || path.extname(file.originalname).toLowerCase() || '.jpg';
    const uniqueName = `${crypto.randomUUID()}${ext}`;
    cb(null, uniqueName);
  },
});

// File filter (initial MIME check)
const fileFilter = (req, file, cb) => {
  const mime = file.mimetype.toLowerCase();
  if (MIME_EXT_MAP[mime]) {
    cb(null, true);
  } else {
    const err = new Error('Invalid file type: only JPEG, PNG, and WebP images are allowed');
    err.code = 'INVALID_FILE_TYPE';
    cb(err, false);
  }
};

// Multer instance: max 5 files, 5 MB each
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB per file
    files: 5,                  // Maximum 5 files
  },
});

/**
 * Validates actual file content using magic byte signatures.
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
 * Safely delete an array of Multer files or paths from disk
 */
const deleteUploadedFiles = async (files) => {
  if (!files || !Array.isArray(files)) return;
  for (const file of files) {
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
 * Safely delete a single listing file by filename (prevents directory traversal)
 */
const deleteListingFile = async (filename) => {
  if (!filename || typeof filename !== 'string') return;
  const safeFilename = path.basename(filename);
  const filePath = path.join(uploadDir, safeFilename);
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  } catch (err) {
    console.error(`Failed to delete file ${safeFilename}:`, err.message);
  }
};

/**
 * Reusable Express middleware handling upload.array('images', 5)
 * with Multer error handling and magic bytes validation.
 */
const uploadListingImages = (req, res, next) => {
  const handler = upload.array('images', 5);

  handler(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'File size exceeds 5 MB limit per image' });
      }
      if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ message: 'Maximum 5 images allowed per listing' });
      }
      if (err.code === 'INVALID_FILE_TYPE') {
        return res.status(400).json({ message: err.message });
      }
      return res.status(400).json({ message: err.message || 'File upload error' });
    }

    // Verify magic bytes for all uploaded files
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const detected = validateMagicBytes(file.path);
        if (!detected) {
          // Clean up all uploaded files from this request
          await deleteUploadedFiles(req.files);
          return res.status(400).json({
            message: `File "${file.originalname}" has invalid content. Only authentic JPEG, PNG, and WebP images are allowed.`,
          });
        }
      }
    }

    next();
  });
};

module.exports = {
  uploadListingImages,
  deleteUploadedFiles,
  deleteListingFile,
  uploadDir,
};
