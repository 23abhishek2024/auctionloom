const rateLimit = require('express-rate-limit');

/**
 * Rate Limiter Middleware (Token Bucket pattern via express-rate-limit)
 * - Limits each IP to 100 requests per 15 minutes
 * - Prevents spam and brute-force attacks
 */
const rateLimiterMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 5000, // 5000 in dev, 100 in production
  standardHeaders: true,     // Return rate limit info in RateLimit-* headers
  legacyHeaders: false,
  message: {
    error: 'Too many requests from this IP. Please try again after 15 minutes.',
  },
});

module.exports = { rateLimiterMiddleware };
