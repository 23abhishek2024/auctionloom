const auctionService = require('../services/auctionService');
const {
  isUUID,
  requireUuid,
  requireMoney,
  requireString,
  optionalString,
  optionalQueryString,
  requireFutureEndTime,
} = require('../utils/validators');
const { AppError } = require('../utils/AppError');

/**
 * An image for a listing: a full http(s) URL or a file we stored (/uploads/...), at most 2048 characters
 */
const readImageUrl = (value) => {
  const url = optionalString(value, 'image_url', 2048);
  if (url === null) return null;
  if (!/^https?:\/\//i.test(url) && !url.startsWith('/uploads/')) {
    throw new AppError(400, 'image_url must be an http(s) link or an uploaded image (/uploads/...).');
  }
  return url;
};

/**
 * GET /api/auctions - Get all auctions with optional query filtering:
 *   ?status=ACTIVE | CLOSED | RESTRICTED
 *   ?search=keyword
 *   ?seller_id=uuid
 *   ?sort=price_asc | price_desc | ending_soon
 *   ?limit=number&offset=number
 * Each filter must be given once, as text; seller_id must be a UUID.
 */
const getAllAuctions = async (req, res, next) => {
  try {
    const { query } = req;
    const filters = {
      status: optionalQueryString(query.status, 'status', 20),
      search: optionalQueryString(query.search, 'search', 100),
      seller_id: query.seller_id === undefined || query.seller_id === '' ? null : requireUuid(query.seller_id, 'seller_id'),
      sort: optionalQueryString(query.sort, 'sort', 20),
      limit: optionalQueryString(query.limit, 'limit', 10),
      offset: optionalQueryString(query.offset, 'offset', 10),
    };

    const auctions = await auctionService.listAuctions(filters, req.user);
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
 * title 1-255 characters, description up to 5000, starting_price in whole cents,
 * end_time in the future and within a year (or duration_minutes / duration_hours instead).
 */
const createAuction = async (req, res, next) => {
  try {
    const { title, description, starting_price, duration_minutes, duration_hours } = req.body;
    let { end_time } = req.body;

    if (!end_time && (duration_minutes || duration_hours)) {
      const mins = parseInt(duration_minutes, 10) || ((parseInt(duration_hours, 10) || 0) * 60) || 60;
      if (mins < 1) {
        return res.status(400).json({ error: 'duration_minutes must be at least 1.' });
      }
      end_time = new Date(Date.now() + mins * 60 * 1000).toISOString();
    }

    if (!title || !starting_price || !end_time) {
      return res.status(400).json({ error: 'Title, starting_price, and end_time (or duration_minutes) are required.' });
    }

    const auction = await auctionService.createAuction(req.user.id, {
      title: requireString(title, 'Title', 255),
      description: optionalString(description, 'Description', 5000),
      startingPrice: requireMoney(starting_price, 'starting_price'),
      endTime: requireFutureEndTime(end_time),
      imageUrl: readImageUrl(req.body.image_url ?? req.body.imageUrl),
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

    const endTime = requireFutureEndTime(end_time, 'New end_time');
    const startingPrice = starting_price !== undefined && starting_price !== null && starting_price !== ''
      ? requireMoney(starting_price, 'starting_price')
      : null;

    const auction = await auctionService.republishAuction(id, req.user, { endTime, startingPrice });

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
