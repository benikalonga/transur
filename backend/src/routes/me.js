const express = require('express');
const { randomUUID: uuid } = require('crypto');
const { sql, one } = require('../db/pool');
const { handle, badRequest, notFound, forbidden } = require('../lib/http');
const { isCoordinate } = require('../lib/geo');
const { avatarUpload, publicPath } = require('../lib/uploads');
const { requireUser, onlyRoles } = require('../middleware/auth');
const { FLEET_ROLES } = require('../config/catalog');
const fleet = require('../services/fleet');
const wallet = require('../services/wallet');
const { openRequestsFor } = require('../services/dispatch');

const router = express.Router();
router.use(requireUser);

const fleetOnly = onlyRoles(...FLEET_ROLES);

// GET /api/me — profile with fleet and wallet details when relevant
router.get('/', handle(async (req, res) => {
  const user = await one(
    `SELECT u.id, u.phone, u.full_name, u.email, u.role, u.avatar_url, u.referral_code, u.created_at,
            fp.vehicle_class, fp.vehicle_make, fp.vehicle_color, fp.plate_number, fp.licence_number,
            fp.availability, fp.rating_avg, fp.rating_count, fp.jobs_completed, fp.is_verified,
            w.balance AS wallet_balance, w.is_locked AS wallet_locked, w.debt_limit AS wallet_debt_limit
     FROM users u
     LEFT JOIN fleet_profiles fp ON fp.user_id = u.id
     LEFT JOIN wallets w ON w.user_id = u.id
     WHERE u.id = ?`,
    [req.user.id]
  );
  const stats = await one(
    `SELECT COUNT(*) AS trips, COALESCE(SUM(final_fare - discount_amount), 0) AS spent
     FROM bookings WHERE rider_id = ? AND status = 'completed'`,
    [req.user.id]
  );
  res.json({ user, riderStats: stats });
}));

// PATCH /api/me — update name, email, push token or avatar (multipart)
router.patch('/', avatarUpload.single('avatar'), handle(async (req, res) => {
  const sets = [];
  const vals = [];
  if (req.body.full_name !== undefined) {
    const name = String(req.body.full_name).trim();
    if (name.length < 2) throw badRequest('Name is too short.');
    sets.push('full_name = ?'); vals.push(name);
  }
  if (req.body.email !== undefined) { sets.push('email = ?'); vals.push(String(req.body.email).trim() || null); }
  if (req.body.push_token !== undefined) { sets.push('push_token = ?'); vals.push(req.body.push_token || null); }
  if (req.file) { sets.push('avatar_url = ?'); vals.push(publicPath(req.file)); }
  if (!sets.length) throw badRequest('Nothing to update.');

  await sql(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...vals, req.user.id]);
  const user = await one('SELECT id, phone, full_name, email, role, avatar_url, referral_code FROM users WHERE id = ?', [req.user.id]);
  res.json({ user });
}));

// PATCH /api/me/vehicle — fleet members update their vehicle (re-verification required)
router.patch('/vehicle', fleetOnly, handle(async (req, res) => {
  const { vehicle_make, vehicle_color, plate_number, licence_number } = req.body;
  await sql(
    `UPDATE fleet_profiles SET
       vehicle_make = COALESCE(?, vehicle_make), vehicle_color = COALESCE(?, vehicle_color),
       plate_number = COALESCE(?, plate_number), licence_number = COALESCE(?, licence_number),
       is_verified = IF(? IS NULL, is_verified, 0)
     WHERE user_id = ?`,
    [vehicle_make || null, vehicle_color || null, plate_number?.toUpperCase() || null, licence_number || null,
      plate_number || null, req.user.id]
  );
  res.json({ updated: true });
}));

// PATCH /api/me/availability — go online / offline
router.patch('/availability', fleetOnly, handle(async (req, res) => {
  const result = await fleet.setAvailability(req.user, req.body.availability, req.body.position);
  res.json(result);
}));

// POST /api/me/position — GPS fallback over HTTP when the socket is down
router.post('/position', fleetOnly, handle(async (req, res) => {
  const lat = parseFloat(req.body.lat);
  const lng = parseFloat(req.body.lng);
  if (!isCoordinate(lat, lng)) throw badRequest('Invalid coordinates.');
  await fleet.updatePosition(req.user, { lat, lng, heading: req.body.heading, speed: req.body.speed });
  res.json({ ok: true });
}));

// GET /api/me/requests — open requests near a provider (after reconnecting)
router.get('/requests', fleetOnly, handle(async (req, res) => {
  res.json({ requests: await openRequestsFor(req.user.id) });
}));

// GET /api/me/earnings — fleet earnings summary
router.get('/earnings', fleetOnly, handle(async (req, res) => {
  res.json(await fleet.earnings(req.user.id));
}));

// GET /api/me/wallet — shortcut used by fleet dashboards
router.get('/wallet', fleetOnly, handle(async (req, res) => {
  res.json({ wallet: await wallet.summary(req.user.id) });
}));

// GET /api/me/referrals — referral code and invited friends
router.get('/referrals', handle(async (req, res) => {
  const me = await one('SELECT referral_code FROM users WHERE id = ?', [req.user.id]);
  const invited = await sql(
    `SELECT u.full_name, u.created_at,
            EXISTS(SELECT 1 FROM bookings b WHERE b.rider_id = u.id AND b.status = 'completed') AS has_travelled
     FROM users u WHERE u.referred_by = ? ORDER BY u.created_at DESC LIMIT 50`,
    [req.user.id]
  );
  res.json({ code: me.referral_code, invited });
}));

// ─── Saved places ─────────────────────────────────────────────────────────────

router.get('/places', handle(async (req, res) => {
  const places = await sql(
    "SELECT * FROM saved_places WHERE user_id = ? ORDER BY FIELD(kind, 'home', 'work', 'other'), label",
    [req.user.id]
  );
  res.json({ places });
}));

router.post('/places', handle(async (req, res) => {
  const { label, kind = 'other', address } = req.body;
  const lat = parseFloat(req.body.lat);
  const lng = parseFloat(req.body.lng);
  if (!label?.trim() || !address?.trim()) throw badRequest('Label and address are required.');
  if (!isCoordinate(lat, lng)) throw badRequest('Pick a location on the map.');
  if (!['home', 'work', 'other'].includes(kind)) throw badRequest('Unknown place type.');

  const count = await one('SELECT COUNT(*) AS n FROM saved_places WHERE user_id = ?', [req.user.id]);
  if (count.n >= 20) throw badRequest('You can save up to 20 places.');

  // Only one home and one work place: replace the previous one.
  if (kind !== 'other') await sql('DELETE FROM saved_places WHERE user_id = ? AND kind = ?', [req.user.id, kind]);

  const id = uuid();
  await sql(
    'INSERT INTO saved_places (id, user_id, label, kind, address, lat, lng) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, req.user.id, label.trim().slice(0, 40), kind, address.trim().slice(0, 255), lat, lng]
  );
  res.status(201).json({ place: await one('SELECT * FROM saved_places WHERE id = ?', [id]) });
}));

router.delete('/places/:id', handle(async (req, res) => {
  const result = await sql('DELETE FROM saved_places WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!result.affectedRows) throw notFound('Place not found');
  res.json({ deleted: true });
}));

// ─── Trusted contacts (alerted on SOS) ────────────────────────────────────────

router.get('/contacts', handle(async (req, res) => {
  res.json({ contacts: await sql('SELECT * FROM trusted_contacts WHERE user_id = ? ORDER BY created_at', [req.user.id]) });
}));

router.post('/contacts', handle(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const phone = String(req.body.phone || '').replace(/[\s()-]/g, '');
  if (name.length < 2 || !/^\+?[0-9]{8,15}$/.test(phone)) throw badRequest('Enter a name and a valid phone number.');
  const count = await one('SELECT COUNT(*) AS n FROM trusted_contacts WHERE user_id = ?', [req.user.id]);
  if (count.n >= 5) throw forbidden('You can add up to 5 trusted contacts.');

  const id = uuid();
  await sql('INSERT INTO trusted_contacts (id, user_id, name, phone) VALUES (?, ?, ?, ?)', [id, req.user.id, name.slice(0, 100), phone]);
  res.status(201).json({ contact: { id, name, phone } });
}));

router.delete('/contacts/:id', handle(async (req, res) => {
  const result = await sql('DELETE FROM trusted_contacts WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  if (!result.affectedRows) throw notFound('Contact not found');
  res.json({ deleted: true });
}));

module.exports = router;
