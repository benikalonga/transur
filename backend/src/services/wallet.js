const { randomUUID: uuid } = require('crypto');
const env = require('../config/env');
const { one, sql, withTransaction } = require('../db/pool');
const { cents } = require('../lib/money');
const { notFound } = require('../lib/http');
const hub = require('../realtime/hub');

const openWallet = (db, userId) =>
  db.sql('INSERT IGNORE INTO wallets (user_id, debt_limit) VALUES (?, ?)', [userId, env.walletDebtLimit]);

/**
 * Post a signed amount to a fleet wallet and record it in the ledger.
 * Positive = money owed to the provider, negative = money owed to the platform.
 * The wallet locks automatically once the balance reaches the debt limit
 * (a lock placed by staff is never lifted here).
 */
const postEntry = async (db, { userId, kind, amount, memo, bookingId = null, externalRef = null }) => {
  const wallet = await db.one('SELECT * FROM wallets WHERE user_id = ? FOR UPDATE', [userId]);
  if (!wallet) throw notFound('Wallet not found');

  const delta = cents(amount);
  const balance = cents(wallet.balance + delta);
  const staffLock = wallet.lock_reason === 'staff';
  const debtLock = balance <= wallet.debt_limit;
  const isLocked = staffLock || debtLock;
  const lockReason = staffLock ? 'staff' : debtLock ? 'debt' : null;

  await db.sql(
    `UPDATE wallets SET balance = ?, is_locked = ?, lock_reason = ?,
       lifetime_earnings = lifetime_earnings + ?,
       lifetime_topups   = lifetime_topups + ?
     WHERE user_id = ?`,
    [
      balance,
      isLocked ? 1 : 0,
      lockReason,
      ['payout', 'tip', 'promo_credit'].includes(kind) && delta > 0 ? delta : 0,
      kind === 'top_up' ? delta : 0,
      userId,
    ]
  );
  await db.sql(
    `INSERT INTO wallet_entries (id, user_id, kind, amount, balance_after, memo, booking_id, external_ref)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [uuid(), userId, kind, delta, balance, memo, bookingId, externalRef]
  );

  if (isLocked && !wallet.is_locked) {
    hub.toUser(userId, 'wallet:locked', { balance, reason: lockReason });
  }
  return { balance, isLocked };
};

/** Same as postEntry but opens its own transaction. */
const post = (entry) => withTransaction((db) => postEntry(db, entry));

const summary = async (userId) => {
  const wallet = await one('SELECT * FROM wallets WHERE user_id = ?', [userId]);
  if (!wallet) return null;
  const recent = await sql(
    'SELECT * FROM wallet_entries WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
    [userId]
  );
  return { ...wallet, recent };
};

const isLocked = async (userId) => {
  const row = await one('SELECT is_locked FROM wallets WHERE user_id = ?', [userId]);
  return Boolean(row?.is_locked);
};

module.exports = { openWallet, postEntry, post, summary, isLocked };
