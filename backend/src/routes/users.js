const express = require('express');
const router  = express.Router();
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');

// ─── GET /api/users/me ────────────────────────────────────────────────────────
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT u.*,
         dp.vehicle_type, dp.vehicle_plate, dp.vehicle_color, dp.vehicle_brand,
         dp.rating AS driver_rating, dp.total_trips, dp.status AS driver_status, dp.is_verified AS driver_verified,
         dlp.transport_type, dlp.rating AS agent_rating, dlp.total_deliveries, dlp.status AS agent_status,
         w.balance, w.is_blocked, w.total_earned, w.debt_limit
       FROM users u
       LEFT JOIN driver_profiles  dp  ON u.id = dp.user_id
       LEFT JOIN delivery_profiles dlp ON u.id = dlp.user_id
       LEFT JOIN wallets           w   ON u.id = w.user_id
       WHERE u.id = ?`,
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json({ user: rows[0] });
  } catch (err) { next(err); }
});

// ─── PATCH /api/users/me ──────────────────────────────────────────────────────
router.patch('/me', authenticate, async (req, res, next) => {
  try {
    const { name, fcm_token } = req.body;
    const sets = [];
    const vals = [];
    if (name)      { sets.push('name = ?');      vals.push(name.trim()); }
    if (fcm_token) { sets.push('fcm_token = ?'); vals.push(fcm_token); }
    if (!sets.length) return res.status(400).json({ error: 'Aucune donnée à mettre à jour' });
    vals.push(req.user.id);
    await query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, vals);
    const { rows } = await query('SELECT id, name, phone, role, photo_url FROM users WHERE id = ?', [req.user.id]);
    res.json({ user: rows[0] });
  } catch (err) { next(err); }
});

// ─── PATCH /api/users/driver/status ──────────────────────────────────────────
router.patch('/driver/status', authenticate, async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['online', 'offline'].includes(status))
      return res.status(400).json({ error: 'Statut invalide (online | offline)' });

    const table = req.user.role === 'driver' ? 'driver_profiles' : 'delivery_profiles';
    await query(`UPDATE ${table} SET status = ? WHERE user_id = ?`, [status, req.user.id]);

    if (status === 'offline') {
      await query('DELETE FROM driver_locations WHERE user_id = ?', [req.user.id]);
    }
    await query('UPDATE users SET last_seen = NOW() WHERE id = ?', [req.user.id]);
    res.json({ status });
  } catch (err) { next(err); }
});

// ─── POST /api/users/location ─────────────────────────────────────────────────
router.post('/location', authenticate, async (req, res, next) => {
  try {
    if (!['driver', 'delivery'].includes(req.user.role))
      return res.status(403).json({ error: 'Réservé aux chauffeurs et livreurs' });

    const { latitude, longitude, heading, speed } = req.body;
    if (!latitude || !longitude) return res.status(400).json({ error: 'Latitude et longitude requis' });

    const { v4: uuidv4 } = require('uuid');
    await query(
      `INSERT INTO driver_locations (id, user_id, latitude, longitude, heading, speed)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE latitude=VALUES(latitude), longitude=VALUES(longitude),
         heading=VALUES(heading), speed=VALUES(speed), updated_at=NOW()`,
      [uuidv4(), req.user.id, latitude, longitude, heading ?? null, speed ?? null]
    );

    // Diffuser la position aux clients qui suivent une course active
    const io = req.app.get('io');
    if (io) {
      const { rows } = await query(
        `SELECT client_id FROM trips WHERE driver_id=? AND status IN ('accepted','pickup','ongoing')
         UNION
         SELECT client_id FROM deliveries WHERE agent_id=? AND status IN ('accepted','pickup','ongoing')`,
        [req.user.id, req.user.id]
      );
      rows.forEach(({ client_id }) =>
        io.to(`user:${client_id}`).emit('driver_location_update',
          { driverId: req.user.id, latitude, longitude, heading })
      );
    }
    res.json({ updated: true });
  } catch (err) { next(err); }
});

module.exports = router;
