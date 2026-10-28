import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

export const SocketProvider = ({ children }) => {
  const { user } = useAuth();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    const s = io(SOCKET_URL, {
      autoConnect: true,
      transports: ['websocket', 'polling'],
      auth: { token },
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
    socketRef.current = s;

    s.on('connect', () => {
      setConnected(true);
      const currentToken = localStorage.getItem('access_token');
      if (currentToken) {
        s.emit('user:auth', currentToken);
      }
    });

    s.on('disconnect', () => setConnected(false));

    return () => {
      s.disconnect();
    };
  }, []);

  // Re-authenticate whenever user session changes (login / refresh / switch account)
  useEffect(() => {
    const s = socketRef.current;
    if (s && user) {
      const currentToken = localStorage.getItem('access_token');
      if (currentToken) {
        s.auth = { token: currentToken };
        s.emit('user:auth', currentToken);
      }
    }
  }, [user]);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, connected }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be inside SocketProvider');
  return ctx;
};
