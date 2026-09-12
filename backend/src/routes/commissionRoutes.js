const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/auth');
const upload = require('../middlewares/upload');
const commissionController = require('../controllers/commissionController');

router.use(authMiddleware);

// Submit proof screenshot for unpaid commission
router.post('/proof', upload.single('proof'), commissionController.submitProof);

// Get logged-in user's submitted proofs and unpaid balance
router.get('/my-proofs', commissionController.getMyProofs);

module.exports = router;
