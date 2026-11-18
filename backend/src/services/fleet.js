const { sql, one } = require('../db/pool');
const { badRequest, conflict } = require('../lib/http');
const { isCoordinate } = require('../lib/geo');
const { LIVE_STATES } = require('../config/catalog');
const hub = require('../realtime/hub');

/** Store a provider's GPS fix and forward it to riders they are serving. */
const updatePosition = async (user, { lat, lng, heading, speed }) => {
  const h = Number.isFinite(parseFloat(heading)) ? parseFloat(heading) : null;
  const s = Number.isFinite(parseFloat(speed)) ? parseFloat(speed) : null;
  await sql(
    `INSERT INTO fleet_positions (user_id, lat, lng, heading, speed) VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE lat = VALUES(lat), lng = VALUES(lng), heading = VALUES(heading),
       speed = VALUES(speed), updated_at = UTC_TIMESTAMP()`,
    [user.id, lat, lng, h, s]
  );

  const live = await sql(
    `SELECT id, rider_id FROM bookings WHERE provider_id = ? AND status IN (${LIVE_STATES.map(() => '?').join(',')})`,
    [user.id, ...LIVE_STATES]
  );
  live.forEach((b) => hub.toUser(b.rider_id, 'provider:position', { bookingId: b.id, lat, lng, heading: h }));
  hub.toStaff('fleet:position', { userId: user.id, role: user.role, lat, lng });
};

const setAvailability = async (user, availability, position) => {
  if (!['online', 'offline'].includes(availability)) throw badRequest('Availability must be "online" or "offline".');

  const profile = await one('SELECT availability FROM fleet_profiles WHERE user_id = ?', [user.id]);
  if (profile?.availability === 'busy') {
    if (availability === 'offline') throw conflict('Finish your current job before going offline.');
    return { availability: 'busy' };
  }

  await sql('UPDATE fleet_profiles SET availability = ? WHERE user_id = ?', [availability, user.id]);
  await sql('UPDATE users SET last_active_at = UTC_TIMESTAMP() WHERE id = ?', [user.id]);

  if (availability === 'offline') {
    await sql('DELETE FROM fleet_positions WHERE user_id = ?', [user.id]);
  } else if (position && isCoordinate(parseFloat(position.lat), parseFloat(position.lng))) {
    await updatePosition(user, { lat: parseFloat(position.lat), lng: parseFloat(position.lng) });
  }

  hub.toStaff('fleet:availability', { userId: user.id, role: user.role, availability });
  hub.toEveryone('fleet:supply_changed', { role: user.role });
  return { availability };
};

/** Today / this week / lifetime earnings for a provider. */
const earnings = async (userId) => {
  const period = (whereClause) =>
    one(
      `SELECT COUNT(*) AS jobs,
              COALESCE(SUM(final_fare), 0)      AS gross,
              COALESCE(SUM(provider_payout), 0) AS net,
              COALESCE(SUM(tip_amount), 0)      AS tips,
              COALESCE(SUM(distance_km), 0)     AS km
       FROM bookings WHERE provider_id = ? AND status = 'completed' AND ${whereClause}`,
      [userId]
    );

  const [today, week, lifetime, daily] = await Promise.all([
    period('completed_at >= UTC_DATE()'),
    period('completed_at >= DATE_SUB(UTC_DATE(), INTERVAL 6 DAY)'),
    period('1 = 1'),
    sql(
      `SELECT DATE(completed_at) AS day, COUNT(*) AS jobs, COALESCE(SUM(provider_payout + tip_amount), 0) AS net
       FROM bookings
       WHERE provider_id = ? AND status = 'completed' AND completed_at >= DATE_SUB(UTC_DATE(), INTERVAL 6 DAY)
       GROUP BY DATE(completed_at) ORDER BY day`,
      [userId]
    ),
  ]);
  const acceptance = await one(
    `SELECT COUNT(DISTINCT d.booking_id) AS offered,
            COUNT(DISTINCT bb.booking_id) AS bid_on
     FROM dispatch_log d
     LEFT JOIN booking_bids bb ON bb.booking_id = d.booking_id AND bb.provider_id = d.provider_id
     WHERE d.provider_id = ? AND d.sent_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)`,
    [userId]
  );
  return { today, week, lifetime, daily, acceptance };
};

module.exports = { updatePosition, setAvailability, earnings };
