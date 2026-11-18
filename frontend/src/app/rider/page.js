'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Briefcase, CalendarClock, Car, Gift, Home, MapPin, Package, Search, ShieldCheck, Star } from 'lucide-react';
import { api } from '@/lib/api';
import { greeting, money, STATUS_LABELS, dateTime } from '@/lib/format';
import { useAccount, InboxBell } from '@/components/shell/AppShell';
import { StatusPill } from '@/components/ui';

const PLACE_ICON = { home: Home, work: Briefcase, other: Star };

export default function RiderHome() {
  const { profile } = useAccount();
  const [places, setPlaces] = useState([]);
  const [current, setCurrent] = useState(null);
  const [upcoming, setUpcoming] = useState([]);
  const [recent, setRecent] = useState([]);
  const [promoCount, setPromoCount] = useState(0);

  useEffect(() => {
    api.me.places().then((r) => setPlaces(r.places)).catch(() => {});
    api.bookings.current().then((r) => setCurrent(r.booking)).catch(() => {});
    api.bookings.list({ scope: 'open' }).then((r) => setUpcoming(r.bookings.filter((b) => b.status === 'scheduled'))).catch(() => {});
    api.bookings.list({ scope: 'past', limit: 6 }).then((r) => setRecent(r.bookings.filter((b) => b.status === 'completed'))).catch(() => {});
    api.promos.mine().then((r) => setPromoCount(r.promos.length)).catch(() => {});
  }, []);

  // Unique recent destinations make one-tap rebooking easy.
  const recentPlaces = [...new Map(recent.map((b) => [b.dropoff_address, b])).values()].slice(0, 3);

  return (
    <main>
      <header className="relative overflow-hidden bg-ink px-5 pb-20 pt-[max(1.5rem,env(safe-area-inset-top))] text-white">
        <div className="absolute -right-10 -top-24 h-64 w-64 rounded-full bg-brand-500/50 blur-3xl" />
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-sm text-white/60">{greeting()},</p>
            <p className="text-2xl font-extrabold">{profile.full_name.split(' ')[0]} 👋</p>
          </div>
          <InboxBell href="/rider/inbox" />
        </div>
        <Link href="/rider/ride" className="tap relative mt-6 flex items-center gap-3 rounded-2xl bg-white px-4 py-4 text-ink shadow-float">
          <Search size={20} className="text-brand-500" />
          <span className="flex-1 text-[15px] font-semibold text-ink-muted">Where are you going?</span>
          <span className="rounded-full bg-canvas px-3 py-1 text-xs font-bold">Now</span>
        </Link>
      </header>

      <div className="-mt-12 space-y-5 px-4">
        <div className="grid grid-cols-2 gap-3">
          <Link href="/rider/ride" className="tap surface relative overflow-hidden p-4 shadow-sm">
            <Car size={28} className="text-brand-500" />
            <p className="mt-6 text-lg font-extrabold">Ride</p>
            <p className="text-xs text-ink-muted">Moto, Economy, Comfort, XL</p>
            <ArrowRight size={18} className="absolute right-4 top-4 text-ink-faint" />
          </Link>
          <Link href="/rider/send" className="tap surface relative overflow-hidden p-4 shadow-sm">
            <Package size={28} className="text-volt" />
            <p className="mt-6 text-lg font-extrabold">Send</p>
            <p className="text-xs text-ink-muted">Parcels with PIN handover</p>
            <ArrowRight size={18} className="absolute right-4 top-4 text-ink-faint" />
          </Link>
        </div>

        {current && (
          <Link href={current.service === 'parcel' ? '/rider/send' : '/rider/ride'} className="tap flex items-center gap-3 rounded-2xl bg-brand-500 p-4 text-white shadow-float">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">{current.service === 'parcel' ? <Package size={20} /> : <Car size={20} />}</span>
            <span className="flex-1">
              <span className="block text-sm font-bold">{STATUS_LABELS[current.status]}</span>
              <span className="block truncate text-xs text-white/75">{current.dropoff_address}</span>
            </span>
            <ArrowRight size={18} />
          </Link>
        )}

        {(places.length > 0 || recentPlaces.length > 0) && (
          <section className="surface divide-y divide-line">
            {places.slice(0, 3).map((p) => {
              const Icon = PLACE_ICON[p.kind] || Star;
              return (
                <Link key={p.id} href={`/rider/ride?to=${p.lat},${p.lng},${encodeURIComponent(p.address)}`} className="tap flex items-center gap-3 px-4 py-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-canvas"><Icon size={16} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{p.label}</span>
                    <span className="block truncate text-xs text-ink-muted">{p.address}</span>
                  </span>
                </Link>
              );
            })}
            {recentPlaces.map((b) => (
              <Link key={b.id} href={`/rider/trips/${b.id}`} className="tap flex items-center gap-3 px-4 py-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-canvas"><MapPin size={16} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{b.dropoff_address}</span>
                  <span className="block text-xs text-ink-muted">Last trip {money(b.final_fare)}</span>
                </span>
              </Link>
            ))}
            {places.length === 0 && (
              <Link href="/rider/places" className="tap flex items-center gap-3 px-4 py-3 text-sm font-semibold text-brand-600">
                <Home size={16} /> Save your home and work addresses
              </Link>
            )}
          </section>
        )}

        {upcoming.length > 0 && (
          <section>
            <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-ink-muted">Scheduled</h2>
            <div className="space-y-2">
              {upcoming.map((b) => (
                <Link key={b.id} href={`/rider/trips/${b.id}`} className="tap surface flex items-center gap-3 p-3">
                  <CalendarClock size={20} className="text-brand-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{b.dropoff_address}</span>
                    <span className="block text-xs text-ink-muted">{dateTime(b.scheduled_for)}</span>
                  </span>
                  <StatusPill status={b.status} />
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Link href="/rider/promos" className="tap surface p-4">
            <Gift size={22} className="text-brand-500" />
            <p className="mt-3 font-bold">Promotions</p>
            <p className="text-xs text-ink-muted">{promoCount ? `${promoCount} available` : 'Enter a code'}</p>
          </Link>
          <Link href="/rider/safety" className="tap surface p-4">
            <ShieldCheck size={22} className="text-emerald-600" />
            <p className="mt-3 font-bold">Safety</p>
            <p className="text-xs text-ink-muted">Trusted contacts & SOS</p>
          </Link>
        </div>

        <Link href="/rider/invite" className="tap flex items-center gap-4 rounded-2xl bg-volt p-4 text-ink">
          <Gift size={32} />
          <span className="flex-1">
            <span className="block font-extrabold">Invite friends, ride for less</span>
            <span className="block text-xs">They get a welcome discount, you get a reward after their first trip.</span>
          </span>
        </Link>
      </div>
    </main>
  );
}
