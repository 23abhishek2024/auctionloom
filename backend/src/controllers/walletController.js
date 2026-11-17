const walletService = require('../services/walletService');
const topupService = require('../services/topupService');
const commissionService = require('../services/commissionService');
const auctionClosureService = require('../services/auctionClosureService');
const { AppError, sendAppError } = require('../utils/AppError');

/**
 * Wallet Controller
 * Exposes endpoints for balance inquiry, simulated top-ups, lot settlements,
 * and commission clearance. The money moves in the services (walletService, topupService,
 * commissionService, auctionClosureService) using locked transactions and an append-only ledger;
 * this file checks the input and shapes the responses.
 *
 * Errors: an AppError or "insufficient funds" is answered here with its own status;
 * anything else goes to the global error handler (app.js), which logs it and answers a
 * generic 500 with a request id, so database or code details never reach the client.
 */

// The 400 answer when the wallet doesn't hold enough money
const sendInsufficientFunds = (res, err) => res.status(400).json({
  error: err.message,
  code: 'INSUFFICIENT_FUNDS',
  currentBalance: err.currentBalance,
  requestedAmount: err.requestedAmount,
});
const isInsufficientFunds = (err) => err instanceof walletService.InsufficientFundsError || err.name === 'InsufficientFundsError';

// Expected failures are answered here; everything else is passed on to the global error handler
const handleWalletError = (err, res, next) => {
  if (err instanceof AppError) return sendAppError(res, err);
  if (isInsufficientFunds(err)) return sendInsufficientFunds(res, err);
  return next(err);
};

// GET /api/wallet/transactions?page=1&limit=20&type=
const getTransactions = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20')));
    const offset = (page - 1) * limit;
    const type = req.query.type ? req.query.type.toUpperCase() : null;

    const history = await walletService.getTransactionHistory(req.user, { limit, offset, type });

    return res.status(200).json({
      success: true,
      data: {
        wallet: history.wallet,
        platformSummary: history.platformSummary,
        transactions: history.transactions,
        pagination: {
          page,
          limit,
          total: history.total,
          totalPages: Math.ceil(history.total / limit),
        },
      },
    });
  } catch (err) {
    return handleWalletError(err, res, next);
  }
};

// GET /api/wallet
const getWallet = async (req, res, next) => {
  try {
    const summary = await walletService.getWalletOverview(req.user);
    return res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (err) {
    return handleWalletError(err, res, next);
  }
};

// Optional client-generated key (one per click, reused on retry), so a repeated request is applied once
const readIdempotencyKey = (req) => {
  const key = req.get('Idempotency-Key');
  return key && /^[A-Za-z0-9_-]{8,100}$/.test(key) ? key : null;
};

// POST /api/wallet/topup
const topup = async (req, res, next) => {
  try {
    const { amount, note } = req.body;
    const numAmount = parseFloat(amount);

    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'Top-up amount must be greater than 0' });
    }

    const idempotencyKey = readIdempotencyKey(req);
    const result = await topupService.requestTopup(req.user.id, numAmount, 'INTERNAL', { note, idempotencyKey });

    return res.status(200).json({
      success: true,
      message: `Successfully added $${numAmount.toFixed(2)} to your wallet!`,
      data: {
        wallet: result.wallet,
        transaction: result.transaction,
        alreadyProcessed: Boolean(result.alreadyProcessed),
      },
    });
  } catch (err) {
    return handleWalletError(err, res, next);
  }
};

// POST /api/wallet/settle-lot
const settleLotPayment = async (req, res, next) => {
  try {
    const { auctionId } = req.body;

    if (!auctionId) {
      return res.status(400).json({ error: 'Auction ID is required' });
    }

    const result = await auctionClosureService.settleWonLot(req.user.id, auctionId);

    if (result.alreadySettled) {
      return res.status(200).json({
        success: true,
        alreadySettled: true,
        alreadyProcessed: true,
        message: 'This auction lot has already been settled via platform escrow.',
        data: {
          auctionId,
          alreadySettled: true,
          winnerWallet: result.winnerWallet,
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: `Lot successfully settled! Hammer price of $${parseFloat(result.hammerPrice).toFixed(2)} transferred.`,
      data: result.settlement,
    });
  } catch (err) {
    return handleWalletError(err, res, next);
  }
};

// POST /api/wallet/settle-commission
const settleCommission = async (req, res, next) => {
  try {
    const { amount } = req.body;
    const numAmount = parseFloat(amount);

    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'Commission settlement amount must be greater than 0' });
    }

    const result = await commissionService.payFromWallet(req.user.id, numAmount);

    return res.status(200).json({
      success: true,
      message: `Successfully cleared $${result.paidAmount.toFixed(2)} of platform commission!`,
      data: result,
    });
  } catch (err) {
    return handleWalletError(err, res, next);
  }
};

// POST /api/wallet/withdraw
const withdraw = async (req, res, next) => {
  try {
    const { amount, note } = req.body;
    const numAmount = parseFloat(amount);

    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'Withdrawal amount must be greater than 0' });
    }

    const idempotencyKey = readIdempotencyKey(req);
    const result = await topupService.requestWithdrawal(req.user.id, numAmount, { note, idempotencyKey });

    return res.status(200).json({
      success: true,
      message: `Withdrawal request for $${numAmount.toFixed(2)} completed successfully.`,
      data: result,
    });
  } catch (err) {
    return handleWalletError(err, res, next);
  }
};

module.exports = {
  getWallet,
  getTransactions,
  topup,
  settleLotPayment,
  settleCommission,
  withdraw,
};
