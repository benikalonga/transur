const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');

// ── GET /api/support/conversation — get or create user's support conversation
router.get('/conversation', authenticate, async (req, res, next) => {
  try {
    const { rows } = await query(
      "SELECT * FROM support_conversations WHERE user_id=? ORDER BY updated_at DESC LIMIT 1",
      [req.user.id]
    );
    if (rows[0]) return res.json({ conversation: rows[0] });

    // Create new conversation
    const id = uuidv4();
    await query(
      "INSERT INTO support_conversations (id, user_id, subject, status) VALUES (?,?,?,'open')",
      [id, req.user.id, 'Support client']
    );
    const { rows: newRows } = await query('SELECT * FROM support_conversations WHERE id=?', [id]);
    res.status(201).json({ conversation: newRows[0] });
  } catch (err) { next(err); }
});

// ── GET /api/support/messages/:convId — get messages for user's conversation
router.get('/messages/:convId', authenticate, async (req, res, next) => {
  try {
    const { rows: conv } = await query(
      'SELECT * FROM support_conversations WHERE id=? AND user_id=?',
      [req.params.convId, req.user.id]
    );
    if (!conv[0]) return res.status(403).json({ error: 'Non autorisé' });

    // Reset user unread
    await query('UPDATE support_conversations SET unread_user=0 WHERE id=?', [req.params.convId]);

    const { rows } = await query(
      'SELECT * FROM support_messages WHERE conversation_id=? ORDER BY created_at ASC LIMIT 100',
      [req.params.convId]
    );
    res.json({ messages: rows });
  } catch (err) { next(err); }
});

module.exports = router;
