'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import { MapPin, X, Loader2, Navigation, Map } from 'lucide-react';

// ── Google Maps loader (singleton) ────────────────────────────────────────────
let googlePromise = null;
function loadGoogleMaps(apiKey) {
  if (googlePromise) return googlePromise;
  if (typeof window !== 'undefined' && window.google?.maps) {
    googlePromise = Promise.resolve(window.google.maps);
    return googlePromise;
  }
  googlePromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&language=fr`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google.maps);
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return googlePromise;
}

// ── Haversine (Nominatim fallback sorting) ────────────────────────────────────
const haversine = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const LBH = { lat: -11.6609, lng: 27.4794 };
const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

export default function LocationInput({
  value = '',
  onSelect,
  placeholder = 'Rechercher un lieu…',
  dotColor = '#007DC5',
  userPosition = null,
  accent = '#007DC5',
  className = '',
  autoFocus = false,
  inputRef: externalRef = null,
  onMapOpen = null,   // () => void — if provided, shows the map button
}) {
  const [query, setQuery]     = useState(value);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen]       = useState(false);
  const debounceRef = useRef(null);
  const wrapRef     = useRef(null);
  const internalRef = useRef(null);
  const inputRef    = externalRef || internalRef;

  // Sync external value
  useEffect(() => { setQuery(value); }, [value]);

  // Close on outside click
  useEffect(() => {
    const h = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // ── Google Places search ──────────────────────────────────────────────────
  const searchGoogle = useCallback(async (q) => {
    const maps = await loadGoogleMaps(GOOGLE_KEY);
    const center = userPosition || LBH;
    const svc = new maps.places.AutocompleteService();
    const bounds = new maps.LatLngBounds(
      new maps.LatLng(center.lat - 0.5, center.lng - 0.5),
      new maps.LatLng(center.lat + 0.5, center.lng + 0.5)
    );

    return new Promise((resolve) => {
      svc.getPlacePredictions(
        {
          input: q,
          bounds,
          componentRestrictions: { country: 'cd' },
          language: 'fr',
        },
        (predictions, status) => {
          if (status !== maps.places.PlacesServiceStatus.OK || !predictions) {
            resolve([]);
            return;
          }
          resolve(predictions.map((p) => ({
            _id: p.place_id,
            _placeId: p.place_id,
            _name: p.structured_formatting?.main_text || p.description,
            _sub: p.structured_formatting?.secondary_text || '',
            _desc: p.description,
          })));
        }
      );
    });
  }, [userPosition]);

  // ── Geocode a place_id → { lat, lng, address } ────────────────────────────
  const geocodePlaceId = useCallback(async (placeId, fallbackName) => {
    const maps = await loadGoogleMaps(GOOGLE_KEY);
    const geocoder = new maps.Geocoder();
    return new Promise((resolve) => {
      geocoder.geocode({ placeId, language: 'fr' }, (results, status) => {
        if (status === maps.GeocoderStatus.OK && results[0]) {
          const loc = results[0].geometry.location;
          const parts = results[0].formatted_address.split(',').map((s) => s.trim()).filter(Boolean);
          resolve({
            address: parts.slice(0, 3).join(', ') || fallbackName,
            lat: loc.lat(),
            lng: loc.lng(),
          });
        } else {
          resolve({ address: fallbackName, lat: LBH.lat, lng: LBH.lng });
        }
      });
    });
  }, []);

  // ── Nominatim fallback ────────────────────────────────────────────────────
  const searchNominatim = useCallback(async (q) => {
    const center = userPosition || LBH;
    const vb = `${center.lng - 0.6},${center.lat - 0.6},${center.lng + 0.6},${center.lat + 0.6}`;
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=8&addressdetails=1&viewbox=${vb}&bounded=0&countrycodes=cd`;
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'fr', 'User-Agent': 'Transur/1.0 (contact@transur.app)' },
    });
    if (!res.ok) throw new Error();
    const data = await res.json();
    const sorted = data
      .map((p) => ({
        ...p,
        _dist: haversine(center.lat, center.lng, parseFloat(p.lat), parseFloat(p.lon)),
      }))
      .sort((a, b) => a._dist - b._dist);
    return sorted;
  }, [userPosition]);

  // ── Main search dispatcher ────────────────────────────────────────────────
  const search = useCallback(async (q) => {
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    try {
      if (GOOGLE_KEY) {
        const hits = await searchGoogle(q);
        setResults(hits);
        setOpen(hits.length > 0);
      } else {
        const hits = await searchNominatim(q);
        setResults(hits);
        setOpen(hits.length > 0);
      }
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  }, [searchGoogle, searchNominatim]);

  const handleChange = (e) => {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(q), 350);
  };

  // ── Selection ─────────────────────────────────────────────────────────────
  const handleSelect = async (item) => {
    setOpen(false);
    setResults([]);

    if (GOOGLE_KEY && item._placeId) {
      setLoading(true);
      try {
        setQuery(item._name);
        const result = await geocodePlaceId(item._placeId, item._name);
        setQuery(result.address);
        onSelect?.(result);
      } catch {
        onSelect?.({ address: item._name, lat: LBH.lat, lng: LBH.lng });
      } finally {
        setLoading(false);
      }
    } else {
      // Nominatim result
      const parts = item.display_name.split(',').map((s) => s.trim()).filter(Boolean);
      const label = parts.slice(0, 3).join(', ');
      setQuery(label);
      onSelect?.({ address: label, lat: parseFloat(item.lat), lng: parseFloat(item.lon) });
    }
  };

  const clear = () => {
    setQuery('');
    setResults([]);
    setOpen(false);
    onSelect?.(null);
    inputRef.current?.focus();
  };

  const fmtDist = (d) => d == null ? '' : d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`;

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      {/* Input row */}
      <div
        className="flex items-center gap-3 bg-[#f5f5f5] rounded-2xl px-4 py-3.5 transition-all"
        style={{ outline: open ? `2px solid ${accent}` : '2px solid transparent' }}
      >
        {/* Colored dot indicator */}
        <div className="flex-shrink-0 w-2.5 h-2.5 rounded-full" style={{ background: dotColor }} />

        <input
          ref={inputRef}
          value={query}
          onChange={handleChange}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="flex-1 text-[15px] font-medium text-gray-900 placeholder-gray-400 focus:outline-none bg-transparent leading-none"
        />

        {loading ? (
          <Loader2 size={16} className="flex-shrink-0 text-gray-400 animate-spin" />
        ) : (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {query && (
              <button type="button" onClick={clear}
                className="w-5 h-5 bg-gray-300 rounded-full flex items-center justify-center">
                <X size={10} className="text-gray-600" strokeWidth={3} />
              </button>
            )}
            {onMapOpen && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onMapOpen(); }}
                title="Choisir sur la carte"
                className="w-7 h-7 rounded-xl flex items-center justify-center transition-colors hover:bg-gray-200"
                style={{ color: accent }}
              >
                <Map size={15} strokeWidth={2} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Dropdown */}
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-[9999] max-h-56 overflow-y-auto">
          {results.map((item, i) => {
            const isGoogle = GOOGLE_KEY && item._placeId;
            const name = isGoogle ? item._name : (item.display_name.split(',')[0] || '');
            const sub  = isGoogle
              ? item._sub
              : item.display_name.split(',').slice(1, 4).map((s) => s.trim()).join(', ');
            const dist = item._dist;

            return (
              <button
                key={item._id || item.place_id || i}
                type="button"
                onClick={() => handleSelect(item)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0"
              >
                <div className="w-8 h-8 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <MapPin size={14} className="text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{name}</p>
                  {sub && <p className="text-xs text-gray-400 truncate mt-0.5">{sub}</p>}
                </div>
                {dist != null && (
                  <span className="text-xs font-bold flex-shrink-0 ml-1" style={{ color: accent }}>
                    {fmtDist(dist)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
