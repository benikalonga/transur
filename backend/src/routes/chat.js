const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');

// GET /chat/:type/:id — historique des messages d'une course/livraison
router.get('/:type/:id', authenticate, async (req, res) => {
  const { type, id } = req.params;
  if (!['trip', 'delivery'].includes(type)) return res.status(400).json({ error: 'Type invalide' });
  try {
    const { rows } = await query(
      `SELECT id, sender_id, sender_name, message, created_at
       FROM chat_messages
       WHERE reference_id = ? AND reference_type = ?
       ORDER BY created_at ASC
       LIMIT 100`,
      [id, type]
    );
    res.json({ messages: rows });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
