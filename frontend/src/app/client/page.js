'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getTripHistory, getDeliveryHistory } from '@/lib/api';
import Link from 'next/link';
import { Home, Clock, User, Bell, Car, Package, MapPin, ChevronRight } from 'lucide-react';
import formatCDF from '@/lib/currency';

const STATUS = {
  completed: { label: 'Terminée',  bg: 'bg-green-100',   text: 'text-green-700' },
  delivered: { label: 'Livrée',    bg: 'bg-green-100',   text: 'text-green-700' },
  cancelled: { label: 'Annulée',   bg: 'bg-red-100',     text: 'text-red-700'   },
  ongoing:   { label: 'En cours',  bg: 'bg-blue-100',    text: 'text-blue-700'  },
  accepted:  { label: 'Acceptée',  bg: 'bg-blue-100',    text: 'text-blue-700'  },
  broadcast: { label: 'Recherche', bg: 'bg-yellow-100',  text: 'text-yellow-700'},
  pickup:    { label: 'En route',  bg: 'bg-purple-100',  text: 'text-purple-700'},
};

export default function ClientDashboard() {
  const router = useRouter();
  const [user, setUser]         = useState(null);
  const [greeting, setGreeting] = useState('');
  const [activity, setActivity] = useState([]);
  const [loadingAct, setLoadingAct] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('transur_user');
    if (!stored) return router.replace('/auth/login');
    const u = JSON.parse(stored);
    if (u.role !== 'client') return router.replace('/auth/login');
    setUser(u);
    const h = new Date().getHours();
    setGreeting(h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir');

    Promise.all([getTripHistory(1), getDeliveryHistory(1)])
      .then(([t, d]) => {
        const all = [
          ...(t.data.trips || []).slice(0,3).map(x => ({ ...x, _type: 'trip' })),
          ...(d.data.deliveries || []).slice(0,3).map(x => ({ ...x, _type: 'delivery' })),
        ].sort((a,b) => new Date(b.requested_at)-new Date(a.requested_at)).slice(0,4);
        setActivity(all);
      })
      .catch(() => {})
      .finally(() => setLoadingAct(false));
  }, [router]);

  if (!user) return null;

  const fmt = d => new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });

  return (
    <div className="min-h-screen bg-[#f0f4f8] flex flex-col">

      {/* ── Header ── */}
      <div className="header-blue relative px-6 pt-14 pb-24 text-white overflow-hidden">
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/5" />
        <div className="absolute bottom-4 right-6 w-20 h-20 rounded-full bg-white/5" />
        {/* Flag stripe */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 right-8 w-1.5 h-full bg-[#CE1126] opacity-50" style={{transform:'rotate(15deg) scaleY(1.5)'}} />
          <div className="absolute top-0 right-11 w-0.5 h-full bg-[#F7D618] opacity-40" style={{transform:'rotate(15deg) scaleY(1.5)'}} />
        </div>

        <div className="relative flex items-center justify-between mb-3">
          <div>
            <p className="text-blue-200 text-sm font-medium">{greeting} 👋</p>
            <h1 className="text-2xl font-black mt-0.5">{user.name}</h1>
          </div>
          <div className="flex gap-2">
            <button className="w-10 h-10 rounded-full bg-white/15 backdrop-blur flex items-center justify-center"><Bell size={18} /></button>
            <Link href="/client/profile" className="w-10 h-10 rounded-full bg-white/15 backdrop-blur flex items-center justify-center font-bold text-base">
              {user.name?.[0]?.toUpperCase()}
            </Link>
          </div>
        </div>
        <p className="relative text-blue-100 text-sm">Que souhaitez-vous faire ?</p>

        {/* Wave */}
        <div className="absolute bottom-0 left-0 right-0 h-8">
          <svg viewBox="0 0 390 32" preserveAspectRatio="none" className="w-full h-full">
            <path d="M0 32 Q195 0 390 32 L390 32 L0 32 Z" fill="#f0f4f8"/>
          </svg>
        </div>
      </div>

      {/* ── Action Cards ── */}
      <div className="px-5 -mt-10 space-y-3 relative z-10">
        {/* Taxi */}
        <button onClick={() => router.push('/client/taxi')}
          className="card card-hover w-full p-5 flex items-center gap-4 text-left">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 text-[#007DC5]"
            style={{background:'linear-gradient(135deg,#dbeafe,#bfdbfe)'}}>
            <Car size={28} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-black text-gray-900">Commander un Taxi</h2>
            <p className="text-gray-500 text-xs mt-0.5">Réservez un chauffeur en quelques secondes</p>
            <div className="flex items-center gap-1 mt-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#007DC5]" />
              <span className="text-[#007DC5] text-xs font-semibold">Disponible à Lubumbashi</span>
            </div>
          </div>
          <div className="w-8 h-8 rounded-full bg-[#007DC5]/10 flex items-center justify-center flex-shrink-0 text-[#007DC5]">
            <ChevronRight size={16} />
          </div>
        </button>

        {/* Livraison */}
        <button onClick={() => router.push('/client/delivery')}
          className="card card-hover w-full p-5 flex items-center gap-4 text-left">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 text-[#CE1126]"
            style={{background:'linear-gradient(135deg,#fee2e2,#fecaca)'}}>
            <Package size={28} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-black text-gray-900">Envoyer un Colis</h2>
            <p className="text-gray-500 text-xs mt-0.5">Livraison rapide à n'importe quelle adresse</p>
            <div className="flex items-center gap-1 mt-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#CE1126]" />
              <span className="text-[#CE1126] text-xs font-semibold">Restaurant, marché, maison...</span>
            </div>
          </div>
          <div className="w-8 h-8 rounded-full bg-[#CE1126]/10 flex items-center justify-center flex-shrink-0 text-[#CE1126]">
            <ChevronRight size={16} />
          </div>
        </button>
      </div>

      {/* ── Recent Activity ── */}
      <div className="px-5 mt-5 flex-1">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-black text-gray-900">Activité récente</h3>
          <Link href="/client/history" className="text-[#007DC5] text-sm font-semibold">Voir tout →</Link>
        </div>

        {loadingAct ? (
          <div className="space-y-2">
            {[1,2].map(i => (
              <div key={i} className="card p-4">
                <div className="skeleton h-4 w-3/4 mb-2" />
                <div className="skeleton h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : activity.length === 0 ? (
          <div className="card p-8 text-center fade-in">
            <div className="flex justify-center mb-3 text-gray-300"><MapPin size={48} /></div>
            <p className="font-semibold text-gray-700">Aucune activité</p>
            <p className="text-gray-400 text-sm mt-1">Vos courses apparaîtront ici</p>
          </div>
        ) : (
          <div className="space-y-2">
            {activity.map((item, i) => {
              const isTrip = item._type === 'trip';
              const st = STATUS[item.status] || { label: item.status, bg: 'bg-gray-100', text: 'text-gray-600' };
              return (
                <div key={item.id} className="card p-4 flex items-center gap-3 slide-up"
                  style={{animationDelay:`${i*60}ms`}}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isTrip ? 'bg-blue-50 text-[#007DC5]' : 'bg-red-50 text-[#CE1126]'}`}>
                    {isTrip ? <Car size={18} /> : <Package size={18} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {item.pickup_address} → {item.dropoff_address}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{fmt(item.requested_at)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className={`badge ${st.bg} ${st.text}`}>{st.label}</span>
                    {(item.final_fare || item.estimated_fare) && (
                      <span className="text-xs font-bold text-gray-800">
                        {formatCDF(item.final_fare || item.estimated_fare)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Bottom Nav ── */}
      <nav className="bottom-nav px-6 pt-3 pb-safe flex justify-around mt-4">
        <button className="flex flex-col items-center gap-1">
          <div className="w-8 h-8 rounded-xl bg-[#007DC5] flex items-center justify-center text-white">
            <Home size={18} />
          </div>
          <span className="text-[10px] font-bold text-[#007DC5]">Accueil</span>
        </button>
        <Link href="/client/history" className="flex flex-col items-center gap-1">
          <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500">
            <Clock size={18} />
          </div>
          <span className="text-[10px] text-gray-400 font-medium">Historique</span>
        </Link>
        <Link href="/client/profile" className="flex flex-col items-center gap-1">
          <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500">
            <User size={18} />
          </div>
          <span className="text-[10px] text-gray-400 font-medium">Profil</span>
        </Link>
      </nav>
    </div>
  );
}
