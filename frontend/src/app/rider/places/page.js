'use client';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Briefcase, Home, MapPin, Plus, Star, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { PinPicker } from '@/components/map';
import { Button, Empty, Modal, Segmented, TopBar } from '@/components/ui';

const ICON = { home: Home, work: Briefcase, other: Star };

export default function PlacesPage() {
  const [places, setPlaces] = useState([]);
  const [draft, setDraft] = useState(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = () => api.me.places().then((r) => setPlaces(r.places)).catch(() => {});
  useEffect(() => { load(); }, []);

  const save = async () => {
    setBusy(true);
    try {
      await api.me.addPlace(draft);
      toast.success('Place saved');
      setDraft(null);
      load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    await api.me.removePlace(id).catch((e) => toast.error(e.message));
    load();
  };

  return (
    <main>
      <TopBar title="Saved places" right={
        <button onClick={() => setDraft({ kind: 'other', label: '' })} className="tap flex h-10 w-10 items-center justify-center rounded-full bg-brand-500 text-white" aria-label="Add place"><Plus size={18} /></button>
      } />
      <div className="space-y-2 p-4">
        {places.map((p) => {
          const Icon = ICON[p.kind];
          return (
            <div key={p.id} className="surface flex items-center gap-3 p-3.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-canvas"><Icon size={18} /></span>
              <div className="min-w-0 flex-1">
                <p className="font-bold">{p.label}</p>
                <p className="truncate text-xs text-ink-muted">{p.address}</p>
              </div>
              <button onClick={() => remove(p.id)} className="tap p-2 text-ink-faint hover:text-red-500" aria-label="Remove"><Trash2 size={18} /></button>
            </div>
          );
        })}
        {places.length === 0 && <Empty icon={MapPin} title="No saved places" text="Save home, work and favourites to book in one tap." />}
      </div>

      <Modal open={Boolean(draft) && !picking} onClose={() => setDraft(null)} title="New place">
        {draft && (
          <div className="space-y-3">
            <Segmented
              value={draft.kind}
              onChange={(kind) => setDraft({ ...draft, kind, label: kind === 'other' ? draft.label : kind === 'home' ? 'Home' : 'Work' })}
              options={[{ value: 'home', label: 'Home' }, { value: 'work', label: 'Work' }, { value: 'other', label: 'Other' }]}
            />
            <input className="field" placeholder="Label (e.g. Gym)" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
            <button onClick={() => setPicking(true)} className="field flex items-center gap-2 text-left">
              <MapPin size={16} className="text-brand-500" />
              <span className={draft.address ? '' : 'text-ink-faint'}>{draft.address || 'Choose on map'}</span>
            </button>
            <Button className="w-full" loading={busy} disabled={!draft.label || !draft.address} onClick={save}>Save place</Button>
          </div>
        )}
      </Modal>
      {picking && (
        <PinPicker
          title="Place location"
          initial={draft?.lat ? draft : null}
          onClose={() => setPicking(false)}
          onConfirm={(loc) => { setDraft((d) => ({ ...d, ...loc })); setPicking(false); }}
        />
      )}
    </main>
  );
}
