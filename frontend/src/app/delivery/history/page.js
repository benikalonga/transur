'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getDeliveryHistory } from '@/lib/api';
import { Flag, Package } from 'lucide-react';
import formatCDF from '@/lib/currency';

const STATUS = {
  delivered: { label: 'Livrée',   bg: 'bg-green-100',  text: 'text-green-700'  },
  cancelled: { label: 'Annulée',  bg: 'bg-red-100',    text: 'text-red-700'    },
  ongoing:   { label: 'En cours', bg: 'bg-blue-100',   text: 'text-blue-700'   },
  pickup:    { label: 'Récupéré', bg: 'bg-purple-100', text: 'text-purple-700' },
  accepted:  { label: 'Acceptée', bg: 'bg-yellow-100', text: 'text-yellow-700' },
};

export default function DeliveryHistory() {
  const router = useRouter();
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, earnings: 0, commission: 0 });

  useEffect(() => {
    getDeliveryHistory(1)
      .then(({ data }) => {
        setDeliveries(data.deliveries || []);
        const done = (data.deliveries || []).filter((d) => d.status === 'delivered');
        setStats({
          total:      done.length,
          earnings:   done.reduce((s, d) => s + parseFloat(d.agent_earnings || 0), 0),
          commission: done.reduce((s, d) => s + parseFloat(d.commission_amount || 0), 0),
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const fmt = (d) => new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });

  return (
    <div className="min-h-screen bg-[#f0f4f8] flex flex-col">

      {/* ── Header ── */}
      <div className="header-red relative px-6 pt-14 pb-20 text-white overflow-hidden">
        <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/5" />
        <button onClick={() => router.back()} className="relative text-red-200 text-sm mb-5">← Retour</button>
        <h1 className="relative text-2xl font-black">Mes Livraisons</h1>
        <p className="relative text-red-100 text-sm mt-1">Historique de vos livraisons</p>
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
            <p className="text-gray-400 text-xs">Livraisons</p>
            <p className="text-2xl font-black text-gray-900 mt-1">{stats.total}</p>
          </div>
          <div className="border-x border-gray-100">
            <p className="text-gray-400 text-xs">Gains nets</p>
            <p className="text-2xl font-black text-[#CE1126] mt-1">{formatCDF(stats.earnings)}</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs">Commissions</p>
            <p className="text-2xl font-black text-gray-500 mt-1">{formatCDF(stats.commission)}</p>
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
        ) : deliveries.length === 0 ? (
          <div className="card p-10 text-center fade-in">
            <div className="flex justify-center mb-3 text-gray-300">
              <Package size={48} />
            </div>
            <p className="font-bold text-gray-700">Aucune livraison pour le moment</p>
          </div>
        ) : (
          deliveries.map((d, i) => {
            const st = STATUS[d.status] || { label: d.status, bg: 'bg-gray-100', text: 'text-gray-600' };
            return (
              <div key={d.id} className="card p-4 slide-up" style={{animationDelay:`${i*50}ms`}}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center flex-shrink-0 text-[#CE1126]">
                      <Package size={20} />
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">{fmt(d.requested_at)}</p>
                      <p className="text-sm font-semibold text-gray-700 capitalize">{d.package_size} colis</p>
                    </div>
                  </div>
                  <span className={`badge ${st.bg} ${st.text}`}>{st.label}</span>
                </div>

                <div className="space-y-1.5 text-sm bg-gray-50 p-3 rounded-xl mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-[#CE1126] rounded-full flex-shrink-0" />
                    <span className="text-gray-600 truncate">{d.pickup_address}</span>
                  </div>
                  <div className="ml-0.5 w-0.5 h-2 bg-gray-300 ml-1" />
                  <div className="flex items-center gap-2">
                    <Flag size={12} className="text-[#CE1126] flex-shrink-0" />
                    <span className="text-gray-600 truncate">{d.dropoff_address}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-gray-100 text-sm">
                  <span className="text-gray-400 text-xs capitalize">{d.payment_method}</span>
                  {d.status === 'delivered' && (
                    <div className="text-right">
                      <div className="font-black text-[#CE1126]">+{formatCDF(d.agent_earnings || 0)}</div>
                      <div className="text-xs text-gray-400">-{formatCDF(d.commission_amount || 0)} comm.</div>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
