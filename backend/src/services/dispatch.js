const env = require('../config/env');
const { sql } = require('../db/pool');
const { SERVICE_ROLE } = require('../config/catalog');
const hub = require('../realtime/hub');
const { distanceKm } = require('../lib/geo');

/** Positions older than this are treated as stale (provider probably lost signal). */
const FRESH_MINUTES = 10;

/**
 * Available providers near a point, nearest first. Drivers must match the
 * requested vehicle class; couriers serve every parcel.
 */
const nearbyProviders = async ({ service, vehicleClass, lat, lng, radiusKm = env.dispatchRadiusKm, limit = 15 }) => {
  const role = SERVICE_ROLE[service];
  const classFilter = service === 'ride' ? 'AND fp.vehicle_class = ?' : '';
  const params = [lat, lng, lat, role, ...(service === 'ride' ? [vehicleClass] : []), radiusKm];

  return sql(
    `SELECT * FROM (
       SELECT u.id, u.full_name, fp.vehicle_class, fp.rating_avg, pos.lat, pos.lng,
              6371 * ACOS(LEAST(1,
                COS(RADIANS(?)) * COS(RADIANS(pos.lat)) * COS(RADIANS(pos.lng) - RADIANS(?))
                + SIN(RADIANS(?)) * SIN(RADIANS(pos.lat))
              )) AS distance_km
       FROM users u
       JOIN fleet_profiles fp ON fp.user_id = u.id
       JOIN fleet_positions pos ON pos.user_id = u.id
       LEFT JOIN wallets w ON w.user_id = u.id
       WHERE u.role = ?
         AND u.account_status = 'active'
         AND fp.availability = 'online'
         AND COALESCE(w.is_locked, 0) = 0
         AND pos.updated_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${FRESH_MINUTES} MINUTE)
         ${classFilter}
     ) candidates
     WHERE distance_km <= ?
     ORDER BY distance_km
     LIMIT ${Number(limit)}`,
    params
  );
};

/** What a provider sees on an incoming request card. */
const requestCard = (b, distanceToPickup) => ({
  bookingId: b.id,
  service: b.service,
  vehicleClass: b.vehicle_class,
  pickup: { address: b.pickup_address, lat: b.pickup_lat, lng: b.pickup_lng },
  dropoff: { address: b.dropoff_address, lat: b.dropoff_lat, lng: b.dropoff_lng },
  distanceKm: b.distance_km,
  durationMin: b.duration_min,
  riderOffer: b.rider_offer,
  quotedFare: b.quoted_fare,
  floorFare: b.floor_fare,
  paymentMethod: b.payment_method,
  parcelSize: b.parcel_size,
  parcelDetails: b.parcel_details,
  note: b.rider_note,
  distanceToPickupKm: distanceToPickup != null ? Math.round(distanceToPickup * 10) / 10 : null,
  expiresInSec: env.requestTtlMinutes * 60,
});

/** Send a booking to nearby providers. Returns how many were reached. */
const broadcast = async (booking) => {
  const providers = await nearbyProviders({
    service: booking.service,
    vehicleClass: booking.vehicle_class,
    lat: booking.pickup_lat,
    lng: booking.pickup_lng,
  });

  providers.forEach((p) => hub.toUser(p.id, 'booking:new', requestCard(booking, p.distance_km)));

  if (providers.length) {
    const placeholders = providers.map(() => '(?, ?, ?)').join(', ');
    const values = providers.flatMap((p) => [booking.id, p.id, Math.round(p.distance_km * 100) / 100]);
    sql(`INSERT INTO dispatch_log (booking_id, provider_id, distance_km) VALUES ${placeholders}`, values)
      .catch((err) => console.warn('[dispatch] log failed:', err.message));
  }
  return providers.length;
};

/** Requests still open near a provider (used when they come online or reconnect). */
const openRequestsFor = async (providerId) => {
  const rows = await sql(
    `SELECT b.*, u.role, fp.vehicle_class AS provider_class, pos.lat AS plat, pos.lng AS plng
     FROM users u
     JOIN fleet_profiles fp ON fp.user_id = u.id
     JOIN fleet_positions pos ON pos.user_id = u.id
     JOIN bookings b ON b.status = 'searching'
       AND b.service = IF(u.role = 'driver', 'ride', 'parcel')
       AND (u.role = 'courier' OR b.vehicle_class = fp.vehicle_class)
     WHERE u.id = ?
     ORDER BY b.broadcast_at DESC
     LIMIT 20`,
    [providerId]
  );
  return rows
    .map((b) => ({ b, d: distanceKm({ lat: b.plat, lng: b.plng }, { lat: b.pickup_lat, lng: b.pickup_lng }) }))
    .filter(({ d }) => d <= env.dispatchRadiusKm)
    .map(({ b, d }) => requestCard(b, d));
};

module.exports = { nearbyProviders, broadcast, requestCard, openRequestsFor };
