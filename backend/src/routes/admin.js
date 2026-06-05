const express = require('express');
const router  = express.Router();
const { query }              = require('../config/database');
const { v4: uuidv4 }         = require('uuid');
const { authenticate, requireSuperAdmin } = require('../middleware/adminAuth');

// All routes require admin authentication
router.use(authenticate);

// ─── GET /api/admin/stats ─────────────────────────────────────────────────────
router.get('/stats', async (req, res, next) => {
  try {
    const [users, trips, deliveries, revenue, revenueByDay, newUsersWeek, activeToday] = await Promise.all([
      query('SELECT role, status, COUNT(*) AS cnt FROM users GROUP BY role, status'),
      query('SELECT status, COUNT(*) AS cnt FROM trips GROUP BY status'),
      query('SELECT status, COUNT(*) AS cnt FROM deliveries GROUP BY status'),
      query(`
        SELECT
          COALESCE(SUM(commission_amount), 0) AS commission,
          COALESCE(SUM(final_fare), 0)         AS revenue,
          COUNT(*)                              AS count,
          'taxi' AS service
        FROM trips WHERE status = 'completed'
        UNION ALL
        SELECT
          COALESCE(SUM(commission_amount), 0),
          COALESCE(SUM(final_fare), 0),
          COUNT(*),
          'delivery'
        FROM deliveries WHERE status = 'delivered'
      `),
      query(`
        SELECT
          DATE(day) AS date,
          COALESCE(SUM(trips_revenue), 0) + COALESCE(SUM(del_revenue), 0) AS total_revenue,
          COALESCE(SUM(trips_revenue), 0)    AS trips_revenue,
          COALESCE(SUM(del_revenue), 0)      AS delivery_revenue,
          COALESCE(SUM(trips_count), 0) + COALESCE(SUM(del_count), 0) AS total_count
        FROM (
          SELECT
            DATE(completed_at) AS day,
            SUM(final_fare)    AS trips_revenue,
            COUNT(*)           AS trips_count,
            NULL               AS del_revenue,
            NULL               AS del_count
          FROM trips
          WHERE status = 'completed'
            AND completed_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
          GROUP BY DATE(completed_at)
          UNION ALL
          SELECT
            DATE(delivered_at),
            NULL,
            NULL,
            SUM(final_fare),
            COUNT(*)
          FROM deliveries
          WHERE status = 'delivered'
            AND delivered_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
          GROUP BY DATE(delivered_at)
        ) sub
        GROUP BY DATE(day)
        ORDER BY date ASC
      `),
      query(`
        SELECT COUNT(*) AS new_users
        FROM users
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      `),
      query(`
        SELECT COUNT(DISTINCT user_id) AS active_today
        FROM (
          SELECT client_id AS user_id FROM trips
          WHERE requested_at >= CURDATE()
          UNION
          SELECT client_id FROM deliveries
          WHERE requested_at >= CURDATE()
        ) sub
      `),
    ]);

    res.json({
      users:           users.rows,
      trips:           trips.rows,
      deliveries:      deliveries.rows,
      revenue:         revenue.rows,
      revenue_by_day:  revenueByDay.rows,
      new_users_week:  newUsersWeek.rows[0]?.new_users || 0,
      active_today:    activeToday.rows[0]?.active_today || 0,
    });
  } catch (err) { next(err); }
});

// ─── GET /api/admin/users ─────────────────────────────────────────────────────
router.get('/users', async (req, res, next) => {
  try {
    const { role, status, page = 1, limit = 50, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conds  = [];
    const vals   = [];

    if (role)   { conds.push('u.role = ?');   vals.push(role); }
    if (status) { conds.push('u.status = ?'); vals.push(status); }
    if (search) {
      conds.push('(u.name LIKE ? OR u.phone LIKE ?)');
      vals.push(`%${search}%`, `%${search}%`);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const [{ rows }, { rows: countRows }] = await Promise.all([
      query(
        `SELECT u.id, u.name, u.phone, u.role, u.status, u.photo_url, u.created_at,
                w.balance, w.is_blocked AS wallet_blocked
         FROM users u
         LEFT JOIN wallets w ON u.id = w.user_id
         ${where}
         ORDER BY u.created_at DESC
         LIMIT ${parseInt(limit)} OFFSET ${offset}`,
        vals
      ),
      query(`SELECT COUNT(*) AS total FROM users u ${where}`, vals),
    ]);

    res.json({ users: rows, total: countRows[0]?.total || 0, page: parseInt(page) });
  } catch (err) { next(err); }
});

// ─── PATCH /api/admin/users/:id/status ───────────────────────────────────────
router.patch('/users/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['active', 'suspended', 'blocked', 'pending'].includes(status))
      return res.status(400).json({ error: 'Statut invalide' });
    await query('UPDATE users SET status = ? WHERE id = ?', [status, req.params.id]);
    const { rows } = await query('SELECT id, name, status FROM users WHERE id = ?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json({ user: rows[0] });
  } catch (err) { next(err); }
});

// ─── GET /api/admin/users/:id ─────────────────────────────────────────────────
router.get('/users/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const [{ rows: userRows }, { rows: walletRows }, { rows: tripStats }, { rows: deliveryStats }] = await Promise.all([
      query(
        `SELECT u.*, dp.status AS driver_status, dp.vehicle_type, dp.vehicle_brand,
                dp.vehicle_plate, dp.rating AS driver_rating, dp.total_trips,
                dlp.status AS livreur_status, dlp.rating AS livreur_rating, dlp.total_deliveries
         FROM users u
         LEFT JOIN driver_profiles   dp  ON u.id = dp.user_id
         LEFT JOIN delivery_profiles dlp ON u.id = dlp.user_id
         WHERE u.id = ?`,
        [id]
      ),
      query('SELECT * FROM wallets WHERE user_id = ?', [id]),
      query(
        `SELECT status, COUNT(*) AS cnt, COALESCE(SUM(final_fare), 0) AS total_spent
         FROM trips WHERE client_id = ? OR driver_id = ? GROUP BY status`,
        [id, id]
      ),
      query(
        `SELECT status, COUNT(*) AS cnt, COALESCE(SUM(final_fare), 0) AS total_spent
         FROM deliveries WHERE client_id = ? OR agent_id = ? GROUP BY status`,
        [id, id]
      ),
    ]);
    if (!userRows[0]) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json({
      user:           userRows[0],
      wallet:         walletRows[0] || null,
      trip_stats:     tripStats,
      delivery_stats: deliveryStats,
    });
  } catch (err) { next(err); }
});

// ─── POST /api/admin/users/:id/wallet/credit (superadmin) ────────────────────
router.post('/users/:id/wallet/credit', requireSuperAdmin, async (req, res, next) => {
  try {
    const { amount, reason } = req.body;
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0)
      return res.status(400).json({ error: 'Montant invalide' });
    const { rows: walletRows } = await query('SELECT * FROM wallets WHERE user_id = ?', [req.params.id]);
    if (!walletRows[0]) return res.status(404).json({ error: 'Portefeuille introuvable' });

    const amt = parseFloat(amount);
    await query(
      'UPDATE wallets SET balance = balance + ?, total_paid = total_paid + ? WHERE user_id = ?',
      [amt, amt, req.params.id]
    );
    await query(
      `INSERT INTO wallet_transactions (id, user_id, type, amount, balance_before, balance_after, description, reference_type)
       SELECT UUID(), user_id, 'bonus', ?, balance - ?, balance, ?, 'admin_credit'
       FROM wallets WHERE user_id = ?`,
      [amt, amt, reason || 'Admin credit', req.params.id]
    );
    const { rows: updated } = await query('SELECT * FROM wallets WHERE user_id = ?', [req.params.id]);
    res.json({ wallet: updated[0] });
  } catch (err) { next(err); }
});

// ─── POST /api/admin/users/:id/wallet/debit (superadmin) ─────────────────────
router.post('/users/:id/wallet/debit', requireSuperAdmin, async (req, res, next) => {
  try {
    const { amount, reason } = req.body;
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0)
      return res.status(400).json({ error: 'Montant invalide' });
    const { rows: walletRows } = await query('SELECT * FROM wallets WHERE user_id = ?', [req.params.id]);
    if (!walletRows[0]) return res.status(404).json({ error: 'Portefeuille introuvable' });

    const amt = parseFloat(amount);
    if (walletRows[0].balance < amt)
      return res.status(400).json({ error: 'Solde insuffisant' });

    await query(
      'UPDATE wallets SET balance = balance - ? WHERE user_id = ?',
      [amt, req.params.id]
    );
    await query(
      `INSERT INTO wallet_transactions (id, user_id, type, amount, balance_before, balance_after, description, reference_type)
       SELECT UUID(), user_id, 'deduction', ?, balance + ?, balance, ?, 'admin_debit'
       FROM wallets WHERE user_id = ?`,
      [amt, amt, reason || 'Admin debit', req.params.id]
    );
    const { rows: updated } = await query('SELECT * FROM wallets WHERE user_id = ?', [req.params.id]);
    res.json({ wallet: updated[0] });
  } catch (err) { next(err); }
});

// ─── GET /api/admin/chauffeurs ────────────────────────────────────────────────
router.get('/chauffeurs', async (req, res, next) => {
  try {
    const { status, page = 1, limit = 50, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conds  = ["u.role = 'driver'"];
    const vals   = [];

    if (status) { conds.push('dp.status = ?'); vals.push(status); }
    if (search) {
      conds.push('(u.name LIKE ? OR u.phone LIKE ?)');
      vals.push(`%${search}%`, `%${search}%`);
    }
    const where = `WHERE ${conds.join(' AND ')}`;

    const [{ rows }, { rows: countRows }] = await Promise.all([
      query(
        `SELECT u.id, u.name, u.phone, u.status AS account_status, u.photo_url, u.created_at,
                dp.status AS driver_status, dp.rating, dp.total_trips, dp.vehicle_type,
                dp.vehicle_brand, dp.vehicle_plate,
                dp.license_number, dp.is_verified,
                w.balance AS wallet_balance, w.is_blocked AS wallet_blocked,
                dl.latitude, dl.longitude, dl.updated_at AS last_location
         FROM users u
         LEFT JOIN driver_profiles  dp ON u.id = dp.user_id
         LEFT JOIN wallets          w  ON u.id = w.user_id
         LEFT JOIN driver_locations dl ON u.id = dl.user_id
         ${where}
         ORDER BY u.created_at DESC
         LIMIT ${parseInt(limit)} OFFSET ${offset}`,
        vals
      ),
      query(
        `SELECT COUNT(*) AS total FROM users u LEFT JOIN driver_profiles dp ON u.id = dp.user_id ${where}`,
        vals
      ),
    ]);

    res.json({ chauffeurs: rows, total: countRows[0]?.total || 0, page: parseInt(page) });
  } catch (err) { next(err); }
});

// ─── GET /api/admin/livreurs ──────────────────────────────────────────────────
router.get('/livreurs', async (req, res, next) => {
  try {
    const { status, page = 1, limit = 50, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conds  = ["u.role = 'delivery'"];
    const vals   = [];

    if (status) { conds.push('dlp.status = ?'); vals.push(status); }
    if (search) {
      conds.push('(u.name LIKE ? OR u.phone LIKE ?)');
      vals.push(`%${search}%`, `%${search}%`);
    }
    const where = `WHERE ${conds.join(' AND ')}`;

    const [{ rows }, { rows: countRows }] = await Promise.all([
      query(
        `SELECT u.id, u.name, u.phone, u.status AS account_status, u.photo_url, u.created_at,
                dlp.status AS livreur_status, dlp.rating, dlp.total_deliveries,
                dlp.transport_type, dlp.vehicle_brand, dlp.vehicle_plate, dlp.is_verified,
                w.balance AS wallet_balance, w.is_blocked AS wallet_blocked,
                dl.latitude, dl.longitude, dl.updated_at AS last_location
         FROM users u
         LEFT JOIN delivery_profiles dlp ON u.id = dlp.user_id
         LEFT JOIN wallets            w   ON u.id = w.user_id
         LEFT JOIN driver_locations   dl  ON u.id = dl.user_id
         ${where}
         ORDER BY u.created_at DESC
         LIMIT ${parseInt(limit)} OFFSET ${offset}`,
        vals
      ),
      query(
        `SELECT COUNT(*) AS total FROM users u LEFT JOIN delivery_profiles dlp ON u.id = dlp.user_id ${where}`,
        vals
      ),
    ]);

    res.json({ livreurs: rows, total: countRows[0]?.total || 0, page: parseInt(page) });
  } catch (err) { next(err); }
});

// ─── GET /api/admin/pricing ───────────────────────────────────────────────────
router.get('/pricing', async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM pricing_config ORDER BY service_type');
    res.json({ configs: rows });
  } catch (err) { next(err); }
});

// ─── PATCH /api/admin/pricing/:id ────────────────────────────────────────────
router.patch('/pricing/:id', async (req, res, next) => {
  try {
    const { base_fare, per_km_rate, minimum_fare, commission_rate, surge_multiplier } = req.body;
    await query(
      `UPDATE pricing_config SET
         base_fare        = COALESCE(?, base_fare),
         per_km_rate      = COALESCE(?, per_km_rate),
         minimum_fare     = COALESCE(?, minimum_fare),
         commission_rate  = COALESCE(?, commission_rate),
         surge_multiplier = COALESCE(?, surge_multiplier),
         updated_at       = NOW()
       WHERE id = ?`,
      [base_fare, per_km_rate, minimum_fare, commission_rate, surge_multiplier, req.params.id]
    );
    const { rows } = await query('SELECT * FROM pricing_config WHERE id = ?', [req.params.id]);
    res.json({ config: rows[0] });
  } catch (err) { next(err); }
});

// ─── GET /api/admin/online ────────────────────────────────────────────────────
router.get('/online', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.name, u.phone, u.role, u.photo_url,
              dl.latitude, dl.longitude, dl.updated_at AS last_location,
              COALESCE(dp.status, dlp.status) AS status
       FROM users u
       JOIN driver_locations dl ON u.id = dl.user_id
       LEFT JOIN driver_profiles   dp  ON u.id = dp.user_id
       LEFT JOIN delivery_profiles dlp ON u.id = dlp.user_id
       WHERE dl.updated_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE)
         AND (dp.status = 'online' OR dlp.status = 'online')`
    );
    res.json({ drivers: rows, count: rows.length });
  } catch (err) { next(err); }
});

// ─── GET /api/admin/trips ─────────────────────────────────────────────────────
router.get('/trips', async (req, res, next) => {
  try {
    const { status, page = 1, limit = 50, from, to, driver_id, client_id } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conds  = [];
    const vals   = [];

    if (status)    { conds.push('t.status = ?');                  vals.push(status); }
    if (driver_id) { conds.push('t.driver_id = ?');               vals.push(driver_id); }
    if (client_id) { conds.push('t.client_id = ?');               vals.push(client_id); }
    if (from)      { conds.push('t.requested_at >= ?');           vals.push(from); }
    if (to)        { conds.push('t.requested_at <= ?');           vals.push(to); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const [{ rows }, { rows: countRows }] = await Promise.all([
      query(
        `SELECT t.*, c.name AS client_name, c.phone AS client_phone,
                d.name AS driver_name, d.phone AS driver_phone
         FROM trips t
         LEFT JOIN users c ON t.client_id = c.id
         LEFT JOIN users d ON t.driver_id = d.id
         ${where}
         ORDER BY t.requested_at DESC
         LIMIT ${parseInt(limit)} OFFSET ${offset}`,
        vals
      ),
      query(`SELECT COUNT(*) AS total FROM trips t ${where}`, vals),
    ]);

    res.json({ trips: rows, total: countRows[0]?.total || 0, page: parseInt(page) });
  } catch (err) { next(err); }
});

// ─── GET /api/admin/trips/:id ─────────────────────────────────────────────────
router.get('/trips/:id', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT t.*,
              c.name AS client_name, c.phone AS client_phone,
              d.name AS driver_name, d.phone AS driver_phone,
              dp.vehicle_brand, dp.vehicle_plate, dp.rating AS driver_rating
       FROM trips t
       LEFT JOIN users          c  ON t.client_id = c.id
       LEFT JOIN users          d  ON t.driver_id = d.id
       LEFT JOIN driver_profiles dp ON t.driver_id = dp.user_id
       WHERE t.id = ?`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Course introuvable' });
    res.json({ trip: rows[0] });
  } catch (err) { next(err); }
});

// ─── GET /api/admin/deliveries ────────────────────────────────────────────────
router.get('/deliveries', async (req, res, next) => {
  try {
    const { status, page = 1, limit = 50, from, to, agent_id, client_id } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conds  = [];
    const vals   = [];

    if (status)    { conds.push('d.status = ?');        vals.push(status); }
    if (agent_id){ conds.push('d.agent_id = ?');    vals.push(agent_id); }
    if (client_id) { conds.push('d.client_id = ?');     vals.push(client_id); }
    if (from)      { conds.push('d.requested_at >= ?'); vals.push(from); }
    if (to)        { conds.push('d.requested_at <= ?'); vals.push(to); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const [{ rows }, { rows: countRows }] = await Promise.all([
      query(
        `SELECT d.*, c.name AS client_name, c.phone AS client_phone,
                l.name AS livreur_name, l.phone AS livreur_phone
         FROM deliveries d
         LEFT JOIN users c ON d.client_id  = c.id
         LEFT JOIN users l ON d.agent_id = l.id
         ${where}
         ORDER BY d.requested_at DESC
         LIMIT ${parseInt(limit)} OFFSET ${offset}`,
        vals
      ),
      query(`SELECT COUNT(*) AS total FROM deliveries d ${where}`, vals),
    ]);

    res.json({ deliveries: rows, total: countRows[0]?.total || 0, page: parseInt(page) });
  } catch (err) { next(err); }
});

// ─── GET /api/admin/deliveries/:id ───────────────────────────────────────────
router.get('/deliveries/:id', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT d.*,
              c.name AS client_name, c.phone AS client_phone,
              l.name AS livreur_name, l.phone AS livreur_phone,
              dlp.transport_type AS livreur_vehicle, dlp.rating AS livreur_rating
       FROM deliveries d
       LEFT JOIN users            c   ON d.client_id  = c.id
       LEFT JOIN users            l   ON d.agent_id = l.id
       LEFT JOIN delivery_profiles dlp ON d.agent_id = dlp.user_id
       WHERE d.id = ?`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Livraison introuvable' });
    res.json({ delivery: rows[0] });
  } catch (err) { next(err); }
});

// ─── GET /api/admin/wallets ───────────────────────────────────────────────────
router.get('/wallets', async (req, res, next) => {
  try {
    const { page = 1, limit = 50, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conds  = [];
    const vals   = [];

    if (search) {
      conds.push('(u.name LIKE ? OR u.phone LIKE ?)');
      vals.push(`%${search}%`, `%${search}%`);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const [{ rows }, { rows: countRows }] = await Promise.all([
      query(
        `SELECT w.*, u.name, u.phone, u.role, u.status AS account_status
         FROM wallets w
         JOIN users u ON w.user_id = u.id
         ${where}
         ORDER BY w.balance DESC
         LIMIT ${parseInt(limit)} OFFSET ${offset}`,
        vals
      ),
      query(`SELECT COUNT(*) AS total FROM wallets w JOIN users u ON w.user_id = u.id ${where}`, vals),
    ]);

    res.json({ wallets: rows, total: countRows[0]?.total || 0, page: parseInt(page) });
  } catch (err) { next(err); }
});

// ─── PATCH /api/admin/wallets/:userId/block ───────────────────────────────────
router.patch('/wallets/:userId/block', async (req, res, next) => {
  try {
    const { blocked } = req.body;
    if (typeof blocked !== 'boolean')
      return res.status(400).json({ error: 'Le champ blocked doit être un booléen' });
    await query('UPDATE wallets SET is_blocked = ? WHERE user_id = ?', [blocked, req.params.userId]);
    const { rows } = await query('SELECT * FROM wallets WHERE user_id = ?', [req.params.userId]);
    if (!rows[0]) return res.status(404).json({ error: 'Portefeuille introuvable' });
    res.json({ wallet: rows[0] });
  } catch (err) { next(err); }
});

// ─── GET /api/admin/transactions ──────────────────────────────────────────────
router.get('/transactions', async (req, res, next) => {
  try {
    const { user_id, type, from, to, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conds  = [];
    const vals   = [];

    if (user_id) { conds.push('wt.user_id = ?');      vals.push(user_id); }
    if (type)    { conds.push('wt.type = ?');          vals.push(type); }
    if (from)    { conds.push('wt.created_at >= ?');   vals.push(from); }
    if (to)      { conds.push('wt.created_at <= ?');   vals.push(to); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const [{ rows }, { rows: countRows }] = await Promise.all([
      query(
        `SELECT wt.*, u.name AS user_name, u.phone AS user_phone, u.role AS user_role
         FROM wallet_transactions wt
         JOIN users u ON wt.user_id = u.id
         ${where}
         ORDER BY wt.created_at DESC
         LIMIT ${parseInt(limit)} OFFSET ${offset}`,
        vals
      ),
      query(`SELECT COUNT(*) AS total FROM wallet_transactions wt ${where}`, vals),
    ]);

    res.json({ transactions: rows, total: countRows[0]?.total || 0, page: parseInt(page) });
  } catch (err) { next(err); }
});

// ─── GET /api/admin/finance/summary ──────────────────────────────────────────
router.get('/finance/summary', async (req, res, next) => {
  try {
    const { year, month } = req.query;
    const y = parseInt(year)  || new Date().getFullYear();
    const m = parseInt(month) || new Date().getMonth() + 1;

    const [{ rows: tripSummary }, { rows: deliverySummary }, { rows: walletSummary }] = await Promise.all([
      query(
        `SELECT
           COUNT(*)                              AS total_trips,
           COALESCE(SUM(final_fare), 0)          AS total_fares,
           COALESCE(SUM(commission_amount), 0)   AS total_commission,
           COALESCE(AVG(final_fare), 0)          AS avg_fare
         FROM trips
         WHERE status = 'completed'
           AND YEAR(completed_at) = ? AND MONTH(completed_at) = ?`,
        [y, m]
      ),
      query(
        `SELECT
           COUNT(*)                              AS total_deliveries,
           COALESCE(SUM(final_fare), 0)          AS total_fares,
           COALESCE(SUM(commission_amount), 0)   AS total_commission,
           COALESCE(AVG(final_fare), 0)          AS avg_fare
         FROM deliveries
         WHERE status = 'delivered'
           AND YEAR(delivered_at) = ? AND MONTH(delivered_at) = ?`,
        [y, m]
      ),
      query(
        `SELECT
           COALESCE(SUM(CASE WHEN type IN ('payment','top_up') THEN amount ELSE 0 END), 0) AS total_in,
           COALESCE(SUM(CASE WHEN type IN ('trip_payment','delivery_payment') THEN amount ELSE 0 END), 0) AS total_out
         FROM wallet_transactions
         WHERE YEAR(created_at) = ? AND MONTH(created_at) = ?`,
        [y, m]
      ),
    ]);

    res.json({
      period:   { year: y, month: m },
      trips:    tripSummary[0],
      delivery: deliverySummary[0],
      wallet:   walletSummary[0],
      total_revenue: (parseFloat(tripSummary[0]?.total_fares) || 0) + (parseFloat(deliverySummary[0]?.total_fares) || 0),
      total_commission: (parseFloat(tripSummary[0]?.total_commission) || 0) + (parseFloat(deliverySummary[0]?.total_commission) || 0),
    });
  } catch (err) { next(err); }
});

// ─── GET /api/admin/finance/daily ─────────────────────────────────────────────
router.get('/finance/daily', async (req, res, next) => {
  try {
    const { rows } = await query(`
      SELECT
        day AS date,
        COALESCE(SUM(trips_revenue), 0) + COALESCE(SUM(del_revenue), 0)   AS total_revenue,
        COALESCE(SUM(trips_commission), 0) + COALESCE(SUM(del_commission), 0) AS total_commission,
        COALESCE(SUM(trips_revenue), 0)    AS trips_revenue,
        COALESCE(SUM(del_revenue), 0)      AS delivery_revenue,
        COALESCE(SUM(trips_count), 0)      AS trips_count,
        COALESCE(SUM(del_count), 0)        AS deliveries_count
      FROM (
        SELECT
          DATE(completed_at)            AS day,
          SUM(final_fare)               AS trips_revenue,
          SUM(commission_amount)        AS trips_commission,
          COUNT(*)                      AS trips_count,
          NULL                          AS del_revenue,
          NULL                          AS del_commission,
          NULL                          AS del_count
        FROM trips
        WHERE status = 'completed'
          AND completed_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        GROUP BY DATE(completed_at)
        UNION ALL
        SELECT
          DATE(delivered_at),
          NULL, NULL, NULL,
          SUM(final_fare),
          SUM(commission_amount),
          COUNT(*)
        FROM deliveries
        WHERE status = 'delivered'
          AND delivered_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        GROUP BY DATE(delivered_at)
      ) sub
      GROUP BY day
      ORDER BY day ASC
    `);
    res.json({ daily: rows });
  } catch (err) { next(err); }
});

// ─── GET /api/admin/finance/top-drivers ───────────────────────────────────────
router.get('/finance/top-drivers', async (req, res, next) => {
  try {
    const { limit = 10, from, to } = req.query;
    const dateFrom = from || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const dateTo   = to   || new Date().toISOString().split('T')[0];

    const { rows } = await query(
      `SELECT
         u.id, u.name, u.phone, u.role, u.photo_url,
         COALESCE(t.total_earned, 0)  AS trips_earned,
         COALESCE(t.trip_count, 0)    AS trip_count,
         COALESCE(d.total_earned, 0)  AS delivery_earned,
         COALESCE(d.delivery_count, 0) AS delivery_count,
         COALESCE(t.total_earned, 0) + COALESCE(d.total_earned, 0) AS total_earned,
         dp.rating AS driver_rating, dlp.rating AS livreur_rating
       FROM users u
       LEFT JOIN (
         SELECT driver_id, SUM(final_fare) AS total_earned, COUNT(*) AS trip_count
         FROM trips
         WHERE status = 'completed' AND completed_at BETWEEN ? AND ?
         GROUP BY driver_id
       ) t ON u.id = t.driver_id
       LEFT JOIN (
         SELECT agent_id, SUM(final_fare) AS total_earned, COUNT(*) AS delivery_count
         FROM deliveries
         WHERE status = 'delivered' AND delivered_at BETWEEN ? AND ?
         GROUP BY agent_id
       ) d ON u.id = d.agent_id
       LEFT JOIN driver_profiles   dp  ON u.id = dp.user_id
       LEFT JOIN delivery_profiles dlp ON u.id = dlp.user_id
       WHERE u.role IN ('chauffeur', 'livreur')
         AND (t.total_earned IS NOT NULL OR d.total_earned IS NOT NULL)
       ORDER BY total_earned DESC
       LIMIT ${parseInt(limit)}`,
      [dateFrom, dateTo, dateFrom, dateTo]
    );
    res.json({ drivers: rows, period: { from: dateFrom, to: dateTo } });
  } catch (err) { next(err); }
});

// ─── GET /api/admin/support/conversations ─────────────────────────────────────
router.get('/support/conversations', async (req, res, next) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conds  = [];
    const vals   = [];

    if (status) { conds.push('sc.status = ?'); vals.push(status); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const [{ rows }, { rows: countRows }] = await Promise.all([
      query(
        `SELECT sc.*,
                u.name AS user_name, u.phone AS user_phone, u.photo_url AS user_photo,
                sc.unread_admin AS unread_count
         FROM support_conversations sc
         JOIN users u ON sc.user_id COLLATE utf8mb4_unicode_ci = u.id COLLATE utf8mb4_unicode_ci
         ${where}
         ORDER BY COALESCE(sc.last_message_at, sc.created_at) DESC
         LIMIT ${parseInt(limit)} OFFSET ${offset}`,
        vals
      ),
      query(`SELECT COUNT(*) AS total FROM support_conversations sc ${where}`, vals),
    ]);

    res.json({ conversations: rows, total: countRows[0]?.total || 0, page: parseInt(page) });
  } catch (err) { next(err); }
});

// ─── GET /api/admin/support/conversations/:id/messages ───────────────────────
router.get('/support/conversations/:id/messages', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 100 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const [{ rows: conv }, { rows: messages }] = await Promise.all([
      query(
        `SELECT sc.*, u.name AS user_name, u.phone AS user_phone
         FROM support_conversations sc
         JOIN users u ON sc.user_id COLLATE utf8mb4_unicode_ci = u.id COLLATE utf8mb4_unicode_ci
         WHERE sc.id = ?`,
        [id]
      ),
      query(
        `SELECT sm.*, a.name AS admin_display_name
         FROM support_messages sm
         LEFT JOIN admins a ON sm.admin_id = a.id AND sm.sender_type = 'admin'
         WHERE sm.conversation_id = ?
         ORDER BY sm.created_at ASC
         LIMIT ${parseInt(limit)} OFFSET ${offset}`,
        [id]
      ),
    ]);
    if (!conv[0]) return res.status(404).json({ error: 'Conversation introuvable' });

    // Mark admin-side unread as read
    await query(
      'UPDATE support_conversations SET unread_admin = 0 WHERE id = ?',
      [id]
    );

    res.json({ conversation: conv[0], messages, page: parseInt(page) });
  } catch (err) { next(err); }
});

// ─── POST /api/admin/support/conversations/:id/reply ─────────────────────────
router.post('/support/conversations/:id/reply', async (req, res, next) => {
  try {
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'Message requis' });

    const { rows: conv } = await query(
      'SELECT id FROM support_conversations WHERE id = ?', [req.params.id]
    );
    if (!conv[0]) return res.status(404).json({ error: 'Conversation introuvable' });

    const msgId = uuidv4();
    const { rows: conv2 } = await query('SELECT user_id FROM support_conversations WHERE id = ?', [req.params.id]);
    await query(
      `INSERT INTO support_messages (id, conversation_id, admin_id, user_id, sender_type, sender_name, message)
       VALUES (?, ?, ?, ?, 'admin', ?, ?)`,
      [msgId, req.params.id, req.admin.id, conv2[0]?.user_id || null, req.admin.name, message.trim()]
    );
    await query(
      `UPDATE support_conversations SET last_message=?, last_message_at=NOW(), unread_user=unread_user+1,
       status='assigned', assigned_admin_id=COALESCE(assigned_admin_id,?), updated_at=NOW() WHERE id=?`,
      [message.trim(), req.admin.id, req.params.id]
    );

    const { rows } = await query('SELECT * FROM support_messages WHERE id = ?', [msgId]);
    res.status(201).json({ message: rows[0] });
  } catch (err) { next(err); }
});

// ─── PATCH /api/admin/support/conversations/:id/status ───────────────────────
router.patch('/support/conversations/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['open', 'answered', 'closed', 'pending'].includes(status))
      return res.status(400).json({ error: 'Statut invalide' });
    await query(
      'UPDATE support_conversations SET status = ?, updated_at = NOW() WHERE id = ?',
      [status, req.params.id]
    );
    const { rows } = await query('SELECT * FROM support_conversations WHERE id = ?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Conversation introuvable' });
    res.json({ conversation: rows[0] });
  } catch (err) { next(err); }
});

// ─── POST /api/admin/support/conversations — create conversation for a user ──
router.post('/support/conversations', async (req, res, next) => {
  try {
    const { userId, subject = 'Support' } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId requis' });
    // Check if open conversation already exists for this user
    const { rows: existing } = await query(
      "SELECT * FROM support_conversations WHERE user_id=? AND status NOT IN ('resolved','closed') LIMIT 1",
      [userId]
    );
    if (existing[0]) return res.json({ conversation: existing[0] });
    const id = uuidv4();
    await query(
      "INSERT INTO support_conversations (id, user_id, subject, status) VALUES (?,?,?,'open')",
      [id, userId, subject]
    );
    const { rows } = await query('SELECT * FROM support_conversations WHERE id=?', [id]);
    res.status(201).json({ conversation: rows[0] });
  } catch (err) { next(err); }
});

// ─── POST /api/admin/support/conversations/:id/assign ────────────────────────
router.post('/support/conversations/:id/assign', async (req, res, next) => {
  try {
    await query(
      'UPDATE support_conversations SET assigned_admin_id = ?, status = "assigned", updated_at = NOW() WHERE id = ?',
      [req.admin.id, req.params.id]
    );
    const { rows } = await query('SELECT * FROM support_conversations WHERE id = ?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Conversation introuvable' });
    res.json({ conversation: rows[0] });
  } catch (err) { next(err); }
});

// ─── GET /api/admin/admins (superadmin only) ──────────────────────────────────
router.get('/admins', requireSuperAdmin, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, name, email, role, status, created_at, last_login
       FROM admins ORDER BY created_at DESC`
    );
    res.json({ admins: rows });
  } catch (err) { next(err); }
});

// ─── PATCH /api/admin/admins/:id/approve (superadmin only) ───────────────────
router.patch('/admins/:id/approve', requireSuperAdmin, async (req, res, next) => {
  try {
    await query('UPDATE admins SET status = ? WHERE id = ?', ['active', req.params.id]);
    const { rows } = await query('SELECT id, name, email, role, status FROM admins WHERE id = ?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Admin introuvable' });
    res.json({ admin: rows[0] });
  } catch (err) { next(err); }
});

// ─── PATCH /api/admin/admins/:id/reject (superadmin only) ────────────────────
router.patch('/admins/:id/reject', requireSuperAdmin, async (req, res, next) => {
  try {
    await query('UPDATE admins SET status = ? WHERE id = ?', ['rejected', req.params.id]);
    const { rows } = await query('SELECT id, name, email, role, status FROM admins WHERE id = ?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Admin introuvable' });
    res.json({ admin: rows[0] });
  } catch (err) { next(err); }
});

// ─── DELETE /api/admin/admins/:id (superadmin only) ───────────────────────────
router.delete('/admins/:id', requireSuperAdmin, async (req, res, next) => {
  try {
    if (req.params.id === req.admin.id)
      return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
    const { rows } = await query('SELECT id FROM admins WHERE id = ?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Admin introuvable' });
    await query('DELETE FROM admins WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── GET /api/admin/activity/live ────────────────────────────────────────────
router.get('/activity/live', async (req, res, next) => {
  try {
    const [{ rows: activeTrips }, { rows: activeDeliveries }, { rows: onlineDrivers }] = await Promise.all([
      query(
        `SELECT t.id, t.status, t.pickup_address, t.dropoff_address,
                t.pickup_lat, t.pickup_lng, t.dropoff_lat, t.dropoff_lng,
                t.requested_at, t.final_fare,
                c.name AS client_name, c.phone AS client_phone,
                d.name AS driver_name, d.phone AS driver_phone,
                dl.latitude AS driver_lat, dl.longitude AS driver_lng
         FROM trips t
         LEFT JOIN users c          ON t.client_id = c.id
         LEFT JOIN users d          ON t.driver_id = d.id
         LEFT JOIN driver_locations dl ON t.driver_id = dl.user_id
         WHERE t.status IN ('accepted', 'in_progress', 'arrived')
         ORDER BY t.requested_at ASC`
      ),
      query(
        `SELECT d.id, d.status, d.pickup_address, d.dropoff_address,
                d.pickup_lat, d.pickup_lng, d.dropoff_lat, d.dropoff_lng,
                d.requested_at, d.final_fare,
                c.name AS client_name, c.phone AS client_phone,
                l.name AS livreur_name, l.phone AS livreur_phone,
                dl.latitude AS livreur_lat, dl.longitude AS livreur_lng
         FROM deliveries d
         LEFT JOIN users c          ON d.client_id  = c.id
         LEFT JOIN users l          ON d.agent_id = l.id
         LEFT JOIN driver_locations dl ON d.agent_id = dl.user_id
         WHERE d.status IN ('accepted', 'pickup', 'ongoing')
         ORDER BY d.requested_at ASC`
      ),
      query(
        `SELECT u.id, u.name, u.phone, u.role, u.photo_url,
                dl.latitude, dl.longitude, dl.updated_at AS last_location,
                COALESCE(dp.status, dlp.status) AS status
         FROM users u
         JOIN driver_locations dl ON u.id = dl.user_id
         LEFT JOIN driver_profiles   dp  ON u.id = dp.user_id
         LEFT JOIN delivery_profiles dlp ON u.id = dlp.user_id
         WHERE dl.updated_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE)
           AND (dp.status = 'online' OR dlp.status = 'online')`
      ),
    ]);

    res.json({
      active_trips:      activeTrips,
      active_deliveries: activeDeliveries,
      online_drivers:    onlineDrivers,
      counts: {
        active_trips:      activeTrips.length,
        active_deliveries: activeDeliveries.length,
        online_drivers:    onlineDrivers.length,
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
