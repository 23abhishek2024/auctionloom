const auctionModel = require('../models/auctionModel');
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

    const auction = await auctionModel.findById(id);
    if (!auction) return res.status(404).json({ error: 'Auction not found.' });
    res.json({ auction });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auctions - Create a new auction (auctioneer/admin only)
 */
const createAuction = async (req, res, next) => {
  try {
    const { title, description, starting_price, end_time } = req.body;
    const imageUrl = req.body.image_url || req.body.imageUrl || null;

    if (!title || !starting_price || !end_time) {
      return res.status(400).json({ error: 'Title, starting_price, and end_time are required.' });
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

    await auctionModel.delete(id);
    res.json({ message: 'Auction deleted successfully.' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAllAuctions,
  getAuctionById,
  createAuction,
  deleteAuction,
};
