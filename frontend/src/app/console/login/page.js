'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ShieldCheck } from 'lucide-react';
import { consoleApi } from '@/lib/api';
import { consoleSession } from '@/lib/session';
import { Button, Segmented } from '@/components/ui';
import Logo from '@/components/Logo';

export default function ConsoleLogin() {
  const router = useRouter();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', full_name: '' });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    if (consoleSession.token()) router.replace('/console');
  }, [router]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      if (mode === 'login') {
        const { token, staff } = await consoleApi.login(form.email, form.password);
        consoleSession.save(token, staff);
        router.replace('/console');
      } else {
        const r = await consoleApi.requestAccess(form);
        setNotice(r.message);
        setMode('login');
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-ink p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -left-20 top-1/3 h-96 w-96 rounded-full bg-brand-500/40 blur-3xl" />
        <Logo size={40} light />
        <div className="relative">
          <h1 className="text-4xl font-extrabold leading-tight">Run the whole network<br />from one place.</h1>
          <p className="mt-4 max-w-md text-white/60">Live dispatch, fleet verification, fares and promotions, wallets, finance, safety alerts and support — all in real time.</p>
        </div>
        <p className="relative text-sm text-white/40">Transur Operations Console</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4">
          <div className="lg:hidden"><Logo /></div>
          <div>
            <h2 className="text-2xl font-extrabold">{mode === 'login' ? 'Staff sign in' : 'Request access'}</h2>
            <p className="text-sm text-ink-muted">{mode === 'login' ? 'Use your console credentials.' : 'An owner must approve new accounts.'}</p>
          </div>
          <Segmented value={mode} onChange={setMode} options={[{ value: 'login', label: 'Sign in' }, { value: 'request', label: 'Request access' }]} />
          {notice && <p className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700"><ShieldCheck size={16} className="mt-0.5" /> {notice}</p>}
          {mode === 'request' && (
            <div><label className="label">Full name</label><input className="field" value={form.full_name} onChange={set('full_name')} required /></div>
          )}
          <div><label className="label">Work email</label><input type="email" className="field" autoComplete="username" value={form.email} onChange={set('email')} required /></div>
          <div><label className="label">Password</label><input type="password" className="field" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'login' ? 1 : 10} value={form.password} onChange={set('password')} required /></div>
          <Button type="submit" className="w-full" loading={busy}>{mode === 'login' ? 'Sign in' : 'Send request'}</Button>
        </form>
      </div>
    </div>
  );
}
