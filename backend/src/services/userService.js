const pool = require('../db');
const authService = require('./authService');
const { AppError } = require('../utils/AppError');

/**
 * User Service
 * A user's own dashboard (stats, listings, bids, wins), upgrading to seller, payout details,
 * the public leaderboard, and the admin's user management.
 */

/**
 * Summary metrics for one user:
 * - listedCount: Number of auctions created by this user
 * - activeBidsCount: Number of ACTIVE auctions the user has placed bids on
 * - wonCount: Number of auctions won by this user
 * - totalBidsCount / totalVolume: Bids placed and their total amount
 * - unpaidCommission: Platform commission the user still owes
 */
async function getStats(userId) {
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

  // 5. Unpaid commission debt
  const userRes = await pool.query('SELECT unpaid_commission FROM users WHERE id = $1', [userId]);

  return {
    listedCount: listedRes.rows[0].count || 0,
    activeBidsCount: activeBidsRes.rows[0].count || 0,
    wonCount: wonRes.rows[0].count || 0,
    totalBidsCount: totalBidsRes.rows[0].count || 0,
    totalVolume: parseFloat(totalBidsRes.rows[0].total_volume || 0),
    unpaidCommission: parseFloat(userRes.rows[0]?.unpaid_commission || 0),
  };
}

/**
 * All auctions created by the user (as seller), newest first, with bid counts and the winner
 */
async function getListedAuctions(userId) {
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
  return result.rows;
}

/**
 * All auctions where the user has placed bids, with:
 * - my_highest_bid
 * - current_price
 * - is_highest_bidder (true if user holds current highest bid)
 * - is_winner (true if auction closed and user is winner)
 */
async function getBidParticipations(userId) {
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
  return result.rows;
}

/**
 * All auctions won by the user, latest ending first
 */
async function getWonAuctions(userId) {
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
  return result.rows;
}

/**
 * Give an existing user (e.g. a legacy 'bidder') full seller privileges.
 * Returns the updated user and a fresh token with the new role, so the browser doesn't keep using the old one.
 */
async function upgradeToSeller(userId) {
  const result = await pool.query(
    "UPDATE users SET role = 'auctioneer' WHERE id = $1 RETURNING id, name, email, role, created_at",
    [userId]
  );

  if (result.rowCount === 0) {
    throw new AppError(404, 'User not found.');
  }

  const user = result.rows[0];
  const token = authService.issueToken({
    id: user.id,
    name: user.name || user.email.split('@')[0],
    email: user.email,
    role: user.role,
  });

  return { user, token };
}

/**
 * Public leaderboard of top bidders by bid volume & won auctions (display names only, no emails)
 *
 * Each total is computed in its own subquery. Joining users to auctions AND bids in one query
 * multiplied the rows (every bid repeated once per auction won), which inflated the bid volume.
 */
async function getLeaderboard() {
  const result = await pool.query(`
    SELECT
      u.id,
      COALESCE(NULLIF(u.name, ''), split_part(u.email, '@', 1)) AS username,
      u.role,
      COALESCE(bid_totals.total_volume, 0)::numeric AS total_spent,
      COALESCE(win_totals.auctions_won, 0)::int AS auctions_won,
      COALESCE(bid_totals.total_bids, 0)::int AS total_bids
    FROM users u
    LEFT JOIN (
      SELECT bidder_id, SUM(amount) AS total_volume, COUNT(*) AS total_bids
      FROM bids
      GROUP BY bidder_id
    ) bid_totals ON bid_totals.bidder_id = u.id
    LEFT JOIN (
      SELECT winner_id, COUNT(*) AS auctions_won
      FROM auctions
      WHERE status = 'CLOSED' AND winner_id IS NOT NULL
      GROUP BY winner_id
    ) win_totals ON win_totals.winner_id = u.id
    WHERE bid_totals.bidder_id IS NOT NULL OR win_totals.winner_id IS NOT NULL
    ORDER BY total_spent DESC, auctions_won DESC, total_bids DESC
    LIMIT 100
  `);

  return result.rows.map((row, index) => {
    const rank = index + 1;
    let tier = 'Active Bidder';
    if (rank === 1) tier = 'Grand Master';
    else if (rank <= 3) tier = 'High Roller';
    else if (parseFloat(row.total_spent) > 1000) tier = 'VIP Collector';

    return {
      rank,
      id: row.id,
      username: row.username,
      totalSpent: parseFloat(row.total_spent),
      auctionsWon: row.auctions_won,
      totalBids: row.total_bids,
      tier,
    };
  });
}

/**
 * Where the user wants to be paid (bank, UPI, PayPal); {} if never set
 */
async function getPayoutMethods(userId) {
  const result = await pool.query('SELECT payout_methods FROM users WHERE id = $1', [userId]);
  return result.rows[0]?.payout_methods || {};
}

/**
 * Save the user's payout details (already cleaned by the controller). Returns what was stored.
 */
async function savePayoutMethods(userId, methods) {
  const result = await pool.query(
    'UPDATE users SET payout_methods = $1 WHERE id = $2 RETURNING id, payout_methods',
    [JSON.stringify(methods), userId]
  );
  return result.rows[0].payout_methods;
}

/**
 * The seller's payout instructions for one auction, so its winner knows where to pay.
 * Only the winner, the seller and admins may see them.
 */
async function getSellerPayoutForAuction(auctionId, user) {
  const auctionRes = await pool.query('SELECT * FROM auctions WHERE id = $1', [auctionId]);
  if (auctionRes.rowCount === 0) throw new AppError(404, 'Auction not found.');

  const auction = auctionRes.rows[0];
  if (user.id !== auction.winner_id && user.id !== auction.seller_id && user.role !== 'admin') {
    throw new AppError(403, 'Only the winning bidder can view seller payout instructions.');
  }

  const sellerRes = await pool.query(
    "SELECT id, name, email, payout_methods FROM users WHERE id = $1",
    [auction.seller_id]
  );

  return {
    seller: {
      id: sellerRes.rows[0]?.id,
      name: sellerRes.rows[0]?.name || sellerRes.rows[0]?.email?.split('@')[0],
      email: sellerRes.rows[0]?.email,
      payoutMethods: sellerRes.rows[0]?.payout_methods || {},
    },
    auction: {
      id: auction.id,
      title: auction.title,
      winningBid: parseFloat(auction.current_price),
    },
  };
}

// ── Admin ───────────────────────────────────────────────────────

/**
 * Admin: registered users (newest first, max 100) with their platform statistics,
 * optionally only those whose email or name matches `search`
 */
async function listUsers(search) {
  const pattern = search ? `%${search.trim()}%` : null;
  let query = `
    SELECT
      u.id,
      u.email,
      COALESCE(NULLIF(u.name, ''), split_part(u.email, '@', 1)) AS name,
      u.role,
      u.unpaid_commission::numeric AS unpaid_commission,
      u.created_at,
      COUNT(DISTINCT a.id)::int AS listings_count,
      COUNT(DISTINCT b.id)::int AS total_bids,
      COUNT(DISTINCT w.id)::int AS auctions_won,
      COALESCE(SUM(b.amount), 0)::numeric AS total_spent
    FROM users u
    LEFT JOIN auctions a ON a.seller_id = u.id
    LEFT JOIN bids b ON b.bidder_id = u.id
    LEFT JOIN auctions w ON w.winner_id = u.id AND w.status = 'CLOSED'
  `;
  const params = [];

  if (pattern) {
    params.push(pattern);
    query += ` WHERE u.email ILIKE $1 OR u.name ILIKE $1 `;
  }

  query += `
    GROUP BY u.id
    ORDER BY u.created_at DESC
    LIMIT 100
  `;

  const result = await pool.query(query, params);
  return result.rows.map((u) => ({
    ...u,
    unpaid_commission: parseFloat(u.unpaid_commission || 0),
    total_spent: parseFloat(u.total_spent || 0),
  }));
}

/**
 * Admin: change a user's role (admin, auctioneer, bidder). It applies on their next request,
 * because the auth middleware reads the role from the database every time.
 */
async function changeRole(userId, role) {
  const result = await pool.query(
    `UPDATE users SET role = $1 WHERE id = $2 RETURNING id, email, name, role`,
    [role, userId]
  );

  if (result.rowCount === 0) {
    throw new AppError(404, 'User not found.');
  }
  return result.rows[0];
}

module.exports = {
  getStats,
  getListedAuctions,
  getBidParticipations,
  getWonAuctions,
  upgradeToSeller,
  getLeaderboard,
  getPayoutMethods,
  savePayoutMethods,
  getSellerPayoutForAuction,
  listUsers,
  changeRole,
};
