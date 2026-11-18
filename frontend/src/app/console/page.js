'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, Car, Coins, Headset, Package, ShieldAlert, UserPlus, Users } from 'lucide-react';
import { consoleApi } from '@/lib/api';
import { money } from '@/lib/format';
import { Bars, PageHead, Stat } from '@/components/console/kit';
import { Spinner } from '@/components/ui';

const count = (rows, key, value) => rows.filter((r) => r[key] === value).reduce((s, r) => s + Number(r.n), 0);

export default function Overview() {
  const [data, setData] = useState(null);

  useEffect(() => {
    const load = () => consoleApi.overview().then(setData).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  if (!data) return <div className="flex h-[50vh] items-center justify-center"><Spinner className="text-brand-500" /></div>;

  const people = Object.fromEntries(data.people.map((p) => [p.role, Number(p.n)]));
  const online = Object.fromEntries(data.onlineFleet.map((p) => [p.role, Number(p.n)]));
  const today = data.today;
  const totalToday = today.reduce((s, r) => s + Number(r.n), 0);
  const doneToday = count(today, 'status', 'completed');
  const cancelledToday = count(today, 'status', 'cancelled');

  const days = [...Array(14)].map((_, i) => {
    const d = new Date(Date.now() - (13 - i) * 864e5);
    const key = d.toISOString().slice(0, 10);
    const rows = data.daily.filter((r) => String(r.day).slice(0, 10) === key);
    return {
      label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      values: [
        { key: 'ride', value: rows.find((r) => r.service === 'ride')?.gross || 0, color: '#5B3DF5' },
        { key: 'parcel', value: rows.find((r) => r.service === 'parcel')?.gross || 0, color: '#FFB020' },
      ],
    };
  });

  return (
    <>
      <PageHead title="Overview" subtitle="The last 30 days at a glance. Refreshes every 30 seconds." />

      {(data.openSos > 0 || data.openHelp > 0) && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          {data.openSos > 0 && (
            <Link href="/console/safety" className="flex items-center gap-3 rounded-2xl bg-red-500 p-4 text-white">
              <ShieldAlert size={22} /><span className="font-bold">{data.openSos} open safety alert{data.openSos > 1 ? 's' : ''}</span>
            </Link>
          )}
          {data.openHelp > 0 && (
            <Link href="/console/help" className="flex items-center gap-3 rounded-2xl bg-volt p-4 text-ink">
              <Headset size={22} /><span className="font-bold">{data.openHelp} conversation{data.openHelp > 1 ? 's' : ''} waiting for a reply</span>
            </Link>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Gross bookings (30d)" value={money(data.revenue.gross)} hint={`${data.revenue.jobs} completed jobs`} icon={Coins} tone="ink" />
        <Stat label="Platform fees (30d)" value={money(data.revenue.fees)} hint={`${money(data.revenue.discounts)} spent on promos`} icon={Activity} tone="green" />
        <Stat label="Bookings today" value={totalToday} hint={`${doneToday} completed · ${cancelledToday} cancelled`} icon={Package} />
        <Stat label="New sign-ups (7d)" value={data.newUsers} icon={UserPlus} tone="amber" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="surface p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <p className="font-bold">Gross bookings, last 14 days</p>
            <div className="flex gap-3 text-xs font-semibold text-ink-muted">
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-brand-500" /> Rides</span>
              <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-volt" /> Parcels</span>
            </div>
          </div>
          <Bars data={days} height={200} format={money} />
        </div>
        <div className="surface space-y-4 p-5">
          <p className="font-bold">Network</p>
          {[
            { label: 'Riders', value: people.rider || 0, icon: Users },
            { label: 'Drivers', value: people.driver || 0, live: online.driver || 0, icon: Car },
            { label: 'Couriers', value: people.courier || 0, live: online.courier || 0, icon: Package },
          ].map(({ label, value, live, icon: Icon }) => (
            <div key={label} className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-canvas"><Icon size={18} /></span>
              <div className="flex-1"><p className="text-sm font-semibold">{label}</p><p className="text-xs text-ink-muted">{value} registered</p></div>
              {live != null && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">{live} online</span>}
            </div>
          ))}
          <Link href="/console/live" className="btn-ink w-full py-2.5 text-sm">Open live map</Link>
        </div>
      </div>
    </>
  );
}
