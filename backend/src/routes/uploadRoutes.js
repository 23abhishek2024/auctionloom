const express = require('express');
const router = express.Router();
const upload = require('../middlewares/upload');
const { authMiddleware } = require('../middlewares/auth');

/**
 * POST /api/upload - Upload an image file (Multer)
 * Requires authenticated user (auctioneer/admin/bidder)
 */
router.post('/', authMiddleware, (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'File upload failed.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Please select an image file to upload.' });
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    res.status(200).json({
      message: 'Image uploaded successfully.',
      filename: req.file.filename,
      url: fileUrl,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
  });
});

module.exports = router;
