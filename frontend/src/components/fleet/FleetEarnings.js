'use client';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { ArrowDownLeft, ArrowUpRight, Lock, Plus, TrendingUp } from 'lucide-react';
import { api } from '@/lib/api';
import { dateTime, km, money, PAYMENT_LABELS, signedMoney, toBase, toDisplay } from '@/lib/format';
import { useAccount } from '@/components/shell/AppShell';
import { Button, Modal, Segmented, Spinner, TopBar } from '@/components/ui';

const PROVIDERS = ['mpesa', 'airtel_money', 'orange_money', 'mtn_momo'];
const KIND_LABEL = {
  commission: 'Service fee',
  payout: 'Earnings',
  top_up: 'Top-up',
  tip: 'Tip',
  promo_credit: 'Promo cover',
  adjustment: 'Adjustment',
  refund: 'Refund',
};

export default function FleetEarnings() {
  const { profile, refresh } = useAccount();
  const [wallet, setWallet] = useState(null);
  const [earnings, setEarnings] = useState(null);
  const [period, setPeriod] = useState('today');
  const [entries, setEntries] = useState([]);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [topUp, setTopUp] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [w, e, l] = await Promise.all([api.wallet.get(), api.me.earnings(), api.wallet.entries(1)]);
    setWallet(w.wallet);
    setEarnings(e);
    setEntries(l.entries);
    setMore(l.entries.length === 30);
    setPage(1);
  };
  useEffect(() => { load().catch((e) => toast.error(e.message)); }, []);

  const loadMore = async () => {
    const l = await api.wallet.entries(page + 1);
    setEntries((list) => [...list, ...l.entries]);
    setMore(l.entries.length === 30);
    setPage(page + 1);
  };

  const submitTopUp = async () => {
    setBusy(true);
    try {
      const res = await api.wallet.topUp({ amount: toBase(topUp.amount), provider: topUp.provider, phone: topUp.phone || profile.phone });
      toast.success(res.status === 'succeeded' ? 'Wallet topped up' : res.instructions, { duration: 6000 });
      setTopUp(null);
      await load();
      refresh();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!wallet || !earnings) return <div className="flex h-[60vh] items-center justify-center"><Spinner className="text-brand-500" /></div>;

  const stats = earnings[period];
  const maxDay = Math.max(1, ...earnings.daily.map((d) => d.net));
  const days = [...Array(7)].map((_, i) => {
    const d = new Date(Date.now() - (6 - i) * 864e5);
    const key = d.toISOString().slice(0, 10);
    const row = earnings.daily.find((x) => String(x.day).slice(0, 10) === key);
    return { label: d.toLocaleDateString('en-GB', { weekday: 'narrow' }), net: row?.net || 0 };
  });
  const acceptRate = earnings.acceptance.offered ? Math.round((earnings.acceptance.bid_on / earnings.acceptance.offered) * 100) : null;

  return (
    <main className="pb-6">
      <TopBar title="Earnings" back={false} />
      <div className="space-y-4 p-4">
        <div className={clsx('rounded-3xl p-5 text-white', wallet.is_locked ? 'bg-red-500' : 'bg-ink')}>
          <div className="flex items-center justify-between">
            <p className="text-sm text-white/70">Wallet balance</p>
            {wallet.is_locked ? <span className="flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-xs font-bold"><Lock size={12} /> Locked</span> : null}
          </div>
          <p className="mt-1 text-4xl font-extrabold">{money(wallet.balance)}</p>
          <p className="mt-1 text-xs text-white/70">
            {wallet.balance < 0 ? `You owe service fees from cash trips. Requests stop at ${money(wallet.debt_limit)}.` : 'Positive balances are paid out to you by the Transur team.'}
          </p>
          <Button variant="ghost" className="mt-4 w-full border-0" onClick={() => setTopUp({ amount: '', provider: 'mpesa', phone: '' })}><Plus size={16} /> Top up with mobile money</Button>
        </div>

        <div className="surface p-4">
          <Segmented value={period} onChange={setPeriod} options={[{ value: 'today', label: 'Today' }, { value: 'week', label: '7 days' }, { value: 'lifetime', label: 'All time' }]} />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div><p className="text-xs text-ink-muted">Net earnings</p><p className="text-2xl font-extrabold">{money(stats.net + stats.tips)}</p></div>
            <div><p className="text-xs text-ink-muted">Jobs</p><p className="text-2xl font-extrabold">{stats.jobs}</p></div>
            <div><p className="text-xs text-ink-muted">Tips</p><p className="font-bold">{money(stats.tips)}</p></div>
            <div><p className="text-xs text-ink-muted">Distance</p><p className="font-bold">{km(stats.km)}</p></div>
          </div>
          <div className="mt-5 flex h-28 items-end gap-2">
            {days.map((d, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div className="w-full rounded-t-md bg-brand-500/90" style={{ height: `${Math.max(4, (d.net / maxDay) * 96)}px` }} title={money(d.net)} />
                <span className="text-[10px] font-semibold text-ink-muted">{d.label}</span>
              </div>
            ))}
          </div>
          {acceptRate != null && (
            <p className="mt-3 flex items-center gap-2 text-xs text-ink-muted"><TrendingUp size={14} /> You responded to {acceptRate}% of requests sent to you in the last 30 days.</p>
          )}
        </div>

        <section>
          <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-ink-muted">Wallet activity</h2>
          <div className="surface divide-y divide-line">
            {entries.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                <span className={clsx('flex h-9 w-9 items-center justify-center rounded-xl', e.amount >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500')}>
                  {e.amount >= 0 ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{KIND_LABEL[e.kind] || e.kind}</p>
                  <p className="truncate text-xs text-ink-muted">{e.memo} · {dateTime(e.created_at)}</p>
                </div>
                <span className={clsx('text-sm font-extrabold', e.amount >= 0 ? 'text-emerald-600' : 'text-red-500')}>{signedMoney(e.amount)}</span>
              </div>
            ))}
            {entries.length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-muted">No wallet activity yet.</p>}
          </div>
          {more && <button onClick={loadMore} className="btn-ghost mx-auto mt-3 flex">Load more</button>}
        </section>
      </div>

      <Modal open={Boolean(topUp)} onClose={() => setTopUp(null)} title="Top up wallet">
        {topUp && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {PROVIDERS.map((p) => (
                <button key={p} onClick={() => setTopUp({ ...topUp, provider: p })} className={topUp.provider === p ? 'chip-on justify-center' : 'chip-off justify-center'}>{PAYMENT_LABELS[p]}</button>
              ))}
            </div>
            <input className="field text-xl font-bold" inputMode="decimal" placeholder="Amount" value={topUp.amount} onChange={(e) => setTopUp({ ...topUp, amount: e.target.value.replace(/[^\d.]/g, '') })} />
            <input className="field" type="tel" placeholder={`Paying number (default ${profile.phone})`} value={topUp.phone} onChange={(e) => setTopUp({ ...topUp, phone: e.target.value })} />
            {wallet.balance < 0 && (
              <button onClick={() => setTopUp({ ...topUp, amount: toDisplay(Math.abs(wallet.balance)).toFixed(2) })} className="text-xs font-semibold text-brand-600">
                Clear my balance ({money(Math.abs(wallet.balance))})
              </button>
            )}
            <Button className="w-full" loading={busy} disabled={!(parseFloat(topUp.amount) > 0)} onClick={submitTopUp}>Pay {topUp.amount || ''}</Button>
          </div>
        )}
      </Modal>
    </main>
  );
}
