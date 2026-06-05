const { query } = require('../config/database');

// Haversine in pure JS — distance entre deux points GPS (km)
const haversineDistance = (lat1, lng1, lat2, lng2) => {
  const R    = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ETA en minutes
const estimateETA = (distanceKm, avgSpeedKmh = 30) =>
  Math.ceil((distanceKm / avgSpeedKmh) * 60);

// Trouve les chauffeurs/livreurs disponibles dans un rayon
const findNearbyDrivers = async (lat, lng, serviceType = 'taxi', radiusKm = 50) => {
  const role = serviceType === 'taxi' ? 'driver' : 'delivery';

  // Haversine dans MySQL (sans PostGIS)
  const { rows } = await query(
    `SELECT
       u.id, u.name, u.phone, u.fcm_token,
       dl.latitude, dl.longitude,
       ROUND(
         6371 * ACOS(
           COS(RADIANS(?)) * COS(RADIANS(dl.latitude))
           * COS(RADIANS(dl.longitude) - RADIANS(?))
           + SIN(RADIANS(?)) * SIN(RADIANS(dl.latitude))
         ), 2
       ) AS distance_km,
       COALESCE(dp.rating, dlp.rating, 5.0) AS rating,
       COALESCE(w.is_blocked, 0)             AS wallet_blocked,
       COALESCE(dp.status, dlp.status)       AS driver_status
     FROM users u
     JOIN driver_locations dl ON u.id = dl.user_id
     LEFT JOIN driver_profiles  dp  ON u.id = dp.user_id
     LEFT JOIN delivery_profiles dlp ON u.id = dlp.user_id
     LEFT JOIN wallets w ON u.id = w.user_id
     WHERE
       u.role   = ?
       AND u.status = 'active'
       AND COALESCE(w.is_blocked, 0) = 0
       AND COALESCE(dp.status, dlp.status) = 'online'
       AND dl.updated_at > DATE_SUB(NOW(), INTERVAL 10 MINUTE)
       AND (
         6371 * ACOS(
           COS(RADIANS(?)) * COS(RADIANS(dl.latitude))
           * COS(RADIANS(dl.longitude) - RADIANS(?))
           + SIN(RADIANS(?)) * SIN(RADIANS(dl.latitude))
         )
       ) <= ?
     ORDER BY distance_km ASC
     LIMIT 10`,
    [lat, lng, lat, role, lat, lng, lat, radiusKm]
  );
  return rows;
};

// Estime le tarif selon la config en base
const estimateFare = async (distanceKm, serviceType = 'taxi', city = 'lubumbashi') => {
  const { rows } = await query(
    'SELECT * FROM pricing_config WHERE service_type = ? AND city = ? AND is_active = 1 LIMIT 1',
    [serviceType, city]
  );
  if (!rows[0]) throw new Error('Tarification non configurée');

  const { base_fare, per_km_rate, minimum_fare, commission_rate } = rows[0];
  const raw      = parseFloat(base_fare) + distanceKm * parseFloat(per_km_rate);
  const fare     = Math.max(raw, parseFloat(minimum_fare));
  const commission = (fare * parseFloat(commission_rate)) / 100;
  const earnings   = fare - commission;

  return {
    fare:            Math.round(fare     * 100) / 100,
    commission:      Math.round(commission * 100) / 100,
    earnings:        Math.round(earnings   * 100) / 100,
    commission_rate: parseFloat(commission_rate),
  };
};

// Retourne le tarif minimum absolu pour un service
const getMinPrice = async (serviceType = 'taxi', city = 'lubumbashi') => {
  const { rows } = await query(
    'SELECT minimum_fare FROM pricing_config WHERE service_type=? AND city=? AND is_active=1 LIMIT 1',
    [serviceType, city]
  );
  return rows[0] ? parseFloat(rows[0].minimum_fare) : 2.00;
};

module.exports = { findNearbyDrivers, estimateFare, haversineDistance, estimateETA, getMinPrice };
