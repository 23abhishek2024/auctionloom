const express = require('express');
const router = express.Router();
const upload = require('../middlewares/upload');
const uploadService = require('../services/uploadService');
const { authMiddleware } = require('../middlewares/auth');

/**
 * POST /api/upload - Upload an image file (Multer, kept in memory, stored in PostgreSQL)
 * Requires authenticated user (auctioneer/admin/bidder)
 */
router.post('/', authMiddleware, (req, res, next) => {
  upload.single('image')(req, res, async (err) => {
    if (err) {
      // The client's fault (wrong file type, too large, ...): say what to fix. Anything else is ours.
      if (err.name === 'MulterError' || err.status === 400) {
        return res.status(400).json({ error: err.message || 'File upload failed.' });
      }
      return next(err);
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Please select an image file to upload.' });
    }

    try {
      const saved = await uploadService.saveImage(req.file, req.user.id);
      res.status(200).json({
        message: 'Image uploaded successfully.',
        filename: saved.url.replace('/uploads/', ''),
        url: saved.url,
        size: saved.size,
        mimetype: saved.mimeType,
      });
    } catch (saveErr) {
      next(saveErr);
    }
  });
});

module.exports = router;
