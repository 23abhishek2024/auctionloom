const crypto = require('crypto');
const pool = require('../db');
const walletService = require('./walletService');
const { AppError } = require('../utils/AppError');

/**
 * Commission Service
 * The platform commission a seller owes (users.unpaid_commission) and the ways it gets paid:
 * from the seller's wallet in one click, or by uploading a bank-transfer receipt that an admin reviews.
 */

/**
 * Throws 400 unless the seller currently owes commission (404 if there is no such user).
 * Checked before a receipt image is stored, so a seller who owes nothing leaves no orphan upload.
 */
async function assertOwesCommission(userId) {
  const userRes = await pool.query('SELECT unpaid_commission FROM users WHERE id = $1', [userId]);
  if (userRes.rowCount === 0) {
    throw new AppError(404, 'User not found.');
  }
  const unpaidCommission = parseFloat(userRes.rows[0].unpaid_commission || 0);
  if (unpaidCommission <= 0) {
    throw new AppError(400, 'You do not currently have any unpaid platform commission.', { unpaidCommission: 0 });
  }
}

/**
 * Seller: record a payment receipt for review. Only allowed while the seller owes commission.
 * `proofUrl` is where the uploaded screenshot is served from.
 */
async function submitProof(userId, { amount, comment, proofUrl }) {
  await assertOwesCommission(userId);

  const result = await pool.query(
    `INSERT INTO commission_proofs (user_id, amount, comment, proof_url, status)
     VALUES ($1, $2, $3, $4, 'PENDING')
     RETURNING *`,
    [userId, amount, comment, proofUrl]
  );
  return result.rows[0];
}

/**
 * Seller: their receipts (newest first) and what they still owe
 */
async function getMyProofs(userId) {
  const result = await pool.query(
    `SELECT * FROM commission_proofs WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );

  const userRes = await pool.query('SELECT unpaid_commission FROM users WHERE id = $1', [userId]);

  return {
    unpaidCommission: parseFloat(userRes.rows[0]?.unpaid_commission || 0),
    proofs: result.rows.map((p) => ({
      ...p,
      amount: parseFloat(p.amount),
    })),
  };
}

/**
 * Seller: pay up to `amount` of the commission they owe straight from their wallet.
 * One transaction: debit the seller, credit the platform (the primary admin's wallet, or the
 * treasury if there is no admin), and lower the debt. Pays at most what is owed.
 */
async function payFromWallet(userId, amount) {
  const client = await pool.connect();
  let payAmount;
  let remainingUnpaid;
  let debitResult;

  try {
    await client.query('BEGIN');

    // 0. Lock both wallets (seller and platform) in the same sorted order that lot settlement uses,
    //    and before the user row, so this can't deadlock with a settlement touching the same wallets.
    const treasuryId = walletService.PLATFORM_TREASURY_USER_ID;
    const primaryAdminId = await walletService.getPrimaryAdminUserId(client);
    const recipientUserId = primaryAdminId || treasuryId;
    await walletService.lockWalletsInOrder(client, [userId, recipientUserId]);

    // 1. Check user unpaid commission
    const userRes = await client.query(
      'SELECT unpaid_commission FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );
    const unpaid = parseFloat(userRes.rows[0]?.unpaid_commission || 0);

    if (unpaid <= 0) {
      throw new AppError(400, 'You have no outstanding platform commission balance to settle.');
    }

    payAmount = Math.min(unpaid, amount);
    const idempotencyKey = `commission_debit_${userId}_${crypto.randomUUID()}`;

    // 2. Debit user wallet
    debitResult = await walletService.debitWallet({
      userId,
      amount: payAmount,
      type: 'COMMISSION',
      referenceType: 'COMMISSION_REQUEST',
      idempotencyKey,
      metadata: { note: 'Platform commission settlement from wallet' },
      client,
    });

    // 2b. Credit Platform Commission to Admin Wallet (single recipient, preventing double entries)
    if (recipientUserId) {
      await walletService.creditWallet({
        userId: recipientUserId,
        amount: payAmount,
        type: 'COMMISSION',
        referenceType: 'COMMISSION_REQUEST',
        idempotencyKey: `comm_recv_${userId}_${crypto.randomUUID()}`,
        metadata: {
          note: `Platform commission payment received from seller`,
          sellerId: userId,
        },
        client,
      });
    }

    // 3. Decrement user's unpaid commission
    remainingUnpaid = Math.max(0, Math.round((unpaid - payAmount) * 100) / 100);
    await client.query(
      'UPDATE users SET unpaid_commission = $1 WHERE id = $2',
      [remainingUnpaid, userId]
    );

    const commitRes = await client.query('COMMIT');
    if (commitRes.command !== 'COMMIT') {
      throw new Error(`Transaction failed to commit: database returned ${commitRes.command}`);
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  // 4. Log approved proof in commission_proofs (non-critical auxiliary audit, done post-commit)
  try {
    await pool.query(
      `INSERT INTO commission_proofs (user_id, amount, payment_method, comment, proof_url, notes, screenshot_url, status, admin_notes)
       VALUES ($1, $2, 'WALLET', $3, $4, $5, $6, 'APPROVED', $7)
       ON CONFLICT DO NOTHING`,
      [
        userId,
        payAmount,
        'Direct 1-Click Settlement via Platform Wallet',
        'wallet://internal-balance',
        'Direct 1-Click Settlement via Platform Wallet',
        'wallet://internal-balance',
        `Automated debit of $${payAmount.toFixed(2)} from user wallet`,
      ]
    );
  } catch (proofErr) {
    console.warn('[commissionService] Notice: commission_proofs log bypassed non-critically:', proofErr.message);
  }

  const freshWalletRes = await pool.query('SELECT * FROM wallets WHERE user_id = $1', [userId]);
  const finalWallet = freshWalletRes.rows[0]
    ? { ...freshWalletRes.rows[0], balance: parseFloat(freshWalletRes.rows[0].balance) }
    : debitResult.wallet;

  return {
    paidAmount: payAmount,
    remainingUnpaid,
    wallet: finalWallet,
    transaction: debitResult.transaction,
  };
}

// ── Admin ───────────────────────────────────────────────────────

/**
 * Admin: payment receipts, newest first, optionally only one status (PENDING, APPROVED, REJECTED)
 */
async function listProofs(status) {
  let query = `
    SELECT p.*,
           u.email AS user_email,
           COALESCE(NULLIF(u.name, ''), split_part(u.email, '@', 1)) AS user_name,
           u.unpaid_commission::numeric AS user_unpaid_commission
    FROM commission_proofs p
    JOIN users u ON p.user_id = u.id
  `;
  const params = [];

  if (status) {
    params.push(status);
    query += ` WHERE p.status = $1 `;
  }

  query += ` ORDER BY p.created_at DESC `;

  const result = await pool.query(query, params);
  return result.rows.map((p) => ({
    ...p,
    amount: parseFloat(p.amount),
    user_unpaid_commission: parseFloat(p.user_unpaid_commission || 0),
  }));
}

/**
 * Admin: approve or reject a receipt that is still PENDING. Approving lowers what the seller owes
 * (never below zero). A decision is final: before, the API let an admin flip an APPROVED receipt to
 * REJECTED, which added the amount back to the debt - even for the APPROVED records written by a
 * wallet payment, whose money had really been taken. (The admin page only ever offered PENDING ones.)
 */
async function reviewProof(proofId, status, adminNotes) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const proofRes = await client.query(`SELECT * FROM commission_proofs WHERE id = $1 FOR UPDATE`, [proofId]);
    if (proofRes.rowCount === 0) {
      throw new AppError(404, 'Commission proof not found.');
    }

    const proof = proofRes.rows[0];
    if (proof.status !== 'PENDING') {
      throw new AppError(409, `This receipt was already reviewed (${proof.status}); a decision can't be changed.`);
    }

    const updatedProofRes = await client.query(
      `UPDATE commission_proofs
       SET status = $1, admin_notes = COALESCE($2, admin_notes), reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [status, adminNotes || null, proofId]
    );

    if (status === 'APPROVED') {
      await client.query(
        `UPDATE users
         SET unpaid_commission = GREATEST(0.00, unpaid_commission - $1)
         WHERE id = $2`,
        [proof.amount, proof.user_id]
      );
    }

    await client.query('COMMIT');
    return updatedProofRes.rows[0];
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  assertOwesCommission,
  submitProof,
  getMyProofs,
  payFromWallet,
  listProofs,
  reviewProof,
};
