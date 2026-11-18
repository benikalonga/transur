/**
 * Thin wrapper around the Socket.IO server so services can push events without
 * passing `io` around. Rooms:
 *   u:<userId>   – every socket of one app user
 *   staff        – every console socket (namespace /console)
 */
let io = null;

const attach = (server) => {
  io = server;
};

const toUser = (userId, event, payload) => {
  if (io && userId) io.to(`u:${userId}`).emit(event, payload);
};

const toUsers = (userIds, event, payload) => userIds.forEach((id) => toUser(id, event, payload));

const toStaff = (event, payload) => {
  if (io) io.of('/console').to('staff').emit(event, payload);
};

const toEveryone = (event, payload) => {
  if (io) io.emit(event, payload);
};

module.exports = { attach, toUser, toUsers, toStaff, toEveryone };
