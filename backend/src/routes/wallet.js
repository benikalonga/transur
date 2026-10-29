const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { query, pool } = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { rechargeWallet, getWallet } = require('../services/walletService');

// ─── GET /api/wallet ──────────────────────────────────────────────────────────
router.get('/', authenticate, requireRole('driver', 'delivery'), async (req, res, next) => {
  try {
    const wallet = await getWallet(req.user.id);
    if (!wallet) return res.status(404).json({ error: 'Wallet introuvable' });
    res.json({ wallet });
  } catch (err) { next(err); }
});

// ─── GET /api/wallet/transactions ─────────────────────────────────────────────
router.get('/transactions', authenticate, requireRole('driver', 'delivery'), async (req, res, next) => {
  try {
    const { page = 1, limit = 30 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { rows } = await query(
      `SELECT * FROM wallet_transactions WHERE user_id=? ORDER BY created_at DESC LIMIT ${parseInt(limit)} OFFSET ${offset}`,
      [req.user.id]
    );
    res.json({ transactions: rows, page: parseInt(page) });
  } catch (err) { next(err); }
});

// ─── POST /api/wallet/recharge ────────────────────────────────────────────────
router.post('/recharge', authenticate, requireRole('driver', 'delivery'), async (req, res, next) => {
  try {
    const { amount, provider, phone, transaction_ref } = req.body;
    if (!amount || parseFloat(amount) <= 0) return res.status(400).json({ error: 'Montant invalide' });
    if (!provider) return res.status(400).json({ error: 'Fournisseur requis' });

    // Une référence opérateur ne peut être réclamée qu'une seule fois
    if (transaction_ref) {
      const { rows: existing } = await query(
        'SELECT id FROM mobile_money_transactions WHERE provider_ref = ?', [transaction_ref]
      );
      if (existing[0]) return res.status(409).json({ error: 'Référence déjà utilisée' });
    }

    // Enregistre la demande de recharge
    const txId = uuidv4();
    const ref  = transaction_ref || `TRX-${uuidv4()}`;
    await query(
      `INSERT INTO mobile_money_transactions
         (id, user_id, provider, phone_number, amount, direction, status, provider_ref, reference_type)
       VALUES (?, ?, ?, ?, ?, 'inbound', 'pending', ?, 'recharge')`,
      [txId, req.user.id, provider, phone || '', parseFloat(amount), ref]
    );

    // En dev uniquement → confirmation immédiate (pas de webhook réel)
    if (process.env.NODE_ENV === 'development') {
      await rechargeWallet(req.user.id, parseFloat(amount), ref, `Recharge via ${provider}`);
      await query(
        "UPDATE mobile_money_transactions SET status='completed', completed_at=NOW() WHERE id=?", [txId]
      );
      const wallet = await getWallet(req.user.id);
      return res.json({ message: 'Wallet rechargé avec succès', wallet });
    }

    // En production → attendre webhook
    res.json({
      message: 'Demande enregistrée. Envoyez le paiement puis confirmez avec la référence.',
      ref,
    });
  } catch (err) { next(err); }
});

// ─── POST /api/wallet/webhook/:provider ───────────────────────────────────────
// Appelé par l'opérateur Mobile Money pour confirmer un paiement entrant.
// Doit envoyer l'en-tête X-Webhook-Secret = WALLET_WEBHOOK_SECRET.
const isAuthorizedWebhook = (req) => {
  const expected = process.env.WALLET_WEBHOOK_SECRET;
  const received = req.get('x-webhook-secret');
  if (!expected || !received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

router.post('/webhook/:provider', async (req, res, next) => {
  try {
    if (!isAuthorizedWebhook(req)) return res.status(401).json({ error: 'Non autorisé' });

    const { transaction_id, amount, status } = req.body;
    if (status !== 'SUCCESS' || !transaction_id) return res.json({ received: true });

    const { rows } = await query(
      "SELECT * FROM mobile_money_transactions WHERE provider_ref=? AND provider=? AND status='pending'",
      [transaction_id, req.params.provider]
    );
    if (!rows[0]) return res.json({ received: true });

    // Le montant payé doit correspondre au montant demandé
    if (Math.abs(parseFloat(amount) - parseFloat(rows[0].amount)) > 0.001) {
      await query(
        "UPDATE mobile_money_transactions SET status='failed' WHERE id=? AND status='pending'", [rows[0].id]
      );
      return res.status(400).json({ error: 'Montant incorrect' });
    }

    // Marque la transaction comme complétée de façon atomique (évite un double crédit)
    const [result] = await pool.execute(
      "UPDATE mobile_money_transactions SET status='completed', completed_at=NOW() WHERE id=? AND status='pending'",
      [rows[0].id]
    );
    if (result.affectedRows !== 1) return res.json({ received: true });

    await rechargeWallet(rows[0].user_id, parseFloat(rows[0].amount), transaction_id,
      `Recharge confirmée — ${req.params.provider}`);
    res.json({ received: true, processed: true });
  } catch (err) { next(err); }
});

module.exports = router;
