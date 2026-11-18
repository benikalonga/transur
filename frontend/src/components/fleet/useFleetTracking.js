'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { appSocket } from '@/lib/socket';
import { OFFLINE_MODE, demoLocation, distanceKm } from '@/lib/geo';

const MIN_INTERVAL_MS = 5000; // never send more than one fix every 5 s
const MIN_MOVE_KM = 0.025; // …unless they moved at least 25 m
const HEARTBEAT_MS = 60000; // re-send the last fix every minute so it never looks stale

/**
 * Watches the device GPS while `active` and streams positions to the API.
 * Uses the socket when connected and falls back to plain HTTP otherwise.
 */
export default function useFleetTracking(active) {
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(null);
  const last = useRef({ at: 0, pos: null });

  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !navigator.geolocation) return undefined;

    const send = (pos, force = false) => {
      const now = Date.now();
      const moved = last.current.pos ? distanceKm(last.current.pos, pos) : Infinity;
      if (!force && now - last.current.at < MIN_INTERVAL_MS && moved < MIN_MOVE_KM) return;
      last.current = { at: now, pos };
      const socket = appSocket();
      if (socket?.connected) socket.emit('fleet:position', pos);
      else api.me.postPosition(pos).catch(() => {});
    };

    // Offline mode (machines with no GPS): use a demo position near the map
    // centre if no real fix arrives quickly.
    const useDemo = () => {
      if (last.current.pos) return;
      const pos = demoLocation(0.8);
      setPosition(pos);
      setError(null);
      send(pos, true);
    };
    const demoTimer = OFFLINE_MODE ? setTimeout(useDemo, 4000) : null;

    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const pos = { lat: coords.latitude, lng: coords.longitude, heading: coords.heading, speed: coords.speed };
        setPosition(pos);
        setError(null);
        send(pos);
      },
      (err) => {
        if (OFFLINE_MODE) return useDemo();
        setError(err.code === 1 ? 'Location permission is blocked. Enable it to receive requests.' : 'Weak GPS signal…');
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
    const heartbeat = setInterval(() => last.current.pos && send(last.current.pos, true), HEARTBEAT_MS);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearInterval(heartbeat);
      if (demoTimer) clearTimeout(demoTimer);
    };
  }, [active]);

  return { position, error };
}
