/**
 * Smaller user-facing endpoints: promos, notifications, help desk, SOS
 * without a booking, and the public catalog / trip tracking pages.
 */
const express = require('express');
const { randomUUID: uuid } = require('crypto');
const { sql, one } = require('../db/pool');
const { handle, badRequest, notFound, paging } = require('../lib/http');
const { requireUser } = require('../middleware/auth');
const { PAYMENT_METHODS, DRIVER_CLASSES, COURIER_MODES, PARCEL_SIZES } = require('../config/catalog');
const pricing = require('../services/pricing');
const promos = require('../services/promos');
const bookings = require('../services/bookings');

const publicRouter = express.Router();
const userRouter = express.Router();
// Scoped so the router never intercepts other /api paths it is mounted beside.
userRouter.use(['/promos', '/notifications', '/help', '/safety'], requireUser);

// ─── Public ───────────────────────────────────────────────────────────────────

// GET /api/public/catalog — options the apps need to render forms
publicRouter.get('/catalog', handle(async (req, res) => {
  const [rides, parcels] = await Promise.all([pricing.activeRules('ride'), pricing.activeRules('parcel')]);
  res.json({
    rideClasses: rides.map((r) => ({ id: r.vehicle_class, label: r.label, seats: r.seats, minimum: r.minimum_fare })),
    parcelClasses: parcels.map((r) => ({ id: r.vehicle_class, label: r.label, minimum: r.minimum_fare })),
    driverClasses: DRIVER_CLASSES,
    courierModes: COURIER_MODES,
    parcelSizes: Object.keys(PARCEL_SIZES),
    paymentMethods: PAYMENT_METHODS,
  });
}));

// GET /api/public/track/:token — read-only live view of a shared trip
publicRouter.get('/track/:token', handle(async (req, res) => {
  if (!/^[a-f0-9]{32}$/.test(req.params.token)) throw notFound('This tracking link is not valid.');
  const b = await one(
    `SELECT b.id, b.service, b.status, b.pickup_address, b.pickup_lat, b.pickup_lng,
            b.dropoff_address, b.dropoff_lat, b.dropoff_lng, b.duration_min, b.started_at, b.completed_at,
            SUBSTRING_INDEX(r.full_name, ' ', 1) AS rider_first_name,
            SUBSTRING_INDEX(p.full_name, ' ', 1) AS provider_first_name,
            fp.vehicle_class, fp.vehicle_make, fp.vehicle_color, fp.plate_number,
            pos.lat AS provider_lat, pos.lng AS provider_lng, pos.updated_at AS position_at
     FROM bookings b
     JOIN users r ON r.id = b.rider_id
     LEFT JOIN users p ON p.id = b.provider_id
     LEFT JOIN fleet_profiles fp ON fp.user_id = b.provider_id
     LEFT JOIN fleet_positions pos ON pos.user_id = b.provider_id
     WHERE b.share_token = ?`,
    [req.params.token]
  );
  if (!b) throw notFound('This tracking link is not valid.');
  // Stop exposing the position once the trip is over.
  if (['completed', 'cancelled'].includes(b.status)) {
    b.provider_lat = null;
    b.provider_lng = null;
  }
  res.json({ trip: b });
}));

// ─── Promos ───────────────────────────────────────────────────────────────────

userRouter.get('/promos', handle(async (req, res) => {
  res.json({ promos: await promos.availableFor(req.user.id) });
}));

userRouter.post('/promos/check', handle(async (req, res) => {
  const service = req.body.service === 'parcel' ? 'parcel' : 'ride';
  const fare = req.body.fare != null ? parseFloat(req.body.fare) : null;
  const { promo, discount } = await promos.evaluate({ code: req.body.code, userId: req.user.id, service, fare });
  res.json({
    valid: true,
    code: promo.code,
    description: promo.description,
    discount_type: promo.discount_type,
    discount_value: promo.discount_value,
    max_discount: promo.max_discount,
    discount,
  });
}));

// ─── Notifications ────────────────────────────────────────────────────────────

userRouter.get('/notifications', handle(async (req, res) => {
  const { limit, offset } = paging(req.query, 30);
  const [items, unread] = await Promise.all([
    sql(
      `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
      [req.user.id]
    ),
    one('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL', [req.user.id]),
  ]);
  res.json({ notifications: items, unread: unread.n });
}));

userRouter.post('/notifications/read', handle(async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.slice(0, 100) : null;
  if (ids?.length) {
    await sql(
      `UPDATE notifications SET read_at = UTC_TIMESTAMP() WHERE user_id = ? AND read_at IS NULL AND id IN (${ids.map(() => '?').join(',')})`,
      [req.user.id, ...ids]
    );
  } else {
    await sql('UPDATE notifications SET read_at = UTC_TIMESTAMP() WHERE user_id = ? AND read_at IS NULL', [req.user.id]);
  }
  res.json({ ok: true });
}));

// ─── Help desk ────────────────────────────────────────────────────────────────

const ensureThread = async (user) => {
  const existing = await one(
    "SELECT * FROM help_threads WHERE user_id = ? AND state <> 'closed' ORDER BY created_at DESC LIMIT 1",
    [user.id]
  );
  if (existing) return existing;
  const id = uuid();
  await sql('INSERT INTO help_threads (id, user_id) VALUES (?, ?)', [id, user.id]);
  return one('SELECT * FROM help_threads WHERE id = ?', [id]);
};

userRouter.get('/help/thread', handle(async (req, res) => {
  const thread = await ensureThread(req.user);
  await sql('UPDATE help_threads SET unread_user = 0 WHERE id = ?', [thread.id]);
  const messages = await sql(
    'SELECT * FROM help_messages WHERE thread_id = ? ORDER BY created_at ASC LIMIT 200',
    [thread.id]
  );
  res.json({ thread, messages });
}));

// ─── SOS without an active booking ────────────────────────────────────────────

userRouter.post('/safety/sos', handle(async (req, res) => {
  if (req.body.bookingId) throw badRequest('Use the booking SOS endpoint for an active trip.');
  res.status(201).json(await bookings.raiseSos(req.user, req.body));
}));

module.exports = { publicRouter, userRouter, ensureThread };
