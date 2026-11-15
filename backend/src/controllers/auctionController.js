const auctionService = require('../services/auctionService');
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
    const auctions = await auctionService.listAuctions(req.query, req.user);
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

    const auction = await auctionService.getAuction(id, req.user);
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

    const auction = await auctionService.createAuction(req.user.id, {
      title: title.trim(),
      description: description ? description.trim() : null,
      startingPrice: price,
      endTime: endDate.toISOString(),
      imageUrl,
    });

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

    await auctionService.deleteAuction(id, req.user);
    res.json({ message: 'Auction deleted successfully.' });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auctions/:id/republish - 1-Click Republish an ended/closed auction
 */
const republishAuction = async (req, res, next) => {
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

    const auction = await auctionService.republishAuction(id, req.user, {
      endTime: newEndDate.toISOString(),
      startingPrice: parsedStartingPrice,
    });

    res.json({
      message: 'Auction republished successfully for a fresh bidding cycle!',
      auction,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAllAuctions,
  getAuctionById,
  createAuction,
  deleteAuction,
  republishAuction,
};
