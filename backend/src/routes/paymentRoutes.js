const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth');
const paymentController = require('../controllers/paymentController');

// All payment routes require authenticated user
router.use(authMiddleware);

router.post('/razorpay/create-order', paymentController.createOrder);
router.post('/razorpay/verify', paymentController.verifyPayment);
router.get('/my-history', paymentController.getMyPayments);

module.exports = router;
