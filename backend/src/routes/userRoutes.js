const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth');
const {
  getMyStats,
  getMyAuctions,
  getMyBids,
  getMyWon,
  upgradeToSeller,
  getLeaderboard,
  getPayoutMethods,
  updatePayoutMethods,
  getSellerPayoutForWinner,
} = require('../controllers/userController');

// Public Leaderboard route (no auth required)
router.get('/leaderboard', getLeaderboard);

// Authenticated user routes
router.get('/me/stats', authMiddleware, getMyStats);
router.get('/me/auctions', authMiddleware, getMyAuctions);
router.get('/me/bids', authMiddleware, getMyBids);
router.get('/me/won', authMiddleware, getMyWon);
router.post('/me/upgrade-seller', authMiddleware, upgradeToSeller);

// Payout methods
router.get('/me/payout-methods', authMiddleware, getPayoutMethods);
router.put('/me/payout-methods', authMiddleware, updatePayoutMethods);
router.get('/auction-payout/:auctionId', authMiddleware, getSellerPayoutForWinner);
router.get('/auctions/:auctionId/seller-payout', authMiddleware, getSellerPayoutForWinner);

module.exports = router;

