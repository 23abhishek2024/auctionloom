const pool = require('../db');
const razorpayService = require('../services/razorpayService');
const { isUUID } = require('../utils/validators');

/**
 * POST /api/payments/razorpay/create-order
 * Initiates an order with Razorpay and records pending transaction
 */
const createOrder = async (req, res, next) => {
  try {
    const { amount, purpose = 'COMMISSION', auction_id = null, notes = {} } = req.body;
    const userId = req.user.id;

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number greater than 0.' });
    }

    if (!['COMMISSION', 'LOT_PAYMENT'].includes(purpose)) {
      return res.status(400).json({ error: "Purpose must be either 'COMMISSION' or 'LOT_PAYMENT'." });
    }

    let validAuctionId = null;
    if (auction_id && isUUID(auction_id)) {
      try {
        const checkAuction = await pool.query('SELECT id FROM auctions WHERE id = $1', [auction_id]);
        if (checkAuction.rowCount > 0) {
          validAuctionId = auction_id;
        }
      } catch (err) {
        console.warn('Could not verify auction ID for payment:', err.message);
      }
    }

    const receiptId = `rcpt_${userId.slice(0, 8)}_${Date.now()}`;
    const order = await razorpayService.createOrder({
      amount: numericAmount,
      receipt: receiptId,
      notes: {
        ...notes,
        userId,
        purpose,
        auctionId: validAuctionId || auction_id || '',
      },
    });

    // Record order in payments audit table
    await pool.query(
      `INSERT INTO payments (
        user_id, auction_id, purpose, amount, currency, razorpay_order_id, status, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, 'CREATED', $7)`,
      [
        userId,
        validAuctionId,
        purpose,
        numericAmount,
        order.currency || 'INR',
        order.id,
        JSON.stringify(notes),
      ]
    );

    res.status(201).json({
      orderId: order.id,
      amount: order.amount, // in paise
      currency: order.currency || 'INR',
      keyId: razorpayService.getKeyId(),
      amountInRupees: numericAmount,
      purpose,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/payments/razorpay/verify
 * Cryptographically verifies the Razorpay HMAC-SHA256 signature
 * and settles the corresponding commission ledger or lot invoice.
 */
const verifyPayment = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const userId = req.user.id;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        error: 'Missing required parameters: razorpay_order_id, razorpay_payment_id, and razorpay_signature are required.',
      });
    }

    // 1. Cryptographic HMAC-SHA256 Verification
    const isValid = razorpayService.verifySignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
    });

    if (!isValid) {
      return res.status(400).json({
        error: 'Invalid payment signature. Authentication failed — transaction could not be verified.',
      });
    }

    await client.query('BEGIN');

    // 2. Fetch corresponding payment record
    const paymentRes = await client.query(
      `SELECT * FROM payments WHERE razorpay_order_id = $1 AND user_id = $2 FOR UPDATE`,
      [razorpay_order_id, userId]
    );

    let payment = null;
    if (paymentRes.rowCount === 0) {
      // Dynamic fallback record for client-side sandbox order
      const insertRes = await client.query(
        `INSERT INTO payments (
          user_id, purpose, amount, currency, razorpay_order_id, razorpay_payment_id, razorpay_signature, status, verified_at
        ) VALUES ($1, 'LOT_PAYMENT', 0, 'INR', $2, $3, $4, 'SUCCESS', NOW())
        RETURNING *`,
        [userId, razorpay_order_id, razorpay_payment_id, razorpay_signature]
      );
      payment = insertRes.rows[0];
    } else {
      payment = paymentRes.rows[0];
    }

    // Check if already processed (Idempotency)
    if (payment.status === 'SUCCESS') {
      await client.query('COMMIT');
      return res.json({
        success: true,
        message: 'Payment was already verified and settled.',
        payment,
      });
    }

    // 3. Mark payment status as SUCCESS
    await client.query(
      `UPDATE payments 
       SET status = 'SUCCESS',
           razorpay_payment_id = $1,
           razorpay_signature = $2,
           verified_at = NOW()
       WHERE id = $3`,
      [razorpay_payment_id, razorpay_signature, payment.id]
    );

    let updatedUnpaidCommission = 0;

    // 4. If purpose is COMMISSION, automatically decrement unpaid_commission balance
    if (payment.purpose === 'COMMISSION') {
      const userUpdateRes = await client.query(
        `UPDATE users 
         SET unpaid_commission = GREATEST(0, unpaid_commission - $1)
         WHERE id = $2
         RETURNING unpaid_commission`,
        [payment.amount, userId]
      );
      updatedUnpaidCommission = userUpdateRes.rows[0]?.unpaid_commission || 0;

      // Automatically insert approved commission receipt proof
      await client.query(
        `INSERT INTO commission_proofs (
          user_id, amount, payment_method, transaction_id, proof_url, screenshot_url, comment, notes, status, admin_notes, reviewed_at
        ) VALUES ($1, $2, 'RAZORPAY_GATEWAY', $3, 'https://razorpay.com/payment-verified', 'https://razorpay.com/payment-verified', 'Automated instant settlement via Razorpay UPI/Card', 'Automated instant settlement via Razorpay UPI/Card', 'APPROVED', 'Cryptographically verified via HMAC-SHA256', NOW())`,
        [userId, payment.amount, razorpay_payment_id]
      );
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Payment verified and settled successfully via Razorpay!',
      payment_id: razorpay_payment_id,
      order_id: razorpay_order_id,
      amount_settled: payment.amount,
      unpaid_commission: updatedUnpaidCommission,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

/**
 * GET /api/payments/my-history
 * Returns user payment transaction audit trail
 */
const getMyPayments = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json({ payments: result.rows });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createOrder,
  verifyPayment,
  getMyPayments,
};
