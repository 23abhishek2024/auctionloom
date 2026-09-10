const { Server } = require('socket.io');

let io;

const parseAllowedOrigins = () => {
  const envUrl = process.env.FRONTEND_URL;
  if (!envUrl || envUrl === '*') {
    return '*';
  }
  const origins = envUrl.split(',').map((o) => o.trim()).filter(Boolean);
  if (!origins.includes('http://localhost:5173')) origins.push('http://localhost:5173');
  if (!origins.includes('http://localhost:3000')) origins.push('http://localhost:3000');
  return origins;
};

/**
 * Initialize Socket.IO and attach to the HTTP server.
 * Called once from app.js on startup.
 */
const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: parseAllowedOrigins(),
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Client joins an auction room to receive live price updates
    socket.on('JOIN_AUCTION', (auctionId) => {
      socket.join(auctionId);
      console.log(`[Socket] ${socket.id} joined auction room: ${auctionId}`);
    });

    socket.on('LEAVE_AUCTION', (auctionId) => {
      socket.leave(auctionId);
      console.log(`[Socket] ${socket.id} left auction room: ${auctionId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });

  console.log('[Socket] Socket.IO initialized.');
};

/**
 * Get the Socket.IO instance from anywhere in the app.
 * Usage: const io = getIO(); io.to(auctionId).emit('EVENT', data);
 */
const getIO = () => {
  if (!io) throw new Error('Socket.IO not initialized. Call initSocket(server) first.');
  return io;
};

module.exports = { initSocket, getIO };
