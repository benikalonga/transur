'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { ArrowLeft, Bike, Camera, Car, Package, Phone, User } from 'lucide-react';
import { api } from '@/lib/api';
import { appSession, homeFor } from '@/lib/session';
import { VEHICLE_LABELS } from '@/lib/format';
import { Button } from '@/components/ui';
import Logo from '@/components/Logo';

const ROLES = [
  { id: 'rider', title: 'Ride & send', text: 'Book rides and deliveries', icon: User },
  { id: 'driver', title: 'Drive', text: 'Earn by giving rides', icon: Car },
  { id: 'courier', title: 'Deliver', text: 'Earn by delivering parcels', icon: Package },
];
const DRIVER_CLASSES = ['moto', 'economy', 'comfort', 'xl'];
const COURIER_MODES = ['bicycle', 'moto', 'car', 'on_foot'];

/** One real input (good for SMS autofill and paste) drawn as six boxes. */
function CodeInput({ value, onChange, onComplete }) {
  const [focused, setFocused] = useState(true);
  const update = (raw) => {
    const next = raw.replace(/\D/g, '').slice(0, 6);
    onChange(next);
    if (next.length === 6) onComplete?.(next);
  };
  return (
    <label className="relative block">
      <input
        value={value}
        onChange={(e) => update(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        autoFocus
        aria-label="6-digit code"
        className="absolute inset-0 h-full w-full opacity-0"
      />
      <div className="flex justify-between gap-2" aria-hidden="true">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className={clsx(
              'flex h-14 w-full items-center justify-center rounded-xl border-2 bg-white text-2xl font-bold',
              focused && i === Math.min(value.length, 5) ? 'border-brand-500' : 'border-line'
            )}
          >
            {value[i] || ''}
          </div>
        ))}
      </div>
    </label>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState('phone'); // phone → code → profile
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [proof, setProof] = useState(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [form, setForm] = useState({ role: 'rider', full_name: '', email: '', referral_code: '', vehicle_class: '', vehicle_make: '', vehicle_color: '', plate_number: '', licence_number: '' });
  const [avatar, setAvatar] = useState(null);

  useEffect(() => {
    const profile = appSession.profile();
    if (appSession.token() && profile) router.replace(homeFor(profile.role));
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref) setForm((f) => ({ ...f, referral_code: ref.toUpperCase() }));
  }, [router]);

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const fullPhone = phone.trim().startsWith('+') ? phone.trim() : `+${phone.trim()}`;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target ? e.target.value : e }));

  const finish = ({ token, user }) => {
    appSession.save(token, user);
    toast.success(`Welcome, ${user.full_name.split(' ')[0]}!`);
    router.replace(homeFor(user.role));
  };

  const requestCode = async () => {
    setBusy(true);
    try {
      await api.auth.requestCode(fullPhone.replace(/\s/g, ''));
      setStep('code');
      setCode('');
      setResendIn(45);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value = code) => {
    if (value.length !== 6 || busy) return;
    setBusy(true);
    try {
      const res = await api.auth.verify(fullPhone.replace(/\s/g, ''), value);
      if (res.isNew) {
        setProof(res.phoneProof);
        setStep('profile');
      } else {
        finish(res);
      }
    } catch (e) {
      toast.error(e.message);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const signup = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = { ...form, phoneProof: proof, avatar };
      if (form.role === 'rider') ['vehicle_class', 'vehicle_make', 'vehicle_color', 'plate_number', 'licence_number'].forEach((k) => delete payload[k]);
      finish(await api.auth.signup(payload));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const classes = form.role === 'driver' ? DRIVER_CLASSES : COURIER_MODES;
  const needsPlate = form.role === 'driver' || ['moto', 'car'].includes(form.vehicle_class);

  return (
    <main className="phone-frame flex flex-col bg-white">
      <div className="relative overflow-hidden bg-ink px-6 pb-10 pt-[max(2.5rem,env(safe-area-inset-top))] text-white">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-500/40 blur-3xl" />
        <div className="absolute -bottom-20 left-10 h-40 w-40 rounded-full bg-volt/30 blur-3xl" />
        {step !== 'phone' && (
          <button onClick={() => setStep(step === 'profile' ? 'code' : 'phone')} className="tap relative mb-6 flex h-10 w-10 items-center justify-center rounded-full bg-white/10" aria-label="Back">
            <ArrowLeft size={18} />
          </button>
        )}
        <div className="relative">
          <Logo size={44} light />
          <h1 className="mt-6 text-[28px] font-extrabold leading-tight">
            {step === 'phone' && <>Move anything,<br />anywhere, at your price.</>}
            {step === 'code' && 'Check your messages'}
            {step === 'profile' && 'Create your account'}
          </h1>
          <p className="mt-2 text-sm text-white/60">
            {step === 'phone' && 'Sign in or sign up with your phone number. No password needed.'}
            {step === 'code' && `We sent a 6-digit code to ${fullPhone}.`}
            {step === 'profile' && 'Just a few details and you are ready to go.'}
          </p>
        </div>
      </div>

      <div className="-mt-5 flex-1 rounded-t-[28px] bg-white px-6 pb-10 pt-8">
        {step === 'phone' && (
          <form onSubmit={(e) => { e.preventDefault(); requestCode(); }} className="space-y-5">
            <div>
              <label className="label" htmlFor="phone">Phone number</label>
              <div className="flex items-center gap-2 rounded-xl bg-canvas px-4 focus-within:ring-2 focus-within:ring-brand-400">
                <Phone size={18} className="text-ink-faint" />
                <input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+243 81 234 5678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/[^\d+\s]/g, ''))}
                  className="w-full bg-transparent py-4 text-lg font-semibold outline-none placeholder:font-normal placeholder:text-ink-faint"
                />
              </div>
              <p className="mt-2 text-xs text-ink-muted">Include your country code. Standard SMS rates may apply.</p>
            </div>
            <Button type="submit" loading={busy} disabled={phone.replace(/\D/g, '').length < 8} className="w-full">
              Continue
            </Button>
          </form>
        )}

        {step === 'code' && (
          <div className="space-y-6">
            <CodeInput value={code} onChange={setCode} onComplete={verify} />
            <Button onClick={() => verify()} loading={busy} disabled={code.length !== 6} className="w-full">
              Verify
            </Button>
            <p className="text-center text-sm text-ink-muted">
              Didn&apos;t get it?{' '}
              {resendIn > 0 ? (
                <span>Resend in {resendIn}s</span>
              ) : (
                <button onClick={requestCode} className="font-semibold text-brand-600">Send a new code</button>
              )}
            </p>
          </div>
        )}

        {step === 'profile' && (
          <form onSubmit={signup} className="space-y-5">
            <div>
              <span className="label">I want to</span>
              <div className="grid grid-cols-3 gap-2">
                {ROLES.map(({ id, title, text, icon: Icon }) => (
                  <button
                    type="button"
                    key={id}
                    onClick={() => setForm((f) => ({ ...f, role: id, vehicle_class: '' }))}
                    className={clsx('tap rounded-2xl border-2 p-3 text-left', form.role === id ? 'border-brand-500 bg-brand-50' : 'border-line')}
                  >
                    <Icon size={20} className={form.role === id ? 'text-brand-500' : 'text-ink-muted'} />
                    <p className="mt-2 text-sm font-bold">{title}</p>
                    <p className="text-[11px] leading-tight text-ink-muted">{text}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <label className="tap relative flex h-20 w-20 flex-shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-3xl bg-canvas">
                {avatar ? <img src={URL.createObjectURL(avatar)} alt="" className="h-full w-full object-cover" /> : <Camera size={22} className="text-ink-faint" />}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => setAvatar(e.target.files?.[0] || null)} />
              </label>
              <div className="flex-1">
                <label className="label" htmlFor="name">Full name</label>
                <input id="name" className="field" value={form.full_name} onChange={set('full_name')} placeholder="Jane Doe" required minLength={2} />
              </div>
            </div>

            {form.role !== 'rider' && (
              <div className="space-y-4 rounded-2xl border border-line p-4">
                <div>
                  <span className="label">{form.role === 'driver' ? 'Vehicle class' : 'How will you deliver?'}</span>
                  <div className="flex flex-wrap gap-2">
                    {classes.map((c) => (
                      <button type="button" key={c} onClick={() => setForm((f) => ({ ...f, vehicle_class: c }))} className={form.vehicle_class === c ? 'chip-on' : 'chip-off'}>
                        {c === 'moto' || c === 'bicycle' ? <Bike size={14} /> : null}
                        {VEHICLE_LABELS[c]}
                      </button>
                    ))}
                  </div>
                </div>
                {form.vehicle_class !== 'on_foot' && form.vehicle_class !== 'bicycle' && (
                  <div className="grid grid-cols-2 gap-3">
                    <input className="field" placeholder="Make & model" value={form.vehicle_make} onChange={set('vehicle_make')} />
                    <input className="field" placeholder="Colour" value={form.vehicle_color} onChange={set('vehicle_color')} />
                    <input className="field" placeholder={needsPlate ? 'Plate number *' : 'Plate number'} value={form.plate_number} onChange={set('plate_number')} required={needsPlate} />
                    <input className="field" placeholder="Licence no." value={form.licence_number} onChange={set('licence_number')} />
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="email">Email (optional)</label>
                <input id="email" type="email" className="field" value={form.email} onChange={set('email')} placeholder="you@example.com" />
              </div>
              <div>
                <label className="label" htmlFor="ref">Invite code</label>
                <input id="ref" className="field uppercase placeholder:normal-case" value={form.referral_code} onChange={set('referral_code')} placeholder="Optional" />
              </div>
            </div>

            <Button type="submit" loading={busy} disabled={!form.full_name.trim() || (form.role !== 'rider' && !form.vehicle_class)} className="w-full">
              Create account
            </Button>
            <p className="text-center text-xs text-ink-muted">By continuing you agree to the Transur terms of service and privacy policy.</p>
          </form>
        )}
      </div>
    </main>
  );
}
