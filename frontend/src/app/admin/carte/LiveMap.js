'use client';

import { useEffect, useRef } from 'react';

// Lubumbashi center
const CENTER = [-11.6600, 27.4794];
const DEFAULT_ZOOM = 13;

function createColorMarker(color, size = 14) {
  // Returns an HTML string for use with Leaflet's DivIcon
  return `
    <div style="
      width: ${size}px;
      height: ${size}px;
      background: ${color};
      border: 2.5px solid white;
      border-radius: 50%;
      box-shadow: 0 1px 4px rgba(0,0,0,0.35);
    "></div>
  `;
}

export default function LiveMap({ drivers = [], trips = [], deliveries = [] }) {
  const mapRef      = useRef(null);
  const leafletRef  = useRef(null);
  const markersRef  = useRef([]);

  // Init map once
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // `cancelled` guards against the StrictMode double-invoke race where the
    // async import resolves after cleanup has already run.
    let cancelled = false;

    // Dynamically import Leaflet (client-side only)
    import('leaflet').then((L) => {
      if (cancelled) return;
      if (leafletRef.current) return; // already initialized
      if (!mapRef.current) return;

      // Clear Leaflet's "already initialized" flag if present (HMR / StrictMode)
      if (mapRef.current._leaflet_id) {
        delete mapRef.current._leaflet_id;
      }

      // Fix Leaflet default icon paths broken by webpack
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const map = L.map(mapRef.current, {
        center: CENTER,
        zoom: DEFAULT_ZOOM,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      // Legend
      const legend = L.control({ position: 'bottomleft' });
      legend.onAdd = () => {
        const div = L.DomUtil.create('div', '');
        div.style.cssText =
          'background:white;padding:10px 14px;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,.18);font-size:12px;line-height:1.8;';
        div.innerHTML = `
          <div style="font-weight:700;margin-bottom:4px;color:#374151;">Légende</div>
          <div><span style="display:inline-block;width:12px;height:12px;background:#3B82F6;border-radius:50%;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.25);vertical-align:middle;margin-right:6px;"></span>Chauffeurs en ligne</div>
          <div><span style="display:inline-block;width:12px;height:12px;background:#059669;border-radius:50%;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.25);vertical-align:middle;margin-right:6px;"></span>Courses actives</div>
          <div><span style="display:inline-block;width:12px;height:12px;background:#F97316;border-radius:50%;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.25);vertical-align:middle;margin-right:6px;"></span>Livraisons actives</div>
        `;
        return div;
      };
      legend.addTo(map);

      leafletRef.current = { map, L };
    });

    // Inject Leaflet CSS if not already present
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id   = 'leaflet-css';
      link.rel  = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    return () => {
      cancelled = true;
      if (leafletRef.current?.map) {
        leafletRef.current.map.remove();
        leafletRef.current = null;
      }
    };
  }, []);

  // Update markers whenever data changes
  useEffect(() => {
    if (!leafletRef.current) return;
    const { map, L } = leafletRef.current;

    // Clear existing markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    function addMarker(lat, lng, html, popupHtml) {
      if (!lat || !lng || isNaN(lat) || isNaN(lng)) return;
      const icon = L.divIcon({
        className: '',
        html,
        iconAnchor: [7, 7],
      });
      const marker = L.marker([lat, lng], { icon }).addTo(map);
      if (popupHtml) marker.bindPopup(popupHtml, { maxWidth: 220 });
      markersRef.current.push(marker);
    }

    // Driver markers (blue)
    (drivers ?? []).forEach((d) => {
      const lat = d.location?.lat ?? d.latitude ?? d.lat;
      const lng = d.location?.lng ?? d.longitude ?? d.lng;
      const name    = d.name ?? d.user?.name ?? 'Chauffeur';
      const vehicle = d.vehicle ?? d.vehicleType ?? '—';
      const status  = d.status ?? '—';
      const lastSeen = d.lastSeen ?? d.last_seen
        ? new Date(d.lastSeen ?? d.last_seen).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        : '—';

      addMarker(
        lat, lng,
        createColorMarker('#3B82F6', 14),
        `<div style="font-size:12px;line-height:1.6;">
          <strong style="font-size:13px;">${name}</strong><br/>
          🚗 ${vehicle}<br/>
          Statut : ${status}<br/>
          Vu à : ${lastSeen}
        </div>`
      );
    });

    // Active trip markers (green) at pickup
    (trips ?? []).forEach((t) => {
      const lat = t.pickup?.lat ?? t.pickupLat ?? t.pickup_lat;
      const lng = t.pickup?.lng ?? t.pickupLng ?? t.pickup_lng;
      const client = t.client?.name ?? t.clientName ?? 'Client';
      const dest   = t.destination?.address ?? t.destinationAddress ?? '—';

      addMarker(
        lat, lng,
        createColorMarker('#059669', 13),
        `<div style="font-size:12px;line-height:1.6;">
          <strong style="font-size:13px;">Course active</strong><br/>
          👤 ${client}<br/>
          Destination : ${dest}
        </div>`
      );
    });

    // Active delivery markers (orange) at pickup
    (deliveries ?? []).forEach((d) => {
      const lat = d.pickup?.lat ?? d.pickupLat ?? d.pickup_lat;
      const lng = d.pickup?.lng ?? d.pickupLng ?? d.pickup_lng;
      const pickup  = d.pickup?.address ?? d.pickupAddress ?? '—';
      const dropoff = d.dropoff?.address ?? d.dropoffAddress ?? '—';

      addMarker(
        lat, lng,
        createColorMarker('#F97316', 13),
        `<div style="font-size:12px;line-height:1.6;">
          <strong style="font-size:13px;">Livraison active</strong><br/>
          📦 De : ${pickup}<br/>
          Vers : ${dropoff}
        </div>`
      );
    });
  }, [drivers, trips, deliveries]);

  return (
    <div
      ref={mapRef}
      style={{ width: '100%', height: '100%' }}
    />
  );
}
