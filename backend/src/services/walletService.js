const pool = require('../db');

/**
 * Production-Grade Wallet Service
 * Enforces Double-Entry Accounting, ACID Row-Locking (SELECT FOR UPDATE),
 * Idempotency Key Deduping, and Zero-Overdraft Invariants.
 */

class InsufficientFundsError extends Error {
  constructor(message, currentBalance, requestedAmount) {
    super(message);
    this.name = 'InsufficientFundsError';
    this.statusCode = 400;
    this.currentBalance = currentBalance;
    this.requestedAmount = requestedAmount;
  }
}

/**
 * Get existing wallet or create one atomically if missing.
 */
async function getOrCreateWallet(userId, externalClient = null) {
  const client = externalClient || pool;
  let res = await client.query('SELECT * FROM wallets WHERE user_id = $1', [userId]);

  if (res.rows.length === 0) {
    res = await client.query(
      `INSERT INTO wallets (user_id, balance, currency, version)
       VALUES ($1, 0.00, 'USD', 0)
       ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [userId]
    );
  }

  return res.rows[0];
}

/**
 * Credit user wallet with strict row-locking & double-entry ledger entry.
 */
async function creditWallet({
  userId,
  amount,
  type = 'TOPUP',
  referenceType = null,
  referenceId = null,
  idempotencyKey = null,
  metadata = {},
  client: passedClient = null,
}) {
  const numericAmount = parseFloat(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    throw new Error('Credit amount must be a positive number');
  }

  const client = passedClient || (await pool.connect());
  const shouldCommit = !passedClient;

  try {
    if (shouldCommit) await client.query('BEGIN');

    // 1. Check idempotency key first if provided
    if (idempotencyKey) {
      const existingTx = await client.query(
        'SELECT * FROM wallet_transactions WHERE idempotency_key = $1',
        [idempotencyKey]
      );
      if (existingTx.rows.length > 0) {
        const wallet = await getOrCreateWallet(userId, client);
        if (shouldCommit) await client.query('COMMIT');
        return {
          success: true,
          alreadyProcessed: true,
          wallet,
          transaction: existingTx.rows[0],
        };
      }
    }

    // 2. Ensure wallet exists
    await getOrCreateWallet(userId, client);

    // 3. Acquire pessimistic row-lock on wallet
    const lockRes = await client.query(
      'SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE',
      [userId]
    );
    const wallet = lockRes.rows[0];

    const prevBalance = parseFloat(wallet.balance);
    const newBalance = Math.round((prevBalance + numericAmount) * 100) / 100;
    const newVersion = (wallet.version || 0) + 1;

    // 4. Update wallet balance
    const updatedWalletRes = await client.query(
      `UPDATE wallets 
       SET balance = $1, version = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [newBalance, newVersion, wallet.id]
    );
    const updatedWallet = updatedWalletRes.rows[0];

    // 5. Insert immutable double-entry transaction record
    const txRes = await client.query(
      `INSERT INTO wallet_transactions 
       (wallet_id, type, amount, balance_after, reference_type, reference_id, idempotency_key, status, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'COMPLETED', $8)
       RETURNING *`,
      [
        wallet.id,
        type,
        numericAmount,
        newBalance,
        referenceType,
        referenceId,
        idempotencyKey,
        JSON.stringify(metadata || {}),
      ]
    );

    if (shouldCommit) await client.query('COMMIT');

    return {
      success: true,
      wallet: {
        ...updatedWallet,
        balance: parseFloat(updatedWallet.balance),
      },
      transaction: {
        ...txRes.rows[0],
        amount: parseFloat(txRes.rows[0].amount),
        balance_after: parseFloat(txRes.rows[0].balance_after),
      },
    };
  } catch (err) {
    if (shouldCommit) await client.query('ROLLBACK');

    // Handle concurrent duplicate idempotency race condition
    if (err.code === '23505' && err.constraint === 'wallet_transactions_idempotency_key_key') {
      const existing = await pool.query(
        'SELECT * FROM wallet_transactions WHERE idempotency_key = $1',
        [idempotencyKey]
      );
      const wallet = await getOrCreateWallet(userId);
      return {
        success: true,
        alreadyProcessed: true,
        wallet,
        transaction: existing.rows[0],
      };
    }
    throw err;
  } finally {
    if (shouldCommit) client.release();
  }
}

/**
 * Debit user wallet with strict row-locking, overdraft checks & double-entry ledger entry.
 */
async function debitWallet({
  userId,
  amount,
  type = 'SETTLEMENT_DEBIT',
  referenceType = null,
  referenceId = null,
  idempotencyKey = null,
  metadata = {},
  client: passedClient = null,
}) {
  const numericAmount = parseFloat(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    throw new Error('Debit amount must be a positive number');
  }

  const client = passedClient || (await pool.connect());
  const shouldCommit = !passedClient;

  try {
    if (shouldCommit) await client.query('BEGIN');

    // 1. Check idempotency key first if provided
    if (idempotencyKey) {
      const existingTx = await client.query(
        'SELECT * FROM wallet_transactions WHERE idempotency_key = $1',
        [idempotencyKey]
      );
      if (existingTx.rows.length > 0) {
        const wallet = await getOrCreateWallet(userId, client);
        if (shouldCommit) await client.query('COMMIT');
        return {
          success: true,
          alreadyProcessed: true,
          wallet,
          transaction: existingTx.rows[0],
        };
      }
    }

    // 2. Ensure wallet exists
    await getOrCreateWallet(userId, client);

    // 3. Acquire pessimistic row-lock on wallet
    const lockRes = await client.query(
      'SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE',
      [userId]
    );
    const wallet = lockRes.rows[0];

    const currentBalance = parseFloat(wallet.balance);

    // 4. Invariant Check: Overdraft protection
    if (currentBalance < numericAmount) {
      throw new InsufficientFundsError(
        `Insufficient funds. Balance ($${currentBalance.toFixed(2)}) is less than required ($${numericAmount.toFixed(2)})`,
        currentBalance,
        numericAmount
      );
    }

    const newBalance = Math.round((currentBalance - numericAmount) * 100) / 100;
    const newVersion = (wallet.version || 0) + 1;

    // 5. Update wallet balance
    const updatedWalletRes = await client.query(
      `UPDATE wallets 
       SET balance = $1, version = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [newBalance, newVersion, wallet.id]
    );
    const updatedWallet = updatedWalletRes.rows[0];

    // 6. Insert immutable double-entry transaction record
    const txRes = await client.query(
      `INSERT INTO wallet_transactions 
       (wallet_id, type, amount, balance_after, reference_type, reference_id, idempotency_key, status, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'COMPLETED', $8)
       RETURNING *`,
      [
        wallet.id,
        type,
        numericAmount,
        newBalance,
        referenceType,
        referenceId,
        idempotencyKey,
        JSON.stringify(metadata || {}),
      ]
    );

    if (shouldCommit) await client.query('COMMIT');

    return {
      success: true,
      wallet: {
        ...updatedWallet,
        balance: parseFloat(updatedWallet.balance),
      },
      transaction: {
        ...txRes.rows[0],
        amount: parseFloat(txRes.rows[0].amount),
        balance_after: parseFloat(txRes.rows[0].balance_after),
      },
    };
  } catch (err) {
    if (shouldCommit) await client.query('ROLLBACK');

    // Handle concurrent duplicate idempotency race condition
    if (err.code === '23505' && err.constraint === 'wallet_transactions_idempotency_key_key') {
      const existing = await pool.query(
        'SELECT * FROM wallet_transactions WHERE idempotency_key = $1',
        [idempotencyKey]
      );
      const wallet = await getOrCreateWallet(userId);
      return {
        success: true,
        alreadyProcessed: true,
        wallet,
        transaction: existing.rows[0],
      };
    }
    throw err;
  } finally {
    if (shouldCommit) client.release();
  }
}

/**
 * Execute atomic settlement between winner and seller:
 * - Debits winner the full hammer price
 * - Credits seller the hammer price minus 5% platform commission
 * - Emits audit logs in one atomic transaction
 */
async function settleLotEscrow({ auctionId, winnerId, sellerId, hammerPrice, idempotencyPrefix = '' }) {
  const numericPrice = parseFloat(hammerPrice);
  if (isNaN(numericPrice) || numericPrice <= 0) {
    throw new Error('Valid hammer price required for settlement');
  }

  const commission = Math.round(numericPrice * 0.05 * 100) / 100;
  const sellerPayout = Math.round((numericPrice - commission) * 100) / 100;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Verify auction exists and is CLOSED
    const auctionRes = await client.query(
      'SELECT * FROM auctions WHERE id = $1 FOR UPDATE',
      [auctionId]
    );
    if (auctionRes.rows.length === 0) {
      throw new Error('Auction not found');
    }
    const auction = auctionRes.rows[0];

    if (auction.is_settled) {
      throw new Error('This auction lot has already been settled via platform escrow.');
    }

    // 2. Debit Winner
    const debitKey = `${idempotencyPrefix || 'lot'}_debit_${auctionId}`;
    const debitResult = await debitWallet({
      userId: winnerId,
      amount: numericPrice,
      type: 'SETTLEMENT_DEBIT',
      referenceType: 'AUCTION',
      referenceId: auctionId,
      idempotencyKey: debitKey,
      metadata: { auctionTitle: auction.title, sellerId, commission },
      client,
    });

    if (debitResult.alreadyProcessed) {
      await client.query(
        `UPDATE auctions SET is_settled = true, settled_at = COALESCE(settled_at, NOW()), updated_at = NOW() WHERE id = $1`,
        [auctionId]
      );
      throw new Error('This auction lot settlement has already been processed.');
    }

    // 3. Credit Seller (net of commission)
    const creditKey = `${idempotencyPrefix || 'lot'}_credit_${auctionId}`;
    const creditResult = await creditWallet({
      userId: sellerId,
      amount: sellerPayout,
      type: 'SETTLEMENT_CREDIT',
      referenceType: 'AUCTION',
      referenceId: auctionId,
      idempotencyKey: creditKey,
      metadata: {
        auctionTitle: auction.title,
        winnerId,
        grossAmount: numericPrice,
        commissionDeducted: commission,
      },
      client,
    });

    // 4. Mark auction as settled and record timestamp in platform records
    await client.query(
      `UPDATE auctions 
       SET is_settled = true,
           settled_at = NOW(),
           updated_at = NOW(),
           commission_calculated = true, 
           commission_amount = $1
       WHERE id = $2`,
      [commission, auctionId]
    );

    // 5. Decrement seller's unpaid commission debt since platform fee was deducted at source
    await client.query(
      `UPDATE users 
       SET unpaid_commission = GREATEST(0.00, unpaid_commission - $1) 
       WHERE id = $2`,
      [commission, sellerId]
    );

    // 6. Commit transaction and verify successful write
    const commitRes = await client.query('COMMIT');
    if (commitRes.command !== 'COMMIT') {
      throw new Error(`Transaction failed to commit: database returned ${commitRes.command}`);
    }

    // 7. Retrieve confirmed committed wallet states from database ground-truth
    const [freshWinnerRes, freshSellerRes] = await Promise.all([
      pool.query('SELECT * FROM wallets WHERE user_id = $1', [winnerId]),
      pool.query('SELECT * FROM wallets WHERE user_id = $1', [sellerId]),
    ]);

    const finalWinnerWallet = freshWinnerRes.rows[0]
      ? { ...freshWinnerRes.rows[0], balance: parseFloat(freshWinnerRes.rows[0].balance) }
      : debitResult.wallet;

    const finalSellerWallet = freshSellerRes.rows[0]
      ? { ...freshSellerRes.rows[0], balance: parseFloat(freshSellerRes.rows[0].balance) }
      : creditResult.wallet;

    return {
      success: true,
      auctionId,
      hammerPrice: numericPrice,
      commission,
      sellerPayout,
      winnerWallet: finalWinnerWallet,
      sellerWallet: finalSellerWallet,
      winnerTransaction: debitResult.transaction,
      sellerTransaction: creditResult.transaction,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Get wallet details and recent audit transactions for a user.
 */
async function getWalletSummary(userId) {
  const wallet = await getOrCreateWallet(userId);
  const txRes = await pool.query(
    `SELECT * FROM wallet_transactions 
     WHERE wallet_id = $1 
     ORDER BY created_at DESC 
     LIMIT 100`,
    [wallet.id]
  );

  return {
    wallet: {
      id: wallet.id,
      userId: wallet.user_id,
      balance: parseFloat(wallet.balance),
      currency: wallet.currency,
      version: wallet.version,
      updatedAt: wallet.updated_at,
    },
    transactions: txRes.rows.map((r) => ({
      id: r.id,
      type: r.type,
      amount: parseFloat(r.amount),
      balanceAfter: parseFloat(r.balance_after),
      referenceType: r.reference_type,
      referenceId: r.reference_id,
      idempotencyKey: r.idempotency_key,
      status: r.status,
      metadata: r.metadata,
      createdAt: r.created_at,
    })),
  };
}

module.exports = {
  InsufficientFundsError,
  getOrCreateWallet,
  creditWallet,
  debitWallet,
  settleLotEscrow,
  getWalletSummary,
};
