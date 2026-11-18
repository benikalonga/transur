const { randomUUID: uuid } = require('crypto');
const { sql, one } = require('../db/pool');
const { badRequest, notFound } = require('../lib/http');
const hub = require('./hub');

const clean = (body) => {
  const text = String(body || '').trim();
  if (!text) throw badRequest('Message cannot be empty.');
  return text.slice(0, 2000);
};

const store = async ({ threadId, authorType, authorId, authorName, body }) => {
  const id = uuid();
  await sql(
    'INSERT INTO help_messages (id, thread_id, author_type, author_id, author_name, body) VALUES (?, ?, ?, ?, ?, ?)',
    [id, threadId, authorType, authorId, authorName, body]
  );
  return { id, thread_id: threadId, author_type: authorType, author_name: authorName, body, created_at: new Date() };
};

/** A user writes to the help desk. */
const postUserMessage = async (user, threadId, rawBody) => {
  const body = clean(rawBody);
  const thread = await one('SELECT * FROM help_threads WHERE id = ? AND user_id = ?', [threadId, user.id]);
  if (!thread) throw notFound('Conversation not found');

  const message = await store({ threadId, authorType: 'user', authorId: user.id, authorName: user.full_name, body });
  await sql(
    `UPDATE help_threads SET last_message = ?, last_message_at = UTC_TIMESTAMP(),
       unread_staff = unread_staff + 1, state = 'open' WHERE id = ?`,
    [body.slice(0, 500), threadId]
  );
  hub.toStaff('help:message', { ...message, user_name: user.full_name });
  hub.toUser(user.id, 'help:message', message);
  return message;
};

/** A staff member replies. */
const postStaffReply = async (staff, threadId, rawBody) => {
  const body = clean(rawBody);
  const thread = await one('SELECT * FROM help_threads WHERE id = ?', [threadId]);
  if (!thread) throw notFound('Conversation not found');

  const message = await store({ threadId, authorType: 'staff', authorId: staff.id, authorName: staff.full_name, body });
  await sql(
    `UPDATE help_threads SET last_message = ?, last_message_at = UTC_TIMESTAMP(), unread_user = unread_user + 1,
       state = IF(state = 'closed', 'open', 'pending'), staff_id = COALESCE(staff_id, ?) WHERE id = ?`,
    [body.slice(0, 500), staff.id, threadId]
  );
  hub.toUser(thread.user_id, 'help:message', message);
  hub.toStaff('help:message', message);
  return message;
};

module.exports = { postUserMessage, postStaffReply };
