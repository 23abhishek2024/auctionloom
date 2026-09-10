const { v4: uuidv4 } = require('uuid');

/**
 * Logger Middleware
 * - Attaches a unique request_id to every request
 * - Logs method, path, status, and duration
 */
const loggerMiddleware = (req, res, next) => {
  req.id = uuidv4();
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
