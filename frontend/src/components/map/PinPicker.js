'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, LocateFixed, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';
import { DEFAULT_CENTER, locateOnce, reverseGeocode } from '@/lib/geo';
import { Button, Spinner } from '@/components/ui';
import LeafletMap from './LeafletMap';

/** Full-screen "move the map under the pin" location picker. */
export default function PinPicker({ title = 'Choose location', initial, onConfirm, onClose }) {
  const [center, setCenter] = useState(initial || DEFAULT_CENTER);
  const [mapCenter, setMapCenter] = useState(initial || DEFAULT_CENTER);
  const [address, setAddress] = useState(initial?.address || '');
  const [looking, setLooking] = useState(false);
  const [moving, setMoving] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    setMoving(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLooking(true);
      setAddress(await reverseGeocode(center));
      setLooking(false);
      setMoving(false);
    }, 600);
    return () => clearTimeout(timer.current);
  }, [center]);

  const locate = async () => {
    try {
      const p = await locateOnce();
      setMapCenter({ ...p });
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div className="fixed inset-0 z-[3000] mx-auto max-w-md bg-white">
      <div className="absolute inset-0">
        <LeafletMap center={mapCenter} zoom={16} fitTo={[mapCenter]} padBottom={200} onCenterChange={setCenter} />
      </div>

      <div className="pointer-events-none absolute left-1/2 top-1/2 z-[1000] -translate-x-1/2 -translate-y-full">
        <MapPin size={44} className={`fill-brand-500 text-white drop-shadow-lg transition-transform ${moving ? '-translate-y-2' : ''}`} strokeWidth={1.5} />
      </div>

      <div className="absolute left-0 right-0 top-0 z-[1000] flex items-center gap-3 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button onClick={onClose} className="tap flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-float" aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <div className="rounded-full bg-white px-4 py-2.5 text-sm font-bold shadow-float">{title}</div>
      </div>

      <button onClick={locate} className="tap absolute bottom-48 right-4 z-[1000] flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-float" aria-label="My location">
        <LocateFixed size={20} />
      </button>

      <div className="sheet px-5 pt-5">
        <p className="label">Selected address</p>
        <p className="mb-4 flex min-h-[48px] items-center gap-2 text-[15px] font-semibold">
          {looking ? <Spinner size={16} /> : null}
          {looking ? 'Finding address…' : address || 'Move the map to place the pin'}
        </p>
        <Button className="w-full" disabled={looking} onClick={() => onConfirm({ address: address || 'Pinned location', lat: center.lat, lng: center.lng })}>
          Confirm location
        </Button>
      </div>
    </div>
  );
}
