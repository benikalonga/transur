'use client';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus } from 'lucide-react';
import { consoleApi } from '@/lib/api';
import { dateOnly, money } from '@/lib/format';
import { PageHead, Table, Tabs } from '@/components/console/kit';
import { useStaff } from '@/components/console/ConsoleShell';
import { Button, Modal, Pill } from '@/components/ui';

const EMPTY = { code: '', description: '', discount_type: 'percent', discount_value: '', max_discount: '', min_fare: '', service: 'any', usage_limit: '', per_user_limit: 1, starts_at: '', expires_at: '', is_active: true };

const describe = (p) => (p.discount_type === 'percent' ? `${Number(p.discount_value)}%${p.max_discount ? ` (max ${money(p.max_discount)})` : ''}` : money(p.discount_value));

export default function PromosPage() {
  const { staff } = useStaff();
  const [tab, setTab] = useState('public');
  const [promos, setPromos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const isOwner = staff.role === 'owner';

  const load = () => {
    setLoading(true);
    consoleApi.promos({ personal: tab === 'personal' ? '1' : undefined })
      .then((r) => setPromos(tab === 'personal' ? r.promos.filter((p) => p.owner_user_id) : r.promos))
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [tab]);

  const save = async () => {
    setBusy(true);
    try {
      const payload = { ...form };
      if (form.id) await consoleApi.updatePromo(form.id, payload);
      else await consoleApi.createPromo(payload);
      toast.success('Promotion saved');
      setForm(null);
      load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (p) => {
    try {
      await consoleApi.updatePromo(p.id, { is_active: !p.is_active });
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const toLocal = (v) => (v ? new Date(v).toISOString().slice(0, 16) : '');

  return (
    <>
      <PageHead
        title="Promotions"
        subtitle="Discount codes riders enter at checkout. Discounts are funded by the platform, never by the fleet."
        actions={isOwner && <Button className="py-2.5 text-sm" onClick={() => setForm(EMPTY)}><Plus size={16} /> New code</Button>}
      />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'public', label: 'Campaign codes' }, { value: 'personal', label: 'Referral & gift codes' }]} />
      <Table
        loading={loading}
        rows={promos}
        onRowClick={isOwner && tab === 'public' ? (p) => setForm({ ...EMPTY, ...p, starts_at: toLocal(p.starts_at), expires_at: toLocal(p.expires_at), max_discount: p.max_discount ?? '', usage_limit: p.usage_limit ?? '' }) : undefined}
        columns={[
          { key: 'code', label: 'Code', render: (p) => <div><p className="font-mono font-bold">{p.code}</p><p className="text-xs text-ink-muted">{p.description || (p.owner_name ? `For ${p.owner_name}` : '')}</p></div> },
          { key: 'discount', label: 'Discount', render: describe },
          { key: 'service', label: 'Service', render: (p) => <Pill>{p.service}</Pill> },
          { key: 'usage', label: 'Used', render: (p) => `${p.times_used}${p.usage_limit ? ` / ${p.usage_limit}` : ''}` },
          { key: 'total_discount', label: 'Cost', className: 'text-right', render: (p) => money(p.total_discount) },
          { key: 'expires_at', label: 'Expires', render: (p) => (p.expires_at ? dateOnly(p.expires_at) : 'Never') },
          { key: 'is_active', label: 'State', render: (p) => (
            <button disabled={!isOwner} onClick={(e) => { e.stopPropagation(); toggle(p); }}>
              <Pill tone={p.is_active ? 'green' : 'gray'}>{p.is_active ? 'Active' : 'Paused'}</Pill>
            </button>
          ) },
        ]}
      />

      <Modal open={Boolean(form)} onClose={() => setForm(null)} title={form?.id ? `Edit ${form.code}` : 'New promotion'} wide>
        {form && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label><span className="label">Code</span><input className="field uppercase" value={form.code} onChange={set('code')} placeholder="LAUNCH20" /></label>
            <label><span className="label">Description</span><input className="field" value={form.description || ''} onChange={set('description')} placeholder="20% off your next ride" /></label>
            <label><span className="label">Type</span>
              <select className="field" value={form.discount_type} onChange={set('discount_type')}><option value="percent">Percent</option><option value="flat">Flat amount</option></select>
            </label>
            <label><span className="label">{form.discount_type === 'percent' ? 'Percent off' : 'Amount off'}</span><input type="number" step="0.01" className="field" value={form.discount_value} onChange={set('discount_value')} /></label>
            <label><span className="label">Max discount</span><input type="number" step="0.01" className="field" value={form.max_discount} onChange={set('max_discount')} placeholder="No cap" /></label>
            <label><span className="label">Minimum fare</span><input type="number" step="0.01" className="field" value={form.min_fare} onChange={set('min_fare')} placeholder="0" /></label>
            <label><span className="label">Service</span>
              <select className="field" value={form.service} onChange={set('service')}><option value="any">Rides & parcels</option><option value="ride">Rides only</option><option value="parcel">Parcels only</option></select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label><span className="label">Total uses</span><input type="number" className="field" value={form.usage_limit} onChange={set('usage_limit')} placeholder="∞" /></label>
              <label><span className="label">Per rider</span><input type="number" min="1" className="field" value={form.per_user_limit} onChange={set('per_user_limit')} /></label>
            </div>
            <label><span className="label">Starts</span><input type="datetime-local" className="field" value={form.starts_at} onChange={set('starts_at')} /></label>
            <label><span className="label">Expires</span><input type="datetime-local" className="field" value={form.expires_at} onChange={set('expires_at')} /></label>
            <label className="flex items-center gap-2 text-sm font-semibold sm:col-span-2"><input type="checkbox" checked={Boolean(form.is_active)} onChange={set('is_active')} /> Active</label>
            <Button className="sm:col-span-2" loading={busy} disabled={!form.code || !form.discount_value} onClick={save}>Save promotion</Button>
          </div>
        )}
      </Modal>
    </>
  );
}
