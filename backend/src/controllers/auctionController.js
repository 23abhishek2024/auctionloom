const pool = require('../db');
const auctionModel = require('../models/auctionModel');
const auctionClosureService = require('../services/auctionClosureService');
const { isUUID, isUuidFormat, isPositiveNumber } = require('../utils/validators');

// A sold lot is held for its winner this long after the auction ends. Only after that can the
// seller republish it if the winner still hasn't paid.
const PAYMENT_WINDOW_HOURS = 24;

/**
 * Is the viewer an admin right now? (optionalAuth only decodes the token, and a token's role can be stale)
 */
const isCurrentAdmin = async (viewer) => {
  if (!viewer || viewer.role !== 'admin' || !isUuidFormat(viewer.id)) return false;
  const result = await pool.query('SELECT role FROM users WHERE id = $1', [viewer.id]);
  return result.rows[0]?.role === 'admin';
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
 * GET /api/auctions - Get all auctions with optional query filtering:
 *   ?status=ACTIVE | CLOSED
 *   ?search=keyword
 *   ?seller_id=uuid
 *   ?sort=price_asc | price_desc | ending_soon
 *   ?limit=number&offset=number
 */
const getAllAuctions = async (req, res, next) => {
  try {
    const rows = await auctionModel.findAll(req.query);
    const viewerIsAdmin = await isCurrentAdmin(req.user);
    const auctions = rows.map((a) => toPublicAuction(a, req.user, viewerIsAdmin));
    res.json({
      auctions,
      count: auctions.length,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/auctions/:id - Get single auction
 */
const getAuctionById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isUUID(id)) {
      return res.status(400).json({ error: 'Invalid auction ID format. Must be a valid UUID.' });
    }

    let auction = await auctionModel.findById(id);
    if (!auction) return res.status(404).json({ error: 'Auction not found.' });

    // Auto-close expired auction on demand if still marked ACTIVE
    if (auction.status === 'ACTIVE' && new Date(auction.end_time) <= new Date()) {
      await auctionClosureService.closeAuction(id);
      auction = await auctionModel.findById(id);
    }

    const viewerIsAdmin = await isCurrentAdmin(req.user);
    res.json({ auction: toPublicAuction(auction, req.user, viewerIsAdmin) });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auctions - Create a new auction (auctioneer/admin only)
 * Enforces commission settlement lock (Piyush Garg Middleware / Sachin Reference)
 */
const createAuction = async (req, res, next) => {
  try {
    let { title, description, starting_price, end_time, duration_minutes, duration_hours } = req.body;
    const imageUrl = req.body.image_url || req.body.imageUrl || null;

    if (!end_time && (duration_minutes || duration_hours)) {
      const mins = parseInt(duration_minutes, 10) || ((parseInt(duration_hours, 10) || 0) * 60) || 60;
      end_time = new Date(Date.now() + mins * 60 * 1000).toISOString();
    }

    if (!title || !starting_price || !end_time) {
      return res.status(400).json({ error: 'Title, starting_price, and end_time (or duration_minutes) are required.' });
    }

    const price = parseFloat(starting_price);
    if (!isPositiveNumber(price)) {
      return res.status(400).json({ error: 'starting_price must be a positive number greater than 0.' });
    }

    const endDate = new Date(end_time);
    if (isNaN(endDate.getTime()) || endDate <= new Date()) {
      return res.status(400).json({ error: 'end_time must be in the future.' });
    }

    const auction = await auctionModel.create(
      req.user.id,
      title.trim(),
      description ? description.trim() : null,
      price,
      endDate.toISOString(),
      imageUrl
    );

    res.status(201).json({ auction });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/auctions/:id - Delete an auction
 * Seller can delete if no bids placed yet. Admins can delete anytime.
 */
const deleteAuction = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isUUID(id)) {
      return res.status(400).json({ error: 'Invalid auction ID format. Must be a valid UUID.' });
    }

    const auction = await auctionModel.findById(id);
    if (!auction) {
      return res.status(404).json({ error: 'Auction not found.' });
    }

    if (auction.seller_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You are not authorized to delete this auction.' });
    }

    const hasBids = await auctionModel.hasBids(id);
    if (hasBids && req.user.role !== 'admin') {
      return res.status(400).json({ error: 'Cannot delete auction after bids have already been placed.' });
    }

    // Clean up jobs & bids
    await pool.query(`DELETE FROM jobs WHERE payload->>'auction_id' = $1`, [id]);
    await pool.query(`DELETE FROM bids WHERE auction_id = $1`, [id]);
    await auctionModel.delete(id);
    res.json({ message: 'Auction deleted successfully.' });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auctions/:id/republish - 1-Click Republish an ended/closed auction
 */
const republishAuction = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { end_time, starting_price } = req.body;

    if (!isUUID(id)) {
      return res.status(400).json({ error: 'Invalid auction ID format. Must be a valid UUID.' });
    }

    if (!end_time) {
      return res.status(400).json({ error: 'New end_time is required to republish an auction.' });
    }

    const newEndDate = new Date(end_time);
    if (isNaN(newEndDate.getTime()) || newEndDate <= new Date()) {
      return res.status(400).json({ error: 'New end_time must be in the future.' });
    }

    let parsedStartingPrice = null;
    if (starting_price !== undefined && starting_price !== null && starting_price !== '') {
      parsedStartingPrice = parseFloat(starting_price);
      if (!isPositiveNumber(parsedStartingPrice)) {
        return res.status(400).json({ error: 'starting_price must be a positive number greater than 0.' });
      }
    }

    // An auction whose time is up but that nothing has closed yet must be closed first, so its
    // highest bidder becomes the winner (and gets the email) instead of being wiped out here.
    // closeAuction locks the row in its own transaction, so it has to run before ours begins.
    const before = await pool.query('SELECT status, end_time FROM auctions WHERE id = $1', [id]);
    if (before.rows[0]?.status === 'ACTIVE' && new Date(before.rows[0].end_time) <= new Date()) {
      await auctionClosureService.closeAuction(id);
    }

    await client.query('BEGIN');

    const auction = await auctionModel.findByIdForUpdate(client, id);
    if (!auction) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Auction not found.' });
    }

    if (auction.seller_id !== req.user.id && req.user.role !== 'admin') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'You are not authorized to republish this auction.' });
    }

    if (auction.status === 'ACTIVE') {
      await client.query('ROLLBACK');
      if (new Date(auction.end_time) > new Date()) {
        return res.status(400).json({ error: 'Auction is currently active. Cannot republish an active auction.' });
      }
      // Ended a moment ago and not closed yet (the database clock decides when closing is allowed)
      return res.status(409).json({ error: 'This auction has just ended and is still being closed. Try again in a few seconds.' });
    }

    // An auction frozen by an admin stays frozen: only an admin may republish it.
    if (auction.status === 'RESTRICTED' && req.user.role !== 'admin') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'This auction was frozen by an admin and cannot be republished.' });
    }

    // A lot the winner has already paid for is sold. Republishing it would sell the same item twice,
    // and the second sale's settlement would reuse this lot's idempotency keys and charge the new winner $0.
    if (auction.is_settled) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This lot has been sold and paid for, so it cannot be republished. Create a new listing instead.' });
    }

    // A sold but unpaid lot is held for its winner during the payment window. Republishing earlier
    // would delete the winning bid before the winner had a chance to pay. (An admin can override.)
    if (auction.winner_id && req.user.role !== 'admin') {
      const windowEndsMs = new Date(auction.end_time).getTime() + PAYMENT_WINDOW_HOURS * 60 * 60 * 1000;
      if (windowEndsMs > Date.now()) {
        await client.query('ROLLBACK');
        const hoursLeft = Math.ceil((windowEndsMs - Date.now()) / (60 * 60 * 1000));
        return res.status(409).json({
          error: `This lot has a winner, who has ${hoursLeft} more hour${hoursLeft === 1 ? '' : 's'} to pay. You can republish it if they haven't paid by then.`,
          paymentWindowEndsAt: new Date(windowEndsMs).toISOString(),
        });
      }
    }

    const updatedAuction = await auctionModel.republish(
      client,
      id,
      newEndDate.toISOString(),
      parsedStartingPrice
    );

    await client.query('COMMIT');

    res.json({
      message: 'Auction republished successfully for a fresh bidding cycle!',
      auction: updatedAuction,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

module.exports = {
  getAllAuctions,
  getAuctionById,
  createAuction,
  deleteAuction,
  republishAuction,
};

