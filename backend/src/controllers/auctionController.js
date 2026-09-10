const auctionModel = require('../models/auctionModel');

/**
 * GET /api/auctions - Get all auctions
 */
const getAllAuctions = async (req, res, next) => {
  try {
    const auctions = await auctionModel.findAll();
    res.json({ auctions });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/auctions/:id - Get single auction
 */
const getAuctionById = async (req, res, next) => {
  try {
    const auction = await auctionModel.findById(req.params.id);
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

    if (!title || !starting_price || !end_time) {
      return res.status(400).json({ error: 'Title, starting_price, and end_time are required.' });
    }
    if (new Date(end_time) <= new Date()) {
      return res.status(400).json({ error: 'end_time must be in the future.' });
    }

    const auction = await auctionModel.create(
      req.user.id,
      title,
      description,
      starting_price,
      end_time
    );

    res.status(201).json({ auction });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAllAuctions, getAuctionById, createAuction };
