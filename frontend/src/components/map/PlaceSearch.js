'use client';
import { useEffect, useRef, useState } from 'react';
import { Briefcase, Home, LocateFixed, MapPin, MapPinned, Search, Star, X } from 'lucide-react';
import { searchPlaces } from '@/lib/geo';
import { km } from '@/lib/format';
import { Spinner } from '@/components/ui';

const PLACE_ICON = { home: Home, work: Briefcase, other: Star };

/**
 * Address field with live suggestions, saved places, "use my location" and a
 * shortcut to drop a pin on the map.
 */
export default function PlaceSearch({
  value,
  onSelect,
  placeholder,
  marker = 'pickup',
  near,
  savedPlaces = [],
  onUseLocation,
  onPickOnMap,
  autoFocus,
}) {
  const [text, setText] = useState(value?.address || '');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(false);
  const timer = useRef(null);
  const wrap = useRef(null);

  useEffect(() => setText(value?.address || ''), [value?.address]);

  useEffect(() => {
    const close = (e) => wrap.current && !wrap.current.contains(e.target) && setFocused(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  const onType = (q) => {
    setText(q);
    clearTimeout(timer.current);
    if (q.trim().length < 3) return setResults([]);
    timer.current = setTimeout(async () => {
      setBusy(true);
      try {
        setResults(await searchPlaces(q, near || undefined));
      } catch {
        setResults([]);
      } finally {
        setBusy(false);
      }
    }, 400); // debounced: Nominatim allows ~1 request per second
  };

  const choose = (place) => {
    setText(place.address);
    setResults([]);
    setFocused(false);
    onSelect({ address: place.address, lat: place.lat, lng: place.lng });
  };

  const showPanel = focused && (results.length > 0 || (!text && (savedPlaces.length || onUseLocation)));

  return (
    <div ref={wrap} className="relative">
      <div className="flex items-center gap-3 rounded-xl bg-canvas px-4 py-3 focus-within:bg-white focus-within:ring-2 focus-within:ring-brand-400">
        {marker === 'pickup' ? (
          <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-brand-500 ring-4 ring-brand-100" />
        ) : (
          <span className="h-2.5 w-2.5 flex-shrink-0 rounded-[3px] bg-ink ring-4 ring-ink/10" />
        )}
        <input
          value={text}
          onChange={(e) => onType(e.target.value)}
          onFocus={() => setFocused(true)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="min-w-0 flex-1 bg-transparent text-[15px] font-medium outline-none placeholder:text-ink-faint"
        />
        {busy && <Spinner size={16} className="text-ink-faint" />}
        {!busy && text && (
          <button type="button" onClick={() => { setText(''); setResults([]); onSelect(null); }} aria-label="Clear" className="rounded-full bg-line p-0.5">
            <X size={12} />
          </button>
        )}
        {onPickOnMap && (
          <button type="button" onClick={onPickOnMap} aria-label="Pick on map" className="text-brand-500">
            <MapPinned size={18} />
          </button>
        )}
      </div>

      {showPanel && (
        <div className="absolute left-0 right-0 top-full z-[1200] mt-2 max-h-72 overflow-y-auto rounded-2xl border border-line bg-white shadow-float">
          {!text && onUseLocation && (
            <button type="button" onClick={() => { setFocused(false); onUseLocation(); }} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-canvas">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-500"><LocateFixed size={16} /></span>
              <span className="text-sm font-semibold">Use my current location</span>
            </button>
          )}
          {!text && savedPlaces.map((p) => {
            const Icon = PLACE_ICON[p.kind] || Star;
            return (
              <button type="button" key={p.id} onClick={() => choose(p)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-canvas">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-canvas"><Icon size={16} /></span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{p.label}</span>
                  <span className="block truncate text-xs text-ink-muted">{p.address}</span>
                </span>
              </button>
            );
          })}
          {results.map((r) => (
            <button type="button" key={r.id} onClick={() => choose(r)} className="flex w-full items-center gap-3 border-t border-line/60 px-4 py-3 text-left first:border-0 hover:bg-canvas">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-canvas"><MapPin size={16} className="text-ink-muted" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{r.title}</span>
                <span className="block truncate text-xs text-ink-muted">{r.subtitle}</span>
              </span>
              <span className="text-xs font-semibold text-brand-500">{km(r.distance)}</span>
            </button>
          ))}
          {text && !busy && results.length === 0 && (
            <p className="flex items-center gap-2 px-4 py-3 text-sm text-ink-muted"><Search size={14} /> Keep typing, or pick the spot on the map.</p>
          )}
        </div>
      )}
    </div>
  );
}
