'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getTripHistory } from '@/lib/api';
import { Car, Flag, Clock, Wallet, User } from 'lucide-react';
import Link from 'next/link';
import formatCDF from '@/lib/currency';

const STATUS = {
  completed: { label: 'Terminée', bg: 'bg-green-100', text: 'text-green-700' },
  cancelled: { label: 'Annulée',  bg: 'bg-red-100',   text: 'text-red-700'   },
  ongoing:   { label: 'En cours', bg: 'bg-blue-100',  text: 'text-blue-700'  },
};

export default function DriverHistory() {
  const router = useRouter();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, earnings: 0, commission: 0 });

  useEffect(() => {
    getTripHistory(1)
      .then(({ data }) => {
        setTrips(data.trips || []);
        const done = (data.trips || []).filter((t) => t.status === 'completed');
        setStats({
          total:      done.length,
          earnings:   done.reduce((s, t) => s + parseFloat(t.driver_earnings || 0), 0),
          commission: done.reduce((s, t) => s + parseFloat(t.commission_amount || 0), 0),
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const fmt = (d) => new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });

  return (
    <div className="min-h-screen bg-[#f0f4f8] flex flex-col">

      {/* ── Header ── */}
      <div className="header-dark relative px-6 pt-14 pb-20 text-white overflow-hidden">
        <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/5" />
        <button onClick={() => router.back()} className="relative text-gray-400 text-sm mb-5">← Retour</button>
        <h1 className="relative text-2xl font-black">Mes Courses</h1>
        <p className="relative text-gray-400 text-sm mt-1">Historique de vos trajets</p>
        <div className="absolute bottom-0 left-0 right-0 h-8">
          <svg viewBox="0 0 390 32" preserveAspectRatio="none" className="w-full h-full">
            <path d="M0 32 Q195 0 390 32 L390 32 L0 32 Z" fill="#f0f4f8"/>
          </svg>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="px-5 -mt-2 mb-4">
        <div className="card p-4 grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-gray-400 text-xs">Courses</p>
            <p className="text-2xl font-black text-gray-900 mt-1">{stats.total}</p>
          </div>
          <div className="border-x border-gray-100">
            <p className="text-gray-400 text-xs">Gains nets</p>
            <p className="text-2xl font-black text-[#007DC5] mt-1">{formatCDF(stats.earnings)}</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs">Commissions</p>
            <p className="text-2xl font-black text-[#CE1126] mt-1">{formatCDF(stats.commission)}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-5 space-y-3 pb-6">
        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => (
              <div key={i} className="card p-4">
                <div className="skeleton h-4 w-3/4 mb-2" />
                <div className="skeleton h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : trips.length === 0 ? (
          <div className="card p-10 text-center fade-in">
            <div className="flex justify-center mb-3"><Car size={48} className="text-gray-300" /></div>
            <p className="font-bold text-gray-700">Aucune course pour le moment</p>
          </div>
        ) : (
          trips.map((t, i) => {
            const st = STATUS[t.status] || { label: t.status, bg: 'bg-gray-100', text: 'text-gray-600' };
            return (
              <div key={t.id} className="card p-4 slide-up" style={{animationDelay:`${i*50}ms`}}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Car size={20} className="text-[#007DC5]" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">{fmt(t.requested_at)}</p>
                      {t.client_name && <p className="text-sm font-semibold text-gray-700">{t.client_name}</p>}
                    </div>
                  </div>
                  <span className={`badge ${st.bg} ${st.text}`}>{st.label}</span>
                </div>

                <div className="space-y-1.5 text-sm bg-gray-50 p-3 rounded-xl mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-[#007DC5] rounded-full flex-shrink-0" />
                    <span className="text-gray-600 truncate">{t.pickup_address}</span>
                  </div>
                  <div className="ml-0.5 w-0.5 h-2 bg-gray-300 ml-1" />
                  <div className="flex items-center gap-2">
                    <Flag size={12} className="text-gray-400 flex-shrink-0" />
                    <span className="text-gray-600 truncate">{t.dropoff_address}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-gray-100 text-sm">
                  <span className="text-gray-400 text-xs">
                    {t.actual_distance ? `${parseFloat(t.actual_distance).toFixed(1)} km` : ''}
                    {t.payment_method ? ` · ${t.payment_method}` : ''}
                  </span>
                  {t.status === 'completed' ? (
                    <div className="text-right">
                      <div className="font-black text-[#007DC5]">+{formatCDF(t.driver_earnings || 0)}</div>
                      <div className="text-xs text-gray-400">-{formatCDF(t.commission_amount || 0)} comm.</div>
                    </div>
                  ) : t.final_fare ? (
                    <span className="font-black text-gray-900">{formatCDF(t.final_fare)}</span>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Bottom nav ── */}
      <nav className="bottom-nav px-6 pt-3 pb-safe flex justify-around">
        <Link href="/driver" className="flex flex-col items-center gap-1">
          <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center"><Car size={18} className="text-gray-500" /></div>
          <span className="text-[10px] text-gray-400 font-medium">Accueil</span>
        </Link>
        <button className="flex flex-col items-center gap-1">
          <div className="w-8 h-8 rounded-xl bg-[#007DC5] flex items-center justify-center"><Clock size={18} className="text-white" /></div>
          <span className="text-[10px] font-bold text-[#007DC5]">Courses</span>
        </button>
        <Link href="/driver/wallet" className="flex flex-col items-center gap-1">
          <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center"><Wallet size={18} className="text-gray-500" /></div>
          <span className="text-[10px] text-gray-400 font-medium">Portefeuille</span>
        </Link>
        <Link href="/driver/profile" className="flex flex-col items-center gap-1">
          <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center"><User size={18} className="text-gray-500" /></div>
          <span className="text-[10px] text-gray-400 font-medium">Profil</span>
        </Link>
      </nav>
    </div>
  );
}
