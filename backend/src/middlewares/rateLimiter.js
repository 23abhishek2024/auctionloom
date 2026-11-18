const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

/**
 * Rate Limiter Middlewares (express-rate-limit, fixed 15-minute / 1-hour windows, in-memory store)
 *
 * They count per client IP, read from req.ip. Behind a proxy (Render's load balancer) req.ip is
 * only the client's address if Express's "trust proxy" is set (see app.js); without it every user
 * shares the proxy's address and therefore one counter.
 * The store is in memory, so each Node process counts on its own (with N cluster workers a client
 * effectively gets N times the limit); a shared store such as Redis would fix that.
 */

// Every API request: 5000 per 15 minutes per IP (about 5 per second, generous for live bidding)
const rateLimiterMiddleware = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5000,
  standardHeaders: true, // RateLimit-* headers
  legacyHeaders: false,
  message: {
    error: 'Too many requests from this IP. Please try again after 15 minutes.',
  },
});

// Login: 10 FAILED attempts per 15 minutes per IP and email (successful logins are not counted),
// so nobody can try thousands of passwords against one account
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    return `${ipKeyGenerator(req.ip)}|${email}`;
  },
  message: {
    error: 'Too many failed login attempts. Please wait 15 minutes and try again.',
  },
});

// Sign-up: 50 accounts per hour per IP (each sign-up costs a bcrypt hash, so mass sign-ups load the CPU)
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many accounts created from this IP. Please try again later.',
  },
});

module.exports = { rateLimiterMiddleware, loginLimiter, registerLimiter };
