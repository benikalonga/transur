'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Car, Clock3, Package } from 'lucide-react';
import { api } from '@/lib/api';
import { dateTime, money } from '@/lib/format';
import { Empty, Segmented, Spinner, StatusPill, TopBar } from '@/components/ui';

/** Booking history list. Riders see what they paid, fleet sees what they earned. */
export default function ActivityScreen({ perspective = 'rider', basePath, title = 'Activity' }) {
  const [filter, setFilter] = useState('all');
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (nextPage, f) => {
    setLoading(true);
    try {
      const params = { page: nextPage, limit: 20 };
      if (f === 'ride' || f === 'parcel') params.service = f;
      if (f === 'upcoming') params.scope = 'open';
      const { bookings } = await api.bookings.list(params);
      setItems((list) => (nextPage === 1 ? bookings : [...list, ...bookings]));
      setDone(bookings.length < 20);
      setPage(nextPage);
    } catch {
      /* keep what we have */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(1, filter); }, [filter, load]);

  const filters = perspective === 'rider'
    ? [{ value: 'all', label: 'All' }, { value: 'ride', label: 'Rides' }, { value: 'parcel', label: 'Parcels' }, { value: 'upcoming', label: 'Upcoming' }]
    : [{ value: 'all', label: 'All' }, { value: 'upcoming', label: 'Active' }];

  return (
    <main>
      <TopBar title={title} back={false} />
      <div className="px-4 py-3"><Segmented value={filter} onChange={setFilter} options={filters} /></div>
      <div className="space-y-2 px-4">
        {items.map((b) => {
          const Icon = b.service === 'parcel' ? Package : Car;
          const amount = perspective === 'rider'
            ? (b.final_fare != null ? b.final_fare - (b.discount_amount || 0) + (b.tip_amount || 0) : b.agreed_fare ?? b.rider_offer)
            : (b.provider_payout != null ? b.provider_payout + (b.tip_amount || 0) : b.agreed_fare);
          return (
            <Link key={b.id} href={`${basePath}/${b.id}`} className="tap surface flex items-start gap-3 p-3.5">
              <span className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-canvas"><Icon size={18} /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{b.dropoff_address}</span>
                <span className="block truncate text-xs text-ink-muted">from {b.pickup_address}</span>
                <span className="mt-1.5 flex items-center gap-2 text-xs text-ink-muted">
                  <StatusPill status={b.status} />
                  {dateTime(b.scheduled_for && b.status === 'scheduled' ? b.scheduled_for : b.created_at)}
                </span>
              </span>
              <span className="text-right text-sm font-extrabold">{amount != null ? money(amount) : '—'}</span>
            </Link>
          );
        })}
      </div>
      {loading && <Spinner className="mx-auto my-6 block text-brand-500" />}
      {!loading && items.length === 0 && (
        <Empty icon={Clock3} title="Nothing here yet" text={perspective === 'rider' ? 'Your rides and deliveries will show up here.' : 'Completed jobs will show up here.'} />
      )}
      {!loading && !done && items.length > 0 && (
        <button onClick={() => load(page + 1, filter)} className="btn-ghost mx-auto my-4 flex">Load more</button>
      )}
    </main>
  );
}
