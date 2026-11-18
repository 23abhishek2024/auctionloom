const pool = require('../db');

const bidModel = {
  /**
   * Get all bids for a specific auction, ordered by highest amount first.
   * This list is public, so it carries the bidder's display name but never their email.
   */
  findByAuctionId: async (auctionId) => {
    const result = await pool.query(
      `SELECT b.*,
              COALESCE(NULLIF(u.name, ''), split_part(u.email, '@', 1)) AS bidder_name
       FROM bids b
       JOIN users u ON b.bidder_id = u.id
       WHERE b.auction_id = $1
       ORDER BY b.amount DESC, b.created_at ASC`,
      [auctionId]
    );
    return result.rows;
  },

  /**
   * Get the highest bid for an auction. Accepted bids are strictly increasing, so amounts can't tie;
   * if old data ever has a tie, the earlier bid wins (a fixed rule instead of whatever order the database picks).
   */
  findHighestBid: async (client, auctionId) => {
    const result = await client.query(
      'SELECT * FROM bids WHERE auction_id = $1 ORDER BY amount DESC, created_at ASC, id ASC LIMIT 1',
      [auctionId]
    );
    return result.rows[0];
  },

  /**
   * Place a new bid (must be called inside a transaction)
   */
  create: async (client, auctionId, bidderId, amount) => {
    const result = await client.query(
      `INSERT INTO bids (auction_id, bidder_id, amount)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [auctionId, bidderId, amount]
    );
    return result.rows[0];
  },
};

module.exports = bidModel;
