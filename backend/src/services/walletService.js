const { v4: uuidv4 } = require('uuid');
const { query, transaction } = require('../config/database');

// Débite la commission (paiement cash) — verrouillage FOR UPDATE
const debitCommission = async (userId, amount, referenceId, referenceType, description) =>
  transaction(async (client) => {
    const { rows } = await client.query(
      'SELECT id, balance FROM wallets WHERE user_id = ? FOR UPDATE', [userId]
    );
    if (!rows[0]) throw new Error('Wallet introuvable');

    const wallet     = rows[0];
    const newBalance = parseFloat(wallet.balance) - parseFloat(amount);

    await client.query('UPDATE wallets SET balance = ? WHERE id = ?', [newBalance, wallet.id]);
    await client.query(
      `INSERT INTO wallet_transactions
         (id, wallet_id, user_id, type, amount, balance_before, balance_after, description, reference_id, reference_type)
       VALUES (?, ?, ?, 'commission_debit', ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), wallet.id, userId, -amount, wallet.balance, newBalance, description, referenceId, referenceType]
    );
    return { balance: newBalance };
  });

// Crédite les gains (paiement mobile money)
const creditEarnings = async (userId, amount, referenceId, referenceType, description) =>
  transaction(async (client) => {
    const { rows } = await client.query(
      'SELECT id, balance FROM wallets WHERE user_id = ? FOR UPDATE', [userId]
    );
    if (!rows[0]) throw new Error('Wallet introuvable');

    const wallet     = rows[0];
    const newBalance = parseFloat(wallet.balance) + parseFloat(amount);

    await client.query(
      'UPDATE wallets SET balance = ?, total_earned = total_earned + ? WHERE id = ?',
      [newBalance, amount, wallet.id]
    );
    await client.query(
      `INSERT INTO wallet_transactions
         (id, wallet_id, user_id, type, amount, balance_before, balance_after, description, reference_id, reference_type)
       VALUES (?, ?, ?, 'mobile_money_credit', ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), wallet.id, userId, amount, wallet.balance, newBalance, description, referenceId, referenceType]
    );
    return { balance: newBalance };
  });

// Recharge wallet via Mobile Money
const rechargeWallet = async (userId, amount, mobileMoneyRef, description) =>
  transaction(async (client) => {
    const { rows } = await client.query(
      'SELECT id, balance FROM wallets WHERE user_id = ? FOR UPDATE', [userId]
    );
    if (!rows[0]) throw new Error('Wallet introuvable');

    const wallet     = rows[0];
    const newBalance = parseFloat(wallet.balance) + parseFloat(amount);

    await client.query(
      'UPDATE wallets SET balance = ?, total_paid = total_paid + ? WHERE id = ?',
      [newBalance, amount, wallet.id]
    );
    await client.query(
      `INSERT INTO wallet_transactions
         (id, wallet_id, user_id, type, amount, balance_before, balance_after, description, mobile_money_ref, reference_type)
       VALUES (?, ?, ?, 'mobile_money_credit', ?, ?, ?, ?, ?, 'recharge')`,
      [uuidv4(), wallet.id, userId, amount, wallet.balance, newBalance, description || 'Recharge wallet', mobileMoneyRef]
    );
    return { balance: newBalance };
  });

const getWallet = async (userId) => {
  const { rows: walletRows } = await query('SELECT * FROM wallets WHERE user_id = ?', [userId]);
  if (!walletRows[0]) return null;
  const { rows: txRows } = await query(
    'SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
    [userId]
  );
  return { ...walletRows[0], recent_transactions: txRows };
};

module.exports = { debitCommission, creditEarnings, rechargeWallet, getWallet };
