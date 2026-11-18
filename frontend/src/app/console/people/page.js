'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { BadgeCheck, Headset, Lock, Unlock } from 'lucide-react';
import { consoleApi } from '@/lib/api';
import { dateOnly, dateTime, money, ROLE_LABELS, STATUS_LABELS, timeAgo, VEHICLE_LABELS } from '@/lib/format';
import { PageHead, Pager, SearchBox, Select, Table, Tabs, useDebounced } from '@/components/console/kit';
import { useStaff } from '@/components/console/ConsoleShell';
import { Avatar, Button, Modal, Pill, Rating, StatusPill } from '@/components/ui';

const ACCOUNT_TONE = { active: 'green', suspended: 'amber', banned: 'red' };

function PersonModal({ id, onClose, onChanged }) {
  const router = useRouter();
  const { staff } = useStaff();
  const [data, setData] = useState(null);
  const [adjust, setAdjust] = useState({ amount: '', memo: '' });

  const load = () => consoleApi.person(id).then(setData).catch((e) => toast.error(e.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (id) load(); else setData(null); }, [id]);

  const act = async (fn, msg) => {
    try {
      await fn();
      toast.success(msg);
      load();
      onChanged();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const p = data?.person;
  const isFleet = p && p.role !== 'rider';

  return (
    <Modal open={Boolean(id)} onClose={onClose} title="Person" wide>
      {p && (
        <div className="space-y-5 text-sm">
          <div className="flex items-center gap-4">
            <Avatar name={p.full_name} src={p.avatar_url} size={64} />
            <div className="flex-1">
              <p className="text-lg font-extrabold">{p.full_name} {p.is_verified ? <BadgeCheck size={16} className="inline text-brand-500" /> : null}</p>
              <p className="text-ink-muted">{p.phone}{p.email ? ` · ${p.email}` : ''}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Pill tone="violet">{ROLE_LABELS[p.role]}</Pill>
                <Pill tone={ACCOUNT_TONE[p.account_status]}>{p.account_status}</Pill>
                <span className="text-xs text-ink-muted">Joined {dateOnly(p.created_at)} · active {timeAgo(p.last_active_at)}</span>
              </div>
              {p.referred_by_name && <p className="mt-1 text-xs text-ink-muted">Invited by {p.referred_by_name} · code {p.referral_code}</p>}
            </div>
          </div>

          {isFleet && (
            <div className="grid gap-3 rounded-2xl bg-canvas p-4 sm:grid-cols-4">
              <div><p className="text-xs text-ink-muted">Vehicle</p><p className="font-semibold">{VEHICLE_LABELS[p.vehicle_class]} {p.vehicle_make || ''}</p></div>
              <div><p className="text-xs text-ink-muted">Plate / licence</p><p className="font-semibold">{p.plate_number || '—'} / {p.licence_number || '—'}</p></div>
              <div><p className="text-xs text-ink-muted">Rating</p><Rating value={p.rating_avg} /> <span className="text-xs text-ink-muted">({p.rating_count})</span></div>
              <div><p className="text-xs text-ink-muted">Jobs</p><p className="font-semibold">{p.jobs_completed} · {p.availability}</p></div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {isFleet && (
              <Button variant={p.is_verified ? 'ghost' : 'brand'} className="py-2.5 text-sm" onClick={() => act(() => consoleApi.verify(p.id, !p.is_verified), p.is_verified ? 'Verification removed' : 'Verified')}>
                <BadgeCheck size={16} /> {p.is_verified ? 'Remove verification' : 'Verify documents'}
              </Button>
            )}
            {p.account_status !== 'active' && <Button variant="ghost" className="py-2.5 text-sm" onClick={() => act(() => consoleApi.setPersonStatus(p.id, 'active'), 'Account reactivated')}>Reactivate</Button>}
            {p.account_status === 'active' && <Button variant="ghost" className="py-2.5 text-sm text-amber-600" onClick={() => act(() => consoleApi.setPersonStatus(p.id, 'suspended'), 'Account suspended')}>Suspend</Button>}
            {p.account_status !== 'banned' && <Button variant="ghost" className="py-2.5 text-sm text-red-500" onClick={() => window.confirm('Ban this account permanently?') && act(() => consoleApi.setPersonStatus(p.id, 'banned'), 'Account banned')}>Ban</Button>}
            <Button variant="ink" className="py-2.5 text-sm" onClick={async () => { const { thread } = await consoleApi.startThread(p.id); router.push(`/console/help?thread=${thread.id}`); }}>
              <Headset size={16} /> Message
            </Button>
          </div>

          {data.wallet && (
            <div className="rounded-2xl border border-line p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-ink-muted">Wallet</p>
                  <p className={`text-2xl font-extrabold ${data.wallet.balance < 0 ? 'text-red-500' : ''}`}>{money(data.wallet.balance)}</p>
                  <p className="text-xs text-ink-muted">Debt limit {money(data.wallet.debt_limit)} · earned {money(data.wallet.lifetime_earnings)}</p>
                </div>
                <Button variant="ghost" className="py-2 text-sm" onClick={() => act(() => consoleApi.lockWallet(p.id, !data.wallet.is_locked), data.wallet.is_locked ? 'Wallet unlocked' : 'Wallet locked')}>
                  {data.wallet.is_locked ? <><Unlock size={14} /> Unlock</> : <><Lock size={14} /> Lock</>}
                </Button>
              </div>
              {staff.role === 'owner' && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <input className="field w-32 py-2 text-sm" placeholder="± amount" value={adjust.amount} onChange={(e) => setAdjust({ ...adjust, amount: e.target.value })} />
                  <input className="field flex-1 py-2 text-sm" placeholder="Reason (required)" value={adjust.memo} onChange={(e) => setAdjust({ ...adjust, memo: e.target.value })} />
                  <Button className="py-2 text-sm" disabled={!parseFloat(adjust.amount) || adjust.memo.length < 3} onClick={() => act(() => consoleApi.adjustWallet(p.id, parseFloat(adjust.amount), adjust.memo), 'Wallet adjusted').then(() => setAdjust({ amount: '', memo: '' }))}>Apply</Button>
                </div>
              )}
            </div>
          )}

          <div>
            <p className="mb-2 font-bold">Recent bookings</p>
            <div className="divide-y divide-line rounded-2xl border border-line">
              {data.recent.map((b) => (
                <div key={b.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="flex-1 truncate">{b.pickup_address} → {b.dropoff_address}</span>
                  <span className="text-xs text-ink-muted">{dateTime(b.created_at)}</span>
                  <span className="w-16 text-right font-semibold">{money(b.final_fare ?? b.rider_offer)}</span>
                  <StatusPill status={b.status} />
                </div>
              ))}
              {data.recent.length === 0 && <p className="p-4 text-center text-ink-muted">No bookings yet.</p>}
            </div>
            <p className="mt-2 text-xs text-ink-muted">{data.stats.map((s) => `${STATUS_LABELS[s.status]}: ${s.n}`).join(' · ')}</p>
          </div>
          {data.contacts.length > 0 && <p className="text-xs text-ink-muted">Trusted contacts: {data.contacts.map((c) => `${c.name} (${c.phone})`).join(', ')}</p>}
        </div>
      )}
    </Modal>
  );
}

export default function PeoplePage() {
  const [role, setRole] = useState('driver');
  const [filters, setFilters] = useState({ q: '', status: '', verified: '', availability: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ people: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const q = useDebounced(filters.q);

  const load = () => {
    setLoading(true);
    const params = { role, page, ...Object.fromEntries(Object.entries({ ...filters, q }).filter(([, v]) => v)) };
    consoleApi.people(params).then(setData).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [role, page, filters.status, filters.verified, filters.availability, q]);

  const set = (k) => (v) => { setPage(1); setFilters((f) => ({ ...f, [k]: v })); };
  const isFleet = role !== 'rider';

  const columns = [
    { key: 'full_name', label: 'Name', render: (r) => (
      <div className="flex items-center gap-3">
        <Avatar name={r.full_name} src={r.avatar_url} size={34} />
        <div><p className="font-semibold">{r.full_name} {r.is_verified ? <BadgeCheck size={14} className="inline text-brand-500" /> : null}</p><p className="text-xs text-ink-muted">{r.phone}</p></div>
      </div>
    ) },
    ...(isFleet ? [
      { key: 'vehicle', label: 'Vehicle', render: (r) => <div><p>{VEHICLE_LABELS[r.vehicle_class]}</p><p className="text-xs text-ink-muted">{r.plate_number || '—'}</p></div> },
      { key: 'availability', label: 'Now', render: (r) => <Pill tone={r.availability === 'online' ? 'green' : r.availability === 'busy' ? 'amber' : 'gray'}>{r.availability}</Pill> },
      { key: 'rating_avg', label: 'Rating', render: (r) => <Rating value={r.rating_avg} /> },
      { key: 'jobs_completed', label: 'Jobs' },
      { key: 'wallet_balance', label: 'Wallet', className: 'text-right', render: (r) => <span className={`font-semibold ${r.wallet_balance < 0 ? 'text-red-500' : ''}`}>{money(r.wallet_balance)} {r.wallet_locked ? '🔒' : ''}</span> },
    ] : []),
    { key: 'account_status', label: 'Account', render: (r) => <Pill tone={ACCOUNT_TONE[r.account_status]}>{r.account_status}</Pill> },
    { key: 'created_at', label: 'Joined', render: (r) => <span className="text-xs text-ink-muted">{dateOnly(r.created_at)}</span> },
  ];

  return (
    <>
      <PageHead title="People" subtitle="Riders, drivers and couriers. Verify documents, manage accounts and wallets." />
      <Tabs value={role} onChange={(r) => { setRole(r); setPage(1); }} tabs={[{ value: 'driver', label: 'Drivers' }, { value: 'courier', label: 'Couriers' }, { value: 'rider', label: 'Riders' }]} />
      <div className="mb-4 flex flex-wrap gap-2">
        <SearchBox value={filters.q} onChange={set('q')} placeholder={isFleet ? 'Name, phone or plate' : 'Name or phone'} />
        <Select label="Account" value={filters.status} onChange={set('status')} options={[{ value: '', label: 'Any account' }, { value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' }, { value: 'banned', label: 'Banned' }]} />
        {isFleet && <Select label="Verification" value={filters.verified} onChange={set('verified')} options={[{ value: '', label: 'Any verification' }, { value: '0', label: 'Needs verification' }, { value: '1', label: 'Verified' }]} />}
        {isFleet && <Select label="Availability" value={filters.availability} onChange={set('availability')} options={[{ value: '', label: 'Any availability' }, { value: 'online', label: 'Online' }, { value: 'busy', label: 'On a job' }, { value: 'offline', label: 'Offline' }]} />}
      </div>
      <Table loading={loading} rows={data.people} columns={columns} onRowClick={(r) => setOpenId(r.id)} />
      <Pager page={page} total={data.total} onChange={setPage} />
      <PersonModal id={openId} onClose={() => setOpenId(null)} onChanged={load} />
    </>
  );
}
