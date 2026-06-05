import { io } from 'socket.io-client';

let socket = null;

export const getSocket = () => {
  if (!socket || !socket.connected) {
    const token = typeof window !== 'undefined' ? localStorage.getItem('transur_token') : null;
    if (!token) return null;

    socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5001', {
      auth: { token },
      transports: ['websocket', 'polling'], // websocket first, fallback to polling
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
      timeout: 10000,
    });

    socket.on('connect', () => console.log('🔌 Socket connecté'));
    socket.on('disconnect', (reason) => console.log('❌ Socket déconnecté:', reason));
    socket.on('connect_error', (err) => console.warn('Socket erreur:', err.message));
  }
  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export default { getSocket, disconnectSocket };
