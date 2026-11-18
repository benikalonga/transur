'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  Bell, Camera, Car, ChevronRight, Gift, Headset, LogOut, MapPin, Pencil, ShieldCheck, Star, Users, Wallet,
} from 'lucide-react';
import { api } from '@/lib/api';
import { appSession } from '@/lib/session';
import { closeSockets } from '@/lib/socket';
import { dateOnly, money, ROLE_LABELS, VEHICLE_LABELS } from '@/lib/format';
import { useAccount } from '@/components/shell/AppShell';
import { Avatar, Button, Modal, Pill, Row, Section, Verified } from '@/components/ui';

export default function AccountScreen() {
  const router = useRouter();
  const { profile, refresh, role } = useAccount();
  const [editing, setEditing] = useState(null); // 'profile' | 'vehicle'
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const isFleet = role !== 'rider';
  const base = `/${role}`;
  const chevron = <ChevronRight size={18} className="text-ink-faint" />;

  const open = (what) => {
    setForm(what === 'profile'
      ? { full_name: profile.full_name, email: profile.email || '' }
      : { vehicle_make: profile.vehicle_make || '', vehicle_color: profile.vehicle_color || '', plate_number: profile.plate_number || '', licence_number: profile.licence_number || '' });
    setEditing(what);
  };

  const save = async () => {
    setBusy(true);
    try {
      if (editing === 'profile') await api.me.update(form);
      else await api.me.updateVehicle(form);
      await refresh();
      toast.success(editing === 'vehicle' && form.plate_number !== profile.plate_number ? 'Saved. Your vehicle will be re-verified.' : 'Saved');
      setEditing(null);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const changeAvatar = async (file) => {
    if (!file) return;
    try {
      await api.me.update({ avatar: file });
      await refresh();
      toast.success('Photo updated');
    } catch (e) {
      toast.error(e.message);
    }
  };

  const signOut = () => {
    closeSockets();
    appSession.clear();
    router.replace('/login');
  };

  return (
    <main className="pb-6">
      <div className="bg-white px-5 pb-6 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-4">
          <label className="relative cursor-pointer">
            <Avatar name={profile.full_name} src={profile.avatar_url} size={72} />
            <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-ink text-white"><Camera size={13} /></span>
            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => changeAvatar(e.target.files?.[0])} />
          </label>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xl font-extrabold">{profile.full_name} {profile.is_verified ? <Verified /> : null}</p>
            <p className="text-sm text-ink-muted">{profile.phone}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Pill tone="violet">{ROLE_LABELS[profile.role]}</Pill>
              {isFleet && <Pill tone="amber"><Star size={10} className="fill-current" /> {Number(profile.rating_avg || 5).toFixed(2)}</Pill>}
              <span className="text-[11px] text-ink-faint">since {dateOnly(profile.created_at)}</span>
            </div>
          </div>
          <button onClick={() => open('profile')} className="tap flex h-10 w-10 items-center justify-center rounded-full bg-canvas" aria-label="Edit profile"><Pencil size={16} /></button>
        </div>
        {isFleet && (
          <div className="mt-5 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-canvas p-3"><p className="text-lg font-extrabold">{profile.jobs_completed || 0}</p><p className="text-[11px] text-ink-muted">Jobs</p></div>
            <div className="rounded-2xl bg-canvas p-3"><p className="text-lg font-extrabold">{profile.rating_count || 0}</p><p className="text-[11px] text-ink-muted">Ratings</p></div>
            <div className="rounded-2xl bg-canvas p-3"><p className={`text-lg font-extrabold ${profile.wallet_balance < 0 ? 'text-red-500' : ''}`}>{money(profile.wallet_balance)}</p><p className="text-[11px] text-ink-muted">Wallet</p></div>
          </div>
        )}
      </div>

      <div className="mt-4 space-y-4">
        {isFleet ? (
          <Section title="Work">
            <div className="surface divide-y divide-line overflow-hidden">
              <Row icon={Car} label="Vehicle" hint={[VEHICLE_LABELS[profile.vehicle_class], profile.vehicle_make, profile.plate_number].filter(Boolean).join(' · ')} right={chevron} onClick={() => open('vehicle')} />
              <Row href={`${base}/earnings`} icon={Wallet} label="Earnings & wallet" right={chevron} />
            </div>
          </Section>
        ) : (
          <Section title="Travel">
            <div className="surface divide-y divide-line overflow-hidden">
              <Row href="/rider/places" icon={MapPin} label="Saved places" hint="Home, work and favourites" right={chevron} />
              <Row href="/rider/safety" icon={ShieldCheck} label="Safety" hint="Trusted contacts and emergency SOS" right={chevron} />
              <Row href="/rider/promos" icon={Gift} label="Promotions" right={chevron} />
              <Row href="/rider/invite" icon={Users} label="Invite friends" hint={`Your code: ${profile.referral_code}`} right={chevron} />
            </div>
          </Section>
        )}

        <Section title="Support">
          <div className="surface divide-y divide-line overflow-hidden">
            <Row href={`${base}/help`} icon={Headset} label="Help centre" hint="Chat with our team" right={chevron} />
            {isFleet && <Row href={`${base}/inbox`} icon={Bell} label="Notifications" right={chevron} />}
          </div>
        </Section>

        <Section>
          <div className="surface overflow-hidden"><Row icon={LogOut} label="Sign out" danger onClick={signOut} /></div>
        </Section>
        <p className="text-center text-xs text-ink-faint">Transur v1.0</p>
      </div>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === 'profile' ? 'Edit profile' : 'Vehicle details'}>
        <div className="space-y-3">
          {editing === 'profile' ? (
            <>
              <div><label className="label">Full name</label><input className="field" value={form.full_name || ''} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
              <div><label className="label">Email</label><input type="email" className="field" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            </>
          ) : (
            <>
              {['vehicle_make', 'vehicle_color', 'plate_number', 'licence_number'].map((k) => (
                <div key={k}>
                  <label className="label">{{ vehicle_make: 'Make & model', vehicle_color: 'Colour', plate_number: 'Plate number', licence_number: 'Licence number' }[k]}</label>
                  <input className="field" value={form[k] || ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                </div>
              ))}
              <p className="text-xs text-ink-muted">Changing your plate removes your verified badge until our team checks it again.</p>
            </>
          )}
          <Button className="w-full" loading={busy} onClick={save}>Save</Button>
        </div>
      </Modal>
    </main>
  );
}
