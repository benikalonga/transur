'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { X, Check, Search, Loader2, MapPin, Navigation } from 'lucide-react';

// ── Leaflet (SSR-safe) ────────────────────────────────────────────────────────
const MapPickerInner = dynamic(() => import('./MapPickerInner'), { ssr: false });

const LBH = { lat: -11.6609, lng: 27.4794 };
const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

// ── Google Maps loader (singleton, safe to call multiple times) ───────────────
let googlePromise = null;
function loadGoogleMaps(apiKey) {
  if (googlePromise) return googlePromise;
  if (typeof window !== 'undefined' && window.google?.maps) {
    googlePromise = Promise.resolve(window.google.maps);
    return googlePromise;
  }
  googlePromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-gm]');
    if (existing) { existing.addEventListener('load', () => resolve(window.google.maps)); return; }
    const script = document.createElement('script');
    script.setAttribute('data-gm', '1');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&language=fr`;
    script.async = true;
    script.defer = true;
    script.onload  = () => resolve(window.google.maps);
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return googlePromise;
}

// ── Reverse geocode a lat/lng → address string ────────────────────────────────
async function reverseGeocode(lat, lng) {
  if (GOOGLE_KEY) {
    try {
      const maps = await loadGoogleMaps(GOOGLE_KEY);
      const geocoder = new maps.Geocoder();
      return await new Promise((resolve) => {
        geocoder.geocode({ location: { lat, lng }, language: 'fr' }, (results, status) => {
          if (status === maps.GeocoderStatus.OK && results[0]) {
            const parts = results[0].formatted_address.split(',').map((s) => s.trim()).filter(Boolean);
            resolve(parts.slice(0, 3).join(', '));
          } else {
            resolve(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
          }
        });
      });
    } catch {
      // fall through to Nominatim
    }
  }
  // Nominatim fallback
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=fr`,
      { headers: { 'User-Agent': 'Transur/1.0 (contact@transur.app)' } }
    );
    const data = await res.json();
    const { road, suburb, city, town, village, county } = data.address || {};
    const parts = [road, suburb || city || town || village || county].filter(Boolean);
    return parts.join(', ') || data.display_name?.split(',').slice(0, 2).join(', ') || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

// ── Forward search ────────────────────────────────────────────────────────────
async function searchPlaces(q, center) {
  if (q.length < 2) return [];

  if (GOOGLE_KEY) {
    try {
      const maps = await loadGoogleMaps(GOOGLE_KEY);
      const svc = new maps.places.AutocompleteService();
      const bounds = new maps.LatLngBounds(
        new maps.LatLng(center.lat - 0.5, center.lng - 0.5),
        new maps.LatLng(center.lat + 0.5, center.lng + 0.5)
      );
      return await new Promise((resolve) => {
        svc.getPlacePredictions(
          { input: q, bounds, componentRestrictions: { country: 'cd' }, language: 'fr' },
          (predictions, status) => {
            if (status !== maps.places.PlacesServiceStatus.OK || !predictions) { resolve([]); return; }
            resolve(predictions.map((p) => ({
              id: p.place_id,
              placeId: p.place_id,
              name: p.structured_formatting?.main_text || p.description,
              sub: p.structured_formatting?.secondary_text || '',
            })));
          }
        );
      });
    } catch { /* fall through */ }
  }

  // Nominatim fallback
  try {
    const vb = `${center.lng - 0.6},${center.lat - 0.6},${center.lng + 0.6},${center.lat + 0.6}`;
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=6&addressdetails=1&viewbox=${vb}&bounded=0&countrycodes=cd`,
      { headers: { 'Accept-Language': 'fr', 'User-Agent': 'Transur/1.0' } }
    );
    const data = await res.json();
    return data.map((p) => ({
      id: p.place_id,
      nominatim: true,
      lat: parseFloat(p.lat),
      lng: parseFloat(p.lon),
      name: p.display_name.split(',')[0],
      sub: p.display_name.split(',').slice(1, 3).map((s) => s.trim()).join(', '),
    }));
  } catch { return []; }
}

async function geocodePlaceId(placeId, fallback) {
  const maps = await loadGoogleMaps(GOOGLE_KEY);
  const geocoder = new maps.Geocoder();
  return new Promise((resolve) => {
    geocoder.geocode({ placeId, language: 'fr' }, (results, status) => {
      if (status === maps.GeocoderStatus.OK && results[0]) {
        const loc = results[0].geometry.location;
        const parts = results[0].formatted_address.split(',').map((s) => s.trim()).filter(Boolean);
        resolve({ address: parts.slice(0, 3).join(', ') || fallback, lat: loc.lat(), lng: loc.lng() });
      } else {
        resolve(null);
      }
    });
  });
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MapPickerModal({
  initialLocation,   // { lat, lng, address } or null
  userPosition,      // { lat, lng } or null
  onConfirm,         // ({ lat, lng, address }) => void
  onCancel,          // () => void
  accent = '#007DC5',
  label = 'Choisir sur la carte',
}) {
  const center = initialLocation || userPosition || LBH;

  const [pin, setPin]           = useState({ lat: center.lat, lng: center.lng });
  const [address, setAddress]   = useState(initialLocation?.address || '');
  const [resolving, setResolving] = useState(false);

  // Search bar
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef(null);
  const searchRef   = useRef(null);

  // Reverse geocode when pin changes (debounced)
  const rgRef = useRef(null);
  const handlePinChange = useCallback((latlng) => {
    setPin(latlng);
    setAddress('');
    clearTimeout(rgRef.current);
    rgRef.current = setTimeout(async () => {
      setResolving(true);
      const addr = await reverseGeocode(latlng.lat, latlng.lng);
      setAddress(addr);
      setResolving(false);
    }, 400);
  }, []);

  // Reverse geocode initial pin on open
  // Also reverse-geocode when the existing address is a UI placeholder (not a real street address)
  const PLACEHOLDER_ADDRESSES = ['Ma position actuelle', 'My current location', 'Position actuelle'];
  useEffect(() => {
    const needsGeocode = !initialLocation?.address ||
      PLACEHOLDER_ADDRESSES.some(p => initialLocation?.address?.startsWith(p));
    if (needsGeocode) {
      setResolving(true);
      reverseGeocode(center.lat, center.lng).then((addr) => {
        setAddress(addr);
        setResolving(false);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Search
  const handleSearchChange = (e) => {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(debounceRef.current);
    if (!q.trim()) { setResults([]); setShowResults(false); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const hits = await searchPlaces(q, pin);
      setResults(hits);
      setShowResults(hits.length > 0);
      setSearching(false);
    }, 350);
  };

  const handleResultSelect = async (item) => {
    setShowResults(false);
    setResults([]);
    setQuery('');
    searchRef.current?.blur();

    if (item.nominatim) {
      setPin({ lat: item.lat, lng: item.lng });
      const addr = await reverseGeocode(item.lat, item.lng);
      setAddress(addr);
    } else {
      setResolving(true);
      const geo = await geocodePlaceId(item.placeId, item.name);
      if (geo) {
        setPin({ lat: geo.lat, lng: geo.lng });
        setAddress(geo.address);
      }
      setResolving(false);
    }
  };

  const handleConfirm = () => {
    if (!address && resolving) return;
    onConfirm({ lat: pin.lat, lng: pin.lng, address: address || `${pin.lat.toFixed(5)}, ${pin.lng.toFixed(5)}` });
  };

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-white">

      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      {/* z-[1001] beats Leaflet's max internal z-index of 1000 (.leaflet-top) */}
      <div className="relative z-[1001] bg-white shadow-sm">
        {/* Title row */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-2">
          <button
            onClick={onCancel}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors flex-shrink-0"
          >
            <X size={18} className="text-gray-700" />
          </button>
          <span className="font-bold text-base text-gray-900 flex-1 truncate">{label}</span>
        </div>

        {/* Search bar */}
        <div className="px-4 pb-3 relative">
          <div className="flex items-center gap-2 bg-gray-100 rounded-2xl px-4 py-3">
            {searching
              ? <Loader2 size={16} className="text-gray-400 animate-spin flex-shrink-0" />
              : <Search size={16} className="text-gray-400 flex-shrink-0" />
            }
            <input
              ref={searchRef}
              value={query}
              onChange={handleSearchChange}
              onFocus={() => results.length > 0 && setShowResults(true)}
              placeholder="Rechercher une adresse…"
              className="flex-1 text-[14px] font-medium text-gray-900 placeholder-gray-400 focus:outline-none bg-transparent"
            />
            {query ? (
              <button onClick={() => { setQuery(''); setResults([]); setShowResults(false); }}>
                <X size={14} className="text-gray-400" />
              </button>
            ) : null}
          </div>

          {/* Dropdown results — fixed position so it always floats above the Leaflet map */}
          {showResults && results.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-[1002] max-h-52 overflow-y-auto">
              {results.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleResultSelect(item)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
                >
                  <div className="w-8 h-8 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <MapPin size={14} className="text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{item.name}</p>
                    {item.sub && <p className="text-xs text-gray-400 truncate mt-0.5">{item.sub}</p>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Map ────────────────────────────────────────────────────────────── */}
      <div className="flex-1 relative">
        <MapPickerInner
          pin={pin}
          onPinChange={handlePinChange}
          accent={accent}
        />

        {/* Fixed crosshair hint */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full pointer-events-none z-10"
          style={{ marginTop: '-4px' }}>
          {/* shadow dot under pin */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1 w-3 h-1.5 rounded-full bg-black/20 blur-[2px]" />
        </div>
      </div>

      {/* ── Bottom confirm bar ──────────────────────────────────────────────── */}
      <div className="relative bg-white border-t border-gray-100 px-4 pt-3 pb-6 z-[1001]">
        {/* Resolved address preview */}
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
            style={{ background: `${accent}15` }}>
            <MapPin size={16} style={{ color: accent }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-400 font-medium mb-0.5">Adresse sélectionnée</p>
            {resolving ? (
              <div className="flex items-center gap-2">
                <Loader2 size={13} className="animate-spin text-gray-400" />
                <span className="text-sm text-gray-400">Localisation…</span>
              </div>
            ) : (
              <p className="text-sm font-semibold text-gray-900 leading-snug">{address || '—'}</p>
            )}
          </div>
        </div>

        {/* Confirm button */}
        <button
          onClick={handleConfirm}
          disabled={resolving || !address}
          className="w-full py-4 rounded-2xl font-bold text-base text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          style={{ background: accent }}
        >
          <Check size={18} strokeWidth={2.5} />
          Confirmer ce lieu
        </button>
      </div>
    </div>
  );
}
