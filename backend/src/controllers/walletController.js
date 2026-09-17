const pool = require('../db');
const walletService = require('../services/walletService');
const topupService = require('../services/topupService');
const auctionClosureService = require('../services/auctionClosureService');

/**
 * Wallet Controller
 * Exposes endpoints for balance inquiry, simulated top-ups, lot settlements,
 * and commission clearance using atomic double-entry operations.
 */

// GET /api/wallet
const getWallet = async (req, res) => {
  try {
    const summary = await walletService.getWalletSummary(req.user.id);
    return res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (err) {
    console.error('[WalletController.getWallet] Error:', err);
    return res.status(500).json({ error: 'Failed to retrieve wallet information' });
  }
};

// POST /api/wallet/topup
const topup = async (req, res) => {
  try {
    const { amount, note } = req.body;
    const numAmount = parseFloat(amount);

    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'Top-up amount must be greater than 0' });
    }

    const result = await topupService.requestTopup(req.user.id, numAmount, 'INTERNAL', { note });

    return res.status(200).json({
      success: true,
      message: `Successfully added $${numAmount.toFixed(2)} to your wallet!`,
      data: {
        wallet: result.wallet,
        transaction: result.transaction,
      },
    });
  } catch (err) {
    console.error('[WalletController.topup] Error:', err);
    return res.status(500).json({ error: err.message || 'Failed to process top-up' });
  }
};

// POST /api/wallet/settle-lot
const settleLotPayment = async (req, res) => {
  try {
    const { auctionId } = req.body;

    if (!auctionId) {
      return res.status(400).json({ error: 'Auction ID is required' });
    }

    // 1. Fetch auction and verify lot status
    let auctionRes = await pool.query('SELECT * FROM auctions WHERE id = $1', [auctionId]);
    if (auctionRes.rows.length === 0) {
      return res.status(404).json({ error: 'Auction lot not found' });
    }

    let auction = auctionRes.rows[0];

    // If auction end time has passed but status is still ACTIVE, auto-close it atomically
    const isTimeEnded = new Date(auction.end_time) <= new Date();
    if (auction.status === 'ACTIVE' && isTimeEnded) {
      await auctionClosureService.closeAuction(auctionId);
      auctionRes = await pool.query('SELECT * FROM auctions WHERE id = $1', [auctionId]);
      auction = auctionRes.rows[0];
    }

    if (auction.status !== 'CLOSED') {
      return res.status(400).json({ error: 'This auction lot has not concluded yet. Bidding is still active.' });
    }

    if (!auction.winner_id) {
      return res.status(400).json({ error: 'This auction concluded with no winning bids placed.' });
    }

    if (auction.winner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the winning bidder can settle this auction lot.' });
    }

    // 2. Execute atomic settlement
    const settlement = await walletService.settleLotEscrow({
      auctionId,
      winnerId: req.user.id,
      sellerId: auction.seller_id,
      hammerPrice: auction.current_price,
    });

    return res.status(200).json({
      success: true,
      message: `Lot successfully settled! Hammer price of $${parseFloat(auction.current_price).toFixed(2)} transferred.`,
      data: settlement,
    });
  } catch (err) {
    console.error('[WalletController.settleLotPayment] Error:', err);
    if (err instanceof walletService.InsufficientFundsError || err.name === 'InsufficientFundsError') {
      return res.status(400).json({
        error: err.message,
        code: 'INSUFFICIENT_FUNDS',
        currentBalance: err.currentBalance,
        requestedAmount: err.requestedAmount,
      });
    }
    return res.status(500).json({ error: err.message || 'Failed to settle lot from wallet' });
  }
};

// POST /api/wallet/settle-commission
const settleCommission = async (req, res) => {
  const client = await pool.connect();
  try {
    const { amount } = req.body;
    const numAmount = parseFloat(amount);

    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'Commission settlement amount must be greater than 0' });
    }

    await client.query('BEGIN');

    // 1. Check user unpaid commission
    const userRes = await client.query(
      'SELECT unpaid_commission FROM users WHERE id = $1 FOR UPDATE',
      [req.user.id]
    );
    const unpaid = parseFloat(userRes.rows[0]?.unpaid_commission || 0);

    if (unpaid <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'You have no outstanding platform commission balance to settle.' });
    }

    const payAmount = Math.min(unpaid, numAmount);
    const idempotencyKey = `commission_debit_${req.user.id}_${Date.now()}`;

    // 2. Debit user wallet
    const debitResult = await walletService.debitWallet({
      userId: req.user.id,
      amount: payAmount,
      type: 'COMMISSION',
      referenceType: 'COMMISSION_REQUEST',
      idempotencyKey,
      metadata: { note: 'Platform commission settlement from wallet' },
      client,
    });

    // 3. Decrement user's unpaid commission
    const remainingUnpaid = Math.max(0, Math.round((unpaid - payAmount) * 100) / 100);
    await client.query(
      'UPDATE users SET unpaid_commission = $1 WHERE id = $2',
      [remainingUnpaid, req.user.id]
    );

    // 4. Log approved proof in commission_proofs
    await client.query(
      `INSERT INTO commission_proofs (user_id, amount, comment, proof_url, status, admin_notes)
       VALUES ($1, $2, $3, $4, 'APPROVED', $5)`,
      [
        req.user.id,
        payAmount,
        'Direct 1-Click Settlement via Platform Wallet',
        'wallet://internal-balance',
        `Automated debit of $${payAmount.toFixed(2)} from user wallet`,
      ]
    );

    await client.query('COMMIT');

    return res.status(200).json({
      success: true,
      message: `Successfully cleared $${payAmount.toFixed(2)} of platform commission!`,
      data: {
        paidAmount: payAmount,
        remainingUnpaid,
        wallet: debitResult.wallet,
        transaction: debitResult.transaction,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[WalletController.settleCommission] Error:', err);
    if (err instanceof walletService.InsufficientFundsError || err.name === 'InsufficientFundsError') {
      return res.status(400).json({
        error: err.message,
        code: 'INSUFFICIENT_FUNDS',
        currentBalance: err.currentBalance,
        requestedAmount: err.requestedAmount,
      });
    }
    return res.status(500).json({ error: err.message || 'Failed to settle commission' });
  } finally {
    client.release();
  }
};

// POST /api/wallet/withdraw
const withdraw = async (req, res) => {
  try {
    const { amount, note } = req.body;
    const numAmount = parseFloat(amount);

    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'Withdrawal amount must be greater than 0' });
    }

    const result = await topupService.requestWithdrawal(req.user.id, numAmount, { note });

    return res.status(200).json({
      success: true,
      message: `Withdrawal request for $${numAmount.toFixed(2)} completed successfully.`,
      data: result,
    });
  } catch (err) {
    console.error('[WalletController.withdraw] Error:', err);
    if (err instanceof walletService.InsufficientFundsError || err.name === 'InsufficientFundsError') {
      return res.status(400).json({
        error: err.message,
        code: 'INSUFFICIENT_FUNDS',
        currentBalance: err.currentBalance,
        requestedAmount: err.requestedAmount,
      });
    }
    return res.status(500).json({ error: err.message || 'Failed to process withdrawal' });
  }
};

module.exports = {
  getWallet,
  topup,
  settleLotPayment,
  settleCommission,
  withdraw,
};
