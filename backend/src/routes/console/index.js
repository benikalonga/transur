const express = require('express');
const { randomUUID: uuid } = require('crypto');
const { sql, one } = require('../../db/pool');
const { handle, badRequest, notFound, paging } = require('../../lib/http');
const { toAmount } = require('../../lib/money');
const { requireStaff, ownerOnly } = require('../../middleware/auth');
const { LIVE_STATES } = require('../../config/catalog');
const wallet = require('../../services/wallet');
const bookings = require('../../services/bookings');
const promos = require('../../services/promos');
const { notify } = require('../../services/notify');
const hub = require('../../realtime/hub');
const { ensureThread } = require('../engagement');
const { postStaffReply } = require('../../realtime/helpdesk');

const router = express.Router();
router.use(requireStaff);

const like = (q) => `%${String(q).trim()}%`;
const inList = (values) => values.map(() => '?').join(',');

/** Build "WHERE a AND b" from optional filters. */
const filters = () => {
  const where = [];
  const params = [];
  return {
    add(clause, ...values) { where.push(clause); params.push(...values); },
    sql: () => (where.length ? `WHERE ${where.join(' AND ')}` : ''),
    params,
  };
};

// ─── Overview ─────────────────────────────────────────────────────────────────

router.get('/overview', handle(async (req, res) => {
  const [people, today, revenue, daily, onlineFleet, openSos, openHelp, newUsers] = await Promise.all([
    sql('SELECT role, COUNT(*) AS n FROM users GROUP BY role'),
    sql(`SELECT service, status, COUNT(*) AS n FROM bookings WHERE created_at >= UTC_DATE() GROUP BY service, status`),
    one(`SELECT COALESCE(SUM(final_fare), 0) AS gross, COALESCE(SUM(platform_fee), 0) AS fees,
                COALESCE(SUM(discount_amount), 0) AS discounts, COUNT(*) AS jobs
         FROM bookings WHERE status = 'completed' AND completed_at >= DATE_SUB(UTC_DATE(), INTERVAL 29 DAY)`),
    sql(`SELECT DATE(completed_at) AS day, service, COUNT(*) AS jobs,
                COALESCE(SUM(final_fare), 0) AS gross, COALESCE(SUM(platform_fee), 0) AS fees
         FROM bookings WHERE status = 'completed' AND completed_at >= DATE_SUB(UTC_DATE(), INTERVAL 13 DAY)
         GROUP BY DATE(completed_at), service ORDER BY day`),
    sql(`SELECT u.role, COUNT(*) AS n FROM fleet_profiles fp JOIN users u ON u.id = fp.user_id
         WHERE fp.availability IN ('online','busy') GROUP BY u.role`),
    one("SELECT COUNT(*) AS n FROM sos_alerts WHERE status <> 'resolved'"),
    one("SELECT COUNT(*) AS n FROM help_threads WHERE state = 'open' AND unread_staff > 0"),
    one('SELECT COUNT(*) AS n FROM users WHERE created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY)'),
  ]);
  res.json({ people, today, revenue, daily, onlineFleet, openSos: openSos.n, openHelp: openHelp.n, newUsers: newUsers.n });
}));

// ─── People ───────────────────────────────────────────────────────────────────

router.get('/people', handle(async (req, res) => {
  const { limit, offset, page } = paging(req.query, 25);
  const f = filters();
  if (req.query.role) f.add('u.role = ?', req.query.role);
  if (req.query.status) f.add('u.account_status = ?', req.query.status);
  if (req.query.availability) f.add('fp.availability = ?', req.query.availability);
  if (req.query.verified === '0' || req.query.verified === '1') f.add('fp.is_verified = ?', Number(req.query.verified));
  if (req.query.q) f.add('(u.full_name LIKE ? OR u.phone LIKE ? OR fp.plate_number LIKE ?)', like(req.query.q), like(req.query.q), like(req.query.q));

  const from = `FROM users u
    LEFT JOIN fleet_profiles fp ON fp.user_id = u.id
    LEFT JOIN wallets w ON w.user_id = u.id
    ${f.sql()}`;
  const [rows, total] = await Promise.all([
    sql(
      `SELECT u.id, u.full_name, u.phone, u.role, u.account_status, u.avatar_url, u.created_at, u.last_active_at,
              fp.vehicle_class, fp.vehicle_make, fp.plate_number, fp.availability, fp.rating_avg,
              fp.jobs_completed, fp.is_verified, w.balance AS wallet_balance, w.is_locked AS wallet_locked
       ${from} ORDER BY u.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
      f.params
    ),
    one(`SELECT COUNT(*) AS n ${from}`, f.params),
  ]);
  res.json({ people: rows, total: total.n, page });
}));

router.get('/people/:id', handle(async (req, res) => {
  const person = await one(
    `SELECT u.*, fp.vehicle_class, fp.vehicle_make, fp.vehicle_color, fp.plate_number, fp.licence_number,
            fp.availability, fp.rating_avg, fp.rating_count, fp.jobs_completed, fp.is_verified,
            ref.full_name AS referred_by_name
     FROM users u
     LEFT JOIN fleet_profiles fp ON fp.user_id = u.id
     LEFT JOIN users ref ON ref.id = u.referred_by
     WHERE u.id = ?`,
    [req.params.id]
  );
  if (!person) throw notFound('Person not found');
  delete person.push_token;

  const [walletRow, stats, recent, contacts] = await Promise.all([
    wallet.summary(person.id),
    sql(
      `SELECT status, COUNT(*) AS n, COALESCE(SUM(final_fare), 0) AS value
       FROM bookings WHERE rider_id = ? OR provider_id = ? GROUP BY status`,
      [person.id, person.id]
    ),
    sql(
      `SELECT id, service, status, pickup_address, dropoff_address, final_fare, rider_offer, created_at
       FROM bookings WHERE rider_id = ? OR provider_id = ? ORDER BY created_at DESC LIMIT 15`,
      [person.id, person.id]
    ),
    sql('SELECT name, phone FROM trusted_contacts WHERE user_id = ?', [person.id]),
  ]);
  res.json({ person, wallet: walletRow, stats, recent, contacts });
}));

router.patch('/people/:id/status', handle(async (req, res) => {
  const status = req.body.status;
  if (!['active', 'suspended', 'banned'].includes(status)) throw badRequest('Unknown status.');
  const result = await sql('UPDATE users SET account_status = ? WHERE id = ?', [status, req.params.id]);
  if (!result.affectedRows) throw notFound('Person not found');
  if (status !== 'active') {
    await sql("UPDATE fleet_profiles SET availability = 'offline' WHERE user_id = ? AND availability = 'online'", [req.params.id]);
    hub.toUser(req.params.id, 'account:suspended', { status });
  }
  res.json({ id: req.params.id, status });
}));

router.patch('/people/:id/verify', handle(async (req, res) => {
  const verified = req.body.verified !== false;
  const result = await sql('UPDATE fleet_profiles SET is_verified = ? WHERE user_id = ?', [verified ? 1 : 0, req.params.id]);
  if (!result.affectedRows) throw notFound('Fleet member not found');
  if (verified) await notify(req.params.id, { title: 'You are verified ✔', body: 'Riders now see a verified badge on your offers.' });
  res.json({ id: req.params.id, verified });
}));

router.post('/people/:id/wallet', ownerOnly, handle(async (req, res) => {
  const amount = toAmount(req.body.amount);
  if (!amount) throw badRequest('Enter a non-zero amount (negative to debit).');
  const memo = String(req.body.memo || '').trim();
  if (memo.length < 3) throw badRequest('Add a short reason for the adjustment.');
  const result = await wallet.post({ userId: req.params.id, kind: 'adjustment', amount, memo: `${memo} — ${req.staff.full_name}` });
  hub.toUser(req.params.id, 'wallet:updated', {});
  res.json(result);
}));

// ─── Bookings ─────────────────────────────────────────────────────────────────

router.get('/bookings', handle(async (req, res) => {
  const { limit, offset, page } = paging(req.query, 25);
  const f = filters();
  if (req.query.service) f.add('b.service = ?', req.query.service);
  if (req.query.status) f.add('b.status = ?', req.query.status);
  if (req.query.from) f.add('b.created_at >= ?', req.query.from);
  if (req.query.to) f.add('b.created_at < DATE_ADD(?, INTERVAL 1 DAY)', req.query.to);
  if (req.query.q) {
    f.add('(b.id LIKE ? OR r.full_name LIKE ? OR r.phone LIKE ? OR p.full_name LIKE ? OR b.pickup_address LIKE ? OR b.dropoff_address LIKE ?)',
      `${req.query.q}%`, like(req.query.q), like(req.query.q), like(req.query.q), like(req.query.q), like(req.query.q));
  }
  const from = `FROM bookings b JOIN users r ON r.id = b.rider_id LEFT JOIN users p ON p.id = b.provider_id ${f.sql()}`;
  const [rows, total] = await Promise.all([
    sql(
      `SELECT b.id, b.service, b.vehicle_class, b.status, b.pickup_address, b.dropoff_address, b.distance_km,
              b.rider_offer, b.agreed_fare, b.final_fare, b.discount_amount, b.platform_fee, b.payment_method,
              b.scheduled_for, b.created_at, r.full_name AS rider_name, r.phone AS rider_phone,
              p.full_name AS provider_name, p.phone AS provider_phone
       ${from} ORDER BY b.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
      f.params
    ),
    one(`SELECT COUNT(*) AS n ${from}`, f.params),
  ]);
  res.json({ bookings: rows, total: total.n, page });
}));

router.get('/bookings/:id', handle(async (req, res) => {
  const booking = await bookings.getDetailed(req.params.id);
  if (!booking) throw notFound('Booking not found');
  const [bids, reached, messages] = await Promise.all([
    sql(
      `SELECT bb.amount, bb.status, bb.eta_min, bb.created_at, u.full_name
       FROM booking_bids bb JOIN users u ON u.id = bb.provider_id WHERE bb.booking_id = ? ORDER BY bb.amount`,
      [req.params.id]
    ),
    one('SELECT COUNT(*) AS n FROM dispatch_log WHERE booking_id = ?', [req.params.id]),
    sql(
      `SELECT m.body, m.created_at, u.full_name AS sender
       FROM booking_messages m JOIN users u ON u.id = m.sender_id WHERE m.booking_id = ? ORDER BY m.created_at`,
      [req.params.id]
    ),
  ]);
  res.json({ booking, bids, providersReached: reached.n, messages });
}));

router.post('/bookings/:id/cancel', handle(async (req, res) => {
  await bookings.cancel(req.staff, req.params.id, req.body.reason || 'Cancelled by support', 'staff');
  res.json({ status: 'cancelled' });
}));

// ─── Live map ─────────────────────────────────────────────────────────────────

router.get('/live', handle(async (req, res) => {
  const [active, fleet] = await Promise.all([
    sql(
      `SELECT b.id, b.service, b.status, b.pickup_address, b.dropoff_address, b.pickup_lat, b.pickup_lng,
              b.dropoff_lat, b.dropoff_lng, b.created_at, b.agreed_fare, b.rider_offer,
              r.full_name AS rider_name, p.full_name AS provider_name,
              pos.lat AS provider_lat, pos.lng AS provider_lng
       FROM bookings b
       JOIN users r ON r.id = b.rider_id
       LEFT JOIN users p ON p.id = b.provider_id
       LEFT JOIN fleet_positions pos ON pos.user_id = b.provider_id
       WHERE b.status IN ('searching', ${inList(LIVE_STATES)})
       ORDER BY b.created_at`,
      LIVE_STATES
    ),
    sql(
      `SELECT u.id, u.full_name, u.phone, u.role, fp.vehicle_class, fp.availability, pos.lat, pos.lng, pos.updated_at
       FROM fleet_profiles fp
       JOIN users u ON u.id = fp.user_id
       JOIN fleet_positions pos ON pos.user_id = u.id
       WHERE fp.availability IN ('online','busy') AND pos.updated_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 10 MINUTE)`
    ),
  ]);
  res.json({ active, fleet });
}));

// ─── Wallets & ledger ─────────────────────────────────────────────────────────

router.get('/wallets', handle(async (req, res) => {
  const { limit, offset, page } = paging(req.query, 25);
  const f = filters();
  if (req.query.locked === '1') f.add('w.is_locked = 1');
  if (req.query.q) f.add('(u.full_name LIKE ? OR u.phone LIKE ?)', like(req.query.q), like(req.query.q));
  const from = `FROM wallets w JOIN users u ON u.id = w.user_id ${f.sql()}`;
  const [rows, total, totals] = await Promise.all([
    sql(
      `SELECT w.*, u.full_name, u.phone, u.role, u.account_status ${from}
       ORDER BY w.balance ASC LIMIT ${limit} OFFSET ${offset}`,
      f.params
    ),
    one(`SELECT COUNT(*) AS n ${from}`, f.params),
    one(`SELECT COALESCE(SUM(CASE WHEN balance < 0 THEN -balance END), 0) AS owed_to_platform,
                COALESCE(SUM(CASE WHEN balance > 0 THEN balance END), 0) AS owed_to_fleet,
                SUM(is_locked) AS locked
         FROM wallets`),
  ]);
  res.json({ wallets: rows, total: total.n, page, totals });
}));

router.patch('/wallets/:userId/lock', handle(async (req, res) => {
  const locked = Boolean(req.body.locked);
  const w = await one('SELECT * FROM wallets WHERE user_id = ?', [req.params.userId]);
  if (!w) throw notFound('Wallet not found');
  // Unlocking only clears a staff lock if the balance is healthy.
  const debtLock = w.balance <= w.debt_limit;
  await sql(
    'UPDATE wallets SET is_locked = ?, lock_reason = ? WHERE user_id = ?',
    [locked || debtLock ? 1 : 0, locked ? 'staff' : debtLock ? 'debt' : null, req.params.userId]
  );
  hub.toUser(req.params.userId, 'wallet:updated', {});
  res.json({ wallet: await one('SELECT * FROM wallets WHERE user_id = ?', [req.params.userId]) });
}));

router.get('/ledger', handle(async (req, res) => {
  const { limit, offset, page } = paging(req.query, 40);
  const f = filters();
  if (req.query.userId) f.add('e.user_id = ?', req.query.userId);
  if (req.query.kind) f.add('e.kind = ?', req.query.kind);
  const from = `FROM wallet_entries e JOIN users u ON u.id = e.user_id ${f.sql()}`;
  const [rows, total] = await Promise.all([
    sql(`SELECT e.*, u.full_name, u.role ${from} ORDER BY e.created_at DESC LIMIT ${limit} OFFSET ${offset}`, f.params),
    one(`SELECT COUNT(*) AS n ${from}`, f.params),
  ]);
  res.json({ entries: rows, total: total.n, page });
}));

// ─── Finance ──────────────────────────────────────────────────────────────────

router.get('/finance', handle(async (req, res) => {
  const to = req.query.to || new Date().toISOString().slice(0, 10);
  const from = req.query.from || new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10);
  const range = "status = 'completed' AND completed_at >= ? AND completed_at < DATE_ADD(?, INTERVAL 1 DAY)";

  const [byService, daily, byMethod, leaders, promoCost] = await Promise.all([
    sql(
      `SELECT service, COUNT(*) AS jobs, COALESCE(SUM(final_fare), 0) AS gross, COALESCE(SUM(platform_fee), 0) AS fees,
              COALESCE(SUM(discount_amount), 0) AS discounts, COALESCE(SUM(tip_amount), 0) AS tips,
              COALESCE(AVG(final_fare), 0) AS avg_fare
       FROM bookings WHERE ${range} GROUP BY service`,
      [from, to]
    ),
    sql(
      `SELECT DATE(completed_at) AS day, COUNT(*) AS jobs, COALESCE(SUM(final_fare), 0) AS gross,
              COALESCE(SUM(platform_fee), 0) AS fees
       FROM bookings WHERE ${range} GROUP BY DATE(completed_at) ORDER BY day`,
      [from, to]
    ),
    sql(
      `SELECT payment_method, COUNT(*) AS jobs, COALESCE(SUM(final_fare), 0) AS gross
       FROM bookings WHERE ${range} GROUP BY payment_method`,
      [from, to]
    ),
    sql(
      `SELECT u.id, u.full_name, u.role, fp.rating_avg, COUNT(*) AS jobs,
              COALESCE(SUM(b.provider_payout + b.tip_amount), 0) AS earned
       FROM bookings b JOIN users u ON u.id = b.provider_id JOIN fleet_profiles fp ON fp.user_id = u.id
       WHERE b.status = 'completed' AND b.completed_at >= ? AND b.completed_at < DATE_ADD(?, INTERVAL 1 DAY)
       GROUP BY u.id, u.full_name, u.role, fp.rating_avg ORDER BY earned DESC LIMIT 10`,
      [from, to]
    ),
    sql(
      `SELECT pc.code, COUNT(*) AS uses, COALESCE(SUM(pr.amount), 0) AS cost
       FROM promo_redemptions pr JOIN promo_codes pc ON pc.id = pr.promo_code_id
       WHERE pr.created_at >= ? AND pr.created_at < DATE_ADD(?, INTERVAL 1 DAY)
       GROUP BY pc.code ORDER BY cost DESC LIMIT 10`,
      [from, to]
    ),
  ]);
  res.json({ period: { from, to }, byService, daily, byMethod, leaders, promoCost });
}));

// ─── Fare rules ───────────────────────────────────────────────────────────────

router.get('/fares', handle(async (req, res) => {
  res.json({ rules: await sql('SELECT * FROM fare_rules ORDER BY city, service, minimum_fare') });
}));

const FARE_FIELDS = ['label', 'base_fare', 'per_km', 'per_minute', 'minimum_fare', 'surge_multiplier', 'commission_pct', 'seats', 'is_active'];

router.patch('/fares/:id', ownerOnly, handle(async (req, res) => {
  const sets = [];
  const vals = [];
  for (const field of FARE_FIELDS) {
    if (req.body[field] === undefined) continue;
    const value = field === 'label' ? String(req.body[field]).slice(0, 60) : Number(req.body[field]);
    if (field !== 'label' && (!Number.isFinite(value) || value < 0)) throw badRequest(`${field} must be a positive number.`);
    if (field === 'surge_multiplier' && (value < 0.5 || value > 5)) throw badRequest('Surge must be between 0.5 and 5.');
    if (field === 'commission_pct' && value > 50) throw badRequest('Commission cannot exceed 50%.');
    sets.push(`${field} = ?`);
    vals.push(field === 'is_active' ? (value ? 1 : 0) : value);
  }
  if (!sets.length) throw badRequest('Nothing to update.');
  await sql(`UPDATE fare_rules SET ${sets.join(', ')} WHERE id = ?`, [...vals, req.params.id]);
  const rule = await one('SELECT * FROM fare_rules WHERE id = ?', [req.params.id]);
  if (!rule) throw notFound('Fare rule not found');
  res.json({ rule });
}));

// ─── Promo codes ──────────────────────────────────────────────────────────────

router.get('/promos', handle(async (req, res) => {
  const rows = await sql(
    `SELECT p.*, u.full_name AS owner_name,
            (SELECT COALESCE(SUM(amount), 0) FROM promo_redemptions r WHERE r.promo_code_id = p.id) AS total_discount
     FROM promo_codes p LEFT JOIN users u ON u.id = p.owner_user_id
     ${req.query.personal === '1' ? '' : 'WHERE p.owner_user_id IS NULL'}
     ORDER BY p.created_at DESC LIMIT 200`
  );
  res.json({ promos: rows });
}));

const readPromo = (body, partial = false) => {
  const out = {};
  if (!partial || body.code !== undefined) {
    out.code = promos.normalize(body.code);
    if (!/^[A-Z0-9-]{3,30}$/.test(out.code)) throw badRequest('Codes use 3–30 letters, digits or dashes.');
  }
  if (!partial || body.discount_type !== undefined) {
    if (!['percent', 'flat'].includes(body.discount_type)) throw badRequest('Choose percent or flat.');
    out.discount_type = body.discount_type;
  }
  if (!partial || body.discount_value !== undefined) {
    out.discount_value = toAmount(body.discount_value);
    if (!(out.discount_value > 0)) throw badRequest('Discount must be greater than zero.');
    if ((out.discount_type || body.discount_type) === 'percent' && out.discount_value > 100) throw badRequest('Percent cannot exceed 100.');
  }
  const optional = {
    description: (v) => String(v).slice(0, 200) || null,
    max_discount: (v) => (v === '' || v == null ? null : toAmount(v)),
    min_fare: (v) => toAmount(v) || 0,
    service: (v) => (['any', 'ride', 'parcel'].includes(v) ? v : 'any'),
    usage_limit: (v) => (v === '' || v == null ? null : parseInt(v, 10)),
    per_user_limit: (v) => Math.max(1, parseInt(v, 10) || 1),
    starts_at: (v) => v || null,
    expires_at: (v) => v || null,
    is_active: (v) => (v ? 1 : 0),
  };
  for (const [key, cast] of Object.entries(optional)) {
    if (body[key] !== undefined) out[key] = cast(body[key]);
  }
  return out;
};

router.post('/promos', ownerOnly, handle(async (req, res) => {
  const data = readPromo(req.body);
  const id = uuid();
  const cols = ['id', ...Object.keys(data)];
  await sql(`INSERT INTO promo_codes (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, [id, ...Object.values(data)]);
  res.status(201).json({ promo: await one('SELECT * FROM promo_codes WHERE id = ?', [id]) });
}));

router.patch('/promos/:id', ownerOnly, handle(async (req, res) => {
  const data = readPromo(req.body, true);
  if (!Object.keys(data).length) throw badRequest('Nothing to update.');
  await sql(
    `UPDATE promo_codes SET ${Object.keys(data).map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
    [...Object.values(data), req.params.id]
  );
  const promo = await one('SELECT * FROM promo_codes WHERE id = ?', [req.params.id]);
  if (!promo) throw notFound('Promo not found');
  res.json({ promo });
}));

// ─── Safety alerts ────────────────────────────────────────────────────────────

router.get('/sos', handle(async (req, res) => {
  const f = filters();
  if (req.query.status) f.add('s.status = ?', req.query.status);
  const alerts = await sql(
    `SELECT s.*, u.full_name, u.phone, u.role, st.full_name AS handled_by_name,
            b.service, b.status AS booking_status, b.pickup_address, b.dropoff_address
     FROM sos_alerts s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN staff st ON st.id = s.handled_by
     LEFT JOIN bookings b ON b.id = s.booking_id
     ${f.sql()} ORDER BY FIELD(s.status, 'open', 'acknowledged', 'resolved'), s.created_at DESC LIMIT 100`,
    f.params
  );
  res.json({ alerts });
}));

router.patch('/sos/:id', handle(async (req, res) => {
  const status = req.body.status;
  if (!['acknowledged', 'resolved'].includes(status)) throw badRequest('Unknown status.');
  const result = await sql(
    `UPDATE sos_alerts SET status = ?, handled_by = ?, resolved_at = IF(? = 'resolved', UTC_TIMESTAMP(), resolved_at) WHERE id = ?`,
    [status, req.staff.id, status, req.params.id]
  );
  if (!result.affectedRows) throw notFound('Alert not found');
  const alert = await one('SELECT user_id FROM sos_alerts WHERE id = ?', [req.params.id]);
  if (status === 'acknowledged') {
    await notify(alert.user_id, { title: 'Help is on the way', body: 'Our safety team has seen your alert and is contacting you.', category: 'safety' });
  }
  hub.toStaff('sos:updated', { id: req.params.id, status });
  res.json({ id: req.params.id, status });
}));

// ─── Help desk ────────────────────────────────────────────────────────────────

router.get('/help/threads', handle(async (req, res) => {
  const f = filters();
  if (req.query.state) f.add('t.state = ?', req.query.state);
  const threads = await sql(
    `SELECT t.*, u.full_name, u.phone, u.role, u.avatar_url, st.full_name AS staff_name
     FROM help_threads t JOIN users u ON u.id = t.user_id LEFT JOIN staff st ON st.id = t.staff_id
     ${f.sql()} ORDER BY COALESCE(t.last_message_at, t.created_at) DESC LIMIT 100`,
    f.params
  );
  res.json({ threads });
}));

router.post('/help/threads', handle(async (req, res) => {
  const user = await one('SELECT id FROM users WHERE id = ?', [req.body.userId]);
  if (!user) throw notFound('Person not found');
  res.status(201).json({ thread: await ensureThread(user) });
}));

router.get('/help/threads/:id', handle(async (req, res) => {
  const thread = await one(
    `SELECT t.*, u.full_name, u.phone, u.role FROM help_threads t JOIN users u ON u.id = t.user_id WHERE t.id = ?`,
    [req.params.id]
  );
  if (!thread) throw notFound('Conversation not found');
  await sql('UPDATE help_threads SET unread_staff = 0 WHERE id = ?', [req.params.id]);
  const messages = await sql('SELECT * FROM help_messages WHERE thread_id = ? ORDER BY created_at ASC LIMIT 500', [req.params.id]);
  res.json({ thread, messages });
}));

router.post('/help/threads/:id/reply', handle(async (req, res) => {
  const message = await postStaffReply(req.staff, req.params.id, req.body.body);
  res.status(201).json({ message });
}));

router.patch('/help/threads/:id', handle(async (req, res) => {
  const state = req.body.state;
  if (!['open', 'pending', 'closed'].includes(state)) throw badRequest('Unknown state.');
  const result = await sql(
    'UPDATE help_threads SET state = ?, staff_id = COALESCE(staff_id, ?) WHERE id = ?',
    [state, req.staff.id, req.params.id]
  );
  if (!result.affectedRows) throw notFound('Conversation not found');
  res.json({ id: req.params.id, state });
}));

// ─── Team (owners only) ───────────────────────────────────────────────────────

router.get('/team', ownerOnly, handle(async (req, res) => {
  res.json({
    team: await sql('SELECT id, email, full_name, role, access_status, last_login_at, created_at FROM staff ORDER BY created_at DESC'),
  });
}));

router.patch('/team/:id', ownerOnly, handle(async (req, res) => {
  if (req.params.id === req.staff.id) throw badRequest('You cannot change your own access.');
  const sets = [];
  const vals = [];
  if (req.body.access_status) {
    if (!['active', 'rejected', 'pending'].includes(req.body.access_status)) throw badRequest('Unknown access status.');
    sets.push('access_status = ?', 'approved_by = ?');
    vals.push(req.body.access_status, req.staff.id);
  }
  if (req.body.role) {
    if (!['owner', 'agent'].includes(req.body.role)) throw badRequest('Unknown role.');
    sets.push('role = ?');
    vals.push(req.body.role);
  }
  if (!sets.length) throw badRequest('Nothing to update.');
  const result = await sql(`UPDATE staff SET ${sets.join(', ')} WHERE id = ?`, [...vals, req.params.id]);
  if (!result.affectedRows) throw notFound('Team member not found');
  res.json({ member: await one('SELECT id, email, full_name, role, access_status FROM staff WHERE id = ?', [req.params.id]) });
}));

router.delete('/team/:id', ownerOnly, handle(async (req, res) => {
  if (req.params.id === req.staff.id) throw badRequest('You cannot remove yourself.');
  const result = await sql('DELETE FROM staff WHERE id = ?', [req.params.id]);
  if (!result.affectedRows) throw notFound('Team member not found');
  res.json({ removed: true });
}));

module.exports = router;
