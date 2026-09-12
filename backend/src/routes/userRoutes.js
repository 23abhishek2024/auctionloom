const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth');
const {
  getMyStats,
  getMyAuctions,
  getMyBids,
  getMyWon,
} = require('../controllers/userController');

// All /api/users/me/* routes require authentication
router.use(authMiddleware);

router.get('/me/stats', getMyStats);
router.get('/me/auctions', getMyAuctions);
router.get('/me/bids', getMyBids);
router.get('/me/won', getMyWon);

module.exports = router;
