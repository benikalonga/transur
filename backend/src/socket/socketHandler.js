const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');

const setupSocket = (io) => {
  // Authentification des connexions WebSocket
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentification requise'));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const { rows } = await query(
        'SELECT id, name, role, status FROM users WHERE id=?', [decoded.userId]
      );
      if (!rows[0] || rows[0].status !== 'active') return next(new Error('Compte non valide'));
      socket.user = rows[0];
      next();
    } catch {
      next(new Error('Token invalide'));
    }
  });

  io.on('connection', (socket) => {
    const { user } = socket;
    console.log(`🔌 [WS] ${user.name} (${user.role}) connecté — ${socket.id}`);

    // Chaque utilisateur rejoint sa salle personnelle
    socket.join(`user:${user.id}`);

    // ── GPS : mise à jour de position ────────────────────────────────────────
    socket.on('location_update', async ({ latitude, longitude, heading, speed }) => {
      if (!latitude || !longitude) return;
      await query(
        `INSERT INTO driver_locations (id, user_id, latitude, longitude, heading, speed)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           latitude=VALUES(latitude), longitude=VALUES(longitude),
           heading=VALUES(heading), speed=VALUES(speed), updated_at=NOW()`,
        [uuidv4(), user.id, latitude, longitude, heading ?? null, speed ?? null]
      ).catch(() => {});

      // Diffuser aux clients avec course active
      const { rows } = await query(
        `SELECT client_id FROM trips
         WHERE driver_id=? AND status IN ('accepted','pickup','ongoing')
         UNION
         SELECT client_id FROM deliveries
         WHERE agent_id=? AND status IN ('accepted','pickup','ongoing')`,
        [user.id, user.id]
      ).catch(() => ({ rows: [] }));

      rows.forEach(({ client_id }) =>
        io.to(`user:${client_id}`).emit('driver_location_update',
          { driverId: user.id, latitude, longitude, heading })
      );
    });

    // ── Statut en ligne / hors ligne ──────────────────────────────────────────
    socket.on('set_status', async ({ status }) => {
      if (!['online', 'offline'].includes(status)) return;
      const table = user.role === 'driver' ? 'driver_profiles' : 'delivery_profiles';
      await query(`UPDATE ${table} SET status=? WHERE user_id=?`, [status, user.id]).catch(() => {});
      if (status === 'offline') {
        await query('DELETE FROM driver_locations WHERE user_id=?', [user.id]).catch(() => {});
      }
      socket.emit('status_updated', { status });
      // Notify all clients so they can update available-provider counts in real time
      if (status === 'online') {
        io.emit('provider_online', { userId: user.id, role: user.role });
      }
    });

    // ── Message entre client et chauffeur ─────────────────────────────────────
    socket.on('message', async ({ to, text, tripId, deliveryId, referenceType }) => {
      if (!to || !text?.trim()) return;
      const refId = tripId || deliveryId;
      const refType = referenceType || (tripId ? 'trip' : 'delivery');

      // Persist to DB
      const msgId = uuidv4();
      await query(
        `INSERT INTO chat_messages (id, reference_id, reference_type, sender_id, sender_name, message)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [msgId, refId || 'general', refType || 'trip', user.id, user.name, text.trim()]
      ).catch(() => {});

      const payload = {
        id: msgId,
        from: user.id,
        fromName: user.name,
        text: text.trim(),
        tripId, deliveryId,
        at: new Date().toISOString(),
      };

      // Send to recipient
      io.to(`user:${to}`).emit('message', payload);
      // Echo back to sender so they see it in their own chat
      socket.emit('message', payload);
    });

    // ── Support : message utilisateur vers admin ──────────────────────────────
    socket.on('support_message', async ({ conversationId, message }) => {
      if (!conversationId || !message?.trim()) return;
      const msgId = uuidv4();
      const { rows: convRows } = await query('SELECT * FROM support_conversations WHERE id=?', [conversationId]);
      if (!convRows[0]) return;
      const conv = convRows[0];
      if (conv.user_id !== user.id) return; // security check
      await query(
        'INSERT INTO support_messages (id, conversation_id, admin_id, user_id, sender_type, sender_name, message) VALUES (?,?,?,?,?,?,?)',
        [msgId, conversationId, conv.assigned_admin_id, user.id, 'user', user.name, message.trim()]
      ).catch(() => {});
      await query(
        'UPDATE support_conversations SET last_message=?, last_message_at=NOW(), unread_admin=unread_admin+1 WHERE id=?',
        [message.trim(), conversationId]
      ).catch(() => {});
      const payload = { id: msgId, conversationId, senderType: 'user', senderName: user.name, message: message.trim(), createdAt: new Date().toISOString() };
      // Send to admins
      io.of('/admin').to('admins').emit('support_message', payload);
      // Echo to user
      socket.emit('support_message', payload);
    });

    // ── Déconnexion ───────────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      console.log(`❌ [WS] ${user.name} déconnecté`);
      await query('UPDATE users SET last_seen=NOW() WHERE id=?', [user.id]).catch(() => {});
    });
  });

  // Admin namespace for real-time admin features
  const adminNs = io.of('/admin');
  adminNs.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Auth requise'));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (!decoded.adminId) return next(new Error('Token invalide'));
      socket.admin = { id: decoded.adminId, role: decoded.role, name: decoded.name };
      next();
    } catch { next(new Error('Token invalide')); }
  });

  adminNs.on('connection', (socket) => {
    const { admin } = socket;
    socket.join('admins');  // All admins in one room
    socket.join(`admin:${admin.id}`);
    console.log(`🔑 [WS-ADMIN] ${admin.name} (${admin.role}) connecté`);

    socket.on('admin_message', async ({ conversationId, message }) => {
      if (!conversationId || !message?.trim()) return;
      const msgId = uuidv4();
      // Get conversation to find user
      const { rows: convRows } = await query('SELECT * FROM support_conversations WHERE id=?', [conversationId]);
      if (!convRows[0]) return;
      const conv = convRows[0];
      await query(
        'INSERT INTO support_messages (id, conversation_id, admin_id, user_id, sender_type, sender_name, message) VALUES (?,?,?,?,?,?,?)',
        [msgId, conversationId, admin.id, conv.user_id, 'admin', admin.name, message.trim()]
      ).catch(() => {});
      await query(
        'UPDATE support_conversations SET last_message=?, last_message_at=NOW(), unread_user=unread_user+1, status=IF(status="open","assigned",status), assigned_admin_id=COALESCE(assigned_admin_id,?) WHERE id=?',
        [message.trim(), admin.id, conversationId]
      ).catch(() => {});
      const payload = { id: msgId, conversationId, senderType: 'admin', senderName: admin.name, message: message.trim(), createdAt: new Date().toISOString() };
      // Send to user
      io.to(`user:${conv.user_id}`).emit('support_message', payload);
      // Echo to all admins
      adminNs.to('admins').emit('support_message', payload);
    });

    socket.on('disconnect', () => {
      console.log(`❌ [WS-ADMIN] ${admin.name} déconnecté`);
    });
  });
};

module.exports = { setupSocket };
