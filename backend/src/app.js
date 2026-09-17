require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');

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
app.use(cors());
app.use(express.json());
app.use(loggerMiddleware);
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
app.use((err, req, res, next) => {
  const reqId = req.id || 'unknown';
  console.error(`[${reqId}] ❌ Unhandled Error:`, err.message);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
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
