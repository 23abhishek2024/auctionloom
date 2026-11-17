const bidService = require('../services/bidService');
const { isUUID, parseMoney, MONEY_RULE } = require('../utils/validators');

/**
 * POST /api/bids OR POST /api/auctions/:id/bids
 * Checks the request, then bidService places the bid in a locked transaction.
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

  // ── 2. INPUT VALIDATION (before touching the database) ───────
  if (!auctionId || amount === undefined || amount === null || amount === '') {
    return res.status(400).json({ error: 'auction_id and amount are required.' });
  }

  if (!isUUID(auctionId)) {
    return res.status(400).json({ error: 'Invalid auction ID format. Must be a valid UUID.' });
  }

  // Whole cents only: 101.004 would be stored as 101.00 and tie with an existing bid of 101.00
  const bidAmount = parseMoney(amount);
  if (bidAmount === null) {
    return res.status(400).json({ error: `amount must be ${MONEY_RULE}.` });
  }

  try {
    const bid = await bidService.placeBid({ auctionId, bidder: req.user, amount: bidAmount });
    res.status(201).json({ bid });
  } catch (err) {
    next(err);
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

    const bids = await bidService.listBids(auctionId);
    res.json({ bids, count: bids.length });
  } catch (err) {
    next(err);
  }
};

module.exports = { placeBid, getBidsForAuction };
