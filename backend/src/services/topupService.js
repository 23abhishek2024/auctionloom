const crypto = require('crypto');
const pool = require('../db');
const walletService = require('./walletService');
const { AppError } = require('../utils/AppError');

/**
 * Top-Up & Payout Service
 * Simulated top-ups and withdrawals (provider INTERNAL), each recorded as a payment request.
 * A real gateway (Razorpay, Stripe) would create the request first and credit the wallet from the
 * gateway's confirmation callback, through the same creditWallet call.
 */

async function requestTopup(userId, amount, provider = 'INTERNAL', metadata = {}) {
  const numericAmount = parseFloat(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    throw new AppError(400, 'Top-up amount must be a positive number');
  }

  // Future external gateway workflow: record the request; the gateway's callback credits the wallet later
  if (provider !== 'INTERNAL') {
    const wallet = await walletService.getOrCreateWallet(userId);
    const reqRes = await pool.query(
      `INSERT INTO payment_requests (wallet_id, amount, currency, type, provider, status, metadata)
       VALUES ($1, $2, 'USD', 'TOPUP', $3, 'PENDING', $4)
       RETURNING *`,
      [wallet.id, numericAmount, provider, JSON.stringify({ note: metadata.note || null })]
    );
    return { paymentRequest: reqRes.rows[0], wallet };
  }

  // Simulated (INTERNAL) top-up. The payment request, the credit and the ledger row are written in one
  // transaction. If the browser sends an Idempotency-Key, a double click or a retry with the same key
  // credits the wallet once. (Before, every request created a new payment request and a new key.)
  const clientKey = metadata.idempotencyKey ? `topup_${userId}_${metadata.idempotencyKey}` : null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const wallet = await walletService.getOrCreateWallet(userId, client);
    // Lock the wallet first: a second request with the same key waits here until the first one
    // commits, and then finds its ledger row below instead of crediting again.
    await client.query('SELECT id FROM wallets WHERE id = $1 FOR UPDATE', [wallet.id]);

    if (clientKey) {
      const existing = await client.query('SELECT * FROM wallet_transactions WHERE idempotency_key = $1', [clientKey]);
      if (existing.rows.length > 0) {
        await client.query('COMMIT');
        const current = await walletService.getOrCreateWallet(userId);
        return {
          alreadyProcessed: true,
          wallet: { ...current, balance: parseFloat(current.balance) },
          transaction: {
            ...existing.rows[0],
            amount: parseFloat(existing.rows[0].amount),
            balance_after: parseFloat(existing.rows[0].balance_after),
          },
        };
      }
    }

    // 1. Payment request record (kept for a future real gateway)
    const reqRes = await client.query(
      `INSERT INTO payment_requests (wallet_id, amount, currency, type, provider, status, metadata)
       VALUES ($1, $2, 'USD', 'TOPUP', 'INTERNAL', 'PENDING', $3)
       RETURNING *`,
      [wallet.id, numericAmount, JSON.stringify({ note: metadata.note || null })]
    );
    const paymentRequest = reqRes.rows[0];

    // 2. Credit the wallet and write the ledger row
    const creditResult = await walletService.creditWallet({
      userId,
      amount: numericAmount,
      type: 'TOPUP',
      referenceType: 'TOPUP_REQUEST',
      referenceId: paymentRequest.id,
      idempotencyKey: clientKey || `topup_req_${paymentRequest.id}`,
      metadata: { provider: 'INTERNAL', note: metadata.note || 'User-initiated wallet top-up' },
      client,
    });

    // 3. Mark the payment request COMPLETED
    await client.query(
      `UPDATE payment_requests
       SET status = 'COMPLETED', updated_at = NOW()
       WHERE id = $1`,
      [paymentRequest.id]
    );

    await client.query('COMMIT');

    return {
      paymentRequest: { ...paymentRequest, status: 'COMPLETED' },
      wallet: creditResult.wallet,
      transaction: creditResult.transaction,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function requestWithdrawal(userId, amount, metadata = {}) {
  const numericAmount = parseFloat(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    throw new AppError(400, 'Withdrawal amount must be a positive number');
  }

  // One key per withdrawal. If the browser sends an Idempotency-Key header, a retry of the same
  // click reuses it and is not paid out twice; otherwise every request gets a fresh random key.
  // (The old key was built from Date.now(), so two withdrawals in the same millisecond shared a key
  //  and the second one was reported as successful without debiting the wallet.)
  const idempotencyKey = metadata.idempotencyKey
    ? `withdrawal_${userId}_${metadata.idempotencyKey}`
    : `withdrawal_${userId}_${crypto.randomUUID()}`;

  // The debit and the payout record are written in one transaction: both happen or neither does.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const wallet = await walletService.getOrCreateWallet(userId, client);
    // Lock the wallet before checking the key: two requests with the same key then run one after
    // the other, and the second finds the first one's ledger row instead of failing on the unique key.
    await client.query('SELECT id FROM wallets WHERE id = $1 FOR UPDATE', [wallet.id]);

    // 1. Debit wallet (checks the key, then the balance)
    const debitResult = await walletService.debitWallet({
      userId,
      amount: numericAmount,
      type: 'WITHDRAWAL',
      referenceType: 'PAYOUT_REQUEST',
      idempotencyKey,
      metadata: { note: metadata.note || 'Platform payout withdrawal' },
      client,
    });

    // A retry of a withdrawal that already went through: don't record a second payout
    if (debitResult.alreadyProcessed) {
      await client.query('COMMIT');
      return {
        alreadyProcessed: true,
        wallet: debitResult.wallet,
        transaction: debitResult.transaction,
      };
    }

    // 2. Record the payout
    const reqRes = await client.query(
      `INSERT INTO payment_requests (wallet_id, amount, currency, type, provider, status, metadata)
       VALUES ($1, $2, 'USD', 'PAYOUT', 'INTERNAL', 'COMPLETED', $3)
       RETURNING *`,
      [wallet.id, numericAmount, JSON.stringify({ note: metadata.note || null })]
    );

    await client.query('COMMIT');

    return {
      paymentRequest: reqRes.rows[0],
      wallet: debitResult.wallet,
      transaction: debitResult.transaction,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  requestTopup,
  requestWithdrawal,
};

