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
  if (!origins.includes('https://auctionloom.vercel.app')) origins.push('https://auctionloom.vercel.app');
  if (!origins.includes('https://biding-app-indol.vercel.app')) origins.push('https://biding-app-indol.vercel.app');
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

        const senderName = data.senderName || (data.senderEmail ? data.senderEmail.split('@')[0] : 'Bidder');
        const messagePayload = {
          id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
          auctionId: data.auctionId,
          text,
          senderName,
          senderEmail: data.senderEmail || senderName,
          role: data.role || 'bidder',
          timestamp: new Date().toISOString(),
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
        const allowed = ['🔥', '🚀', '💎', '👏', '❤️', '⚡', '🎉'];
        const emoji = allowed.includes(data.emoji) ? data.emoji : '🔥';

        const senderName = data.senderName || (data.senderEmail ? data.senderEmail.split('@')[0] : 'Bidder');
        const reactionPayload = {
          id: `react-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
          auctionId: data.auctionId,
          emoji,
          senderName,
          senderEmail: data.senderEmail || senderName,
          timestamp: new Date().toISOString(),
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
