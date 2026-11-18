'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, Clock, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { STATUS_LABELS, VEHICLE_LABELS, timeAgo } from '@/lib/format';
import { MapView } from '@/components/map';
import { Spinner, StatusPill } from '@/components/ui';
import Logo from '@/components/Logo';

/** Read-only live view of a trip someone shared with you. No sign-in needed. */
export default function TrackPage() {
  const { token } = useParams();
  const [trip, setTrip] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let timer;
    const load = async () => {
      try {
        const { trip: t } = await api.track(token);
        setTrip(t);
        if (!['completed', 'cancelled'].includes(t.status)) timer = setTimeout(load, 5000);
      } catch (e) {
        setError(e.message);
      }
    };
    load();
    return () => clearTimeout(timer);
  }, [token]);

  if (error) {
    return <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 p-6 text-center"><Logo /><p className="text-ink-muted">{error}</p></main>;
  }
  if (!trip) return <main className="flex min-h-[100dvh] items-center justify-center"><Spinner className="text-brand-500" /></main>;

  const pickup = { lat: trip.pickup_lat, lng: trip.pickup_lng };
  const dropoff = { lat: trip.dropoff_lat, lng: trip.dropoff_lng };
  const vehicle = trip.provider_lat ? { lat: trip.provider_lat, lng: trip.provider_lng } : null;
  const done = trip.status === 'completed';

  return (
    <main className="phone-frame flex h-[100dvh] flex-col">
      <header className="flex items-center justify-between bg-white px-4 py-3">
        <Logo size={30} />
        <StatusPill status={trip.status} />
      </header>
      <div className="relative flex-1">
        <MapView
          markers={[
            { id: 'p', kind: 'pickup', ...pickup },
            { id: 'd', kind: 'dropoff', ...dropoff },
            vehicle && { id: 'v', kind: 'vehicle', ...vehicle },
          ].filter(Boolean)}
          fitTo={vehicle ? [vehicle, trip.status === 'in_progress' ? dropoff : pickup] : [pickup, dropoff]}
          padBottom={230}
          follow
        />
      </div>
      <div className="sheet relative px-5 pt-5">
        <p className="text-lg font-extrabold">
          {done ? `${trip.rider_first_name} arrived safely` : `Following ${trip.rider_first_name}'s ${trip.service === 'parcel' ? 'delivery' : 'trip'}`}
        </p>
        <p className="text-sm text-ink-muted">{STATUS_LABELS[trip.status]}{trip.provider_first_name ? ` · with ${trip.provider_first_name}` : ''}</p>
        {trip.plate_number && (
          <p className="mt-3 text-sm">
            <span className="rounded-md bg-ink px-2 py-1 font-extrabold tracking-wider text-volt">{trip.plate_number}</span>{' '}
            <span className="text-ink-muted">{[trip.vehicle_color, trip.vehicle_make || VEHICLE_LABELS[trip.vehicle_class]].filter(Boolean).join(' ')}</span>
          </p>
        )}
        <div className="mt-3 space-y-1 text-sm">
          <p className="truncate"><span className="text-ink-muted">From</span> {trip.pickup_address}</p>
          <p className="truncate"><span className="text-ink-muted">To</span> {trip.dropoff_address}</p>
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-muted">
          {done ? <CheckCircle2 size={14} className="text-emerald-500" /> : <Clock size={14} />}
          {done ? 'Trip completed — location sharing has stopped.' : trip.position_at ? `Location updated ${timeAgo(trip.position_at)}` : 'Waiting for location…'}
        </p>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-faint"><ShieldCheck size={14} /> Shared securely with Transur</p>
      </div>
    </main>
  );
}
