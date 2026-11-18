const express = require('express');
const { sql, one } = require('../db/pool');
const { handle, badRequest, paging } = require('../lib/http');
const { readPoint } = require('../lib/geo');
const { requireUser, onlyRoles } = require('../middleware/auth');
const { FLEET_ROLES, LIVE_STATES, OPEN_STATES } = require('../config/catalog');
const pricing = require('../services/pricing');
const promos = require('../services/promos');
const dispatch = require('../services/dispatch');
const bookings = require('../services/bookings');

const router = express.Router();
router.use(requireUser);

const riderOnly = onlyRoles('rider');
const fleetOnly = onlyRoles(...FLEET_ROLES);

// POST /api/bookings/quote — prices for every vehicle class + live supply
router.post('/quote', riderOnly, handle(async (req, res) => {
  const service = req.body.service === 'parcel' ? 'parcel' : 'ride';
  const pickup = readPoint(req.body, 'pickup');
  const dropoff = readPoint(req.body, 'dropoff');
  if (!pickup || !dropoff) throw badRequest('Pickup and drop-off locations are required.');

  const quote = await pricing.quoteAll(service, pickup, dropoff, req.body.parcel_size);
  for (const option of quote.options) {
    const nearby = await dispatch.nearbyProviders({ service, vehicleClass: option.vehicle_class, ...pickup });
    option.nearby = nearby.length;
    option.pickup_eta_min = nearby.length ? Math.max(2, Math.ceil(nearby[0].distance_km * 1.3 / 25 * 60)) : null;
  }

  if (req.body.promo_code) {
    try {
      const { promo } = await promos.evaluate({ code: req.body.promo_code, userId: req.user.id, service, fare: null });
      quote.promo = {
        code: promo.code,
        description: promo.description,
        discount_type: promo.discount_type,
        discount_value: promo.discount_value,
        max_discount: promo.max_discount,
        min_fare: promo.min_fare,
      };
      quote.options.forEach((o) => { o.discount = promos.discountFor(promo, o.quoted_fare); });
    } catch (err) {
      quote.promoError = err.message;
    }
  }
  res.json({ service, ...quote });
}));

// POST /api/bookings — request a ride or a delivery (now or scheduled)
router.post('/', riderOnly, handle(async (req, res) => {
  const { booking, providersReached } = await bookings.create(req.user, req.body);
  res.status(201).json({ booking, providersReached });
}));

// GET /api/bookings — history for the signed-in user (?service=ride|parcel&scope=open|past)
router.get('/', handle(async (req, res) => {
  const { limit, offset, page } = paging(req.query);
  const column = req.user.role === 'rider' ? 'b.rider_id' : 'b.provider_id';
  const where = [`${column} = ?`];
  const params = [req.user.id];

  if (['ride', 'parcel'].includes(req.query.service)) { where.push('b.service = ?'); params.push(req.query.service); }
  if (req.query.scope === 'open') where.push(`b.status IN (${OPEN_STATES.map((s) => `'${s}'`).join(',')})`);
  if (req.query.scope === 'past') where.push("b.status IN ('completed','cancelled')");

  const rows = await sql(
    `SELECT b.id, b.service, b.vehicle_class, b.status, b.pickup_address, b.dropoff_address,
            b.distance_km, b.rider_offer, b.agreed_fare, b.final_fare, b.discount_amount, b.tip_amount,
            b.provider_payout, b.payment_method, b.scheduled_for, b.created_at, b.completed_at,
            b.rider_rating, b.provider_rating, b.cancel_reason,
            r.full_name AS rider_name, p.full_name AS provider_name, p.avatar_url AS provider_avatar
     FROM bookings b
     JOIN users r ON r.id = b.rider_id
     LEFT JOIN users p ON p.id = b.provider_id
     WHERE ${where.join(' AND ')}
     ORDER BY b.created_at DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  res.json({ bookings: rows, page });
}));

// GET /api/bookings/current — the booking the user is actively involved in, if any
router.get('/current', handle(async (req, res) => {
  const column = req.user.role === 'rider' ? 'rider_id' : 'provider_id';
  const states = req.user.role === 'rider' ? ['searching', ...LIVE_STATES] : LIVE_STATES;
  const row = await one(
    `SELECT id FROM bookings WHERE ${column} = ? AND status IN (${states.map(() => '?').join(',')})
     ORDER BY created_at DESC LIMIT 1`,
    [req.user.id, ...states]
  );
  res.json({ booking: row ? await bookings.getForParticipant(row.id, req.user) : null });
}));

// GET /api/bookings/:id
router.get('/:id', handle(async (req, res) => {
  res.json({ booking: await bookings.getForParticipant(req.params.id, req.user) });
}));

// ─── Bidding ──────────────────────────────────────────────────────────────────

router.post('/:id/bids', fleetOnly, handle(async (req, res) => {
  const bid = await bookings.placeBid(req.user, req.params.id, req.body.amount);
  res.status(201).json({ bid });
}));

router.delete('/:id/bids/mine', fleetOnly, handle(async (req, res) => {
  await bookings.withdrawBid(req.user, req.params.id);
  res.json({ withdrawn: true });
}));

router.get('/:id/bids', riderOnly, handle(async (req, res) => {
  res.json(await bookings.openBids(req.user, req.params.id));
}));

router.post('/:id/bids/:bidId/accept', riderOnly, handle(async (req, res) => {
  res.json({ booking: await bookings.acceptBid(req.user, req.params.id, req.params.bidId) });
}));

// ─── Trip progress (provider) ─────────────────────────────────────────────────

router.post('/:id/arrive', fleetOnly, handle(async (req, res) => {
  await bookings.advance(req.user, req.params.id, 'arrive');
  res.json({ status: 'arrived' });
}));

router.post('/:id/start', fleetOnly, handle(async (req, res) => {
  await bookings.advance(req.user, req.params.id, 'start');
  res.json({ status: 'in_progress' });
}));

router.post('/:id/complete', fleetOnly, handle(async (req, res) => {
  const result = await bookings.complete(req.user, req.params.id, { pin: req.body.pin });
  res.json({
    status: 'completed',
    fare: result.fare,
    discount: result.discount,
    collectFromRider: result.booking.payment_method === 'cash' ? result.riderPays : 0,
    payout: result.providerPayout,
  });
}));

router.post('/:id/cancel', handle(async (req, res) => {
  const by = req.user.role === 'rider' ? 'rider' : 'provider';
  await bookings.cancel(req.user, req.params.id, req.body.reason, by);
  res.json({ status: 'cancelled' });
}));

// ─── After the trip ───────────────────────────────────────────────────────────

router.post('/:id/rating', handle(async (req, res) => {
  await bookings.rate(req.user, req.params.id, req.body.stars, req.body.feedback);
  res.json({ thanks: true });
}));

router.post('/:id/tip', riderOnly, handle(async (req, res) => {
  res.json(await bookings.tip(req.user, req.params.id, req.body));
}));

router.get('/:id/receipt', handle(async (req, res) => {
  const b = await bookings.getForParticipant(req.params.id, req.user);
  if (b.status !== 'completed') throw badRequest('Receipts are available once the booking is completed.');
  res.json({
    receipt: {
      id: b.id,
      service: b.service,
      vehicle_class: b.vehicle_class,
      date: b.completed_at,
      from: b.pickup_address,
      to: b.dropoff_address,
      distance_km: b.distance_km,
      duration_min: b.started_at && b.completed_at
        ? Math.max(1, Math.round((new Date(b.completed_at) - new Date(b.started_at)) / 60000))
        : b.duration_min,
      fare: b.final_fare,
      discount: b.discount_amount,
      promo_code: b.promo_code,
      tip: b.tip_amount,
      total: Math.round((b.final_fare - b.discount_amount + b.tip_amount) * 100) / 100,
      payment_method: b.payment_method,
      provider: b.provider_name,
      rider: b.rider_name,
    },
  });
}));

// ─── Safety ───────────────────────────────────────────────────────────────────

router.post('/:id/share', handle(async (req, res) => {
  res.json(await bookings.shareLink(req.user, req.params.id));
}));

router.post('/:id/sos', handle(async (req, res) => {
  res.status(201).json(await bookings.raiseSos(req.user, { ...req.body, bookingId: req.params.id }));
}));

// ─── In-trip chat history ─────────────────────────────────────────────────────

router.get('/:id/messages', handle(async (req, res) => {
  await bookings.getForParticipant(req.params.id, req.user);
  const messages = await sql(
    `SELECT m.id, m.sender_id, u.full_name AS sender_name, m.body, m.created_at
     FROM booking_messages m JOIN users u ON u.id = m.sender_id
     WHERE m.booking_id = ? ORDER BY m.created_at ASC LIMIT 200`,
    [req.params.id]
  );
  res.json({ messages });
}));

module.exports = router;
