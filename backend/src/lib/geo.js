const EARTH_RADIUS_KM = 6371;
const toRad = (deg) => (deg * Math.PI) / 180;

/** Great-circle distance between two coordinates, in kilometres. */
const distanceKm = (a, b) => {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

/**
 * Road distance is longer than the straight line; a 1.3 detour factor is a
 * reasonable city average when no routing engine is available server-side.
 */
const roadDistanceKm = (a, b) => distanceKm(a, b) * 1.3;

/** Travel time in minutes at an average speed (km/h). */
const travelMinutes = (km, avgSpeedKmh = 28) => Math.max(1, Math.ceil((km / avgSpeedKmh) * 60));

const isCoordinate = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/** Parse `{prefix}_lat` / `{prefix}_lng` style fields into a point, or null. */
const readPoint = (body, prefix) => {
  const lat = parseFloat(body[`${prefix}_lat`]);
  const lng = parseFloat(body[`${prefix}_lng`]);
  return isCoordinate(lat, lng) ? { lat, lng } : null;
};

module.exports = { distanceKm, roadDistanceKm, travelMinutes, isCoordinate, readPoint };
