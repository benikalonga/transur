const http = require('http');
const { Server } = require('socket.io');
const env = require('./config/env');

env.assertValid();

const { ping } = require('./db/pool');
const { createApp } = require('./app');
const { setupSockets } = require('./realtime/sockets');
const { startScheduler } = require('./jobs/scheduler');

const start = async () => {
  try {
    await ping();
  } catch (err) {
    console.error(`✖ cannot reach MySQL at ${env.db.host}:${env.db.port} — ${err.message}`);
    process.exit(1);
  }

  const app = createApp();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: env.appUrl, methods: ['GET', 'POST'] },
    // Generous timeouts so flaky mobile links are not dropped too eagerly.
    pingInterval: 25000,
    pingTimeout: 60000,
  });

  setupSockets(io);
  startScheduler();

  server.listen(env.port, () => {
    console.log(`▶ Transur API on http://localhost:${env.port}  (${env.nodeEnv})`);
  });

  const shutdown = () => {
    console.log('… shutting down');
    io.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
};

start();
