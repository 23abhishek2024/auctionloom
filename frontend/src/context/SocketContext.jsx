import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const formatSocketUrl = (raw) => {
  if (!raw || typeof raw !== 'string') return 'http://localhost:5000';
  const match = raw.match(/https?:\/\/[^\s\r\n/]+/);
  if (match) return match[0];
  return 'http://localhost:5000';
};

const rawSocketUrl = 
  import.meta.env.VITE_SOCKET_URL || 
  (import.meta.env.PROD 
    ? 'https://primebid-backend-e971.onrender.com' 
    : 'http://localhost:5000');

const SOCKET_URL = formatSocketUrl(rawSocketUrl);

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const currentRoomRef = useRef(null);
  const socketRef = useRef(null);
  const { token } = useAuth();
  const lastTokenRef = useRef(token);

  useEffect(() => {
    const socketInstance = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      // Read on every (re)connect: the server works out who is chatting from this token,
      // so names and roles in the chat can't be faked from the browser
      auth: (cb) => cb({ token: localStorage.getItem('token') }),
    });
    socketRef.current = socketInstance;

    socketInstance.on('connect', () => {
      console.log('[SocketClient] Connected with id:', socketInstance.id);
      setIsConnected(true);
      if (currentRoomRef.current) {
        console.log('[SocketClient] Re-joining active auction room:', currentRoomRef.current);
        socketInstance.emit('JOIN_AUCTION', currentRoomRef.current);
      }
    });

    socketInstance.on('disconnect', (reason) => {
      console.log('[SocketClient] Disconnected:', reason);
      setIsConnected(false);
    });

    socketInstance.on('connect_error', (err) => {
      console.warn('[SocketClient] Connection error:', err.message);
      setIsConnected(false);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  // Logging in, logging out, renaming or becoming a seller gives a new token: reconnect so the
  // server reads the new identity (the 'connect' handler above re-joins the current room)
  useEffect(() => {
    if (lastTokenRef.current === token) return;
    lastTokenRef.current = token;
    const s = socketRef.current;
    if (s) {
      s.disconnect();
      s.connect();
    }
  }, [token]);

  const joinAuction = (auctionId) => {
    if (!auctionId) return;
    currentRoomRef.current = auctionId;
    if (socket) {
      socket.emit('JOIN_AUCTION', auctionId);
    }
  };

  const leaveAuction = (auctionId) => {
    if (currentRoomRef.current === auctionId) {
      currentRoomRef.current = null;
    }
    if (socket) {
      socket.emit('LEAVE_AUCTION', auctionId);
    }
  };

  const sendMessage = (data) => {
    if (socket) {
      socket.emit('SEND_MESSAGE', data);
    }
  };

  const sendReaction = (data) => {
    if (socket) {
      socket.emit('SEND_REACTION', data);
    }
  };

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        joinAuction,
        leaveAuction,
        sendMessage,
        sendReaction,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};
