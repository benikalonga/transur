const { randomUUID: uuid } = require('crypto');
const { sql } = require('../db/pool');
const hub = require('../realtime/hub');

/**
 * Store an in-app notification and push it live. Never throws: a failed
 * notification must not break the action that triggered it.
 */
const notify = async (userId, { title, body, category = 'general', bookingId = null }) => {
  if (!userId) return;
  try {
    const id = uuid();
    await sql(
      'INSERT INTO notifications (id, user_id, title, body, category, booking_id) VALUES (?, ?, ?, ?, ?, ?)',
      [id, userId, title, body, category, bookingId]
    );
    hub.toUser(userId, 'notification', { id, title, body, category, bookingId, createdAt: new Date() });
  } catch (err) {
    console.warn('[notify] failed:', err.message);
  }
};

module.exports = { notify };
