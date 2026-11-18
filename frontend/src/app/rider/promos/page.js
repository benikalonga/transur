'use client';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Copy, Gift, Ticket } from 'lucide-react';
import { api } from '@/lib/api';
import { dateOnly, money } from '@/lib/format';
import { Button, Empty, Pill, TopBar } from '@/components/ui';

const describe = (p) =>
  p.discount_type === 'percent'
    ? `${Number(p.discount_value)}% off${p.max_discount ? ` (up to ${money(p.max_discount)})` : ''}`
    : `${money(p.discount_value)} off`;

export default function PromosPage() {
  const [promos, setPromos] = useState(null);
  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);

  useEffect(() => { api.promos.mine().then((r) => setPromos(r.promos)).catch(() => setPromos([])); }, []);

  const check = async (e) => {
    e.preventDefault();
    setChecking(true);
    try {
      const r = await api.promos.check(code.trim());
      toast.success(`${r.code}: ${describe(r)} — enter it when you book.`, { duration: 5000 });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setChecking(false);
    }
  };

  const copy = (c) => navigator.clipboard?.writeText(c).then(() => toast.success('Code copied'));

  return (
    <main className="pb-6">
      <TopBar title="Promotions" />
      <form onSubmit={check} className="flex gap-2 p-4">
        <input className="field flex-1 uppercase" placeholder="Have a code?" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        <Button type="submit" variant="ink" loading={checking} disabled={!code.trim()}>Check</Button>
      </form>
      <div className="space-y-3 px-4">
        {promos?.map((p) => (
          <div key={p.id} className="relative overflow-hidden rounded-2xl border border-line bg-white">
            <div className="flex items-start gap-3 p-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500 text-white">{p.is_personal ? <Gift size={20} /> : <Ticket size={20} />}</span>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-extrabold">{describe(p)}</p>
                <p className="text-sm text-ink-muted">{p.description || (p.service === 'any' ? 'Rides and deliveries' : `${p.service === 'ride' ? 'Rides' : 'Deliveries'} only`)}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {p.is_personal ? <Pill tone="violet">Just for you</Pill> : null}
                  {p.min_fare > 0 && <Pill>Min. fare {money(p.min_fare)}</Pill>}
                  {p.expires_at && <Pill tone="amber">Until {dateOnly(p.expires_at)}</Pill>}
                </div>
              </div>
            </div>
            <button onClick={() => copy(p.code)} className="flex w-full items-center justify-between border-t border-dashed border-line bg-canvas px-4 py-2.5 text-sm font-bold tracking-wider">
              {p.code} <Copy size={16} className="text-ink-muted" />
            </button>
          </div>
        ))}
        {promos?.length === 0 && <Empty icon={Gift} title="No promotions right now" text="Invite friends to earn reward codes." />}
      </div>
    </main>
  );
}
