const pool = require('../db');

const userModel = {
  /**
   * Find a user by email
   */
  findByEmail: async (email) => {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    return result.rows[0];
  },

  /**
   * Find a user by ID
   */
  findById: async (id) => {
    const result = await pool.query(
      'SELECT id, email, role, created_at FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0];
  },

  /**
   * Create a new user
   */
  create: async (email, passwordHash, role = 'bidder') => {
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role, created_at',
      [email, passwordHash, role]
    );
    return result.rows[0];
  },
};

module.exports = userModel;
