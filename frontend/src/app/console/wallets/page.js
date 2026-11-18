'use client';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Lock, Scale, Unlock, Wallet } from 'lucide-react';
import { consoleApi } from '@/lib/api';
import { dateTime, money, ROLE_LABELS, signedMoney } from '@/lib/format';
import { PageHead, Pager, SearchBox, Select, Stat, Table, Tabs, useDebounced } from '@/components/console/kit';
import { Pill } from '@/components/ui';

const KINDS = ['', 'commission', 'payout', 'top_up', 'tip', 'promo_credit', 'adjustment', 'refund'];

export default function WalletsPage() {
  const [tab, setTab] = useState('wallets');
  const [q, setQ] = useState('');
  const [lockedOnly, setLockedOnly] = useState('');
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(1);
  const [wallets, setWallets] = useState({ wallets: [], total: 0, totals: null });
  const [ledger, setLedger] = useState({ entries: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const search = useDebounced(q);

  const load = () => {
    setLoading(true);
    const req = tab === 'wallets'
      ? consoleApi.wallets({ page, q: search || undefined, locked: lockedOnly || undefined }).then(setWallets)
      : consoleApi.ledger({ page, kind: kind || undefined }).then(setLedger);
    req.catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [tab, page, search, lockedOnly, kind]);

  const toggle = async (w) => {
    try {
      await consoleApi.lockWallet(w.user_id, !w.is_locked);
      toast.success(w.is_locked ? 'Unlocked' : 'Locked');
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const t = wallets.totals;

  return (
    <>
      <PageHead title="Wallets" subtitle="Fleet balances. Negative balances are service fees owed from cash trips." />
      {t && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Stat label="Owed to platform" value={money(t.owed_to_platform)} icon={Scale} tone="red" />
          <Stat label="Owed to fleet" value={money(t.owed_to_fleet)} icon={Wallet} tone="green" />
          <Stat label="Locked wallets" value={t.locked || 0} icon={Lock} tone="amber" />
        </div>
      )}
      <Tabs value={tab} onChange={(v) => { setTab(v); setPage(1); }} tabs={[{ value: 'wallets', label: 'Balances' }, { value: 'ledger', label: 'Ledger' }]} />

      {tab === 'wallets' ? (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Name or phone" />
            <Select label="Lock state" value={lockedOnly} onChange={(v) => { setLockedOnly(v); setPage(1); }} options={[{ value: '', label: 'All wallets' }, { value: '1', label: 'Locked only' }]} />
          </div>
          <Table
            rowKey="user_id"
            loading={loading}
            rows={wallets.wallets}
            columns={[
              { key: 'full_name', label: 'Owner', render: (r) => <div><p className="font-semibold">{r.full_name}</p><p className="text-xs text-ink-muted">{ROLE_LABELS[r.role]} · {r.phone}</p></div> },
              { key: 'balance', label: 'Balance', className: 'text-right', render: (r) => <span className={`font-bold ${r.balance < 0 ? 'text-red-500' : 'text-emerald-600'}`}>{money(r.balance)}</span> },
              { key: 'debt_limit', label: 'Limit', className: 'text-right', render: (r) => money(r.debt_limit) },
              { key: 'lifetime_earnings', label: 'Lifetime earnings', className: 'text-right', render: (r) => money(r.lifetime_earnings) },
              { key: 'lifetime_topups', label: 'Top-ups', className: 'text-right', render: (r) => money(r.lifetime_topups) },
              { key: 'is_locked', label: 'State', render: (r) => (r.is_locked ? <Pill tone="red">Locked · {r.lock_reason}</Pill> : <Pill tone="green">Active</Pill>) },
              { key: 'act', label: '', render: (r) => (
                <button onClick={() => toggle(r)} className="btn-ghost px-3 py-1.5 text-xs">{r.is_locked ? <><Unlock size={12} /> Unlock</> : <><Lock size={12} /> Lock</>}</button>
              ) },
            ]}
          />
          <Pager page={page} total={wallets.total} onChange={setPage} />
        </>
      ) : (
        <>
          <div className="mb-4">
            <Select label="Entry type" value={kind} onChange={(v) => { setKind(v); setPage(1); }} options={KINDS.map((k) => ({ value: k, label: k ? k.replace('_', ' ') : 'All entry types' }))} />
          </div>
          <Table
            loading={loading}
            rows={ledger.entries}
            columns={[
              { key: 'created_at', label: 'When', render: (r) => <span className="whitespace-nowrap text-xs">{dateTime(r.created_at)}</span> },
              { key: 'full_name', label: 'Account', render: (r) => <div><p className="font-semibold">{r.full_name}</p><p className="text-xs text-ink-muted">{ROLE_LABELS[r.role]}</p></div> },
              { key: 'kind', label: 'Type', render: (r) => <Pill>{r.kind.replace('_', ' ')}</Pill> },
              { key: 'memo', label: 'Memo', render: (r) => <span className="text-xs">{r.memo}</span> },
              { key: 'amount', label: 'Amount', className: 'text-right', render: (r) => <span className={`font-bold ${r.amount < 0 ? 'text-red-500' : 'text-emerald-600'}`}>{signedMoney(r.amount)}</span> },
              { key: 'balance_after', label: 'Balance after', className: 'text-right', render: (r) => money(r.balance_after) },
            ]}
          />
          <Pager page={page} total={ledger.total} limit={40} onChange={setPage} />
        </>
      )}
    </>
  );
}
