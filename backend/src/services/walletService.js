const pool = require('../db');
const { AppError } = require('../utils/AppError');
const { toCents, splitSale } = require('../utils/validators');

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

const PLATFORM_TREASURY_USER_ID = '00000000-0000-0000-0000-000000000000';

async function getPrimaryAdminUserId(client = null) {
  const db = client || pool;
  try {
    const res = await db.query(
      "SELECT id FROM users WHERE role = 'admin' AND email != 'treasury@auctionloom.internal' ORDER BY created_at ASC LIMIT 1"
    );
    return res.rows[0]?.id || null;
  } catch (err) {
    console.error('[walletService.getPrimaryAdminUserId] Error:', err);
    return null;
  }
}

/**
 * Get existing wallet or create one atomically if missing.
 */
async function getOrCreateWallet(userId, externalClient = null) {
  const client = externalClient || pool;
  let res = await client.query('SELECT * FROM wallets WHERE user_id = $1', [userId]);

  if (res.rows.length === 0) {
    if (userId === PLATFORM_TREASURY_USER_ID) {
      await client.query(`
        INSERT INTO users (id, email, password_hash, role, name)
        VALUES ('00000000-0000-0000-0000-000000000000', 'treasury@auctionloom.internal', 'SYSTEM_ACCOUNT_DO_NOT_LOGIN', 'admin', 'AuctionLoom Treasury')
        ON CONFLICT (id) DO NOTHING
      `);
    } else {
      const userCheck = await client.query('SELECT id FROM users WHERE id = $1', [userId]);
      if (userCheck.rows.length === 0) {
        throw new AppError(401, 'User account not found or session expired.');
      }
    }
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
 * Lock the wallets of several users in one fixed order (sorted user ids).
 * Every transaction that changes more than one wallet calls this before moving money,
 * so two transactions can never each hold one wallet while waiting for the other's (a deadlock).
 * Must be called inside an open transaction on `client`.
 */
async function lockWalletsInOrder(client, userIds) {
  const ids = [...new Set(userIds.filter(Boolean))].sort();
  for (const id of ids) {
    await getOrCreateWallet(id, client);
    await client.query('SELECT id FROM wallets WHERE user_id = $1 FOR UPDATE', [id]);
  }
  return ids;
}

/**
 * Run a whole transaction again if PostgreSQL aborts it as a deadlock victim (error 40P01).
 * Safe because the aborted attempt was rolled back completely, and settlement is idempotent.
 */
async function withDeadlockRetry(fn, attempts = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err.code !== '40P01' || attempt >= attempts) throw err;
      const delayMs = 50 + Math.floor(Math.random() * 150);
      console.warn(`[walletService] Deadlock detected; retrying in ${delayMs}ms (attempt ${attempt + 1} of ${attempts})`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
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
    throw new AppError(400, 'Credit amount must be a positive number');
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
    throw new AppError(400, 'Debit amount must be a positive number');
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
async function settleLotEscrow(args) {
  return withDeadlockRetry(() => settleLotEscrowOnce(args));
}

async function settleLotEscrowOnce({ auctionId, winnerId, sellerId, hammerPrice, idempotencyPrefix = '' }) {
  const numericPrice = parseFloat(hammerPrice);
  if (isNaN(numericPrice) || numericPrice <= 0) {
    throw new AppError(400, 'Valid hammer price required for settlement');
  }

  const { commission, sellerPayout } = splitSale(numericPrice); // 5% fee, in whole cents

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Lock the auction row, then check (under the lock) that it is still the lot the caller saw
    const auctionRes = await client.query(
      'SELECT * FROM auctions WHERE id = $1 FOR UPDATE',
      [auctionId]
    );
    if (auctionRes.rows.length === 0) {
      throw new AppError(404, 'Auction not found');
    }
    const auction = auctionRes.rows[0];

    if (!auction.is_settled) {
      // The callers read the auction before this lock. In between it may have been reopened by an admin
      // or changed in some other way; then no money must move for the old winner and price.
      if (auction.status !== 'CLOSED') {
        throw new AppError(409, 'This lot is not closed any more, so it cannot be settled.');
      }
      if (auction.winner_id !== winnerId || auction.seller_id !== sellerId) {
        throw new AppError(409, 'The winner or seller of this lot has changed. Please reload the page.');
      }
      if (toCents(auction.current_price) !== toCents(numericPrice)) {
        throw new AppError(409, 'The hammer price of this lot has changed. Please reload the page.');
      }
    }

    if (auction.is_settled) {
      const [winnerWallet, sellerWallet] = await Promise.all([
        getOrCreateWallet(winnerId, client),
        getOrCreateWallet(sellerId, client),
      ]);
      await client.query('COMMIT');
      return {
        success: true,
        alreadyProcessed: true,
        alreadySettled: true,
        auctionId,
        hammerPrice: numericPrice,
        commission,
        sellerPayout,
        winnerWallet,
        sellerWallet,
      };
    }

    // 1b. Lock all three wallets up front, in sorted order, before any money moves.
    // Without this, a lot where X buys from Y and another where Y buys from X lock the same
    // two wallets in opposite orders and can deadlock.
    let platformUserId = null;
    if (commission > 0) {
      platformUserId = (await getPrimaryAdminUserId(client)) || PLATFORM_TREASURY_USER_ID;
    }
    await lockWalletsInOrder(client, [winnerId, sellerId, platformUserId]);

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
      const [winnerWallet, sellerWallet] = await Promise.all([
        getOrCreateWallet(winnerId, client),
        getOrCreateWallet(sellerId, client),
      ]);
      await client.query('COMMIT');
      return {
        success: true,
        alreadyProcessed: true,
        alreadySettled: true,
        auctionId,
        hammerPrice: numericPrice,
        commission,
        sellerPayout,
        winnerWallet,
        sellerWallet,
      };
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

    // 4. Credit Platform Commission to Admin Wallet (single immutable entry)
    let platformWallet = null;
    if (commission > 0) {
      const platformKey = `${idempotencyPrefix || 'lot'}_platform_fee_${auctionId}`;
      const platformCreditResult = await creditWallet({
        userId: platformUserId,
        amount: commission,
        type: 'COMMISSION',
        referenceType: 'AUCTION',
        referenceId: auctionId,
        idempotencyKey: platformKey,
        metadata: {
          note: `Admin commission (+5%) received from "${auction.title}"`,
          auctionTitle: auction.title,
          sellerId,
          winnerId,
          hammerPrice: numericPrice,
          commissionRate: '5%',
        },
        client,
      });
      platformWallet = platformCreditResult.wallet;
    }

    // 5. Mark auction as settled and record timestamp in platform records
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

    // (The 5% fee was taken from the hammer price above, so this lot leaves the seller no debt.
    //  An old step here also subtracted the fee from unpaid_commission, which forgave unrelated
    //  debt; it only went unnoticed because a start-up step reset every debt to 0.)

    // 6. Commit transaction and verify successful write
    const commitRes = await client.query('COMMIT');
    if (commitRes.command !== 'COMMIT') {
      throw new Error(`Transaction failed to commit: database returned ${commitRes.command}`);
    }

    // 8. Retrieve confirmed committed wallet states from database ground-truth
    // Read them on the connection we already hold: borrowing three more from the pool here
    // could starve the pool when many settlements run at once (each would hold one and wait for three).
    const freshWinnerRes = await client.query('SELECT * FROM wallets WHERE user_id = $1', [winnerId]);
    const freshSellerRes = await client.query('SELECT * FROM wallets WHERE user_id = $1', [sellerId]);
    const freshPlatformRes = await client.query('SELECT * FROM wallets WHERE user_id = $1', [platformUserId || PLATFORM_TREASURY_USER_ID]);

    const finalWinnerWallet = freshWinnerRes.rows[0]
      ? { ...freshWinnerRes.rows[0], balance: parseFloat(freshWinnerRes.rows[0].balance) }
      : debitResult.wallet;

    const finalSellerWallet = freshSellerRes.rows[0]
      ? { ...freshSellerRes.rows[0], balance: parseFloat(freshSellerRes.rows[0].balance) }
      : creditResult.wallet;

    const finalPlatformWallet = freshPlatformRes.rows[0]
      ? { ...freshPlatformRes.rows[0], balance: parseFloat(freshPlatformRes.rows[0].balance) }
      : platformWallet;

    return {
      success: true,
      auctionId,
      hammerPrice: numericPrice,
      commission,
      sellerPayout,
      winnerWallet: finalWinnerWallet,
      sellerWallet: finalSellerWallet,
      platformWallet: finalPlatformWallet,
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

/**
 * Total commission credited to one wallet, and how many commission entries that took
 * (used for the admin's wallet, which receives the platform's 5%).
 */
async function getCommissionTotals(walletId) {
  const commAgg = await pool.query(`
    SELECT COALESCE(SUM(amount), 0)::numeric AS total_comm, COUNT(*)::int AS count_comm
    FROM wallet_transactions
    WHERE wallet_id = $1 AND type = 'COMMISSION'
  `, [walletId]);
  return {
    total: parseFloat(commAgg.rows[0]?.total_comm || 0),
    count: parseInt(commAgg.rows[0]?.count_comm || 0),
  };
}

/**
 * The wallet page: balance and recent ledger entries, plus the commission totals for an admin.
 * Read-only: no balance "self-heal" here, a balance only changes through ledger-backed credits and debits.
 */
async function getWalletOverview(user) {
  const summary = await getWalletSummary(user.id);
  if (user.role === 'admin') {
    const commission = await getCommissionTotals(summary.wallet.id);
    summary.treasuryBalance = commission.total;
    summary.totalCommissionEarned = commission.total;
    summary.totalCommissionTransitions = commission.count;
  }
  return summary;
}

/**
 * One page of a user's ledger, newest first, optionally only one type (TOPUP, WITHDRAWAL, ...).
 * Rows that belong to an auction carry its title. An admin also gets the commission totals.
 * Read-only: a balance changes only through creditWallet/debitWallet, which also write the ledger.
 * (An old "auto-sync" here reset the admin's balance to total commission earned whenever it was 0,
 *  which recreated money the admin had already withdrawn.)
 */
async function getTransactionHistory(user, { limit, offset, type }) {
  const wallet = await getOrCreateWallet(user.id);

  const params = [wallet.id];
  const conditions = ['wt.wallet_id = $1'];
  if (type) {
    params.push(type);
    conditions.push(`wt.type = $${params.length}`);
  }
  const where = conditions.join(' AND ');

  const [txRes, countRes] = await Promise.all([
    pool.query(
      `SELECT
         wt.id,
         wt.type,
         wt.amount,
         wt.balance_after,
         wt.reference_type,
         wt.reference_id,
         wt.status,
         wt.metadata,
         wt.created_at,
         a.title AS auction_title,
         a.id    AS auction_id
       FROM wallet_transactions wt
       LEFT JOIN auctions a ON a.id::text = wt.reference_id::text
       WHERE ${where}
       ORDER BY wt.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total FROM wallet_transactions wt WHERE ${where}`,
      params
    ),
  ]);

  let platformSummary = null;
  if (user.role === 'admin') {
    const commission = await getCommissionTotals(wallet.id);
    platformSummary = {
      totalCommissionEarned: commission.total,
      totalCommissionTransitions: commission.count,
    };
  }

  return {
    wallet: {
      id: wallet.id,
      balance: parseFloat(wallet.balance),
      currency: wallet.currency,
    },
    platformSummary,
    transactions: txRes.rows.map((r) => ({
      id: r.id,
      type: r.type,
      amount: parseFloat(r.amount),
      balanceAfter: parseFloat(r.balance_after),
      referenceType: r.reference_type,
      referenceId: r.reference_id,
      auctionTitle: r.auction_title || null,
      auctionId: r.auction_id || null,
      status: r.status,
      metadata: r.metadata,
      createdAt: r.created_at,
    })),
    total: countRes.rows[0].total,
  };
}

module.exports = {
  PLATFORM_TREASURY_USER_ID,
  getPrimaryAdminUserId,
  InsufficientFundsError,
  getOrCreateWallet,
  lockWalletsInOrder,
  creditWallet,
  debitWallet,
  settleLotEscrow,
  getWalletSummary,
  getWalletOverview,
  getTransactionHistory,
};
