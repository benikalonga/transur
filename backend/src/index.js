require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');

const { testConnection } = require('./config/database');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { setupSocket } = require('./socket/socketHandler');

const authRoutes     = require('./routes/auth');
const userRoutes     = require('./routes/users');
const tripRoutes     = require('./routes/trips');
const deliveryRoutes = require('./routes/deliveries');
const walletRoutes   = require('./routes/wallet');
const adminAuthRoutes = require('./routes/adminAuth');
const supportRoutes   = require('./routes/support');
const adminRoutes    = require('./routes/admin');
const chatRouter     = require('./routes/chat');

const app    = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: process.env.CLIENT_URL || '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

app.set('io', io);

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(cors({ origin: process.env.CLIENT_URL || '*', credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));

app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));
app.use('/api/auth/send-otp', rateLimit({ windowMs: 60 * 60 * 1000, max: 10,
  message: { error: 'Trop de tentatives. Réessayez dans 1h.' } }));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',       authRoutes);
app.use('/api/users',      userRoutes);
app.use('/api/trips',      tripRoutes);
app.use('/api/deliveries', deliveryRoutes);
app.use('/api/wallet',     walletRoutes);
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/admin',      adminRoutes); // adminAuth middleware is now inside admin.js itself
app.use('/api/chat',       chatRouter);
app.use('/api/support',    supportRoutes);

app.get('/api/health', (_, res) =>
  res.json({ status: 'ok', service: 'Transur API', env: process.env.NODE_ENV, ts: new Date().toISOString() })
);

// ─── Socket & Errors ─────────────────────────────────────────────────────────
setupSocket(io);
app.use(notFound);
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, async () => {
  await testConnection();
  console.log(`🚀 Transur API  →  http://localhost:${PORT}`);
  console.log(`📡 WebSocket    →  ws://localhost:${PORT}`);
});

module.exports = { app, server, io };
