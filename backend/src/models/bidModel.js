const pool = require('../db');

const bidModel = {
  /**
   * Get all bids for a specific auction, ordered by highest amount first
   */
  findByAuctionId: async (auctionId) => {
    const result = await pool.query(
      `SELECT b.*, u.email AS bidder_email
       FROM bids b
       JOIN users u ON b.bidder_id = u.id
       WHERE b.auction_id = $1
       ORDER BY b.amount DESC`,
      [auctionId]
    );
    return result.rows;
  },

  /**
   * Get the highest bid for an auction
   */
  findHighestBid: async (client, auctionId) => {
    const result = await client.query(
      'SELECT * FROM bids WHERE auction_id = $1 ORDER BY amount DESC LIMIT 1',
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
