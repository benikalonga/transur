'use client';
// This file is always loaded with { ssr: false } via next/dynamic
import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';

const LBH = [-11.6609, 27.4794];

// ── Icon factories ────────────────────────────────────────────────────────────
function circleIcon(color, size = 18, pulse = false) {
  const ringHtml = pulse
    ? `<div style="position:absolute;inset:-6px;border-radius:50%;background:${color};opacity:0.2;animation:ping 1.6s ease-out infinite"></div>`
    : '';
  return L.divIcon({
    className: '',
    html: `<div style="position:relative;width:${size}px;height:${size}px">
      ${ringHtml}
      <div style="width:${size}px;height:${size}px;background:${color};border:3px solid white;border-radius:50%;box-shadow:0 2px 10px rgba(0,0,0,0.35)"></div>
    </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function destIcon(color = '#CE1126') {
  const s = 26;
  return L.divIcon({
    className: '',
    html: `<div style="width:${s}px;height:${s + 8}px;display:flex;flex-direction:column;align-items:center">
      <div style="width:${s}px;height:${s}px;background:${color};border:3px solid white;border-radius:50%;box-shadow:0 2px 10px rgba(0,0,0,0.35)"></div>
      <div style="width:3px;height:8px;background:${color};border-radius:0 0 2px 2px"></div>
    </div>`,
    iconSize: [s, s + 8],
    iconAnchor: [s / 2, s + 8],
  });
}

// ── MapController — handles camera ──────────────────────────────────────────
function MapController({ pickup, dropoff, userPos, sheetHeight }) {
  const map = useMap();
  const prevKey = useRef('');

  useEffect(() => {
    const key = `${pickup?.lat},${pickup?.lng}|${dropoff?.lat},${dropoff?.lng}`;
    if (key === prevKey.current) return;
    prevKey.current = key;

    if (pickup && dropoff) {
      const bounds = L.latLngBounds(
        [pickup.lat, pickup.lng],
        [dropoff.lat, dropoff.lng]
      );
      map.fitBounds(bounds, {
        paddingTopLeft: [48, 80],
        paddingBottomRight: [48, (sheetHeight || 300) + 24],
        maxZoom: 16,
        animate: true,
      });
    } else if (pickup) {
      map.flyTo([pickup.lat, pickup.lng], 15, { animate: true, duration: 0.7 });
    } else if (dropoff) {
      map.flyTo([dropoff.lat, dropoff.lng], 15, { animate: true, duration: 0.7 });
    } else if (userPos) {
      map.flyTo([userPos.lat, userPos.lng], 15, { animate: true, duration: 0.7 });
    }
  }, [pickup, dropoff, userPos, sheetHeight, map]);

  return null;
}

// ── Main export ──────────────────────────────────────────────────────────────
export default function TripMap({
  pickup,
  dropoff,
  userPos,
  route,
  sheetHeight = 300,
  accentColor = '#007DC5',
}) {
  const center = userPos || pickup || { lat: LBH[0], lng: LBH[1] };

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={15}
      style={{ width: '100%', height: '100%' }}
      zoomControl={false}
      attributionControl={false}
    >
      {/* Tile layer — clean OSM */}
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />

      <MapController
        pickup={pickup}
        dropoff={dropoff}
        userPos={userPos}
        sheetHeight={sheetHeight}
      />

      {/* User location dot (pulsing) */}
      {userPos && (
        <Marker
          position={[userPos.lat, userPos.lng]}
          icon={circleIcon(accentColor, 16, true)}
          zIndexOffset={50}
        />
      )}

      {/* Pickup marker */}
      {pickup && (
        <Marker
          position={[pickup.lat, pickup.lng]}
          icon={circleIcon(accentColor, 22)}
          zIndexOffset={200}
        />
      )}

      {/* Dropoff marker */}
      {dropoff && (
        <Marker
          position={[dropoff.lat, dropoff.lng]}
          icon={destIcon(accentColor === '#007DC5' ? '#CE1126' : '#007DC5')}
          zIndexOffset={200}
        />
      )}

      {/* Route polyline */}
      {route && route.length > 1 && (
        <Polyline
          positions={route}
          pathOptions={{
            color: accentColor,
            weight: 5,
            opacity: 0.9,
            lineCap: 'round',
            lineJoin: 'round',
          }}
        />
      )}
    </MapContainer>
  );
}
