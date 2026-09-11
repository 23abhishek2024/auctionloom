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

// ── Routes ────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/auctions', auctionRoutes);
app.use('/api/bids', bidRoutes);
app.use('/api/ai', aiRoutes);

// ── Root & Health Check ───────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    message: '🚀 AuctionLoom Backend API & Real-Time WebSocket Server',
    status: 'online',
    version: '1.0.0',
    frontend: process.env.FRONTEND_URL || 'http://localhost:5173',
    endpoints: {
      health: '/health',
      auctions: '/api/auctions',
      auth: '/api/auth',
      bids: '/api/bids',
      ai: '/api/ai/generate',
    },
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', pid: process.pid, time: new Date().toISOString() });
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
});

module.exports = app;
