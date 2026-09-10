const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const { authMiddleware, roleMiddleware } = require('../middlewares/auth');

// POST /api/ai/generate (Restricted to auctioneer and admin roles)
router.post(
  '/generate',
  authMiddleware,
  roleMiddleware('auctioneer', 'admin'),
  aiController.generateDescription
);

module.exports = router;
