const pool = require('../db');

const auctionModel = {
  /**
   * Get all auctions with optional filters, search, and sorting
   */
  findAll: async (filters = {}) => {
    const { status, search, seller_id, limit, offset, sort } = filters;
    const conditions = [];
    const params = [];

    if (status && (status.toUpperCase() === 'ACTIVE' || status.toUpperCase() === 'CLOSED')) {
      params.push(status.toUpperCase());
      conditions.push(`a.status = $${params.length}`);
    }

    if (seller_id) {
      params.push(seller_id);
      conditions.push(`a.seller_id = $${params.length}`);
    }

    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      conditions.push(`(a.title ILIKE $${params.length} OR a.description ILIKE $${params.length})`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    let orderBy = 'ORDER BY a.created_at DESC';
    if (sort === 'price_asc') orderBy = 'ORDER BY a.current_price ASC';
    else if (sort === 'price_desc') orderBy = 'ORDER BY a.current_price DESC';
    else if (sort === 'ending_soon') orderBy = 'ORDER BY a.end_time ASC';

    let paginationClause = '';
    const parsedLimit = parseInt(limit, 10);
    const parsedOffset = parseInt(offset, 10);
    if (!isNaN(parsedLimit) && parsedLimit > 0) {
      params.push(parsedLimit);
      paginationClause += ` LIMIT $${params.length}`;
    }
    if (!isNaN(parsedOffset) && parsedOffset >= 0) {
      params.push(parsedOffset);
      paginationClause += ` OFFSET $${params.length}`;
    }

    const query = `
      SELECT a.*, 
             COALESCE(NULLIF(u.name, ''), split_part(u.email, '@', 1)) AS seller_name,
             u.email AS seller_email,
             COALESCE(NULLIF(w.name, ''), split_part(w.email, '@', 1)) AS winner_name,
             w.email AS winner_email
      FROM auctions a
      JOIN users u ON a.seller_id = u.id
      LEFT JOIN users w ON a.winner_id = w.id
      ${whereClause}
      ${orderBy}
      ${paginationClause}
    `;

    const result = await pool.query(query, params);
    return result.rows;
  },

  /**
   * Get a single auction by ID
   */
  findById: async (id) => {
    const result = await pool.query(
      `SELECT a.*, 
              COALESCE(NULLIF(u.name, ''), split_part(u.email, '@', 1)) AS seller_name,
              u.email AS seller_email,
              COALESCE(NULLIF(w.name, ''), split_part(w.email, '@', 1)) AS winner_name,
              w.email AS winner_email
       FROM auctions a
       JOIN users u ON a.seller_id = u.id
       LEFT JOIN users w ON a.winner_id = w.id
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
  create: async (sellerId, title, description, startingPrice, endTime, imageUrl = null) => {
    const result = await pool.query(
      `INSERT INTO auctions (seller_id, title, description, starting_price, current_price, end_time, image_url)
       VALUES ($1, $2, $3, $4, $4, $5, $6)
       RETURNING *`,
      [sellerId, title, description, startingPrice, endTime, imageUrl]
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

  /**
   * Check if an auction has received any bids
   */
  hasBids: async (auctionId) => {
    const result = await pool.query('SELECT COUNT(*)::int AS count FROM bids WHERE auction_id = $1', [auctionId]);
    return (result.rows[0]?.count || 0) > 0;
  },

  /**
   * Delete an auction by ID
   */
  delete: async (id) => {
    const result = await pool.query('DELETE FROM auctions WHERE id = $1 RETURNING *', [id]);
    return result.rows[0];
  },
};

module.exports = auctionModel;
