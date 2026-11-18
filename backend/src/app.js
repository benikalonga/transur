const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const env = require('./config/env');
const { routeNotFound, errorResponder } = require('./middleware/errors');

const createApp = () => {
  const app = express();
  app.set('trust proxy', 1);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(compression()); // small payloads matter on 2G/3G
  app.use(morgan(env.isProd ? 'combined' : 'dev'));
  app.use(cors({ origin: env.appUrl, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads'), { maxAge: '30d' }));

  const limit = (windowMin, max, error) =>
    rateLimit({ windowMs: windowMin * 60 * 1000, max, standardHeaders: true, legacyHeaders: false, message: { error } });

  app.use('/api/', limit(15, 300, 'Too many requests. Slow down a little.'));
  app.use('/api/auth/code', limit(60, 8, 'Too many codes requested. Try again in an hour.'));
  app.use('/api/auth/verify', limit(15, 20, 'Too many attempts. Try again later.'));
  app.use('/api/console/auth/login', limit(15, 10, 'Too many sign-in attempts. Try again later.'));

  app.get('/api/health', (req, res) => res.json({ ok: true, service: 'transur-api', time: new Date().toISOString() }));

  const engagement = require('./routes/engagement');
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/me', require('./routes/me'));
  app.use('/api/bookings', require('./routes/bookings'));
  app.use('/api/wallet', require('./routes/wallet'));
  app.use('/api/public', engagement.publicRouter);
  app.use('/api/console/auth', require('./routes/console/auth'));
  app.use('/api/console', require('./routes/console'));
  app.use('/api', engagement.userRouter);

  app.use(routeNotFound);
  app.use(errorResponder);
  return app;
};

module.exports = { createApp };
