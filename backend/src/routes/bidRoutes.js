const express = require('express');
const router = express.Router();
const { placeBid, getBidsForAuction } = require('../controllers/bidController');
const { authMiddleware } = require('../middlewares/auth');

router.get('/:auction_id', getBidsForAuction);
router.post('/', authMiddleware, placeBid);

module.exports = router;
