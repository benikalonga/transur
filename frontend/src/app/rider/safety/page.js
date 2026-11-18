'use client';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { BadgeCheck, MessageSquareWarning, Share2, Siren, Trash2, UserPlus } from 'lucide-react';
import { api } from '@/lib/api';
import { locateOnce } from '@/lib/geo';
import { Button, TopBar } from '@/components/ui';

const TIPS = [
  { icon: BadgeCheck, title: 'Check before you get in', text: 'Match the plate, vehicle and driver photo shown in the app.' },
  { icon: Share2, title: 'Share your trip', text: 'Send a live tracking link to someone you trust from the shield button.' },
  { icon: MessageSquareWarning, title: 'Keep chats in the app', text: 'Your messages stay attached to the trip in case you need support.' },
];

export default function SafetyPage() {
  const [contacts, setContacts] = useState([]);
  const [form, setForm] = useState({ name: '', phone: '' });
  const [busy, setBusy] = useState(null);

  const load = () => api.me.contacts().then((r) => setContacts(r.contacts)).catch(() => {});
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    setBusy('add');
    try {
      await api.me.addContact(form);
      setForm({ name: '', phone: '' });
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  const sos = async () => {
    if (!window.confirm('Send an emergency alert to the Transur safety team and your trusted contacts?')) return;
    setBusy('sos');
    try {
      const pos = await locateOnce().catch(() => ({}));
      const r = await api.sos({ lat: pos.lat, lng: pos.lng });
      toast.success(`Alert sent${r.contactsAlerted ? ` to ${r.contactsAlerted} contact(s) and` : ' to'} our safety team.`, { duration: 6000 });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="pb-6">
      <TopBar title="Safety" />
      <div className="space-y-5 p-4">
        <div className="rounded-3xl bg-red-500 p-5 text-white">
          <Siren size={28} />
          <p className="mt-3 text-lg font-extrabold">Emergency SOS</p>
          <p className="mt-1 text-sm text-white/85">Shares your location with our safety team and texts your trusted contacts. In immediate danger, call local emergency services first.</p>
          <Button variant="ghost" className="mt-4 w-full border-0 text-red-600" loading={busy === 'sos'} onClick={sos}>Send SOS now</Button>
        </div>

        <section>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-muted">Trusted contacts ({contacts.length}/5)</h2>
          <div className="surface divide-y divide-line">
            {contacts.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1"><p className="font-semibold">{c.name}</p><p className="text-xs text-ink-muted">{c.phone}</p></div>
                <button onClick={() => api.me.removeContact(c.id).then(load)} className="p-2 text-ink-faint hover:text-red-500" aria-label="Remove contact"><Trash2 size={18} /></button>
              </div>
            ))}
            {contacts.length < 5 && (
              <form onSubmit={add} className="space-y-2 p-4">
                <div className="grid grid-cols-2 gap-2">
                  <input className="field py-3" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  <input className="field py-3" type="tel" placeholder="+243 81 234 5678" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <Button variant="ink" type="submit" className="w-full py-3" loading={busy === 'add'} disabled={!form.name || !form.phone}><UserPlus size={16} /> Add contact</Button>
              </form>
            )}
          </div>
        </section>

        <section className="space-y-2">
          {TIPS.map(({ icon: Icon, title, text }) => (
            <div key={title} className="surface flex gap-3 p-4">
              <Icon size={20} className="mt-0.5 flex-shrink-0 text-brand-500" />
              <div><p className="font-semibold">{title}</p><p className="text-sm text-ink-muted">{text}</p></div>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
