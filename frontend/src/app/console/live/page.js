'use client';
import { useEffect, useMemo, useState } from 'react';
import { Car, Package } from 'lucide-react';
import { consoleApi } from '@/lib/api';
import { consoleSocket } from '@/lib/socket';
import { money, timeAgo, VEHICLE_LABELS } from '@/lib/format';
import { MapView } from '@/components/map';
import { PageHead, Stat } from '@/components/console/kit';
import { StatusPill } from '@/components/ui';

export default function LiveMapPage() {
  const [active, setActive] = useState([]);
  const [fleet, setFleet] = useState([]);
  const [focus, setFocus] = useState(null);

  useEffect(() => {
    const load = () => consoleApi.live().then((r) => { setActive(r.active); setFleet(r.fleet); }).catch(() => {});
    load();
    const t = setInterval(load, 15000);
    const socket = consoleSocket();
    // Positions stream in between full refreshes.
    const onPos = ({ userId, lat, lng }) => setFleet((list) => list.map((f) => (f.id === userId ? { ...f, lat, lng, updated_at: new Date() } : f)));
    socket?.on('fleet:position', onPos);
    socket?.on('booking:created', load);
    return () => {
      clearInterval(t);
      socket?.off('fleet:position', onPos);
      socket?.off('booking:created', load);
    };
  }, []);

  const markers = useMemo(() => [
    ...fleet.map((f) => ({ id: `f-${f.id}`, kind: f.availability === 'busy' ? 'fleetBusy' : 'fleetOnline', lat: f.lat, lng: f.lng, onClick: () => setFocus({ type: 'fleet', item: f }) })),
    ...active.filter((b) => b.status === 'searching').map((b) => ({ id: `b-${b.id}`, kind: 'request', lat: b.pickup_lat, lng: b.pickup_lng, onClick: () => setFocus({ type: 'booking', item: b }) })),
  ], [fleet, active]);

  const fitTo = useMemo(() => (markers.length ? markers.slice(0, 50) : null), [markers.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <PageHead title="Live map" subtitle="Fleet positions and open requests, updated in real time." />
      <div className="mb-4 grid gap-4 sm:grid-cols-4">
        <Stat label="Online" value={fleet.filter((f) => f.availability === 'online').length} hint="Available now" />
        <Stat label="On a job" value={fleet.filter((f) => f.availability === 'busy').length} tone="amber" />
        <Stat label="Waiting for offers" value={active.filter((b) => b.status === 'searching').length} tone="red" />
        <Stat label="In progress" value={active.filter((b) => b.status !== 'searching').length} tone="green" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="surface h-[560px] overflow-hidden lg:col-span-2">
          <MapView markers={markers} fitTo={fitTo} padBottom={40} />
        </div>
        <div className="surface flex h-[560px] flex-col overflow-hidden">
          {focus && (
            <div className="border-b border-line bg-brand-50 p-4 text-sm">
              {focus.type === 'fleet' ? (
                <>
                  <p className="font-bold">{focus.item.full_name}</p>
                  <p className="text-ink-muted">{focus.item.role} · {VEHICLE_LABELS[focus.item.vehicle_class]} · {focus.item.phone}</p>
                  <p className="text-xs text-ink-muted">Last fix {timeAgo(focus.item.updated_at)}</p>
                </>
              ) : (
                <>
                  <p className="font-bold">{focus.item.rider_name} is waiting</p>
                  <p className="text-ink-muted">{focus.item.pickup_address} → {focus.item.dropoff_address}</p>
                  <p className="text-xs text-ink-muted">Offer {money(focus.item.rider_offer)} · {timeAgo(focus.item.created_at)}</p>
                </>
              )}
            </div>
          )}
          <p className="px-4 pb-2 pt-4 text-xs font-bold uppercase tracking-wider text-ink-muted">Active bookings ({active.length})</p>
          <div className="flex-1 divide-y divide-line overflow-y-auto">
            {active.map((b) => (
              <button key={b.id} onClick={() => setFocus({ type: 'booking', item: b })} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-canvas">
                {b.service === 'parcel' ? <Package size={16} className="mt-0.5 text-volt" /> : <Car size={16} className="mt-0.5 text-brand-500" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{b.rider_name} {b.provider_name ? `→ ${b.provider_name}` : ''}</p>
                  <p className="truncate text-xs text-ink-muted">{b.dropoff_address}</p>
                </div>
                <StatusPill status={b.status} />
              </button>
            ))}
            {active.length === 0 && <p className="p-6 text-center text-sm text-ink-muted">No active bookings right now.</p>}
          </div>
        </div>
      </div>
    </>
  );
}
