'use client';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { MapPin, Phone, ShieldAlert } from 'lucide-react';
import { consoleApi } from '@/lib/api';
import { consoleSocket } from '@/lib/socket';
import { dateTime, ROLE_LABELS, STATUS_LABELS, timeAgo } from '@/lib/format';
import { PageHead, Tabs } from '@/components/console/kit';
import { useStaff } from '@/components/console/ConsoleShell';
import { Button, Empty, Pill } from '@/components/ui';

const TONE = { open: 'red', acknowledged: 'amber', resolved: 'green' };

export default function SafetyPage() {
  const { setBadges } = useStaff();
  const [status, setStatus] = useState('');
  const [alerts, setAlerts] = useState([]);

  const load = () => consoleApi.sos({ status: status || undefined }).then((r) => {
    setAlerts(r.alerts);
    setBadges((b) => ({ ...b, sos: r.alerts.filter((a) => a.status !== 'resolved').length }));
  }).catch((e) => toast.error(e.message));

  useEffect(() => {
    load();
    const socket = consoleSocket();
    socket?.on('sos:new', load);
    socket?.on('sos:updated', load);
    return () => { socket?.off('sos:new', load); socket?.off('sos:updated', load); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const update = async (id, next) => {
    try {
      await consoleApi.updateSos(id, next);
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <>
      <PageHead title="Safety alerts" subtitle="SOS alerts raised from the apps. Acknowledging one tells the person that help is coming." />
      <Tabs value={status} onChange={setStatus} tabs={[{ value: '', label: 'All' }, { value: 'open', label: 'Open' }, { value: 'acknowledged', label: 'Acknowledged' }, { value: 'resolved', label: 'Resolved' }]} />
      <div className="grid gap-4 lg:grid-cols-2">
        {alerts.map((a) => (
          <div key={a.id} className={`surface p-5 ${a.status === 'open' ? 'border-red-300 ring-2 ring-red-100' : ''}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-lg font-extrabold"><ShieldAlert size={18} className="text-red-500" /> {a.full_name}</p>
                <p className="text-sm text-ink-muted">{ROLE_LABELS[a.role]} · raised {timeAgo(a.created_at)} ({dateTime(a.created_at)})</p>
              </div>
              <Pill tone={TONE[a.status]}>{a.status}</Pill>
            </div>
            {a.message && <p className="mt-3 rounded-xl bg-canvas p-3 text-sm">“{a.message}”</p>}
            {a.booking_id && (
              <p className="mt-3 text-sm"><span className="text-ink-muted">During {a.service}:</span> {a.pickup_address} → {a.dropoff_address} <span className="text-ink-muted">({STATUS_LABELS[a.booking_status]})</span></p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <a href={`tel:${a.phone}`} className="btn-ink py-2 text-sm"><Phone size={14} /> Call {a.phone}</a>
              {a.lat && <a href={`https://maps.google.com/?q=${a.lat},${a.lng}`} target="_blank" rel="noreferrer" className="btn-ghost py-2 text-sm"><MapPin size={14} /> Location</a>}
              {a.status === 'open' && <Button className="py-2 text-sm" onClick={() => update(a.id, 'acknowledged')}>Acknowledge</Button>}
              {a.status !== 'resolved' && <Button variant="ghost" className="py-2 text-sm" onClick={() => update(a.id, 'resolved')}>Mark resolved</Button>}
            </div>
            {a.handled_by_name && <p className="mt-3 text-xs text-ink-muted">Handled by {a.handled_by_name}</p>}
          </div>
        ))}
      </div>
      {alerts.length === 0 && <Empty icon={ShieldAlert} title="No alerts" text="Nothing needs your attention right now." />}
    </>
  );
}
