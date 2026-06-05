'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { sendOTP, verifyOTP } from '@/lib/api';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { Smartphone, Shield, Lock } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep]       = useState('phone');
  const [phone, setPhone]     = useState('');
  const [otp, setOtp]         = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const startCountdown = () => {
    setCountdown(60);
    const iv = setInterval(() => {
      setCountdown(c => { if (c <= 1) { clearInterval(iv); return 0; } return c - 1; });
    }, 1000);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!phone || phone.length < 10) return toast.error('Entrez un numéro valide');
    setLoading(true);
    try {
      await sendOTP(phone);
      toast.success('Code envoyé !');
      setStep('otp');
      startCountdown();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur d\'envoi');
    } finally { setLoading(false); }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    if (otp.length !== 6) return toast.error('Code à 6 chiffres');
    setLoading(true);
    try {
      const { data } = await verifyOTP(phone, otp);
      if (data.isNewUser) {
        localStorage.setItem('transur_temp_token', data.tempToken);
        localStorage.setItem('transur_phone', phone);
        return router.push('/auth/register');
      }
      localStorage.setItem('transur_token', data.token);
      localStorage.setItem('transur_user', JSON.stringify(data.user));
      toast.success(`Bienvenue, ${data.user.name} !`);
      const routes = { client: '/client', driver: '/driver', delivery: '/delivery', admin: '/admin' };
      router.replace(routes[data.user.role] || '/client');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Code incorrect');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Hero */}
      <div className="header-blue relative px-6 pt-16 pb-20 text-white overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-white/5" />
        <div className="absolute -bottom-8 -left-8 w-36 h-36 rounded-full bg-white/5" />
        {/* Flag diagonal stripe */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 right-0 w-2 h-full bg-[#CE1126] opacity-70" style={{transform:'rotate(12deg) translateX(60px) scaleY(1.5)'}} />
          <div className="absolute top-0 right-0 w-1 h-full bg-[#F7D618] opacity-60" style={{transform:'rotate(12deg) translateX(67px) scaleY(1.5)'}} />
        </div>

        <div className="relative">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center font-black text-xl">T</div>
            <span className="text-xl font-black tracking-tight">Transur</span>
          </div>
          <h1 className="text-3xl font-black leading-tight mb-2 flex items-center gap-2">
            {step === 'phone' ? 'Bienvenue 👋' : <><Lock size={24} /> Vérification</>}
          </h1>
          <p className="text-blue-100 text-sm">
            {step === 'phone'
              ? 'Taxi & Livraison à Lubumbashi'
              : `Code envoyé au ${phone}`}
          </p>
        </div>
        {/* Wave */}
        <div className="wave-bottom" />
      </div>

      {/* Form */}
      <div className="flex-1 px-6 py-8 -mt-2">
        {step === 'phone' ? (
          <form onSubmit={handleSend} className="space-y-5 slide-up">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Numéro de téléphone</label>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"><Smartphone size={18} /></div>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+243 81 234 5678"
                  className="input-field pl-12"
                  inputMode="tel"
                  autoFocus
                />
              </div>
              <p className="text-xs text-gray-400 mt-1.5 ml-1">Exemple : +243 81 234 5678</p>
            </div>

            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <> Envoyer le code <span>→</span> </>
              )}
            </button>

            <div className="text-center pt-2">
              <p className="text-gray-400 text-sm">Nouveau sur Transur ?</p>
              <Link href="/auth/register" className="text-[#007DC5] font-semibold text-sm">
                Créer un compte
              </Link>
            </div>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="space-y-5 slide-up">
            <button type="button" onClick={() => setStep('phone')}
              className="flex items-center gap-1 text-gray-400 text-sm mb-2">
              ← Modifier le numéro
            </button>

            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex items-start gap-3">
              <span className="text-blue-500 mt-0.5"><Shield size={18} /></span>
              <p className="text-blue-700 text-sm leading-relaxed">
                Entrez le code à 6 chiffres reçu par SMS.<br />
                <span className="text-xs text-blue-400">Ne partagez jamais ce code.</span>
              </p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Code OTP</label>
              <input
                type="tel"
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g,'').slice(0,6))}
                placeholder="• • • • • •"
                className="input-field text-center text-3xl font-black tracking-[0.6em]"
                inputMode="numeric"
                maxLength={6}
                autoFocus
              />
            </div>

            <button type="submit" disabled={loading || otp.length < 6} className="btn-primary">
              {loading
                ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : 'Confirmer ✓'
              }
            </button>

            <div className="text-center">
              {countdown > 0
                ? <p className="text-gray-400 text-sm">Renvoyer dans <strong>{countdown}s</strong></p>
                : <button type="button" onClick={() => { sendOTP(phone); startCountdown(); toast.success('Code renvoyé'); }}
                    className="text-[#007DC5] font-semibold text-sm">
                    Renvoyer le code
                  </button>
              }
            </div>
          </form>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 pb-8 text-center">
        <div className="flex items-center justify-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#007DC5]" />
          <div className="w-8 h-1 rounded-full bg-[#CE1126]" />
          <div className="w-3 h-3 rounded-full bg-[#007DC5]" />
        </div>
        <p className="text-gray-300 text-xs mt-2">Transur · Lubumbashi, RDC</p>
      </div>
    </div>
  );
}
