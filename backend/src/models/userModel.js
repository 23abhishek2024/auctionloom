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
      'SELECT id, name, email, role, created_at FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0];
  },

  /**
   * Create a new user
   */
  create: async (email, passwordHash, role = 'bidder', name = null) => {
    const displayName = name && name.trim() ? name.trim() : email.split('@')[0];
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, role, name) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, created_at',
      [email, passwordHash, role, displayName]
    );
    return result.rows[0];
  },

  /**
   * Update a user's display name
   */
  updateName: async (id, name) => {
    const result = await pool.query(
      'UPDATE users SET name = $1 WHERE id = $2 RETURNING id, name, email, role, created_at',
      [name, id]
    );
    return result.rows[0];
  },
};

module.exports = userModel;
