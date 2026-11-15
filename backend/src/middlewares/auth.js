const jwt = require('jsonwebtoken');
const pool = require('../db');
const { isUuidFormat } = require('../utils/validators');

/**
 * Auth Middleware
 * - Extracts Bearer token from Authorization header
 * - Verifies the JWT, then loads the user's current role from the database
 * - Returns 401 if the token is missing or invalid, or the account no longer exists
 *
 * The token proves who the user is; what they may do is read fresh on every request.
 * A role stored only in the token goes stale: an upgrade to seller, or an admin changing
 * someone's role, would otherwise apply only after the next login (up to 7 days later).
 * The cost is one primary-key lookup per authenticated request.
 */
const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer <token>"

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }

  if (!isUuidFormat(decoded.id)) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }

  try {
    const result = await pool.query('SELECT role FROM users WHERE id = $1', [decoded.id]);
    if (result.rowCount === 0) {
      return res.status(401).json({ error: 'This account no longer exists.' });
    }
    req.user = { ...decoded, role: result.rows[0].role }; // { id, name, email, role }
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Optional auth for public routes
 * - With a valid token, req.user is set so the handler can show extra fields to the people involved
 * - Without one (or with an expired one), the request simply continues as anonymous
 */
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return next();

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
  } catch (_) {
    // An invalid token on a public page is ignored rather than rejected
  }
  next();
};

/**
 * Role Middleware Factory
 * - Restricts a route to specific roles (runs after authMiddleware, so req.user.role is current)
 * - Usage: roleMiddleware('admin', 'auctioneer')
 */
const roleMiddleware = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access forbidden. Required role: ${allowedRoles.join(' or ')}.`,
      });
    }
    next();
  };
};

module.exports = { authMiddleware, optionalAuth, roleMiddleware };
