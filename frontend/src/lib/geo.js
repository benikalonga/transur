const [cLat, cLng] = (process.env.NEXT_PUBLIC_MAP_CENTER || '0,0').split(',').map(Number);
export const DEFAULT_CENTER = { lat: cLat, lng: cLng };
export const SEARCH_COUNTRY = process.env.NEXT_PUBLIC_SEARCH_COUNTRY || '';

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
  new Promise((resolve, reject) => {
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

/** Road route between two points from the public OSRM server (null if unavailable). */
export const fetchRoute = async (from, to) => {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=simplified&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    const route = data.routes?.[0];
    if (!route) return null;
    return {
      points: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      km: route.distance / 1000,
      min: Math.round(route.duration / 60),
    };
  } catch {
    return null;
  }
};

/** Free-text place search (OpenStreetMap Nominatim), nearest results first. */
export const searchPlaces = async (text, near = DEFAULT_CENTER) => {
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
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { 'Accept-Language': 'en' } });
  if (!res.ok) return [];
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
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const data = await res.json();
    return data.display_name?.split(',').slice(0, 3).map((s) => s.trim()).join(', ') || 'Pinned location';
  } catch {
    return 'Pinned location';
  }
};
