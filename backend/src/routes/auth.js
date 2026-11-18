const express = require('express');
const crypto = require('crypto');
const { randomUUID: uuid } = require('crypto');
const env = require('../config/env');
const { sql, one, withTransaction } = require('../db/pool');
const { handle, badRequest, HttpError } = require('../lib/http');
const { avatarUpload, publicPath } = require('../lib/uploads');
const sms = require('../services/sms');
const promos = require('../services/promos');
const wallet = require('../services/wallet');
const { notify } = require('../services/notify');
const { signUserToken, signPhoneProof, readPhoneProof } = require('../middleware/auth');
const { ROLES, DRIVER_CLASSES, COURIER_MODES } = require('../config/catalog');

const router = express.Router();

const PHONE_RE = /^\+?[0-9]{8,15}$/;
const normalizePhone = (raw) => String(raw || '').replace(/[\s()-]/g, '');

const publicUser = (u) => ({
  id: u.id,
  phone: u.phone,
  full_name: u.full_name,
  email: u.email,
  role: u.role,
  avatar_url: u.avatar_url,
  referral_code: u.referral_code,
});

const newReferralCode = () => crypto.randomBytes(6).toString('base64').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 7);

// POST /api/auth/code — send a one-time sign-in code by SMS
router.post('/code', handle(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  if (!PHONE_RE.test(phone)) throw badRequest('Enter a valid phone number in international format.');

  await sql('UPDATE login_codes SET consumed = 1 WHERE phone = ? AND consumed = 0', [phone]);
  const code = sms.newCode();
  await sql(
    'INSERT INTO login_codes (id, phone, code_hash, expires_at) VALUES (?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE))',
    [uuid(), phone, sms.hashCode(phone, code), env.otpTtlMinutes]
  );
  await sms.sendLoginCode(phone, code);
  res.json({ sent: true, phone, expiresInMin: env.otpTtlMinutes });
}));

// POST /api/auth/verify — check the code; returns a session or a sign-up proof
router.post('/verify', handle(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const code = String(req.body.code || '');
  if (!PHONE_RE.test(phone) || !/^\d{6}$/.test(code)) throw badRequest('Enter the 6-digit code.');

  const row = await one(
    `SELECT * FROM login_codes
     WHERE phone = ? AND consumed = 0 AND expires_at > UTC_TIMESTAMP()
     ORDER BY created_at DESC LIMIT 1`,
    [phone]
  );
  if (!row) throw badRequest('That code is invalid or has expired.');
  if (row.attempts >= env.otpMaxAttempts) {
    await sql('UPDATE login_codes SET consumed = 1 WHERE id = ?', [row.id]);
    throw new HttpError(429, 'Too many attempts. Request a new code.');
  }

  const expected = Buffer.from(row.code_hash);
  const received = Buffer.from(sms.hashCode(phone, code));
  if (!crypto.timingSafeEqual(expected, received)) {
    await sql('UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?', [row.id]);
    throw badRequest('That code is invalid or has expired.');
  }
  await sql('UPDATE login_codes SET consumed = 1 WHERE id = ?', [row.id]);

  const user = await one('SELECT * FROM users WHERE phone = ?', [phone]);
  if (user) {
    if (user.account_status !== 'active') throw new HttpError(403, 'This account is suspended. Please contact support.');
    await sql('UPDATE users SET last_active_at = UTC_TIMESTAMP() WHERE id = ?', [user.id]);
    return res.json({ isNew: false, token: signUserToken(user.id), user: publicUser(user) });
  }
  res.json({ isNew: true, phoneProof: signPhoneProof(phone) });
}));

// POST /api/auth/signup — finish creating an account (multipart: optional "avatar")
router.post('/signup', avatarUpload.single('avatar'), handle(async (req, res) => {
  const phone = readPhoneProof(req.body.phoneProof);
  if (!phone) throw badRequest('Your verification expired. Please request a new code.');

  const role = req.body.role;
  const fullName = String(req.body.full_name || '').trim();
  if (!ROLES.includes(role)) throw badRequest('Choose how you want to use Transur.');
  if (fullName.length < 2) throw badRequest('Please enter your full name.');

  const isFleet = role !== 'rider';
  let vehicleClass = null;
  if (role === 'driver') {
    vehicleClass = req.body.vehicle_class;
    if (!DRIVER_CLASSES.includes(vehicleClass)) throw badRequest('Choose your vehicle class.');
    if (!req.body.plate_number?.trim()) throw badRequest('A plate number is required for drivers.');
  }
  if (role === 'courier') {
    vehicleClass = req.body.vehicle_class;
    if (!COURIER_MODES.includes(vehicleClass)) throw badRequest('Choose how you will deliver.');
    if (['moto', 'car'].includes(vehicleClass) && !req.body.plate_number?.trim()) {
      throw badRequest('A plate number is required for motorised couriers.');
    }
  }

  let referrer = null;
  if (req.body.referral_code) {
    referrer = await one('SELECT id, full_name FROM users WHERE referral_code = ?', [String(req.body.referral_code).trim().toUpperCase()]);
    if (!referrer) throw badRequest('That referral code does not exist.');
  }

  const id = uuid();
  await withTransaction(async (db) => {
    await db.sql(
      `INSERT INTO users (id, phone, full_name, email, role, avatar_url, referral_code, referred_by, last_active_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
      [id, phone, fullName, req.body.email?.trim() || null, role, publicPath(req.file), newReferralCode(), referrer?.id || null]
    );
    if (isFleet) {
      await db.sql(
        `INSERT INTO fleet_profiles (user_id, vehicle_class, vehicle_make, vehicle_color, plate_number, licence_number)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          id, vehicleClass,
          req.body.vehicle_make?.trim() || null,
          req.body.vehicle_color?.trim() || null,
          req.body.plate_number?.trim().toUpperCase() || null,
          req.body.licence_number?.trim() || null,
        ]
      );
      await wallet.openWallet(db, id);
    }
  });

  if (referrer && role === 'rider') {
    const code = await promos.grantPersonalCode({
      userId: id,
      amount: env.referralWelcome,
      description: `Welcome gift from ${referrer.full_name}`,
      prefix: 'WELCOME',
    });
    await notify(id, { title: 'Welcome to Transur 🎁', body: `Use code ${code} for a discount on your first trip.`, category: 'promo' });
  } else {
    await notify(id, {
      title: 'Welcome to Transur',
      body: isFleet ? 'Go online from your dashboard to start receiving requests.' : 'Book your first ride or send a parcel in seconds.',
    });
  }

  const user = await one('SELECT * FROM users WHERE id = ?', [id]);
  res.status(201).json({ token: signUserToken(id), user: publicUser(user) });
}));

module.exports = router;
module.exports.publicUser = publicUser;
