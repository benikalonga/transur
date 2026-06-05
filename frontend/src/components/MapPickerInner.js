'use client';
// This component is always loaded with { ssr: false } via next/dynamic
import { useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

const LBH = [-11.6609, 27.4794];

// ── Draggable pin icon ────────────────────────────────────────────────────────
function makePinIcon(color = '#007DC5') {
  const size = 38;
  const stem = 12;
  return L.divIcon({
    className: '',
    html: `
      <div style="
        width:${size}px;
        height:${size + stem}px;
        display:flex;
        flex-direction:column;
        align-items:center;
        filter: drop-shadow(0 4px 8px rgba(0,0,0,0.35));
      ">
        <div style="
          width:${size}px;
          height:${size}px;
          background:${color};
          border:3px solid white;
          border-radius:50% 50% 50% 0;
          transform:rotate(-45deg);
          display:flex;
          align-items:center;
          justify-content:center;
        ">
          <div style="
            width:12px;
            height:12px;
            background:white;
            border-radius:50%;
            transform:rotate(45deg);
          "></div>
        </div>
      </div>
    `,
    iconSize: [size, size + stem],
    iconAnchor: [size / 2, size + stem],
    popupAnchor: [0, -(size + stem)],
  });
}

// ── Fly-to controller when pin changes programmatically (via search) ──────────
function FlyController({ target }) {
  const map = useMap();
  const prev = useRef(null);
  useEffect(() => {
    if (!target) return;
    const key = `${target.lat},${target.lng}`;
    if (key === prev.current) return;
    prev.current = key;
    map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 16), { animate: true, duration: 0.6 });
  }, [target, map]);
  return null;
}

// ── Map event handler — updates pin on click ──────────────────────────────────
function ClickHandler({ onMove }) {
  useMapEvents({
    click(e) {
      onMove({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function MapPickerInner({ pin, onPinChange, accent = '#007DC5' }) {
  const markerRef = useRef(null);
  const pinIcon = makePinIcon(accent);

  const eventHandlers = useCallback(() => ({
    dragend() {
      const m = markerRef.current;
      if (m) {
        const { lat, lng } = m.getLatLng();
        onPinChange({ lat, lng });
      }
    },
  }), [onPinChange]);

  return (
    <MapContainer
      center={[pin.lat, pin.lng]}
      zoom={16}
      style={{ width: '100%', height: '100%' }}
      zoomControl={false}
      attributionControl={false}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />

      {/* Fly to pin when changed via search */}
      <FlyController target={pin} />

      {/* Click on map to move pin */}
      <ClickHandler onMove={onPinChange} />

      {/* Draggable pin */}
      <Marker
        ref={markerRef}
        position={[pin.lat, pin.lng]}
        icon={pinIcon}
        draggable={true}
        eventHandlers={eventHandlers()}
      />

      {/* Zoom controls — bottom right */}
      <ZoomButtons />
    </MapContainer>
  );
}

// ── Custom zoom buttons (top-right) ──────────────────────────────────────────
function ZoomButtons() {
  const map = useMap();
  return (
    <div
      className="leaflet-top leaflet-right"
      style={{ pointerEvents: 'auto', position: 'absolute', top: 16, right: 16, zIndex: 1000 }}
    >
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        background: 'white',
        borderRadius: 14,
        padding: 4,
        boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
      }}>
        <button
          onClick={() => map.zoomIn()}
          style={{
            width: 36, height: 36, display: 'flex', alignItems: 'center',
            justifyContent: 'center', border: 'none', background: 'transparent',
            cursor: 'pointer', fontSize: 20, fontWeight: 700, color: '#333',
            borderRadius: 10,
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#f5f5f5'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >+</button>
        <div style={{ height: 1, background: '#eee', margin: '0 4px' }} />
        <button
          onClick={() => map.zoomOut()}
          style={{
            width: 36, height: 36, display: 'flex', alignItems: 'center',
            justifyContent: 'center', border: 'none', background: 'transparent',
            cursor: 'pointer', fontSize: 22, fontWeight: 700, color: '#333',
            borderRadius: 10,
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#f5f5f5'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >−</button>
      </div>
    </div>
  );
}
