const pool = require('../db');
const auctionModel = require('../models/auctionModel');
const bidModel = require('../models/bidModel');
const { getIO } = require('./socketService');
const { AppError } = require('../utils/AppError');

/**
 * Bid Service
 * Placing a bid is the most critical operation in the system. It runs in a PostgreSQL
 * transaction with pessimistic locking (SELECT ... FOR UPDATE on the auction row), so
 * concurrent bids on one auction take turns and two bids can never win against the same price.
 */

/**
 * Place a bid of `amount` (a number) by `bidder` (the logged-in user) on an auction.
 * Returns the new bid. Throws AppError when the auction is missing, frozen, closed or ended,
 * when the bidder is its seller, or when the amount is not above the current price.
 */
async function placeBid({ auctionId, bidder, amount }) {
  const client = await pool.connect(); // A dedicated client for the transaction
  let newBid;

  try {
    // ── BEGIN TRANSACTION ───────────────────────────────────────
    await client.query('BEGIN');

    // ── PESSIMISTIC LOCK ────────────────────────────────────────
    // SELECT ... FOR UPDATE locks this specific auction row.
    // All other concurrent bids will WAIT here until we COMMIT or ROLLBACK.
    const auction = await auctionModel.findByIdForUpdate(client, auctionId);

    if (!auction) {
      throw new AppError(404, 'Auction not found.');
    }
    if (auction.status === 'RESTRICTED') {
      throw new AppError(403, 'This auction has been placed under administrative restriction. Bidding is temporarily frozen.');
    }
    if (auction.status !== 'ACTIVE') {
      throw new AppError(400, 'This auction is no longer active.');
    }
    if (new Date() > new Date(auction.end_time)) {
      throw new AppError(400, 'This auction has ended.');
    }
    if (bidder.id === auction.seller_id) {
      throw new AppError(400, 'You cannot bid on your own auction.');
    }
    if (amount <= parseFloat(auction.current_price)) {
      throw new AppError(400, `Bid must be higher than current price of $${auction.current_price}.`);
    }

    // ── WRITE NEW BID + UPDATE AUCTION PRICE ────────────────────
    newBid = await bidModel.create(client, auctionId, bidder.id, amount);
    await auctionModel.updatePrice(client, auctionId, amount);

    // ── COMMIT TRANSACTION ──────────────────────────────────────
    // Row lock is released here. Next concurrent bid can now proceed.
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release(); // Always release the client back to the pool
  }

  // ── REAL-TIME BROADCAST (after commit) ──────────────────────
  // Everyone in the room receives this, so it carries the bidder's id and name, never their email
  const bidderName = bidder.name || (bidder.email ? bidder.email.split('@')[0] : 'Bidder');
  getIO().to(auctionId).emit('PRICE_UPDATE', {
    auction_id: auctionId,
    new_price: amount,
    bidder_name: bidderName,
    bidder_id: bidder.id,
    bid_id: newBid.id,
  });

  return newBid;
}

/**
 * All bids on an auction, highest first (public: bidder names, no emails)
 */
async function listBids(auctionId) {
  return bidModel.findByAuctionId(auctionId);
}

module.exports = { placeBid, listBids };
