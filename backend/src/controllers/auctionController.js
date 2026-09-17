const pool = require('../db');
const auctionModel = require('../models/auctionModel');
const auctionClosureService = require('../services/auctionClosureService');
const { isUUID, isPositiveNumber } = require('../utils/validators');

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
    const auctions = await auctionModel.findAll(req.query);
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

    res.json({ auction });
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

    if (auction.status === 'ACTIVE' && new Date(auction.end_time) > new Date()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Auction is currently active. Cannot republish an active auction.' });
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

