'use client';
// Always imported through components/map/index.js with { ssr: false }.
import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { DEFAULT_CENTER, OFFLINE_MODE } from '@/lib/geo';

const dot = (color, size = 18, pulse = false) =>
  L.divIcon({
    className: 'tsp-marker',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="position:relative;width:${size}px;height:${size}px">
      ${pulse ? `<div class="animate-radar" style="position:absolute;inset:-8px;border-radius:50%;background:${color};opacity:.35"></div>` : ''}
      <div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35)"></div>
    </div>`,
  });

const square = (color) =>
  L.divIcon({
    className: 'tsp-marker',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    html: `<div style="width:20px;height:20px;border-radius:5px;background:${color};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35)"></div>`,
  });

const vehicle = (heading = 0) =>
  L.divIcon({
    className: 'tsp-marker',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    html: `<div style="width:34px;height:34px;border-radius:50%;background:#0E0E1A;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,.4);transform:rotate(${heading || 0}deg)">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="#FFB020"><path d="M12 2l7 19-7-4-7 4z"/></svg>
    </div>`,
  });

const ICONS = {
  me: () => dot('#5B3DF5', 16, true),
  pickup: () => dot('#5B3DF5', 20),
  dropoff: () => square('#0E0E1A'),
  fleetOnline: () => dot('#10B981', 14),
  fleetBusy: () => dot('#F59E0B', 14),
  request: () => dot('#EF4444', 14),
};

function Camera({ points, padTop, padBottom, follow }) {
  const map = useMap();
  const lastKey = useRef('');
  useEffect(() => {
    const valid = points.filter(Boolean);
    const key = valid.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join('|');
    if (!valid.length || (key === lastKey.current && !follow)) return;
    lastKey.current = key;
    if (valid.length === 1) {
      map.flyTo([valid[0].lat, valid[0].lng], Math.max(map.getZoom(), 15), { duration: 0.6 });
    } else {
      map.fitBounds(L.latLngBounds(valid.map((p) => [p.lat, p.lng])), {
        paddingTopLeft: [40, padTop],
        paddingBottomRight: [40, padBottom + 30],
        maxZoom: 16,
      });
    }
  }, [points, padTop, padBottom, follow, map]);
  return null;
}

function CenterReporter({ onMove }) {
  const map = useMapEvents({
    moveend: () => {
      const c = map.getCenter();
      onMove({ lat: c.lat, lng: c.lng });
    },
  });
  return null;
}

/**
 * Generic map used everywhere in the app.
 * markers: [{ id, lat, lng, kind: 'me'|'pickup'|'dropoff'|'vehicle'|'fleetOnline'|'fleetBusy'|'request', heading, onClick }]
 */
export default function LeafletMap({
  markers = [],
  route,
  fitTo,
  padBottom = 300,
  padTop = 90,
  center,
  zoom = 14,
  onCenterChange,
  follow = false,
  interactive = true,
}) {
  const start = center || markers[0] || DEFAULT_CENTER;
  return (
    <MapContainer
      center={[start.lat, start.lng]}
      zoom={zoom}
      zoomControl={false}
      attributionControl={false}
      dragging={interactive}
      scrollWheelZoom={interactive}
      style={{ width: '100%', height: '100%' }}
      className={OFFLINE_MODE ? 'map-offline' : undefined}
    >
      {!OFFLINE_MODE && <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />}
      {fitTo && <Camera points={fitTo} padTop={padTop} padBottom={padBottom} follow={follow} />}
      {onCenterChange && <CenterReporter onMove={onCenterChange} />}
      {route?.length > 1 && (
        <>
          <Polyline positions={route} pathOptions={{ color: '#0E0E1A', weight: 7, opacity: 0.15 }} />
          <Polyline positions={route} pathOptions={{ color: '#5B3DF5', weight: 4.5, lineCap: 'round', lineJoin: 'round' }} />
        </>
      )}
      {markers.filter((m) => m && Number.isFinite(m.lat)).map((m) => (
        <Marker
          key={m.id || `${m.kind}-${m.lat}-${m.lng}`}
          position={[m.lat, m.lng]}
          icon={m.kind === 'vehicle' ? vehicle(m.heading) : (ICONS[m.kind] || ICONS.pickup)()}
          zIndexOffset={m.kind === 'vehicle' ? 500 : 100}
          eventHandlers={m.onClick ? { click: m.onClick } : undefined}
        />
      ))}
    </MapContainer>
  );
}
