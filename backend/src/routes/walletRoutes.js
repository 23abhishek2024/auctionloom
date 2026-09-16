const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const { authMiddleware } = require('../middlewares/auth');

/**
 * Wallet API Routes
 * All endpoints require valid JWT authentication.
 */

// Balance & Ledger Summary
router.get('/', authMiddleware, walletController.getWallet);

// Self-Service Simulated Top-Up
router.post('/topup', authMiddleware, walletController.topup);

// Winning Bidder Lot Settlement
router.post('/settle-lot', authMiddleware, walletController.settleLotPayment);

// Seller Commission Settlement
router.post('/settle-commission', authMiddleware, walletController.settleCommission);

// Payout / Withdrawal
router.post('/withdraw', authMiddleware, walletController.withdraw);

module.exports = router;
