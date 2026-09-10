const rateLimit = require('express-rate-limit');

/**
 * Rate Limiter Middleware (Token Bucket pattern via express-rate-limit)
 * - Limits each IP to 100 requests per 15 minutes
 * - Prevents spam and brute-force attacks
 */
const rateLimiterMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,                  // max requests per window per IP
  standardHeaders: true,     // Return rate limit info in RateLimit-* headers
  legacyHeaders: false,
  message: {
    error: 'Too many requests from this IP. Please try again after 15 minutes.',
  },
});

module.exports = { rateLimiterMiddleware };
