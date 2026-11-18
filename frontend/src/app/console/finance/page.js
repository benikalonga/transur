'use client';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Download } from 'lucide-react';
import { consoleApi } from '@/lib/api';
import { money, PAYMENT_LABELS, ROLE_LABELS } from '@/lib/format';
import { Bars, PageHead, Stat, Table } from '@/components/console/kit';
import { Button, Rating } from '@/components/ui';

const iso = (d) => d.toISOString().slice(0, 10);

export default function FinancePage() {
  const [range, setRange] = useState({ from: iso(new Date(Date.now() - 29 * 864e5)), to: iso(new Date()) });
  const [data, setData] = useState(null);

  useEffect(() => {
    consoleApi.finance(range).then(setData).catch((e) => toast.error(e.message));
  }, [range]);

  const sum = (key) => (data?.byService || []).reduce((s, r) => s + Number(r[key] || 0), 0);

  const exportCsv = () => {
    const rows = [['day', 'jobs', 'gross', 'fees'], ...data.daily.map((d) => [String(d.day).slice(0, 10), d.jobs, d.gross, d.fees])];
    const blob = new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `transur-finance-${range.from}-to-${range.to}.csv`;
    a.click();
  };

  return (
    <>
      <PageHead
        title="Finance"
        subtitle="Revenue, platform fees and promotion spend for the selected period."
        actions={(
          <>
            <input type="date" aria-label="From" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} className="rounded-xl border border-line bg-white px-3 py-2 text-sm" />
            <input type="date" aria-label="To" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} className="rounded-xl border border-line bg-white px-3 py-2 text-sm" />
            <Button variant="ghost" className="py-2 text-sm" disabled={!data?.daily.length} onClick={exportCsv}><Download size={14} /> CSV</Button>
          </>
        )}
      />
      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Gross bookings" value={money(sum('gross'))} hint={`${sum('jobs')} completed jobs`} tone="ink" />
            <Stat label="Platform fees" value={money(sum('fees'))} tone="green" />
            <Stat label="Promotions" value={money(sum('discounts'))} hint="Discounts funded by the platform" tone="amber" />
            <Stat label="Net revenue" value={money(sum('fees') - sum('discounts'))} hint={`Tips to fleet: ${money(sum('tips'))}`} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <div className="surface p-5 lg:col-span-2">
              <p className="mb-4 font-bold">Daily gross & fees</p>
              <Bars
                height={220}
                format={money}
                data={data.daily.map((d) => ({
                  label: new Date(d.day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
                  values: [
                    { key: 'fees', value: Number(d.fees), color: '#10B981' },
                    { key: 'rest', value: Number(d.gross) - Number(d.fees), color: '#C7BBFF' },
                  ],
                }))}
              />
              {data.daily.length === 0 && <p className="text-center text-sm text-ink-muted">No completed jobs in this period.</p>}
            </div>
            <div className="space-y-4">
              <div className="surface p-5">
                <p className="mb-3 font-bold">By service</p>
                {data.byService.map((s) => (
                  <div key={s.service} className="flex justify-between py-1.5 text-sm">
                    <span className="capitalize">{s.service}s · {s.jobs}</span>
                    <span className="font-semibold">{money(s.gross)} <span className="text-xs text-ink-muted">avg {money(s.avg_fare)}</span></span>
                  </div>
                ))}
              </div>
              <div className="surface p-5">
                <p className="mb-3 font-bold">By payment method</p>
                {data.byMethod.map((m) => (
                  <div key={m.payment_method} className="flex justify-between py-1.5 text-sm">
                    <span>{PAYMENT_LABELS[m.payment_method] || m.payment_method} · {m.jobs}</span>
                    <span className="font-semibold">{money(m.gross)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-2 font-bold">Top earners</p>
              <Table
                rows={data.leaders}
                columns={[
                  { key: 'full_name', label: 'Name', render: (r) => <div><p className="font-semibold">{r.full_name}</p><p className="text-xs text-ink-muted">{ROLE_LABELS[r.role]}</p></div> },
                  { key: 'rating_avg', label: 'Rating', render: (r) => <Rating value={r.rating_avg} /> },
                  { key: 'jobs', label: 'Jobs' },
                  { key: 'earned', label: 'Earned', className: 'text-right', render: (r) => <span className="font-bold">{money(r.earned)}</span> },
                ]}
              />
            </div>
            <div>
              <p className="mb-2 font-bold">Promotion cost</p>
              <Table
                rowKey="code"
                rows={data.promoCost}
                empty="No promo redemptions in this period"
                columns={[
                  { key: 'code', label: 'Code', render: (r) => <span className="font-mono font-semibold">{r.code}</span> },
                  { key: 'uses', label: 'Uses' },
                  { key: 'cost', label: 'Cost', className: 'text-right', render: (r) => <span className="font-bold">{money(r.cost)}</span> },
                ]}
              />
            </div>
          </div>
        </>
      )}
    </>
  );
}
