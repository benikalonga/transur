const crypto = require('crypto');
const { randomUUID: uuid } = require('crypto');
const { one, sql } = require('../db/pool');
const { cents } = require('../lib/money');
const { badRequest } = require('../lib/http');

const normalize = (code) => String(code || '').trim().toUpperCase();

/** Random human-friendly code, e.g. "TS-7KQ2M9". */
const generateCode = (prefix = 'TS') =>
  `${prefix}-${crypto.randomBytes(4).toString('base64').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6)}`;

const discountFor = (promo, fare) => {
  const raw = promo.discount_type === 'percent' ? (fare * promo.discount_value) / 100 : promo.discount_value;
  const capped = promo.max_discount ? Math.min(raw, promo.max_discount) : raw;
  return cents(Math.min(capped, fare));
};

/**
 * Check a code for a user and a service/fare. Returns the promo row and the
 * discount it would give, or throws a 400 with a readable reason.
 */
const evaluate = async ({ code, userId, service, fare }) => {
  const promo = await one('SELECT * FROM promo_codes WHERE code = ?', [normalize(code)]);
  const now = new Date();

  if (!promo || !promo.is_active) throw badRequest('This promo code is not valid.');
  if (promo.owner_user_id && promo.owner_user_id !== userId) throw badRequest('This promo code belongs to another account.');
  if (promo.starts_at && new Date(promo.starts_at) > now) throw badRequest('This promo code is not active yet.');
  if (promo.expires_at && new Date(promo.expires_at) < now) throw badRequest('This promo code has expired.');
  if (promo.service !== 'any' && promo.service !== service) throw badRequest(`This code only works for ${promo.service}s.`);
  if (promo.usage_limit != null && promo.times_used >= promo.usage_limit) throw badRequest('This promo code has been fully used.');
  if (fare != null && fare < promo.min_fare) throw badRequest(`This code needs a fare of at least ${promo.min_fare}.`);

  const used = await one(
    'SELECT COUNT(*) AS n FROM promo_redemptions WHERE promo_code_id = ? AND user_id = ?',
    [promo.id, userId]
  );
  // Also count open bookings that already hold the code.
  const pending = await one(
    `SELECT COUNT(*) AS n FROM bookings
     WHERE promo_code_id = ? AND rider_id = ? AND status NOT IN ('completed','cancelled')`,
    [promo.id, userId]
  );
  if (used.n + pending.n >= promo.per_user_limit) throw badRequest('You have already used this promo code.');

  return { promo, discount: fare != null ? discountFor(promo, fare) : null };
};

/** Record that a completed booking consumed a promo. Call inside the completion transaction. */
const redeem = async (db, { promoId, userId, bookingId, amount }) => {
  await db.sql(
    'INSERT INTO promo_redemptions (id, promo_code_id, user_id, booking_id, amount) VALUES (?, ?, ?, ?, ?)',
    [uuid(), promoId, userId, bookingId, amount]
  );
  await db.sql('UPDATE promo_codes SET times_used = times_used + 1 WHERE id = ?', [promoId]);
};

/** Create a single-use personal code (used for referral rewards). */
const grantPersonalCode = async ({ userId, amount, description, prefix = 'GIFT' }) => {
  const code = generateCode(prefix);
  await sql(
    `INSERT INTO promo_codes
       (id, code, description, discount_type, discount_value, owner_user_id, usage_limit, per_user_limit, expires_at)
     VALUES (?, ?, ?, 'flat', ?, ?, 1, 1, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 60 DAY))`,
    [uuid(), code, description, amount, userId]
  );
  return code;
};

/** Codes a user can currently use (personal ones + public active ones). */
const availableFor = (userId) =>
  sql(
    `SELECT p.id, p.code, p.description, p.discount_type, p.discount_value, p.max_discount,
            p.min_fare, p.service, p.expires_at, (p.owner_user_id IS NOT NULL) AS is_personal
     FROM promo_codes p
     WHERE p.is_active = 1
       AND (p.owner_user_id = ? OR p.owner_user_id IS NULL)
       AND (p.expires_at IS NULL OR p.expires_at > UTC_TIMESTAMP())
       AND (p.starts_at IS NULL OR p.starts_at <= UTC_TIMESTAMP())
       AND (p.usage_limit IS NULL OR p.times_used < p.usage_limit)
       AND (SELECT COUNT(*) FROM promo_redemptions r WHERE r.promo_code_id = p.id AND r.user_id = ?) < p.per_user_limit
     ORDER BY is_personal DESC, p.created_at DESC`,
    [userId, userId]
  );

module.exports = { normalize, generateCode, discountFor, evaluate, redeem, grantPersonalCode, availableFor };
