const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

// Directory where attachments are stored
const uploadDir = path.join(__dirname, '..', 'uploads', 'attachments');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Allowed MIME types
const MIME_EXT_MAP = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = MIME_EXT_MAP[file.mimetype.toLowerCase()] || path.extname(file.originalname).toLowerCase() || '.bin';
    const uniqueName = `att_${Date.now()}_${crypto.randomUUID()}${ext}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (req, file, cb) => {
  const mime = file.mimetype.toLowerCase();
  if (MIME_EXT_MAP[mime]) {
    cb(null, true);
  } else {
    const err = new Error('Invalid attachment type: only JPEG, PNG, WebP images and PDF documents are allowed');
    err.code = 'INVALID_FILE_TYPE';
    cb(err, false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB limit
    files: 3,                   // Maximum 3 attachments per message
  },
});

/**
 * Validates actual file content via magic bytes.
 */
function validateMagicBytes(filePath) {
  try {
    const buffer = Buffer.alloc(8);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buffer, 0, 8, 0);
    fs.closeSync(fd);

    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
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
    // WebP: RIFF ... WEBP
    if (
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 // check first 4 RIFF
    ) {
      return 'webp';
    }
    // PDF: %PDF (25 50 44 46)
    if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
      return 'pdf';
    }

    return null;
  } catch {
    return null;
  }
}

const handleAttachmentUpload = (req, res, next) => {
  upload.array('attachments', 3)(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'Attachment too large: maximum size is 10 MB per file' });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ message: 'Maximum 3 attachments per message allowed' });
      }
      return res.status(400).json({ message: `Attachment upload error: ${err.message}` });
    }
    if (err) {
      return res.status(400).json({ message: err.message || 'Attachment upload failed' });
    }

    // Verify magic bytes
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const detected = validateMagicBytes(file.path);
        if (!detected) {
          // Cleanup uploaded files
          req.files.forEach((f) => {
            if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
          });
          return res.status(400).json({
            message: `File "${file.originalname}" failed security validation. File content does not match supported formats.`,
          });
        }
      }
    }

    next();
  });
};

function deleteUploadedFiles(files) {
  if (!files || !Array.isArray(files)) return;
  files.forEach((file) => {
    const p = file.path || path.join(uploadDir, file.filename || '');
    if (fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
      } catch (e) {
        console.error('Failed to delete file:', p, e.message);
      }
    }
  });
}

module.exports = {
  handleAttachmentUpload,
  deleteUploadedFiles,
  uploadDir,
};
