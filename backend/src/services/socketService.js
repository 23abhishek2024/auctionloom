const { Server } = require('socket.io');
const { getAllowedOrigins } = require('../utils/allowedOrigins');

let io;

/**
 * Initialize Socket.IO and attach to the HTTP server.
 * Called once from app.js on startup.
 */
const initSocket = (server) => {
  const allowedOrigins = getAllowedOrigins();
  io = new Server(server, {
    cors: {
      // Same allow-list as the REST API (no "*", even when FRONTEND_URL is unset)
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // CORS covers only the HTTP polling transport; browsers don't apply it to WebSockets.
    // So the handshake itself is checked: a browser on another site sends its own Origin and is refused.
    // (No Origin header means a non-browser client such as the test suite.)
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      callback(null, !origin || allowedOrigins.includes(origin));
    },
  });

  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Client joins an auction room to receive live price updates and chat
    socket.on('JOIN_AUCTION', (auctionId) => {
      socket.join(auctionId);
      console.log(`[Socket] ${socket.id} joined auction room: ${auctionId}`);
    });

    socket.on('LEAVE_AUCTION', (auctionId) => {
      socket.leave(auctionId);
      console.log(`[Socket] ${socket.id} left auction room: ${auctionId}`);
    });

    // Real-Time Chat Message (Video 33 - Socket.IO Chat)
    socket.on('SEND_MESSAGE', (data) => {
      try {
        if (!data || !data.auctionId || !data.text) return;
        const text = String(data.text).trim().slice(0, 500);
        if (!text) return;

        // Auto-join room to ensure sender receives room broadcasts
        socket.join(data.auctionId);

        // Everyone in the room receives this, so it carries the sender's id and name, never an email
        const senderName = String(data.senderName || 'Bidder').slice(0, 60);
        const messagePayload = {
          id: data.id || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
          auctionId: data.auctionId,
          text,
          senderName,
          senderId: data.senderId || null,
          role: data.role || 'bidder',
          timestamp: data.timestamp || new Date().toISOString(),
        };

        io.to(data.auctionId).emit('CHAT_MESSAGE', messagePayload);
        console.log(`[Socket] Chat message broadcasted in room ${data.auctionId} from ${senderName}`);
      } catch (err) {
        console.error('[Socket] SEND_MESSAGE error:', err.message);
      }
    });

    // Real-Time Reaction (Floating Emojis)
    socket.on('SEND_REACTION', (data) => {
      try {
        if (!data || !data.auctionId || !data.emoji) return;
        socket.join(data.auctionId);
        const allowed = ['🔥', '🚀', '💎', '👏', '❤️', '⚡', '🎉'];
        const emoji = allowed.includes(data.emoji) ? data.emoji : '🔥';

        const senderName = String(data.senderName || 'Bidder').slice(0, 60);
        const reactionPayload = {
          id: data.id || `react-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
          auctionId: data.auctionId,
          emoji,
          senderName,
          senderId: data.senderId || null,
          timestamp: data.timestamp || new Date().toISOString(),
        };

        io.to(data.auctionId).emit('REACTION', reactionPayload);
      } catch (err) {
        console.error('[Socket] SEND_REACTION error:', err.message);
      }
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
