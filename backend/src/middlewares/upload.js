/**
 * Multer File Upload Middleware (Node.js Video 28)
 *
 * Reads one image of at most 5 MB into memory; uploadService checks its content and stores it
 * in PostgreSQL. Nothing is written to the server's disk: on Render's free plan the disk is wiped
 * on every restart, redeploy or sleep, which used to make uploaded pictures disappear.
 */

const multer = require('multer');

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

// First check: the type the browser declares (the bytes are checked again in uploadService)
const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    const err = new Error('Invalid file type. Only JPEG, PNG, WEBP, and GIF images are permitted.');
    err.status = 400;
    cb(err, false);
  }
};

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: {
    fileSize: MAX_FILE_BYTES,
    files: 1,
  },
});

module.exports = upload;
module.exports.ALLOWED_MIME_TYPES = ALLOWED_MIME_TYPES;
module.exports.MAX_FILE_BYTES = MAX_FILE_BYTES;
