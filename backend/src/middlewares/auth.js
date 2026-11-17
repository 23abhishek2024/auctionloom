const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');
const { isUuidFormat } = require('../utils/validators');

/**
 * The account behind a decoded login token, read fresh from the database, or null when the token
 * must not be accepted any more: the account was deleted, or its password was changed after the
 * token was issued (changing the password logs out every other session).
 * Used by authMiddleware, the admin check on public pages, and the Socket.IO handshake.
 * Returns { id, name, email, role }.
 */
const loadTokenUser = async (decoded) => {
  if (!decoded || !isUuidFormat(decoded.id)) return null;
  const current = await userModel.findAuthStateById(decoded.id);
  if (!current) return null;
  if (current.password_changed_at && decoded.iat * 1000 < new Date(current.password_changed_at).getTime()) {
    return null;
  }
  return { id: current.id, name: current.name, email: current.email, role: current.role };
};

/**
 * Auth Middleware
 * - Extracts Bearer token from Authorization header
 * - Verifies the JWT, then loads the user's current role from the database
 * - Returns 401 if the token is missing or invalid, the account no longer exists,
 *   or the password was changed after the token was issued
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
    const current = await loadTokenUser(decoded);
    if (!current) {
      return res.status(401).json({ error: 'Your session has ended. Please log in again.' });
    }
    req.user = { ...decoded, role: current.role }; // { id, name, email, role }
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Optional auth for public routes
 * - With a valid token, req.user is set so the handler can show extra fields to the people involved
 * - Without one (or with an expired one), the request simply continues as anonymous
 * (Only the signature is checked here; anything that grants more, such as admin-only fields,
 *  is re-checked against the database with loadTokenUser.)
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

module.exports = { authMiddleware, optionalAuth, roleMiddleware, loadTokenUser };
