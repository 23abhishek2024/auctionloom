const pool = require('../db');
const { isPositiveNumber } = require('../utils/validators');

/**
 * POST /api/commissions/proof
 * Submit payment proof for outstanding platform commission
 */
const submitProof = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { amount, comment } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'Payment receipt screenshot image is required.' });
    }

    if (!amount || !isPositiveNumber(parseFloat(amount))) {
      return res.status(400).json({ error: 'Valid payment amount is required.' });
    }

    const numericAmount = parseFloat(amount);

    // Verify user exists and check unpaid commission balance
    const userRes = await pool.query('SELECT unpaid_commission FROM users WHERE id = $1', [userId]);
    if (userRes.rowCount === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const unpaidCommission = parseFloat(userRes.rows[0].unpaid_commission || 0);
    if (unpaidCommission <= 0) {
      return res.status(400).json({
        error: 'You do not currently have any unpaid platform commission.',
        unpaidCommission: 0,
      });
    }

    // Relative URL to static uploaded file
    const proofUrl = `/uploads/${req.file.filename}`;

    const result = await pool.query(
      `INSERT INTO commission_proofs (user_id, amount, comment, proof_url, status)
       VALUES ($1, $2, $3, $4, 'PENDING')
       RETURNING *`,
      [userId, numericAmount, comment ? comment.trim() : null, proofUrl]
    );

    res.status(201).json({
      message: 'Payment proof submitted successfully! An administrator will review and verify your settlement shortly.',
      proof: result.rows[0],
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
    const userId = req.user.id;
    const result = await pool.query(
      `SELECT * FROM commission_proofs WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );

    const userRes = await pool.query('SELECT unpaid_commission FROM users WHERE id = $1', [userId]);

    res.json({
      unpaidCommission: parseFloat(userRes.rows[0]?.unpaid_commission || 0),
      proofs: result.rows.map(p => ({
        ...p,
        amount: parseFloat(p.amount),
      })),
      count: result.rows.length,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  submitProof,
  getMyProofs,
};
