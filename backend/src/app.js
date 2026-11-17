require('dotenv').config();

// Fail fast without a JWT secret: no token could be signed or verified, and there is no safe default.
if (!process.env.JWT_SECRET) {
  console.error('[Config] JWT_SECRET is not set. Set it in the environment (see .env.example) and restart.');
  process.exit(1);
}
if (process.env.JWT_SECRET.length < 32) {
  console.warn('[Config] JWT_SECRET is shorter than 32 characters. Use a long random value in production.');
}

const express = require('express');
const cors = require('cors');
const http = require('http');
const { getAllowedOrigins } = require('./utils/allowedOrigins');
const { AppError, sendAppError } = require('./utils/AppError');

// Middlewares
const { loggerMiddleware } = require('./middlewares/logger');
const { rateLimiterMiddleware } = require('./middlewares/rateLimiter');

// Routes
const authRoutes = require('./routes/authRoutes');
const auctionRoutes = require('./routes/auctionRoutes');
const bidRoutes = require('./routes/bidRoutes');
const aiRoutes = require('./routes/aiRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const userRoutes = require('./routes/userRoutes');
const adminRoutes = require('./routes/adminRoutes');
const commissionRoutes = require('./routes/commissionRoutes');
const walletRoutes = require('./routes/walletRoutes');
const { getLeaderboard } = require('./controllers/userController');
const auctionClosureService = require('./services/auctionClosureService');
const path = require('path');

// Services
const { initSocket } = require('./services/socketService');

const app = express();
const server = http.createServer(app);

// ── Init Socket.IO ────────────────────────────────────────────
initSocket(server);

// ── Global Middlewares ────────────────────────────────────────
// Request id + access log first, so even a request that fails in a later middleware
// (for example a malformed JSON body) gets an id and a log line.
app.use(loggerMiddleware);

// CORS: only our own frontends may call the API from a browser. Requests without an Origin header
// (curl, server-to-server, the keep-alive ping) are not cross-site browser calls, so CORS doesn't apply.
const allowedOrigins = getAllowedOrigins();
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false); // no CORS headers, so the browser blocks the response
    },
  })
);
app.use(express.json());
// Express 5 leaves req.body undefined when a request has no JSON body; controllers read
// fields from it, so default to {} and let their own checks answer "x is required" (400).
app.use((req, res, next) => {
  if (req.body === undefined) req.body = {};
  next();
});
app.use(rateLimiterMiddleware);

// Serve static uploaded files (Node.js Video 28 - Multer)
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// ── Routes ────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/auctions', auctionRoutes);
app.use('/api/bids', bidRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/commissions', commissionRoutes);
app.use('/api/wallet', walletRoutes);

// Public leaderboard endpoint aliases
app.get('/api/analytics/leaderboard', getLeaderboard);
app.get('/api/leaderboard', getLeaderboard);

// ── Root, API Directory & Health Check ───────────────────────
app.get('/', (req, res) => {
  res.json({
    message: '🚀 AuctionLoom Backend API & Real-Time WebSocket Server',
    status: 'online',
    version: '2.0.0',
    documentation: '/api',
    frontend: process.env.FRONTEND_URL || 'http://localhost:5173',
    endpoints: {
      health: '/health',
      api_index: '/api',
      auctions: '/api/auctions',
      auth: '/api/auth',
      bids: '/api/bids',
      users: '/api/users',
      leaderboard: '/api/leaderboard',
      admin: '/api/admin',
      commissions: '/api/commissions',
      wallet: '/api/wallet',
      ai: '/api/ai/generate',
      upload: '/api/upload',
    },
  });
});


app.get('/health', (req, res) => {
  res.json({ status: 'ok', pid: process.pid, time: new Date().toISOString() });
});

// REST API Discovery Catalog
app.get('/api', (req, res) => {
  res.json({
    title: 'AuctionLoom RESTful API Specification',
    version: '1.1.0',
    status: 'online',
    timestamp: new Date().toISOString(),
    resources: {
      auth: {
        'POST /api/auth/register': { desc: 'Register a new member', auth: 'Public', body: ['email', 'password', 'role (optional)', 'name (optional)'] },
        'POST /api/auth/login': { desc: 'Authenticate and receive JWT token', auth: 'Public', body: ['email', 'password'] },
        'GET /api/auth/me': { desc: 'Get current user profile', auth: 'Bearer JWT' },
        'PUT /api/auth/profile': { desc: 'Update profile name', auth: 'Bearer JWT', body: ['name'] },
      },
      auctions: {
        'GET /api/auctions': { desc: 'List all auctions with optional filters', auth: 'Public', query: ['status (ACTIVE|CLOSED)', 'search', 'seller_id', 'sort (price_asc|price_desc|ending_soon)', 'limit', 'offset'] },
        'GET /api/auctions/:id': { desc: 'Get single auction by UUID', auth: 'Public' },
        'POST /api/auctions': { desc: 'Create a new auction listing', auth: 'Bearer JWT (Auctioneer/Admin)', body: ['title', 'description', 'starting_price', 'end_time', 'image_url'] },
        'DELETE /api/auctions/:id': { desc: 'Delete an auction listing (before bids)', auth: 'Bearer JWT (Owner/Admin)' },
        'GET /api/auctions/:id/bids': { desc: 'Get all bids placed on an auction', auth: 'Public' },
        'POST /api/auctions/:id/bids': { desc: 'Place a bid on an auction', auth: 'Bearer JWT', body: ['amount'] },
      },
      bids: {
        'POST /api/bids': { desc: 'Place a bid on an auction (legacy route)', auth: 'Bearer JWT', body: ['auction_id', 'amount'] },
        'GET /api/bids/:auction_id': { desc: 'Get all bids for an auction (legacy route)', auth: 'Public' },
      },
      users: {
        'GET /api/users/me/stats': { desc: 'Aggregated user metrics (listings, active bids, wins, volume)', auth: 'Bearer JWT' },
        'GET /api/users/me/auctions': { desc: 'Auctions created by user', auth: 'Bearer JWT' },
        'GET /api/users/me/bids': { desc: 'Auctions user has bid on with high bid indicator', auth: 'Bearer JWT' },
        'GET /api/users/me/won': { desc: 'Auctions won by user', auth: 'Bearer JWT' },
        'POST /api/users/me/upgrade-seller': { desc: 'Upgrade user account to seller privileges', auth: 'Bearer JWT' },
      },
      ai: {
        'POST /api/ai/generate': { desc: 'Generate luxury title, description, and starting price', auth: 'Bearer JWT (Auctioneer/Admin)', body: ['keywords', 'category'] },
      },
      upload: {
        'POST /api/upload': { desc: 'Upload auction image (multipart/form-data)', auth: 'Bearer JWT', body: 'image (file)' },
      },
    },
  });
});

// ── 404 Fallback Handler ──────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    error: `Route not found: ${req.method} ${req.originalUrl}`,
    help: 'Visit GET /api to view all available REST endpoints.',
  });
});

// ── Global Error Handler ──────────────────────────────────────
// Express knows this is the error handler because it takes 4 arguments (the unused 4th is _next).
app.use((err, req, res, _next) => {
  // An expected failure reported by a service (not found, not allowed, ...): answer with its status
  if (err instanceof AppError) {
    return sendAppError(res, err);
  }

  // A file upload the client can fix (too large, unexpected field, ...)
  if (err.name === 'MulterError') {
    return res.status(400).json({ error: err.message });
  }

  // A malformed request the client can fix: invalid JSON, a body that is too large, ...
  // (body-parser marks these with a 4xx status and expose = true)
  const status = err.status || err.statusCode;
  if (status >= 400 && status < 500 && err.expose !== false) {
    const message = err.type === 'entity.parse.failed' ? 'Request body is not valid JSON.' : err.message;
    return res.status(status).json({ error: message });
  }

  // Anything else is a bug or an outage. Log the details with the request id, and tell the client
  // only that something went wrong plus the id, so database and code details never leave the server.
  const requestId = req.id || 'unknown';
  console.error(`[${requestId}] ❌ Unhandled Error:`, err.stack || err.message);
  res.status(500).json({
    error: 'Something went wrong on our side. Please try again.',
    requestId,
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`[App] Worker ${process.pid} listening on port ${PORT}`);
  // Automated background sweep: close expired auctions every 15s (ensures seamless lot settlement)
  auctionClosureService.closeExpiredAuctions();
  setInterval(() => auctionClosureService.closeExpiredAuctions(), 15000);
});

module.exports = app;
