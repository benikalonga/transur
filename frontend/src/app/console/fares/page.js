'use client';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Zap } from 'lucide-react';
import { consoleApi } from '@/lib/api';
import { money, timeAgo } from '@/lib/format';
import { PageHead } from '@/components/console/kit';
import { useStaff } from '@/components/console/ConsoleShell';
import { Button, Pill } from '@/components/ui';

const FIELDS = [
  ['base_fare', 'Base fare'],
  ['per_km', 'Per km'],
  ['per_minute', 'Per minute'],
  ['minimum_fare', 'Minimum'],
  ['commission_pct', 'Commission %'],
  ['surge_multiplier', 'Surge ×'],
];

function RuleCard({ rule, canEdit, onSaved }) {
  const [form, setForm] = useState(rule);
  const [busy, setBusy] = useState(false);
  const dirty = FIELDS.some(([k]) => Number(form[k]) !== Number(rule[k])) || form.is_active !== rule.is_active || form.label !== rule.label;
  const sample = Math.max(form.base_fare * 1 + 5 * form.per_km + 15 * form.per_minute, form.minimum_fare) * form.surge_multiplier;

  const save = async () => {
    setBusy(true);
    try {
      const payload = Object.fromEntries([...FIELDS.map(([k]) => [k, Number(form[k])]), ['is_active', form.is_active ? 1 : 0], ['label', form.label]]);
      const { rule: saved } = await consoleApi.updateFare(rule.id, payload);
      onSaved(saved);
      toast.success(`${saved.label} updated`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`surface p-5 ${form.is_active ? '' : 'opacity-60'}`}>
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <input disabled={!canEdit} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className="w-full bg-transparent text-lg font-extrabold outline-none" />
          <p className="text-xs text-ink-muted">{rule.service} · {rule.vehicle_class} · {rule.city} · updated {timeAgo(rule.updated_at)}</p>
        </div>
        {Number(form.surge_multiplier) > 1 && <Pill tone="amber"><Zap size={11} /> Surge</Pill>}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {FIELDS.map(([k, label]) => (
          <label key={k}>
            <span className="label">{label}</span>
            <input type="number" step="0.01" min="0" disabled={!canEdit} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className="field py-2.5 text-sm" />
          </label>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-muted">Example 5 km / 15 min trip: <span className="font-bold text-ink">{money(sample)}</span></p>
      {canEdit && (
        <div className="mt-4 flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={Boolean(form.is_active)} onChange={(e) => setForm({ ...form, is_active: e.target.checked ? 1 : 0 })} /> Available to riders
          </label>
          <Button className="py-2 text-sm" disabled={!dirty} loading={busy} onClick={save}>Save</Button>
        </div>
      )}
    </div>
  );
}

export default function FaresPage() {
  const { staff } = useStaff();
  const [rules, setRules] = useState([]);

  useEffect(() => { consoleApi.fares().then((r) => setRules(r.rules)).catch((e) => toast.error(e.message)); }, []);

  return (
    <>
      <PageHead title="Fares" subtitle="Suggested prices per vehicle class. Riders and fleet still negotiate around them; riders can offer down to 80% of the suggestion." />
      {staff.role !== 'owner' && <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-700">Only owners can change fares.</p>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rules.map((r) => (
          <RuleCard key={r.id} rule={r} canEdit={staff.role === 'owner'} onSaved={(saved) => setRules((list) => list.map((x) => (x.id === saved.id ? saved : x)))} />
        ))}
      </div>
    </>
  );
}
