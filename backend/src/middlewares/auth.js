const jwt = require('jsonwebtoken');

/**
 * Auth Middleware
 * - Extracts Bearer token from Authorization header
 * - Verifies the JWT and attaches decoded user to req.user
 * - Returns 401 if token is missing or invalid
 */
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer <token>"

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, email, role }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
};

/**
 * Role Middleware Factory
 * - Restricts a route to specific roles
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

module.exports = { authMiddleware, roleMiddleware };
