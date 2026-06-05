'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getMe, updateProfile } from '@/lib/api';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { Car, Wallet, Clock, User, Pencil, HelpCircle, LogOut, Smartphone, ChevronRight } from 'lucide-react';

const VEHICLE_LABELS = { berline:'Berline', suv:'SUV', '4x4':'4×4', minibus:'Minibus', tricycle:'Tricycle', moto:'Moto' };

export default function DriverProfile() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getMe()
      .then((r) => { setUser(r.data.user); setName(r.data.user.name); })
      .catch(() => router.replace('/auth/login'));
  }, [router]);

  const handleSave = async () => {
    if (!name.trim()) return toast.error('Nom requis');
    setSaving(true);
    try {
      await updateProfile({ name });
      const updated = { ...user, name };
      setUser(updated);
      localStorage.setItem('transur_user', JSON.stringify(updated));
      setEditing(false);
      toast.success('Profil mis à jour');
    } catch { toast.error('Erreur'); }
    finally { setSaving(false); }
  };

  const handleLogout = () => {
    localStorage.removeItem('transur_token');
    localStorage.removeItem('transur_user');
    router.replace('/auth/login');
  };

  if (!user) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0f4f8]">
      <div className="w-8 h-8 border-2 border-[#007DC5] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f0f4f8] flex flex-col">

      {/* ── Header (dark with wave) ── */}
      <div className="header-dark relative px-6 pt-14 pb-24 text-white overflow-hidden">
        <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/5" />
        <button onClick={() => router.back()} className="relative text-gray-400 text-sm mb-5">← Retour</button>
        <div className="relative flex items-center gap-4">
          <div className="w-[72px] h-[72px] rounded-2xl overflow-hidden border-2 border-white/20 flex-shrink-0 bg-white/10 flex items-center justify-center text-2xl font-black">
            {user.photo_url
              ? <img src={user.photo_url} alt={user.name} className="w-full h-full object-cover" />
              : user.name?.[0]?.toUpperCase()
            }
          </div>
          <div>
            <h1 className="text-2xl font-black">{user.name}</h1>
            <div className="flex items-center gap-1 text-yellow-400 text-sm mt-0.5">
              <span>★</span>
              <span className="font-semibold">{parseFloat(user.driver_rating || 5).toFixed(1)}</span>
              <span className="text-gray-500 text-xs">({user.total_trips || 0} courses)</span>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full mt-1 inline-block font-semibold ${
              user.driver_verified ? 'bg-green-900/50 text-green-400' : 'bg-yellow-900/50 text-yellow-400'
            }`}>
              {user.driver_verified ? '✓ Vérifié' : '⏳ En attente'}
            </span>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-8">
          <svg viewBox="0 0 390 32" preserveAspectRatio="none" className="w-full h-full">
            <path d="M0 32 Q195 0 390 32 L390 32 L0 32 Z" fill="#f0f4f8"/>
          </svg>
        </div>
      </div>

      <div className="flex-1 px-5 py-5 -mt-2 space-y-4">

        {/* ── Infos perso ── */}
        <div className="card">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Mon profil</span>
            <button onClick={() => setEditing(!editing)} className="text-[#007DC5] text-sm font-bold flex items-center gap-1">
              <Pencil size={14} /> {editing ? 'Annuler' : 'Modifier'}
            </button>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Nom</label>
              {editing
                ? <input value={name} onChange={(e) => setName(e.target.value)} className="input-field" autoFocus />
                : <p className="font-semibold text-gray-900">{user.name}</p>
              }
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Téléphone</label>
              <p className="font-semibold text-gray-900 flex items-center gap-2"><Smartphone size={14} className="text-gray-400" /> {user.phone}</p>
            </div>
          </div>
          {editing && (
            <div className="px-4 pb-4">
              <button onClick={handleSave} disabled={saving} className="btn-primary">
                {saving ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Enregistrer ✓'}
              </button>
            </div>
          )}
        </div>

        {/* ── Véhicule ── */}
        {(user.vehicle_type || user.vehicle_brand) && (
          <div className="card p-4">
            <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Mon Véhicule</p>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center flex-shrink-0">
                <Car size={24} className="text-[#007DC5]" />
              </div>
              <div>
                <p className="font-black text-gray-900">
                  {user.vehicle_brand || ''} {VEHICLE_LABELS[user.vehicle_type] || user.vehicle_type || ''}
                  {user.vehicle_color ? ` · ${user.vehicle_color}` : ''}
                </p>
                {user.vehicle_plate && (
                  <p className="text-sm font-mono bg-gray-100 px-2 py-0.5 rounded-lg inline-block mt-1 font-black">{user.vehicle_plate}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Menu ── */}
        <div className="card divide-y divide-gray-100">
          <Link href="/driver/wallet" className="flex items-center justify-between p-4">
            <span className="flex items-center gap-3">
              <span className="w-8 h-8 bg-blue-50 rounded-xl flex items-center justify-center"><Wallet size={16} className="text-[#007DC5]" /></span>
              <span className="font-semibold text-gray-700">Portefeuille</span>
            </span>
            <ChevronRight size={16} className="text-gray-300" />
          </Link>
          <Link href="/driver/history" className="flex items-center justify-between p-4">
            <span className="flex items-center gap-3">
              <span className="w-8 h-8 bg-gray-50 rounded-xl flex items-center justify-center"><Clock size={16} className="text-gray-500" /></span>
              <span className="font-semibold text-gray-700">Historique des courses</span>
            </span>
            <ChevronRight size={16} className="text-gray-300" />
          </Link>
          <button className="w-full flex items-center justify-between p-4">
            <span className="flex items-center gap-3">
              <span className="w-8 h-8 bg-gray-50 rounded-xl flex items-center justify-center"><HelpCircle size={16} className="text-gray-500" /></span>
              <span className="font-semibold text-gray-700">Aide & Support</span>
            </span>
            <ChevronRight size={16} className="text-gray-300" />
          </button>
          <button onClick={handleLogout} className="w-full flex items-center gap-3 p-4 text-[#CE1126]">
            <span className="w-8 h-8 bg-red-50 rounded-xl flex items-center justify-center"><LogOut size={16} className="text-[#CE1126]" /></span>
            <span className="font-semibold">Déconnexion</span>
          </button>
        </div>

        <p className="text-center text-gray-300 text-xs pb-2">Transur v1.0 · Lubumbashi, RDC</p>
      </div>

      {/* ── Bottom nav ── */}
      <nav className="bottom-nav px-6 pt-3 pb-safe flex justify-around">
        <Link href="/driver" className="flex flex-col items-center gap-1">
          <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center"><Car size={18} className="text-gray-500" /></div>
          <span className="text-[10px] text-gray-400 font-medium">Accueil</span>
        </Link>
        <Link href="/driver/history" className="flex flex-col items-center gap-1">
          <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center"><Clock size={18} className="text-gray-500" /></div>
          <span className="text-[10px] text-gray-400 font-medium">Courses</span>
        </Link>
        <Link href="/driver/wallet" className="flex flex-col items-center gap-1">
          <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center"><Wallet size={18} className="text-gray-500" /></div>
          <span className="text-[10px] text-gray-400 font-medium">Portefeuille</span>
        </Link>
        <button className="flex flex-col items-center gap-1">
          <div className="w-8 h-8 rounded-xl bg-[#007DC5] flex items-center justify-center"><User size={18} className="text-white" /></div>
          <span className="text-[10px] font-bold text-[#007DC5]">Profil</span>
        </button>
      </nav>
    </div>
  );
}
