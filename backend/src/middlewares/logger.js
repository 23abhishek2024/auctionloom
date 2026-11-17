const crypto = require('crypto');

/**
 * Logger Middleware
 * - Attaches a unique request_id to every request
 * - Logs method, path, status, and duration
 */
const loggerMiddleware = (req, res, next) => {
  req.id = crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).substring(2));
  // Sent back on every response, so a user who hits an error can quote the id and we can find the log line
  res.setHeader('X-Request-Id', req.id);
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(
      `[${req.id}] ${req.method} ${req.originalUrl} → ${res.statusCode} (${duration}ms)`
    );
  });

  next();
};

module.exports = { loggerMiddleware };
