const pool = require('../db');

const userModel = {
  /**
   * Find a user by email (case-insensitive)
   */
  findByEmail: async (email) => {
    if (!email) return null;
    const result = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email.trim()]);
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
   * What a login token is checked against on every request, read fresh from the database:
   * the current role (a token's role can be out of date) and when the password last changed.
   * Returns { id, name, email, role, password_changed_at }, or undefined if the account no longer exists.
   */
  findAuthStateById: async (id) => {
    const result = await pool.query(
      'SELECT id, name, email, role, password_changed_at FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0];
  },

  /**
   * The stored password hash (only for checking a password)
   */
  findPasswordHashById: async (id) => {
    const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [id]);
    return result.rows[0]?.password_hash;
  },

  /**
   * Store a new password hash and when it changed. `changedAt` comes from the same (Node) clock that
   * stamps tokens, cut to whole seconds like a token's iat, so the fresh token issued right after the
   * change is accepted even if the database clock is a little ahead.
   */
  updatePasswordHash: async (id, passwordHash, changedAt) => {
    const result = await pool.query(
      `UPDATE users SET password_hash = $1, password_changed_at = $3
       WHERE id = $2
       RETURNING id, name, email, role`,
      [passwordHash, id, changedAt]
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
