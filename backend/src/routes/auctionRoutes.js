const express = require('express');
const router = express.Router();
const { getAllAuctions, getAuctionById, createAuction } = require('../controllers/auctionController');
const { authMiddleware, roleMiddleware } = require('../middlewares/auth');

router.get('/', getAllAuctions);
router.get('/:id', getAuctionById);
// Only auctioneers and admins can create auctions
router.post('/', authMiddleware, roleMiddleware('auctioneer', 'admin'), createAuction);

module.exports = router;
