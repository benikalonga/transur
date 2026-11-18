const express = require('express');
const crypto = require('crypto');
const { randomUUID: uuid } = require('crypto');
const env = require('../config/env');
const { sql, one } = require('../db/pool');
const { handle, badRequest, unauthorized, paging } = require('../lib/http');
const { toAmount } = require('../lib/money');
const { requireUser, onlyRoles } = require('../middleware/auth');
const { FLEET_ROLES, MOBILE_MONEY } = require('../config/catalog');
const wallet = require('../services/wallet');
const bookings = require('../services/bookings');

const router = express.Router();

const fleet = [requireUser, onlyRoles(...FLEET_ROLES)];

// GET /api/wallet — balance, lock state and the last 20 entries
router.get('/', fleet, handle(async (req, res) => {
  res.json({ wallet: await wallet.summary(req.user.id) });
}));

// GET /api/wallet/entries — full ledger, paginated
router.get('/entries', fleet, handle(async (req, res) => {
  const { limit, offset, page } = paging(req.query, 30);
  const entries = await sql(
    `SELECT * FROM wallet_entries WHERE user_id = ? ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    [req.user.id]
  );
  res.json({ entries, page });
}));

// POST /api/wallet/top-up — start a mobile money top-up
router.post('/top-up', fleet, handle(async (req, res) => {
  const amount = toAmount(req.body.amount);
  const provider = req.body.provider;
  if (!(amount >= 0.5 && amount <= 1000)) throw badRequest('Top-ups must be between 0.50 and 1000.');
  if (!MOBILE_MONEY.includes(provider)) throw badRequest('Choose a mobile money provider.');

  const id = uuid();
  const reference = `TOP-${id.slice(0, 13).toUpperCase()}`;
  await sql(
    `INSERT INTO payment_intents (id, user_id, purpose, provider, payer_phone, amount, provider_ref)
     VALUES (?, ?, 'wallet_top_up', ?, ?, ?, ?)`,
    [id, req.user.id, provider, req.body.phone || req.user.phone, amount, reference]
  );

  // Outside production there is no real provider: settle straight away.
  if (!env.isProd) {
    await bookings.settleIntent(reference, amount);
    return res.json({ status: 'succeeded', reference, wallet: await wallet.summary(req.user.id) });
  }
  res.status(202).json({
    status: 'pending',
    reference,
    instructions: `Approve the ${amount.toFixed(2)} payment prompt on ${req.body.phone || req.user.phone}. Your wallet updates automatically.`,
  });
}));

// GET /api/wallet/top-up/:reference — poll a pending top-up
router.get('/top-up/:reference', fleet, handle(async (req, res) => {
  const intent = await one(
    'SELECT provider_ref AS reference, amount, status, created_at, settled_at FROM payment_intents WHERE provider_ref = ? AND user_id = ?',
    [req.params.reference, req.user.id]
  );
  res.json({ intent });
}));

// POST /api/wallet/webhooks/:provider — payment confirmation from the operator
const webhookAuthorized = (req) => {
  const expected = env.paymentWebhookSecret;
  const received = req.get('x-webhook-secret');
  if (!expected || !received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

router.post('/webhooks/:provider', handle(async (req, res) => {
  if (!webhookAuthorized(req)) throw unauthorized('Invalid webhook signature');
  const { reference, amount, status } = req.body;
  if (!reference) throw badRequest('reference is required');

  const intent = await one('SELECT provider FROM payment_intents WHERE provider_ref = ?', [reference]);
  if (!intent || intent.provider !== req.params.provider) return res.json({ received: true });

  if (status !== 'SUCCESS') {
    await sql("UPDATE payment_intents SET status = 'failed', settled_at = UTC_TIMESTAMP() WHERE provider_ref = ? AND status = 'pending'", [reference]);
    return res.json({ received: true });
  }
  const result = await bookings.settleIntent(reference, parseFloat(amount));
  res.json({ received: true, ...result });
}));

module.exports = router;
