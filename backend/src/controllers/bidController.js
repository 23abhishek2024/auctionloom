const pool = require('../db');
const auctionModel = require('../models/auctionModel');
const bidModel = require('../models/bidModel');
const { getIO } = require('../services/socketService');
const { isUUID, isPositiveNumber } = require('../utils/validators');

/**
 * POST /api/bids OR POST /api/auctions/:id/bids
 *
 * This is the most critical endpoint in the system.
 * It uses a PostgreSQL transaction with pessimistic locking (FOR UPDATE)
 * to ensure no two bids can win the same auction simultaneously.
 */
const placeBid = async (req, res, next) => {
  const auctionId = req.params.id || req.body.auction_id;
  const { amount } = req.body;

  // ── 1. MARKETPLACE INTEGRITY CHECK ───────────────────────────
  // Platform administrators are strictly forbidden from bidding to prevent
  // conflicts of interest, shill bidding, and preserve marketplace trust.
  if (req.user && req.user.role === 'admin') {
    return res.status(403).json({
      error: 'Platform administrators are restricted from placing bids to preserve marketplace integrity.',
    });
  }

  // ── 2. INPUT VALIDATION (prior to pool connection) ───────────
  if (!auctionId || amount === undefined || amount === null || amount === '') {
    return res.status(400).json({ error: 'auction_id and amount are required.' });
  }

  if (!isUUID(auctionId)) {
    return res.status(400).json({ error: 'Invalid auction ID format. Must be a valid UUID.' });
  }

  if (!isPositiveNumber(amount)) {
    return res.status(400).json({ error: 'amount must be a positive number greater than 0.' });
  }

  const numericAmount = parseFloat(amount);
  let client;

  try {
    client = await pool.connect(); // Get a dedicated client for the transaction

    // ── BEGIN TRANSACTION ───────────────────────────────────────
    await client.query('BEGIN');

    // ── PESSIMISTIC LOCK ────────────────────────────────────────
    // SELECT ... FOR UPDATE locks this specific auction row.
    // All other concurrent bids will WAIT here until we COMMIT or ROLLBACK.
    const auction = await auctionModel.findByIdForUpdate(client, auctionId);

    if (!auction) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Auction not found.' });
    }
    if (auction.status !== 'ACTIVE') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This auction is no longer active.' });
    }
    if (new Date() > new Date(auction.end_time)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This auction has ended.' });
    }
    if (req.user.id === auction.seller_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'You cannot bid on your own auction.' });
    }
    if (numericAmount <= parseFloat(auction.current_price)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Bid must be higher than current price of $${auction.current_price}.`,
      });
    }

    // ── WRITE NEW BID ───────────────────────────────────────────
    const newBid = await bidModel.create(client, auctionId, req.user.id, numericAmount);

    // ── UPDATE AUCTION PRICE ────────────────────────────────────
    await auctionModel.updatePrice(client, auctionId, numericAmount);

    // ── COMMIT TRANSACTION ──────────────────────────────────────
    // Row lock is released here. Next concurrent bid can now proceed.
    await client.query('COMMIT');

    // ── REAL-TIME BROADCAST (after commit) ──────────────────────
    const io = getIO();
    const bidderName = req.user.name || (req.user.email ? req.user.email.split('@')[0] : 'Bidder');
    io.to(auctionId).emit('PRICE_UPDATE', {
      auction_id: auctionId,
      new_price: numericAmount,
      bidder_name: bidderName,
      bidder_email: req.user.email,
      bid_id: newBid.id,
    });

    res.status(201).json({ bid: newBid });
  } catch (err) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (_) {}
    }
    next(err);
  } finally {
    if (client) client.release(); // Always release the client back to the pool
  }
};

/**
 * GET /api/bids/:auction_id OR GET /api/auctions/:id/bids - Get all bids for an auction
 */
const getBidsForAuction = async (req, res, next) => {
  try {
    const auctionId = req.params.auction_id || req.params.id;
    if (!isUUID(auctionId)) {
      return res.status(400).json({ error: 'Invalid auction ID format. Must be a valid UUID.' });
    }

    const bids = await bidModel.findByAuctionId(auctionId);
    res.json({ bids, count: bids.length });
  } catch (err) {
    next(err);
  }
};

module.exports = { placeBid, getBidsForAuction };
