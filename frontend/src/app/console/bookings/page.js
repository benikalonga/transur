'use client';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Car, Package } from 'lucide-react';
import { consoleApi } from '@/lib/api';
import { dateTime, km, money, PAYMENT_LABELS, STATUS_LABELS, VEHICLE_LABELS } from '@/lib/format';
import { PageHead, Pager, SearchBox, Select, Table, useDebounced } from '@/components/console/kit';
import { Button, Modal, StatusPill } from '@/components/ui';

const STATUSES = ['', 'scheduled', 'searching', 'assigned', 'arrived', 'in_progress', 'completed', 'cancelled'];

function BookingModal({ id, onClose, onChanged }) {
  const [data, setData] = useState(null);
  useEffect(() => { if (id) consoleApi.booking(id).then(setData).catch((e) => toast.error(e.message)); else setData(null); }, [id]);
  const b = data?.booking;

  const cancel = async () => {
    const reason = window.prompt('Reason shown to the rider and provider:', 'Cancelled by Transur support');
    if (reason === null) return;
    try {
      await consoleApi.cancelBooking(id, reason);
      toast.success('Booking cancelled');
      onChanged();
      onClose();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <Modal open={Boolean(id)} onClose={onClose} title={b ? `${b.service === 'parcel' ? 'Delivery' : 'Ride'} #${b.id.slice(0, 8)}` : 'Booking'} wide>
      {b && (
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-2"><StatusPill status={b.status} /><span className="text-ink-muted">{VEHICLE_LABELS[b.vehicle_class]} · {km(b.distance_km)} · created {dateTime(b.created_at)}</span></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-canvas p-3"><p className="text-xs text-ink-muted">Pickup</p><p className="font-semibold">{b.pickup_address}</p></div>
            <div className="rounded-xl bg-canvas p-3"><p className="text-xs text-ink-muted">Drop-off</p><p className="font-semibold">{b.dropoff_address}</p></div>
            <div className="rounded-xl bg-canvas p-3"><p className="text-xs text-ink-muted">Rider</p><p className="font-semibold">{b.rider_name} · {b.rider_phone}</p></div>
            <div className="rounded-xl bg-canvas p-3"><p className="text-xs text-ink-muted">Provider</p><p className="font-semibold">{b.provider_name ? `${b.provider_name} · ${b.provider_phone}` : '—'}</p></div>
          </div>
          {b.service === 'parcel' && <p className="rounded-xl bg-volt/15 p-3">Parcel: {b.parcel_details || '—'} ({b.parcel_size}) → {b.recipient_name}, {b.recipient_phone}</p>}
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
            {[
              ['Quoted', money(b.quoted_fare)], ['Rider offer', money(b.rider_offer)], ['Agreed', b.agreed_fare != null ? money(b.agreed_fare) : '—'],
              ['Final', b.final_fare != null ? money(b.final_fare) : '—'], ['Discount', money(b.discount_amount)], ['Platform fee', b.platform_fee != null ? money(b.platform_fee) : '—'],
              ['Payout', b.provider_payout != null ? money(b.provider_payout) : '—'], ['Tip', money(b.tip_amount)], ['Payment', PAYMENT_LABELS[b.payment_method]],
              ['Promo', b.promo_code || '—'], ['Rating', b.rider_rating ? `${b.rider_rating}★` : '—'], ['Reached', `${data.providersReached} providers`],
            ].map(([k, v]) => <div key={k}><p className="text-xs text-ink-muted">{k}</p><p className="font-semibold">{v}</p></div>)}
          </div>
          {b.cancel_reason && <p className="text-red-500">Cancelled by {b.cancelled_by}: {b.cancel_reason}</p>}
          {data.bids.length > 0 && (
            <div>
              <p className="mb-1 font-bold">Offers</p>
              {data.bids.map((x, i) => <p key={i} className="text-ink-muted">{x.full_name}: {money(x.amount)} · {x.status}{x.eta_min ? ` · ${x.eta_min} min away` : ''}</p>)}
            </div>
          )}
          {data.messages.length > 0 && (
            <div>
              <p className="mb-1 font-bold">Chat</p>
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl bg-canvas p-3">
                {data.messages.map((m, i) => <p key={i}><span className="font-semibold">{m.sender}:</span> {m.body}</p>)}
              </div>
            </div>
          )}
          {!['completed', 'cancelled'].includes(b.status) && <Button variant="danger" onClick={cancel}>Cancel booking</Button>}
        </div>
      )}
    </Modal>
  );
}

export default function BookingsPage() {
  const [filters, setFilters] = useState({ service: '', status: '', q: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ bookings: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const q = useDebounced(filters.q);

  const load = () => {
    setLoading(true);
    const params = { page, ...Object.fromEntries(Object.entries({ ...filters, q }).filter(([, v]) => v)) };
    consoleApi.bookings(params).then(setData).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [page, filters.service, filters.status, filters.from, filters.to, q]);

  const set = (k) => (v) => { setPage(1); setFilters((f) => ({ ...f, [k]: v })); };

  return (
    <>
      <PageHead title="Bookings" subtitle="Every ride and delivery on the platform." />
      <div className="mb-4 flex flex-wrap gap-2">
        <SearchBox value={filters.q} onChange={set('q')} placeholder="ID, name, phone or address" />
        <Select label="Service" value={filters.service} onChange={set('service')} options={[{ value: '', label: 'All services' }, { value: 'ride', label: 'Rides' }, { value: 'parcel', label: 'Parcels' }]} />
        <Select label="Status" value={filters.status} onChange={set('status')} options={STATUSES.map((s) => ({ value: s, label: s ? STATUS_LABELS[s] : 'Any status' }))} />
        <input type="date" aria-label="From" value={filters.from} onChange={(e) => set('from')(e.target.value)} className="rounded-xl border border-line bg-white px-3 text-sm" />
        <input type="date" aria-label="To" value={filters.to} onChange={(e) => set('to')(e.target.value)} className="rounded-xl border border-line bg-white px-3 text-sm" />
      </div>
      <Table
        loading={loading}
        rows={data.bookings}
        onRowClick={(r) => setOpenId(r.id)}
        columns={[
          { key: 'service', label: '', render: (r) => (r.service === 'parcel' ? <Package size={16} className="text-volt" /> : <Car size={16} className="text-brand-500" />) },
          { key: 'id', label: 'Booking', render: (r) => <span className="font-mono text-xs">#{r.id.slice(0, 8)}</span> },
          { key: 'rider_name', label: 'Rider', render: (r) => <div><p className="font-semibold">{r.rider_name}</p><p className="text-xs text-ink-muted">{r.rider_phone}</p></div> },
          { key: 'provider_name', label: 'Provider' },
          { key: 'route', label: 'Route', render: (r) => <p className="max-w-[260px] truncate text-xs">{r.pickup_address} → {r.dropoff_address}</p> },
          { key: 'fare', label: 'Fare', className: 'text-right', render: (r) => <span className="font-bold">{money(r.final_fare ?? r.agreed_fare ?? r.rider_offer)}</span> },
          { key: 'status', label: 'Status', render: (r) => <StatusPill status={r.status} /> },
          { key: 'created_at', label: 'Created', render: (r) => <span className="whitespace-nowrap text-xs text-ink-muted">{dateTime(r.created_at)}</span> },
        ]}
      />
      <Pager page={page} total={data.total} onChange={setPage} />
      <BookingModal id={openId} onClose={() => setOpenId(null)} onChanged={load} />
    </>
  );
}
