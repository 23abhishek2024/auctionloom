const pool = require('../db');
const walletService = require('./walletService');

/**
 * Top-Up & Payout Service
 * Provides payment request abstraction for both simulated internal funding
 * and future real-world payment gateway integrations (Stripe, Adyen, Banking APIs).
 */

async function requestTopup(userId, amount, provider = 'INTERNAL', metadata = {}) {
  const numericAmount = parseFloat(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    throw new Error('Top-up amount must be a positive number');
  }

  const wallet = await walletService.getOrCreateWallet(userId);

  // 1. Create gateway-ready payment request record
  const reqRes = await pool.query(
    `INSERT INTO payment_requests (wallet_id, amount, currency, type, provider, status, metadata)
     VALUES ($1, $2, 'USD', 'TOPUP', $3, 'PENDING', $4)
     RETURNING *`,
    [wallet.id, numericAmount, provider, JSON.stringify(metadata || {})]
  );
  const paymentRequest = reqRes.rows[0];

  // 2. If provider is INTERNAL, fulfill immediately
  if (provider === 'INTERNAL') {
    const idempotencyKey = `topup_req_${paymentRequest.id}`;
    const creditResult = await walletService.creditWallet({
      userId,
      amount: numericAmount,
      type: 'TOPUP',
      referenceType: 'TOPUP_REQUEST',
      referenceId: paymentRequest.id,
      idempotencyKey,
      metadata: { provider: 'INTERNAL', note: metadata.note || 'User-initiated wallet top-up' },
    });

    // Mark payment request as COMPLETED
    await pool.query(
      `UPDATE payment_requests 
       SET status = 'COMPLETED', updated_at = NOW()
       WHERE id = $1`,
      [paymentRequest.id]
    );

    return {
      paymentRequest: { ...paymentRequest, status: 'COMPLETED' },
      wallet: creditResult.wallet,
      transaction: creditResult.transaction,
    };
  }

  // Future external gateway workflow returns checkout URL / client token
  return {
    paymentRequest,
    wallet,
  };
}

async function requestWithdrawal(userId, amount, metadata = {}) {
  const numericAmount = parseFloat(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    throw new Error('Withdrawal amount must be a positive number');
  }

  const wallet = await walletService.getOrCreateWallet(userId);
  const idempotencyKey = `withdrawal_${Date.now()}_${userId.slice(0, 8)}`;

  // 1. Debit wallet first (ensures sufficient balance and locks funds)
  const debitResult = await walletService.debitWallet({
    userId,
    amount: numericAmount,
    type: 'WITHDRAWAL',
    referenceType: 'PAYOUT_REQUEST',
    idempotencyKey,
    metadata: { note: metadata.note || 'Platform payout withdrawal' },
  });

  const reqRes = await pool.query(
    `INSERT INTO payment_requests (wallet_id, amount, currency, type, provider, status, metadata)
     VALUES ($1, $2, 'USD', 'PAYOUT', 'INTERNAL', 'COMPLETED', $3)
     RETURNING *`,
    [wallet.id, numericAmount, JSON.stringify(metadata || {})]
  );

  return {
    paymentRequest: reqRes.rows[0],
    wallet: debitResult.wallet,
    transaction: debitResult.transaction,
  };
}

async function createPaymentRequest({ userId, amount, provider = 'INTERNAL', type = 'TOPUP', metadata = {} }) {
  const numericAmount = parseFloat(amount);
  const wallet = await walletService.getOrCreateWallet(userId);
  const reqRes = await pool.query(
    `INSERT INTO payment_requests (wallet_id, amount, currency, type, provider, status, metadata)
     VALUES ($1, $2, 'USD', $3, $4, 'CREATED', $5)
     RETURNING *`,
    [wallet.id, numericAmount, type, provider, JSON.stringify(metadata || {})]
  );
  return reqRes.rows[0];
}

async function markPaymentVerified(requestId, { providerPaymentId = null, providerSignature = null } = {}) {
  const res = await pool.query(
    `UPDATE payment_requests 
     SET status = 'VERIFIED', provider_payment_id = $2, provider_signature = $3, verified_at = NOW(), updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [requestId, providerPaymentId, providerSignature]
  );
  return res.rows[0];
}

/**
 * Standard Production Interface (matching architectural blueprint)
 */
async function initiateTopup(userId, amount, provider = 'INTERNAL', metadata = {}) {
  const numericAmount = parseFloat(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    throw new Error('Top-up amount must be a positive number');
  }

  // CURRENT: fake direct top-up with INTERNAL provider
  const request = await createPaymentRequest({ userId, amount: numericAmount, provider, type: 'TOPUP', metadata });
  
  if (provider === 'INTERNAL') {
    // No gateway call — just mark verified immediately
    await markPaymentVerified(request.id);
    const creditResult = await walletService.creditWallet({
      userId,
      amount: numericAmount,
      type: 'TOPUP',
      referenceType: 'TOPUP_REQUEST',
      referenceId: request.id,
      idempotencyKey: `topup_req_${request.id}`,
      metadata: { provider: 'INTERNAL', note: metadata.note || 'User-initiated wallet top-up' },
    });

    await pool.query(
      `UPDATE payment_requests 
       SET status = 'COMPLETED', updated_at = NOW()
       WHERE id = $1`,
      [request.id]
    );

    return {
      status: 'success',
      paymentRequest: { ...request, status: 'COMPLETED' },
      wallet: creditResult.wallet,
      transaction: creditResult.transaction,
    };
  }

  // LATER: real Razorpay/Stripe top-up — SAME signature, swappable internals
  return { status: 'pending', requestId: request.id, provider };
}

async function initiateWithdrawal(userId, amount, metadata = {}) {
  return requestWithdrawal(userId, amount, metadata);
}

module.exports = {
  createPaymentRequest,
  markPaymentVerified,
  initiateTopup,
  initiateWithdrawal,
  requestTopup,
  requestWithdrawal,
};

