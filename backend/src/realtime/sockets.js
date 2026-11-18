const { randomUUID: uuid } = require('crypto');
const { sql, one } = require('../db/pool');
const { verifyToken } = require('../middleware/auth');
const { isCoordinate } = require('../lib/geo');
const { FLEET_ROLES, LIVE_STATES } = require('../config/catalog');
const fleet = require('../services/fleet');
const dispatch = require('../services/dispatch');
const helpdesk = require('./helpdesk');
const hub = require('./hub');

/** Per-socket rate limiter: at most `max` events per `windowMs`. */
const throttle = (max, windowMs) => {
  let count = 0;
  let windowStart = Date.now();
  return () => {
    const now = Date.now();
    if (now - windowStart > windowMs) { windowStart = now; count = 0; }
    count += 1;
    return count <= max;
  };
};

const safe = (fn) => async (...args) => {
  try {
    await fn(...args);
  } catch (err) {
    const ack = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
    if (ack) ack({ error: err.message });
    else console.warn('[socket]', err.message);
  }
};

const setupAppNamespace = (io) => {
  io.use(async (socket, next) => {
    const claims = verifyToken(socket.handshake.auth?.token);
    if (!claims?.sub || claims.typ !== 'user') return next(new Error('unauthorized'));
    const user = await one('SELECT id, full_name, phone, role, account_status FROM users WHERE id = ?', [claims.sub]).catch(() => null);
    if (!user || user.account_status !== 'active') return next(new Error('unauthorized'));
    socket.user = user;
    next();
  });

  io.on('connection', (socket) => {
    const { user } = socket;
    const isFleet = FLEET_ROLES.includes(user.role);
    const gpsAllowed = throttle(30, 60_000);
    const chatAllowed = throttle(20, 60_000);

    // Re-joining the personal room on every (re)connection keeps events flowing
    // after a dropped mobile connection.
    socket.join(`u:${user.id}`);

    // Providers who reconnect get the requests they may have missed.
    if (isFleet) {
      dispatch.openRequestsFor(user.id)
        .then((requests) => requests.forEach((r) => socket.emit('booking:new', r)))
        .catch(() => {});
    }

    socket.on('fleet:position', safe(async ({ lat, lng, heading, speed } = {}) => {
      if (!isFleet || !gpsAllowed()) return;
      const la = parseFloat(lat);
      const ln = parseFloat(lng);
      if (!isCoordinate(la, ln)) return;
      await fleet.updatePosition(user, { lat: la, lng: ln, heading, speed });
    }));

    socket.on('fleet:availability', safe(async ({ availability, position } = {}, ack) => {
      if (!isFleet) return;
      const result = await fleet.setAvailability(user, availability, position);
      if (typeof ack === 'function') ack(result);
      if (result.availability === 'online') {
        const requests = await dispatch.openRequestsFor(user.id);
        requests.forEach((r) => socket.emit('booking:new', r));
      }
    }));

    // In-trip chat between rider and provider.
    socket.on('chat:send', safe(async ({ bookingId, body } = {}, ack) => {
      const text = String(body || '').trim().slice(0, 1000);
      if (!bookingId || !text || !chatAllowed()) return;
      const b = await one(
        `SELECT id, rider_id, provider_id, status FROM bookings WHERE id = ? AND (rider_id = ? OR provider_id = ?)`,
        [bookingId, user.id, user.id]
      );
      if (!b || !b.provider_id || ![...LIVE_STATES, 'completed'].includes(b.status)) return;

      const message = { id: uuid(), booking_id: b.id, sender_id: user.id, sender_name: user.full_name, body: text, created_at: new Date() };
      await sql('INSERT INTO booking_messages (id, booking_id, sender_id, body) VALUES (?, ?, ?, ?)', [message.id, b.id, user.id, text]);
      hub.toUser(b.rider_id, 'chat:message', message);
      hub.toUser(b.provider_id, 'chat:message', message);
      if (typeof ack === 'function') ack({ ok: true });
    }));

    socket.on('help:send', safe(async ({ threadId, body } = {}, ack) => {
      if (!chatAllowed()) return;
      const message = await helpdesk.postUserMessage(user, threadId, body);
      if (typeof ack === 'function') ack({ ok: true, message });
    }));

    socket.on('disconnect', () => {
      sql('UPDATE users SET last_active_at = UTC_TIMESTAMP() WHERE id = ?', [user.id]).catch(() => {});
    });
  });
};

const setupConsoleNamespace = (io) => {
  const ns = io.of('/console');
  ns.use(async (socket, next) => {
    const claims = verifyToken(socket.handshake.auth?.token);
    if (!claims?.sub || claims.typ !== 'staff') return next(new Error('unauthorized'));
    const staff = await one("SELECT id, full_name, role FROM staff WHERE id = ? AND access_status = 'active'", [claims.sub]).catch(() => null);
    if (!staff) return next(new Error('unauthorized'));
    socket.staff = staff;
    next();
  });

  ns.on('connection', (socket) => {
    socket.join('staff');
    socket.on('help:reply', safe(async ({ threadId, body } = {}, ack) => {
      const message = await helpdesk.postStaffReply(socket.staff, threadId, body);
      if (typeof ack === 'function') ack({ ok: true, message });
    }));
  });
};

const setupSockets = (io) => {
  hub.attach(io);
  setupAppNamespace(io);
  setupConsoleNamespace(io);
};

module.exports = { setupSockets };
