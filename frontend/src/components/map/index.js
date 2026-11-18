'use client';
import dynamic from 'next/dynamic';

/** Leaflet touches `window`, so the map is only ever rendered in the browser. */
export const MapView = dynamic(() => import('./LeafletMap'), {
  ssr: false,
  loading: () => <div className="skeleton h-full w-full rounded-none" />,
});

export const PinPicker = dynamic(() => import('./PinPicker'), { ssr: false });
export { default as PlaceSearch } from './PlaceSearch';
