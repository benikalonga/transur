'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getTripHistory, getDeliveryHistory } from '@/lib/api';
import Link from 'next/link';
import { Home, Clock, User, Car, Package, Flag } from 'lucide-react';
import formatCDF from '@/lib/currency';

const STATUS = {
  completed:  { label: 'Terminée',  bg: 'bg-green-100',  text: 'text-green-700'  },
  delivered:  { label: 'Livrée',    bg: 'bg-green-100',  text: 'text-green-700'  },
  cancelled:  { label: 'Annulée',   bg: 'bg-red-100',    text: 'text-red-700'    },
  ongoing:    { label: 'En cours',  bg: 'bg-blue-100',   text: 'text-blue-700'   },
  accepted:   { label: 'Acceptée',  bg: 'bg-blue-100',   text: 'text-blue-700'   },
  broadcast:  { label: 'Recherche', bg: 'bg-yellow-100', text: 'text-yellow-700' },
  pickup:     { label: 'En route',  bg: 'bg-purple-100', text: 'text-purple-700' },
};

export default function ClientHistory() {
  const router = useRouter();
  const [tab, setTab] = useState('trips');
  const [trips, setTrips] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [tr, dl] = await Promise.all([getTripHistory(1), getDeliveryHistory(1)]);
        setTrips(tr.data.trips || []);
        setDeliveries(dl.data.deliveries || []);
      } catch {}
      setLoading(false);
    })();
  }, []);

  const fmt = (d) => new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });

  return (
    <div className="min-h-screen bg-[#f0f4f8] flex flex-col">

      {/* ── Header ── */}
      <div className="header-blue relative px-6 pt-14 pb-20 text-white overflow-hidden">
        <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/5" />
        <button onClick={() => router.back()} className="relative text-blue-200 text-sm mb-5">← Retour</button>
        <h1 className="relative text-2xl font-black">Historique</h1>
        <p className="relative text-blue-100 text-sm mt-1">Vos courses et livraisons</p>
        <div className="absolute bottom-0 left-0 right-0 h-8">
          <svg viewBox="0 0 390 32" preserveAspectRatio="none" className="w-full h-full">
            <path d="M0 32 Q195 0 390 32 L390 32 L0 32 Z" fill="#f0f4f8"/>
          </svg>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="px-5 -mt-2">
        <div className="card flex overflow-hidden p-1 gap-1">
          <button onClick={() => setTab('trips')}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
              tab === 'trips' ? 'bg-[#007DC5] text-white shadow-sm' : 'text-gray-500'
            }`}>
            <Car size={16} /> Courses ({trips.length})
          </button>
          <button onClick={() => setTab('deliveries')}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
              tab === 'deliveries' ? 'bg-[#CE1126] text-white shadow-sm' : 'text-gray-500'
            }`}>
            <Package size={16} /> Livraisons ({deliveries.length})
          </button>
        </div>
      </div>

      <div className="flex-1 px-5 py-4">
        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => (
              <div key={i} className="card p-4">
                <div className="skeleton h-4 w-3/4 mb-2" />
                <div className="skeleton h-3 w-1/2 mb-2" />
                <div className="skeleton h-3 w-2/3" />
              </div>
            ))}
          </div>
        ) : tab === 'trips' ? (
          trips.length === 0 ? (
            <div className="card p-10 text-center fade-in">
              <div className="flex justify-center mb-3 text-gray-300"><Car size={48} /></div>
              <p className="font-bold text-gray-700">Aucune course</p>
              <p className="text-gray-400 text-sm mt-1">Vos courses apparaîtront ici</p>
              <button onClick={() => router.push('/client/taxi')}
                className="mt-4 btn-primary" style={{padding:'12px 24px',width:'auto'}}>
                Commander un taxi
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {trips.map((t, i) => {
                const st = STATUS[t.status] || { label: t.status, bg: 'bg-gray-100', text: 'text-gray-600' };
                return (
                  <div key={t.id} className="card p-4 slide-up" style={{animationDelay:`${i*50}ms`}}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-[#007DC5] flex-shrink-0"><Car size={18} /></div>
                        <div>
                          <p className="text-xs text-gray-400">{fmt(t.requested_at)}</p>
                          {t.driver_name && <p className="text-sm font-semibold text-gray-700">{t.driver_name}</p>}
                        </div>
                      </div>
                      <span className={`badge ${st.bg} ${st.text}`}>{st.label}</span>
                    </div>
                    <div className="space-y-1.5 text-sm bg-gray-50 p-3 rounded-xl">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-[#007DC5] rounded-full flex-shrink-0" />
                        <span className="text-gray-600 truncate">{t.pickup_address}</span>
                      </div>
                      <div className="ml-0.5 w-0.5 h-2 bg-gray-300 ml-1" />
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400 flex-shrink-0"><Flag size={12} /></span>
                        <span className="text-gray-600 truncate">{t.dropoff_address}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                      <span className="text-gray-400 text-xs capitalize">{t.payment_method}</span>
                      <span className="font-black text-gray-900">
                        {t.final_fare ? formatCDF(t.final_fare) : t.estimated_fare ? `~${formatCDF(t.estimated_fare)}` : ''}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          deliveries.length === 0 ? (
            <div className="card p-10 text-center fade-in">
              <div className="flex justify-center mb-3 text-gray-300"><Package size={48} /></div>
              <p className="font-bold text-gray-700">Aucune livraison</p>
              <p className="text-gray-400 text-sm mt-1">Vos livraisons apparaîtront ici</p>
              <button onClick={() => router.push('/client/delivery')}
                className="mt-4 btn-primary btn-red" style={{padding:'12px 24px',width:'auto'}}>
                Envoyer un colis
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {deliveries.map((d, i) => {
                const st = STATUS[d.status] || { label: d.status, bg: 'bg-gray-100', text: 'text-gray-600' };
                return (
                  <div key={d.id} className="card p-4 slide-up" style={{animationDelay:`${i*50}ms`}}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center text-[#CE1126] flex-shrink-0"><Package size={18} /></div>
                        <div>
                          <p className="text-xs text-gray-400">{fmt(d.requested_at)}</p>
                          {d.agent_name && <p className="text-sm font-semibold text-gray-700">{d.agent_name}</p>}
                        </div>
                      </div>
                      <span className={`badge ${st.bg} ${st.text}`}>{st.label}</span>
                    </div>
                    <div className="space-y-1.5 text-sm bg-gray-50 p-3 rounded-xl">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-[#CE1126] rounded-full flex-shrink-0" />
                        <span className="text-gray-600 truncate">{d.pickup_address}</span>
                      </div>
                      <div className="ml-0.5 w-0.5 h-2 bg-gray-300 ml-1" />
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400 flex-shrink-0"><Flag size={12} /></span>
                        <span className="text-gray-600 truncate">{d.dropoff_address}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                      <span className="text-gray-400 text-xs capitalize">{d.package_size} · {d.payment_method}</span>
                      {d.final_fare && <span className="font-black text-gray-900">{formatCDF(d.final_fare)}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>

      {/* ── Bottom nav ── */}
      <nav className="bottom-nav px-6 pt-3 pb-safe flex justify-around">
        <Link href="/client" className="flex flex-col items-center gap-1">
          <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500"><Home size={18} /></div>
          <span className="text-[10px] text-gray-400 font-medium">Accueil</span>
        </Link>
        <button className="flex flex-col items-center gap-1">
          <div className="w-8 h-8 rounded-xl bg-[#007DC5] flex items-center justify-center text-white"><Clock size={18} /></div>
          <span className="text-[10px] font-bold text-[#007DC5]">Historique</span>
        </button>
        <Link href="/client/profile" className="flex flex-col items-center gap-1">
          <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500"><User size={18} /></div>
          <span className="text-[10px] text-gray-400 font-medium">Profil</span>
        </Link>
      </nav>
    </div>
  );
}
