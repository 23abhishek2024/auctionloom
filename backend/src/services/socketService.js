const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { getAllowedOrigins } = require('../utils/allowedOrigins');
const { isUUID, isUuidFormat } = require('../utils/validators');
const userModel = require('../models/userModel');

let io;

const MAX_CHAT_LENGTH = 500;
const ALLOWED_REACTIONS = ['🔥', '🚀', '💎', '👏', '❤️', '⚡', '🎉'];

// Per-connection flood control: at most RATE_MAX chat messages / reactions in any RATE_WINDOW_MS
const RATE_MAX = 5;
const RATE_WINDOW_MS = 10 * 1000;
const isFlooding = (socket, kind) => {
  const now = Date.now();
  const key = `${kind}Times`;
  const recent = (socket.data[key] || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) {
    socket.data[key] = recent;
    return true;
  }
  recent.push(now);
  socket.data[key] = recent;
  return false;
};

/**
 * Who is on this connection, worked out on the server from the login token sent in the handshake
 * (socket.handshake.auth.token). Name, id and role come from the database, never from the client,
 * so nobody can post as "Admin" or as another user. No token (or an invalid one) = a guest, who can
 * still watch prices live but cannot chat.
 */
const identify = async (socket) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  if (!token || typeof token !== 'string') return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!isUuidFormat(decoded.id)) return null;
    const user = await userModel.findById(decoded.id);
    if (!user) return null;
    return {
      id: user.id,
      name: user.name || user.email.split('@')[0], // a display name, never the email
      role: user.role,
    };
  } catch (_) {
    return null; // expired or forged token: treat as a guest
  }
};

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

  // Runs once per connection (and again on every reconnect, with the token the browser has then)
  io.use(async (socket, next) => {
    try {
      socket.data.user = await identify(socket);
    } catch (err) {
      console.error('[Socket] Could not identify connection:', err.message);
      socket.data.user = null;
    }
    next();
  });

  io.on('connection', (socket) => {
    const who = socket.data.user ? `${socket.data.user.name} (${socket.data.user.role})` : 'guest';
    console.log(`[Socket] Client connected: ${socket.id} as ${who}`);

    // Client joins an auction room to receive live price updates and chat (guests too)
    socket.on('JOIN_AUCTION', (auctionId) => {
      if (!isUUID(auctionId)) return;
      socket.join(auctionId);
      console.log(`[Socket] ${socket.id} joined auction room: ${auctionId}`);
    });

    socket.on('LEAVE_AUCTION', (auctionId) => {
      if (!isUUID(auctionId)) return;
      socket.leave(auctionId);
      console.log(`[Socket] ${socket.id} left auction room: ${auctionId}`);
    });

    // Real-Time Chat Message: logged-in users only; sender details come from the server
    socket.on('SEND_MESSAGE', (data) => {
      try {
        if (!data || !isUUID(data.auctionId)) return;
        const user = socket.data.user;
        if (!user) {
          socket.emit('CHAT_ERROR', { auctionId: data.auctionId, error: 'Log in to chat in the auction room.' });
          return;
        }
        const text = typeof data.text === 'string' ? data.text.trim().slice(0, MAX_CHAT_LENGTH) : '';
        if (!text) return;
        if (isFlooding(socket, 'chat')) {
          socket.emit('CHAT_ERROR', { auctionId: data.auctionId, error: 'You are sending messages too fast. Please wait a few seconds.' });
          return;
        }

        // Auto-join room to ensure sender receives room broadcasts
        socket.join(data.auctionId);

        // Everyone in the room receives this: id and display name, never an email
        const clientId = typeof data.clientId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(data.clientId) ? data.clientId : null;
        const messagePayload = {
          id: crypto.randomUUID(),
          clientId, // lets the sender replace its optimistic copy; not trusted for anything else
          auctionId: data.auctionId,
          text,
          senderName: user.name,
          senderId: user.id,
          role: user.role,
          timestamp: new Date().toISOString(),
        };

        io.to(data.auctionId).emit('CHAT_MESSAGE', messagePayload);
        console.log(`[Socket] Chat message broadcasted in room ${data.auctionId} from ${user.name}`);
      } catch (err) {
        console.error('[Socket] SEND_MESSAGE error:', err.message);
      }
    });

    // Real-Time Reaction (Floating Emojis): guests may react too, as "Guest"
    socket.on('SEND_REACTION', (data) => {
      try {
        if (!data || !isUUID(data.auctionId)) return;
        if (isFlooding(socket, 'reaction')) return;
        socket.join(data.auctionId);
        const emoji = ALLOWED_REACTIONS.includes(data.emoji) ? data.emoji : '🔥';
        const user = socket.data.user;

        const reactionPayload = {
          id: crypto.randomUUID(),
          auctionId: data.auctionId,
          emoji,
          senderName: user ? user.name : 'Guest',
          senderId: user ? user.id : null,
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
