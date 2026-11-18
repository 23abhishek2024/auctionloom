const userService = require('../services/userService');
const { requireUuid, optionalString, EMAIL_REGEX } = require('../utils/validators');
const { AppError } = require('../utils/AppError');

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
 * Accepts both snake_case and camelCase field names (bank_name or bankName, ...).
 * Every field is optional text of at most 100 characters; a PayPal email must look like an email.
 */
const updatePayoutMethods = async (req, res, next) => {
  try {
    // The first of the given names that has a value, checked as optional text
    const field = (label, ...keys) => {
      const value = keys.map((k) => req.body[k]).find((v) => v !== undefined && v !== null && v !== '');
      // An account number may arrive as a number; anything else that isn't text is refused
      return optionalString(typeof value === 'number' ? String(value) : value, label, 100) || '';
    };

    const methods = {
      bank_name: field('Bank name', 'bank_name', 'bankName'),
      account_number: field('Account number', 'account_number', 'accountNumber'),
      ifsc_swift: field('IFSC / SWIFT', 'ifsc_swift', 'ifscCode', 'ifscSwift'),
      upi_id: field('UPI ID', 'upi_id', 'upiId'),
      paypal_email: field('PayPal email', 'paypal_email', 'paypalEmail'),
      updated_at: new Date().toISOString(),
    };
    if (methods.paypal_email && !EMAIL_REGEX.test(methods.paypal_email)) {
      throw new AppError(400, 'PayPal email must be a valid email address.');
    }

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
    const auctionId = requireUuid(req.params.auctionId, 'auction ID');
    const payout = await userService.getSellerPayoutForAuction(auctionId, req.user);
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
