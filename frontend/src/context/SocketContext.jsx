import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const formatSocketUrl = (raw) => {
  if (!raw || typeof raw !== 'string') return 'http://localhost:5000';
  const match = raw.match(/https?:\/\/[^\s\r\n\/]+/);
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

  useEffect(() => {
    const socketInstance = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketInstance.on('connect', () => {
      console.log('[SocketClient] Connected with id:', socketInstance.id);
      setIsConnected(true);
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

  const joinAuction = (auctionId) => {
    if (socket && socket.connected) {
      socket.emit('JOIN_AUCTION', auctionId);
    }
  };

  const leaveAuction = (auctionId) => {
    if (socket && socket.connected) {
      socket.emit('LEAVE_AUCTION', auctionId);
    }
  };

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        joinAuction,
        leaveAuction,
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
