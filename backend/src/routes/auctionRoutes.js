const express = require('express');
const router = express.Router();
const {
  getAllAuctions,
  getAuctionById,
  createAuction,
  deleteAuction,
  republishAuction,
} = require('../controllers/auctionController');
const { getBidsForAuction, placeBid } = require('../controllers/bidController');
const { authMiddleware, optionalAuth, roleMiddleware } = require('../middlewares/auth');

// Public, but a logged-in admin also gets emails, and the winner or seller the email-preview link
router.get('/', optionalAuth, getAllAuctions);
router.get('/:id', optionalAuth, getAuctionById);
// Only auctioneers and admins can create auctions
router.post('/', authMiddleware, roleMiddleware('auctioneer', 'admin'), createAuction);
router.delete('/:id', authMiddleware, deleteAuction);

// 1-Click Republish closed auction
router.post('/:id/republish', authMiddleware, roleMiddleware('auctioneer', 'admin'), republishAuction);
router.put('/:id/republish', authMiddleware, roleMiddleware('auctioneer', 'admin'), republishAuction);

// Nested RESTful bid endpoints
router.get('/:id/bids', getBidsForAuction);
router.post('/:id/bids', authMiddleware, placeBid);

module.exports = router;


