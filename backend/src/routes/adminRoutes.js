const express = require('express');
const router = express.Router();
const { authMiddleware, roleMiddleware } = require('../middlewares/auth');
const adminController = require('../controllers/adminController');

// All admin routes strictly require authentication and admin role (RBAC)
router.use(authMiddleware);
router.use(roleMiddleware('admin'));

// Platform metrics & revenue chart
router.get('/metrics', adminController.getAdminMetrics);
router.get('/revenue-chart', adminController.getRevenueChart);

// Commission analytics ledger & transactions feed
router.get('/commission-ledger', adminController.getCommissionLedger);
router.get('/commission-transactions', adminController.getCommissionTransactions);

// User management
router.get('/users', adminController.getAllUsers);
router.put('/users/:id/role', adminController.updateUserRole);

// Auction moderation & restriction
router.delete('/auctions/:id', adminController.forceDeleteAuction);
router.put('/auctions/:id/status', adminController.updateAuctionStatus);

// Commission proofs management
router.get('/commission-proofs', adminController.getAllPaymentProofs);
router.put('/commission-proofs/:id/status', adminController.updatePaymentProofStatus);

module.exports = router;
