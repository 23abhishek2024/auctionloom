const commissionService = require('../services/commissionService');
const uploadService = require('../services/uploadService');
const { requireMoney, optionalString } = require('../utils/validators');

/**
 * POST /api/commissions/proof
 * Submit payment proof for outstanding platform commission
 */
const submitProof = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Payment receipt screenshot image is required.' });
    }

    if (!req.body.amount) {
      return res.status(400).json({ error: 'Valid payment amount is required.' });
    }
    const amount = requireMoney(req.body.amount, 'Payment amount');
    const comment = optionalString(req.body.comment, 'Comment', 500);

    // The receipt image is stored only after the other fields passed their checks,
    // and only if there is commission to pay
    await commissionService.assertOwesCommission(req.user.id);
    const saved = await uploadService.saveImage(req.file, req.user.id);
    const proof = await commissionService.submitProof(req.user.id, {
      amount,
      comment,
      proofUrl: saved.url, // e.g. /uploads/<uuid>.png, served from the database
    });

    res.status(201).json({
      message: 'Payment proof submitted successfully! An administrator will review and verify your settlement shortly.',
      proof,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/commissions/my-proofs
 * Returns all payment proofs submitted by the logged-in user
 */
const getMyProofs = async (req, res, next) => {
  try {
    const { unpaidCommission, proofs } = await commissionService.getMyProofs(req.user.id);
    res.json({
      unpaidCommission,
      proofs,
      count: proofs.length,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  submitProof,
  getMyProofs,
};
