const userService = require('../services/userService');

/**
 * GET /api/users/me/stats
 * Summary metrics for the logged-in user (listings, active bids, wins, bids placed, unpaid commission)
 */
const getMyStats = async (req, res, next) => {
  try {
    const stats = await userService.getStats(req.user.id);
    res.json({ stats });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/users/me/auctions
 * Returns all auctions created by the logged-in user (as seller)
 */
const getMyAuctions = async (req, res, next) => {
  try {
    const auctions = await userService.getListedAuctions(req.user.id);
    res.json({
      auctions,
      count: auctions.length,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/users/me/bids
 * Returns all auctions where the user has placed bids, with my_highest_bid,
 * is_highest_bidder and is_winner
 */
const getMyBids = async (req, res, next) => {
  try {
    const participations = await userService.getBidParticipations(req.user.id);
    res.json({
      participations,
      bids: participations,
      count: participations.length,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/users/me/won
 * Returns all auctions won by this user
 */
const getMyWon = async (req, res, next) => {
  try {
    const won = await userService.getWonAuctions(req.user.id);
    res.json({
      wonAuctions: won,
      won,
      count: won.length,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/users/me/upgrade-seller
 * Allows an existing user (e.g. legacy 'bidder') to activate full seller privileges
 */
const upgradeToSeller = async (req, res, next) => {
  try {
    const { user, token } = await userService.upgradeToSeller(req.user.id);
    res.json({
      message: 'Account successfully upgraded to full member (Bidder & Seller).',
      user,
      token,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/users/leaderboard (or /api/analytics/leaderboard)
 * Public leaderboard of top bidders by bid volume & won auctions (display names only, no emails)
 */
const getLeaderboard = async (req, res, next) => {
  try {
    const leaderboard = await userService.getLeaderboard();
    res.json({
      leaderboard,
      count: leaderboard.length,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/users/me/payout-methods
 */
const getPayoutMethods = async (req, res, next) => {
  try {
    const payoutMethods = await userService.getPayoutMethods(req.user.id);
    res.json({ payoutMethods });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/users/me/payout-methods
 * Accepts both snake_case and camelCase field names (bank_name or bankName, ...)
 */
const updatePayoutMethods = async (req, res, next) => {
  try {
    const bank_name = req.body.bank_name || req.body.bankName || '';
    const account_number = req.body.account_number || req.body.accountNumber || '';
    const ifsc_swift = req.body.ifsc_swift || req.body.ifscCode || req.body.ifscSwift || '';
    const upi_id = req.body.upi_id || req.body.upiId || '';
    const paypal_email = req.body.paypal_email || req.body.paypalEmail || '';

    const methods = {
      bank_name: String(bank_name).trim(),
      account_number: String(account_number).trim(),
      ifsc_swift: String(ifsc_swift).trim(),
      upi_id: String(upi_id).trim(),
      paypal_email: String(paypal_email).trim(),
      updated_at: new Date().toISOString(),
    };

    const payoutMethods = await userService.savePayoutMethods(req.user.id, methods);
    res.json({
      message: 'Payout coordinates saved successfully.',
      payoutMethods,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/users/auction-payout/:auctionId (also /api/users/auctions/:auctionId/seller-payout)
 * Allows winning bidder to view seller's payout instructions
 */
const getSellerPayoutForWinner = async (req, res, next) => {
  try {
    const payout = await userService.getSellerPayoutForAuction(req.params.auctionId, req.user);
    res.json(payout);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getMyStats,
  getMyAuctions,
  getMyBids,
  getMyWon,
  upgradeToSeller,
  getLeaderboard,
  getPayoutMethods,
  updatePayoutMethods,
  getSellerPayoutForWinner,
};
