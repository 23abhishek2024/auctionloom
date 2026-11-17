const pool = require('../db');
const auctionModel = require('../models/auctionModel');
const userModel = require('../models/userModel');
const auctionClosureService = require('./auctionClosureService');
const { getIO } = require('./socketService');
const { AppError } = require('../utils/AppError');
const { isUuidFormat } = require('../utils/validators');

/**
 * Auction Service
 * Listing, reading, creating, deleting, republishing and moderating auctions.
 * (Closing an auction lives in auctionClosureService, bidding in bidService.)
 */

// A sold lot is held for its winner this long after the auction ends. Only after that can the
// seller republish it if the winner still hasn't paid.
const PAYMENT_WINDOW_HOURS = 24;

/**
 * Is the viewer an admin right now? (optionalAuth only decodes the token, and a token's role can be stale)
 */
const isCurrentAdmin = async (viewer) => {
  if (!viewer || viewer.role !== 'admin' || !isUuidFormat(viewer.id)) return false;
  const current = await userModel.findRoleById(viewer.id);
  return current?.role === 'admin';
};

/**
 * Auctions are public, but emails are not. Only an admin sees the seller's and winner's emails,
 * and only the winner, the seller or an admin sees the link to the winner's email preview.
 */
const toPublicAuction = (auction, viewer, viewerIsAdmin) => {
  const { seller_email, winner_email, winner_email_preview_url, ...publicFields } = auction;
  const isParty = Boolean(viewer && (viewer.id === auction.seller_id || viewer.id === auction.winner_id));
  return {
    ...publicFields,
    ...(viewerIsAdmin ? { seller_email, winner_email } : {}),
    ...(viewerIsAdmin || isParty ? { winner_email_preview_url } : {}),
  };
};

/**
 * All auctions matching the filters (status, search, seller_id, sort, limit, offset),
 * with emails shown only to the people allowed to see them.
 */
async function listAuctions(filters, viewer) {
  const rows = await auctionModel.findAll(filters);
  const viewerIsAdmin = await isCurrentAdmin(viewer);
  return rows.map((a) => toPublicAuction(a, viewer, viewerIsAdmin));
}

/**
 * One auction. An auction whose time is up but that is still ACTIVE is closed first,
 * so the page shows the result instead of a finished auction that still looks open.
 */
async function getAuction(id, viewer) {
  let auction = await auctionModel.findById(id);
  if (!auction) throw new AppError(404, 'Auction not found.');

  if (auction.status === 'ACTIVE' && new Date(auction.end_time) <= new Date()) {
    await auctionClosureService.closeAuction(id);
    auction = await auctionModel.findById(id);
  }

  const viewerIsAdmin = await isCurrentAdmin(viewer);
  return toPublicAuction(auction, viewer, viewerIsAdmin);
}

/**
 * Create an auction for `sellerId`. The fields are already validated and cleaned by the controller.
 */
async function createAuction(sellerId, { title, description, startingPrice, endTime, imageUrl }) {
  return auctionModel.create(sellerId, title, description, startingPrice, endTime, imageUrl);
}

/**
 * Run `fn(client, auction)` in one transaction with the auction row locked (SELECT ... FOR UPDATE).
 * That is the same lock a bid takes, so no bid can arrive between our checks and the delete.
 * Throws 404 if there is no such auction.
 */
async function withLockedAuction(id, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const auction = await auctionModel.findByIdForUpdate(client, id);
    if (!auction) throw new AppError(404, 'Auction not found.');
    const result = await fn(client, auction);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// A lot that was paid for is part of the money records (ledger rows point at it), so it is never deleted
const refuseIfPaid = (auction) => {
  if (auction.is_settled) {
    throw new AppError(409, 'This lot has been paid for, so it is part of the financial records and cannot be deleted.');
  }
};

/**
 * Delete an auction. Its seller can delete it until the first bid; an admin can delete it anytime,
 * except a lot that has been paid for.
 * Check and delete happen under one row lock: before, a bid placed between the "no bids yet"
 * check and the delete was deleted along with the auction.
 */
async function deleteAuction(id, user) {
  await withLockedAuction(id, async (client, auction) => {
    if (auction.seller_id !== user.id && user.role !== 'admin') {
      throw new AppError(403, 'You are not authorized to delete this auction.');
    }
    refuseIfPaid(auction);
    if (user.role !== 'admin' && (await auctionModel.hasBids(id, client))) {
      throw new AppError(400, 'Cannot delete auction after bids have already been placed.');
    }
    await auctionModel.deleteWithBidsAndJobs(client, id);
  });
}

/**
 * Admin override: delete any unpaid auction, with its bids and queued jobs. Returns the deleted row.
 */
async function forceDeleteAuction(id) {
  return withLockedAuction(id, async (client, auction) => {
    refuseIfPaid(auction);
    return auctionModel.deleteWithBidsAndJobs(client, id);
  });
}

/**
 * Admin moderation: set an auction's status (ACTIVE, CLOSED or RESTRICTED) and tell everyone watching it.
 */
async function setAuctionStatus(id, status, reason) {
  const updated = await auctionModel.updateStatus(id, status);
  if (!updated) {
    throw new AppError(404, 'Auction not found.');
  }

  // Real-time broadcast to room so all clients update live
  try {
    const io = getIO();
    io.to(id).emit('AUCTION_STATUS_CHANGED', {
      auction_id: id,
      status,
      reason: reason || (status === 'RESTRICTED' ? 'Administrative hold applied.' : 'Restriction lifted.'),
      timestamp: new Date().toISOString(),
    });
  } catch (_) {}

  return updated;
}

/**
 * Republish an ended auction for a fresh bidding cycle (new end time, optionally a new starting price).
 * Refuses an auction that is still running, one an admin froze (unless the user is an admin), a lot
 * that has been paid for, and a sold lot whose winner is still inside the payment window.
 */
async function republishAuction(id, user, { endTime, startingPrice }) {
  // An auction whose time is up but that nothing has closed yet must be closed first, so its
  // highest bidder becomes the winner (and gets the email) instead of being wiped out here.
  // closeAuction locks the row in its own transaction, so it has to run before ours begins.
  const before = await pool.query('SELECT status, end_time FROM auctions WHERE id = $1', [id]);
  if (before.rows[0]?.status === 'ACTIVE' && new Date(before.rows[0].end_time) <= new Date()) {
    await auctionClosureService.closeAuction(id);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const auction = await auctionModel.findByIdForUpdate(client, id);
    if (!auction) {
      throw new AppError(404, 'Auction not found.');
    }

    if (auction.seller_id !== user.id && user.role !== 'admin') {
      throw new AppError(403, 'You are not authorized to republish this auction.');
    }

    if (auction.status === 'ACTIVE') {
      if (new Date(auction.end_time) > new Date()) {
        throw new AppError(400, 'Auction is currently active. Cannot republish an active auction.');
      }
      // Ended a moment ago and not closed yet (the database clock decides when closing is allowed)
      throw new AppError(409, 'This auction has just ended and is still being closed. Try again in a few seconds.');
    }

    // An auction frozen by an admin stays frozen: only an admin may republish it.
    if (auction.status === 'RESTRICTED' && user.role !== 'admin') {
      throw new AppError(403, 'This auction was frozen by an admin and cannot be republished.');
    }

    // A lot the winner has already paid for is sold. Republishing it would sell the same item twice,
    // and the second sale's settlement would reuse this lot's idempotency keys and charge the new winner $0.
    if (auction.is_settled) {
      throw new AppError(400, 'This lot has been sold and paid for, so it cannot be republished. Create a new listing instead.');
    }

    // A sold but unpaid lot is held for its winner during the payment window. Republishing earlier
    // would delete the winning bid before the winner had a chance to pay. (An admin can override.)
    if (auction.winner_id && user.role !== 'admin') {
      const windowEndsMs = new Date(auction.end_time).getTime() + PAYMENT_WINDOW_HOURS * 60 * 60 * 1000;
      if (windowEndsMs > Date.now()) {
        const hoursLeft = Math.ceil((windowEndsMs - Date.now()) / (60 * 60 * 1000));
        throw new AppError(
          409,
          `This lot has a winner, who has ${hoursLeft} more hour${hoursLeft === 1 ? '' : 's'} to pay. You can republish it if they haven't paid by then.`,
          { paymentWindowEndsAt: new Date(windowEndsMs).toISOString() }
        );
      }
    }

    const updatedAuction = await auctionModel.republish(client, id, endTime, startingPrice);

    await client.query('COMMIT');
    return updatedAuction;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  PAYMENT_WINDOW_HOURS,
  listAuctions,
  getAuction,
  createAuction,
  deleteAuction,
  forceDeleteAuction,
  setAuctionStatus,
  republishAuction,
};
