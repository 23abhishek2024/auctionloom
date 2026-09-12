const pool = require('../db');

/**
 * GET /api/users/me/stats
 * Summary metrics for the logged-in user:
 * - listedCount: Number of auctions created by this user
 * - activeBidsCount: Number of ACTIVE auctions the user has placed bids on
 * - wonCount: Number of auctions won by this user
 * - totalBidsCount: Total number of individual bids placed by this user
 */
const getMyStats = async (req, res, next) => {
  try {
    const userId = req.user.id;

    // 1. Auctions listed by user
    const listedRes = await pool.query(
      'SELECT COUNT(*)::int AS count FROM auctions WHERE seller_id = $1',
      [userId]
    );

    // 2. Active auctions user is currently bidding on
    const activeBidsRes = await pool.query(
      `SELECT COUNT(DISTINCT b.auction_id)::int AS count
       FROM bids b
       JOIN auctions a ON b.auction_id = a.id
       WHERE b.bidder_id = $1 AND a.status = 'ACTIVE' AND a.end_time > NOW()`,
      [userId]
    );

    // 3. Auctions won by user
    const wonRes = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM auctions
       WHERE winner_id = $1 OR (
         status = 'CLOSED' AND id IN (
           SELECT b1.auction_id FROM bids b1
           WHERE b1.bidder_id = $1 AND b1.amount = (
             SELECT MAX(b2.amount) FROM bids b2 WHERE b2.auction_id = b1.auction_id
           )
         )
       )`,
      [userId]
    );

    // 4. Total bids placed
    const totalBidsRes = await pool.query(
      'SELECT COUNT(*)::int AS count, COALESCE(SUM(amount), 0)::numeric AS total_volume FROM bids WHERE bidder_id = $1',
      [userId]
    );

    res.json({
      stats: {
        listedCount: listedRes.rows[0].count || 0,
        activeBidsCount: activeBidsRes.rows[0].count || 0,
        wonCount: wonRes.rows[0].count || 0,
        totalBidsCount: totalBidsRes.rows[0].count || 0,
        totalVolume: parseFloat(totalBidsRes.rows[0].total_volume || 0),
      },
    });
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
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT a.*,
              COUNT(b.id)::int AS total_bids,
              COALESCE(NULLIF(w.name, ''), split_part(w.email, '@', 1)) AS winner_name,
              w.email AS winner_email
       FROM auctions a
       LEFT JOIN bids b ON a.id = b.auction_id
       LEFT JOIN users w ON a.winner_id = w.id
       WHERE a.seller_id = $1
       GROUP BY a.id, w.name, w.email
       ORDER BY a.created_at DESC`,
      [userId]
    );

    res.json({
      auctions: result.rows,
      count: result.rows.length,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/users/me/bids
 * Returns all auctions where the user has placed bids, with:
 * - my_highest_bid
 * - current_price
 * - is_highest_bidder (true if user holds current highest bid)
 * - is_winner (true if auction closed and user is winner)
 */
const getMyBids = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT a.*,
              my_bids.my_highest_bid,
              my_bids.my_bid_count,
              (a.current_price <= my_bids.my_highest_bid) AS is_highest_bidder,
              COALESCE(NULLIF(s.name, ''), split_part(s.email, '@', 1)) AS seller_name,
              s.email AS seller_email,
              COALESCE(NULLIF(w.name, ''), split_part(w.email, '@', 1)) AS winner_name,
              (a.winner_id = $1 OR (a.status = 'CLOSED' AND a.current_price <= my_bids.my_highest_bid)) AS is_winner
       FROM (
         SELECT auction_id, 
                MAX(amount)::numeric AS my_highest_bid,
                COUNT(id)::int AS my_bid_count
         FROM bids
         WHERE bidder_id = $1
         GROUP BY auction_id
       ) my_bids
       JOIN auctions a ON my_bids.auction_id = a.id
       JOIN users s ON a.seller_id = s.id
       LEFT JOIN users w ON a.winner_id = w.id
       ORDER BY a.created_at DESC`,
      [userId]
    );

    res.json({
      participations: result.rows,
      bids: result.rows,
      count: result.rows.length,
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
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT a.*,
              COALESCE(NULLIF(s.name, ''), split_part(s.email, '@', 1)) AS seller_name,
              s.email AS seller_email,
              MAX(b.amount)::numeric AS winning_bid
       FROM auctions a
       JOIN users s ON a.seller_id = s.id
       LEFT JOIN bids b ON a.id = b.auction_id AND b.bidder_id = $1
       WHERE a.winner_id = $1 OR (
         a.status = 'CLOSED' AND a.id IN (
           SELECT b1.auction_id FROM bids b1
           WHERE b1.bidder_id = $1 AND b1.amount = a.current_price
         )
       )
       GROUP BY a.id, s.name, s.email
       ORDER BY a.end_time DESC`,
      [userId]
    );

    res.json({
      wonAuctions: result.rows,
      won: result.rows,
      count: result.rows.length,
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
    const userId = req.user.id;
    const result = await pool.query(
      "UPDATE users SET role = 'auctioneer' WHERE id = $1 RETURNING id, name, email, role, created_at",
      [userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.json({
      message: 'Account successfully upgraded to full member (Bidder & Seller).',
      user: result.rows[0],
    });
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
};
