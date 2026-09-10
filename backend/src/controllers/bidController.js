const pool = require('../db');
const auctionModel = require('../models/auctionModel');
const bidModel = require('../models/bidModel');
const { getIO } = require('../services/socketService');

/**
 * POST /api/bids
 *
 * This is the most critical endpoint in the system.
 * It uses a PostgreSQL transaction with pessimistic locking (FOR UPDATE)
 * to ensure no two bids can win the same auction simultaneously.
 */
const placeBid = async (req, res, next) => {
  const client = await pool.connect(); // Get a dedicated client for the transaction

  try {
    const { auction_id, amount } = req.body;

    if (!auction_id || !amount) {
      return res.status(400).json({ error: 'auction_id and amount are required.' });
    }

    // ── BEGIN TRANSACTION ───────────────────────────────────────
    await client.query('BEGIN');

    // ── PESSIMISTIC LOCK ────────────────────────────────────────
    // SELECT ... FOR UPDATE locks this specific auction row.
    // All other concurrent bids will WAIT here until we COMMIT or ROLLBACK.
    const auction = await auctionModel.findByIdForUpdate(client, auction_id);

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
    if (parseFloat(amount) <= parseFloat(auction.current_price)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Bid must be higher than current price of $${auction.current_price}.`,
      });
    }

    // ── WRITE NEW BID ───────────────────────────────────────────
    const newBid = await bidModel.create(client, auction_id, req.user.id, amount);

    // ── UPDATE AUCTION PRICE ────────────────────────────────────
    await auctionModel.updatePrice(client, auction_id, amount);

    // ── COMMIT TRANSACTION ──────────────────────────────────────
    // Row lock is released here. Next concurrent bid can now proceed.
    await client.query('COMMIT');

    // ── REAL-TIME BROADCAST (after commit) ──────────────────────
    const io = getIO();
    io.to(auction_id).emit('PRICE_UPDATE', {
      auction_id,
      new_price: amount,
      bidder_email: req.user.email,
      bid_id: newBid.id,
    });

    res.status(201).json({ bid: newBid });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release(); // Always release the client back to the pool
  }
};

/**
 * GET /api/bids/:auction_id - Get all bids for an auction
 */
const getBidsForAuction = async (req, res, next) => {
  try {
    const bids = await bidModel.findByAuctionId(req.params.auction_id);
    res.json({ bids });
  } catch (err) {
    next(err);
  }
};

module.exports = { placeBid, getBidsForAuction };
