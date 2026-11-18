import { io } from 'socket.io-client';
import { appSession, consoleSession } from './session';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';

const sockets = { app: null, console: null };

const connect = (kind, path, session) => {
  const existing = sockets[kind];
  if (existing) return existing;
  const token = session.token();
  if (!token) return null;

  const socket = io(`${SOCKET_URL}${path}`, {
    auth: { token },
    // WebSocket first, long-polling when a proxy or weak network blocks it.
    transports: ['websocket', 'polling'],
    // Keep retrying forever with growing gaps (up to 30 s) — rural networks
    // can be down for minutes at a time.
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1500,
    reconnectionDelayMax: 30000,
    timeout: 15000,
  });
  sockets[kind] = socket;
  return socket;
};

/** Shared socket for riders, drivers and couriers. */
export const appSocket = () => connect('app', '', appSession);

/** Shared socket for the staff console. */
export const consoleSocket = () => connect('console', '/console', consoleSession);

export const closeSockets = () => {
  Object.keys(sockets).forEach((k) => {
    sockets[k]?.disconnect();
    sockets[k] = null;
  });
};
