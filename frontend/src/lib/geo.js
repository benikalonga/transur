import { OFFLINE_PLACES } from './offlinePlaces';

const [cLat, cLng] = (process.env.NEXT_PUBLIC_MAP_CENTER || '0,0').split(',').map(Number);
export const DEFAULT_CENTER = { lat: cLat, lng: cLng };
export const SEARCH_COUNTRY = process.env.NEXT_PUBLIC_SEARCH_COUNTRY || '';

/**
 * Offline mode: no map tiles, no online routing or address search, and a demo
 * location when the device has no GPS. For machines without internet access.
 */
export const OFFLINE_MODE = process.env.NEXT_PUBLIC_OFFLINE_MODE === '1';

const withTimeout = (ms) => {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
};

/** A position near the map centre, used when GPS is unavailable in offline mode. */
export const demoLocation = (jitterKm = 0) => {
  const deg = jitterKm / 111;
  return {
    lat: DEFAULT_CENTER.lat + (Math.random() - 0.5) * 2 * deg,
    lng: DEFAULT_CENTER.lng + (Math.random() - 0.5) * 2 * deg,
    heading: null,
    speed: null,
    demo: true,
  };
};

export const distanceKm = (a, b) => {
  const r = (d) => (d * Math.PI) / 180;
  const dLat = r(b.lat - a.lat);
  const dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

/**
 * One GPS reading. Tries high accuracy first and falls back to a coarse fix,
 * which works better indoors and on low-end phones.
 */
export const locateOnce = () =>
  new Promise((resolve, rawReject) => {
    const reject = (err) => (OFFLINE_MODE ? resolve(demoLocation(0.3)) : rawReject(err));
    if (OFFLINE_MODE) setTimeout(() => resolve(demoLocation(0.3)), 4000); // first answer wins
    if (typeof navigator === 'undefined' || !navigator.geolocation) return reject(new Error('GPS is not available on this device.'));
    const done = ({ coords }) => resolve({ lat: coords.latitude, lng: coords.longitude, heading: coords.heading, speed: coords.speed });
    navigator.geolocation.getCurrentPosition(done, () => {
      navigator.geolocation.getCurrentPosition(done, () => reject(new Error('We could not find your location.')), {
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 120000,
      });
    }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 });
  });

/** Straight line between two points, with a rough city driving time (25 km/h). */
const straightRoute = (from, to) => {
  const km = distanceKm(from, to) * 1.3; // roads are longer than a straight line
  return { points: [[from.lat, from.lng], [to.lat, to.lng]], km, min: Math.max(1, Math.round((km / 25) * 60)), straight: true };
};

/** Road route from the public OSRM server, or a straight line when offline or unavailable. */
export const fetchRoute = async (from, to) => {
  if (OFFLINE_MODE) return straightRoute(from, to);
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=simplified&geometries=geojson`;
    const res = await fetch(url, { signal: withTimeout(8000) });
    const data = await res.json();
    const route = data.routes?.[0];
    if (!route) return straightRoute(from, to);
    return {
      points: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      km: route.distance / 1000,
      min: Math.round(route.duration / 60),
    };
  } catch {
    return straightRoute(from, to);
  }
};

/** Free-text place search (OpenStreetMap Nominatim), nearest results first. */
export const searchPlaces = async (text, near = DEFAULT_CENTER) => {
  const typed = parseCoordinates(text);
  if (typed) return [{ id: 'typed', title: 'Coordinates', subtitle: `${typed.lat}, ${typed.lng}`, address: `${typed.lat}, ${typed.lng}`, ...typed, distance: distanceKm(near, typed) }];
  if (OFFLINE_MODE) return searchOfflinePlaces(text, near);
  try {
    return await searchOnline(text, near);
  } catch {
    return searchOfflinePlaces(text, near);
  }
};

/** "-11.66, 27.48" typed into the search box. */
const parseCoordinates = (text) => {
  const m = String(text).trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
};

const normalize = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Search the built-in list of places (works with no internet). */
const searchOfflinePlaces = (text, near) => {
  const q = normalize(text.trim());
  if (!q) return [];
  return OFFLINE_PLACES
    .filter((p) => normalize(`${p.name} ${p.area}`).includes(q))
    .map((p, i) => ({
      id: `offline-${i}`,
      title: p.name,
      subtitle: p.area,
      address: `${p.name}, ${p.area}`,
      lat: p.lat,
      lng: p.lng,
      distance: distanceKm(near, p),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 8);
};

const searchOnline = async (text, near) => {
  const box = `${near.lng - 0.5},${near.lat - 0.5},${near.lng + 0.5},${near.lat + 0.5}`;
  const params = new URLSearchParams({
    format: 'jsonv2',
    q: text,
    limit: '8',
    viewbox: box,
    bounded: '0',
    addressdetails: '0',
  });
  if (SEARCH_COUNTRY) params.set('countrycodes', SEARCH_COUNTRY);
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { 'Accept-Language': 'en' },
    signal: withTimeout(8000),
  });
  if (!res.ok) throw new Error('search unavailable');
  const rows = await res.json();
  return rows
    .map((p) => {
      const parts = p.display_name.split(',').map((s) => s.trim());
      const point = { lat: parseFloat(p.lat), lng: parseFloat(p.lon) };
      return {
        id: p.place_id,
        title: parts[0],
        subtitle: parts.slice(1, 4).join(', '),
        address: parts.slice(0, 3).join(', '),
        ...point,
        distance: distanceKm(near, point),
      };
    })
    .sort((a, b) => a.distance - b.distance);
};

/** Coordinates → short address (Nominatim reverse geocoding). */
export const reverseGeocode = async ({ lat, lng }) => {
  if (OFFLINE_MODE) return nearestPlaceLabel({ lat, lng });
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18`,
      { headers: { 'Accept-Language': 'en' }, signal: withTimeout(8000) }
    );
    const data = await res.json();
    return data.display_name?.split(',').slice(0, 3).map((s) => s.trim()).join(', ') || nearestPlaceLabel({ lat, lng });
  } catch {
    return nearestPlaceLabel({ lat, lng });
  }
};

/** "Near Gare de Lubumbashi" from the built-in list, or the coordinates. */
const nearestPlaceLabel = (point) => {
  let best = null;
  for (const p of OFFLINE_PLACES) {
    const d = distanceKm(point, p);
    if (!best || d < best.d) best = { p, d };
  }
  if (best && best.d <= 1.5) return `Near ${best.p.name}, ${best.p.area}`;
  return `Pinned location (${point.lat.toFixed(5)}, ${point.lng.toFixed(5)})`;
};
