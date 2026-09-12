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
const { authMiddleware, roleMiddleware } = require('../middlewares/auth');

router.get('/', getAllAuctions);
router.get('/:id', getAuctionById);
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


