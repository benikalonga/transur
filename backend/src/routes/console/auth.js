const express = require('express');
const bcrypt = require('bcryptjs');
const { randomUUID: uuid } = require('crypto');
const { sql, one } = require('../../db/pool');
const { handle, badRequest, unauthorized, forbidden, conflict } = require('../../lib/http');
const { signStaffToken, requireStaff } = require('../../middleware/auth');
const hub = require('../../realtime/hub');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DUMMY_HASH = bcrypt.hashSync('placeholder-for-timing-only', 12);

const publicStaff = (s) => ({ id: s.id, email: s.email, full_name: s.full_name, role: s.role });

// POST /api/console/auth/request-access — ask for a console account (needs owner approval)
router.post('/request-access', handle(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const fullName = String(req.body.full_name || '').trim();
  const password = String(req.body.password || '');
  if (!EMAIL_RE.test(email)) throw badRequest('Enter a valid email address.');
  if (fullName.length < 2) throw badRequest('Enter your full name.');
  if (password.length < 10) throw badRequest('Use a password of at least 10 characters.');

  if (await one('SELECT id FROM staff WHERE email = ?', [email])) throw conflict('An account with this email already exists.');

  const id = uuid();
  await sql(
    'INSERT INTO staff (id, email, full_name, password_hash, role, access_status) VALUES (?, ?, ?, ?, \'agent\', \'pending\')',
    [id, email, fullName, await bcrypt.hash(password, 12)]
  );
  hub.toStaff('team:request', { id, email, full_name: fullName });
  res.status(201).json({ message: 'Request sent. An owner must approve your access before you can sign in.' });
}));

// POST /api/console/auth/login
router.post('/login', handle(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const staff = await one('SELECT * FROM staff WHERE email = ?', [email]);

  // Compare against a dummy hash when the account is missing to keep timing constant.
  const ok = await bcrypt.compare(password, staff?.password_hash || DUMMY_HASH);
  if (!staff || !ok) throw unauthorized('Wrong email or password.');
  if (staff.access_status === 'pending') throw forbidden('Your access request is still waiting for approval.');
  if (staff.access_status !== 'active') throw forbidden('Your console access was declined. Contact an owner.');

  await sql('UPDATE staff SET last_login_at = UTC_TIMESTAMP() WHERE id = ?', [staff.id]);
  res.json({ token: signStaffToken(staff.id), staff: publicStaff(staff) });
}));

// GET /api/console/auth/me
router.get('/me', requireStaff, (req, res) => res.json({ staff: publicStaff(req.staff) }));

module.exports = router;
