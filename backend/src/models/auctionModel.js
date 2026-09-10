const pool = require('../db');

const auctionModel = {
  /**
   * Get all active auctions
   */
  findAll: async () => {
    const result = await pool.query(
      `SELECT a.*, u.email AS seller_email
       FROM auctions a
       JOIN users u ON a.seller_id = u.id
       ORDER BY a.created_at DESC`
    );
    return result.rows;
  },

  /**
   * Get a single auction by ID
   */
  findById: async (id) => {
    const result = await pool.query(
      `SELECT a.*, u.email AS seller_email
       FROM auctions a
       JOIN users u ON a.seller_id = u.id
       WHERE a.id = $1`,
      [id]
    );
    return result.rows[0];
  },

  /**
   * Get a single auction by ID with a row-level lock.
   * MUST be called inside an active transaction (BEGIN).
   * This is the core of concurrency control — blocks other
   * transactions from modifying this row until COMMIT.
   */
  findByIdForUpdate: async (client, id) => {
    const result = await client.query(
      'SELECT * FROM auctions WHERE id = $1 FOR UPDATE',
      [id]
    );
    return result.rows[0];
  },

  /**
   * Create a new auction
   */
  create: async (sellerId, title, description, startingPrice, endTime) => {
    const result = await pool.query(
      `INSERT INTO auctions (seller_id, title, description, starting_price, current_price, end_time)
       VALUES ($1, $2, $3, $4, $4, $5)
       RETURNING *`,
      [sellerId, title, description, startingPrice, endTime]
    );
    return result.rows[0];
  },

  /**
   * Update the current price of an auction (called inside a transaction)
   */
  updatePrice: async (client, auctionId, newPrice) => {
    const result = await client.query(
      'UPDATE auctions SET current_price = $1 WHERE id = $2 RETURNING *',
      [newPrice, auctionId]
    );
    return result.rows[0];
  },

  /**
   * Close an auction and set the winner
   */
  close: async (client, auctionId, winnerId) => {
    const result = await client.query(
      `UPDATE auctions SET status = 'CLOSED', winner_id = $1 WHERE id = $2 RETURNING *`,
      [winnerId, auctionId]
    );
    return result.rows[0];
  },

  /**
   * Find all auctions that have ended but are still ACTIVE
   * Used by the scheduler
   */
  findEndedActive: async () => {
    const result = await pool.query(
      `SELECT * FROM auctions
       WHERE status = 'ACTIVE' AND end_time <= NOW()`
    );
    return result.rows;
  },
};

module.exports = auctionModel;
