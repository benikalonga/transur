'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { RefreshCw, Car, Map, Package, AlertCircle, Clock } from 'lucide-react';
import { getOnlineDrivers, getLiveActivity } from '@/lib/adminApi';

// Dynamic import to avoid SSR issues with Leaflet
const LiveMap = dynamic(() => import('./LiveMap'), {
  ssr: false,
  loading: () => (
    <div className="h-full bg-gray-100 animate-pulse flex items-center justify-center">
      <p className="text-gray-400 text-sm font-medium">Chargement de la carte…</p>
    </div>
  ),
});

// ── Status badge for trips/deliveries ────────────────────────────────────────

function StatusBadge({ status }) {
  const map = {
    ongoing:   { label: 'En cours',    color: '#007DC5', bg: '#EBF5FB' },
    accepted:  { label: 'Acceptée',    color: '#3B82F6', bg: '#EFF6FF' },
    broadcast: { label: 'En diffusion', color: '#F59E0B', bg: '#FFF8E1' },
    picked_up: { label: 'Récupérée',   color: '#7C3AED', bg: '#F5F3FF' },
  };
  const meta = map[status] ?? { label: status ?? '—', color: '#6B7280', bg: '#F3F4F6' };
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ background: meta.bg, color: meta.color }}
    >
      {meta.label}
    </span>
  );
}

// ── Sidebar list item ─────────────────────────────────────────────────────────

function ActivityItem({ item, type }) {
  const isTrip = type === 'trip';
  const id = String(item._id ?? item.id ?? '').slice(-6);
  const label = isTrip
    ? (item.client?.name ?? item.clientName ?? 'Course #' + id)
    : (item.pickup?.address ?? item.pickupAddress ?? 'Livraison #' + id);
  const sub = isTrip
    ? (item.destination?.address ?? item.destinationAddress ?? '—')
    : (item.dropoff?.address ?? item.dropoffAddress ?? '—');

  return (
    <div className="flex items-start gap-2.5 py-2.5 border-b border-gray-50 last:border-0">
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: isTrip ? '#ECFDF5' : '#FFF7ED' }}
      >
        {isTrip
          ? <Car size={12} style={{ color: '#059669' }} />
          : <Package size={12} style={{ color: '#F97316' }} />
        }
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-gray-800 truncate">{label}</p>
        <p className="text-[11px] text-gray-400 truncate mt-0.5">{sub}</p>
      </div>
      <StatusBadge status={item.status} />
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function CartePage() {
  const [drivers,    setDrivers]    = useState([]);
  const [trips,      setTrips]      = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const intervalRef = useRef(null);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [drvRes, actRes] = await Promise.all([
        getOnlineDrivers(),
        getLiveActivity(),
      ]);

      const drvRaw = drvRes.data;
      setDrivers(Array.isArray(drvRaw) ? drvRaw : drvRaw?.drivers ?? drvRaw?.data ?? []);

      const actRaw = actRes.data;
      setTrips(Array.isArray(actRaw?.trips) ? actRaw.trips : []);
      setDeliveries(Array.isArray(actRaw?.deliveries) ? actRaw.deliveries : []);
      setLastUpdate(new Date());
    } catch (err) {
      setError('Impossible de charger les données en temps réel.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + auto-refresh every 30 seconds
  useEffect(() => {
    loadData();
    intervalRef.current = setInterval(loadData, 30_000);
    return () => clearInterval(intervalRef.current);
  }, [loadData]);

  const onlineCount   = drivers.length;
  const tripsCount    = trips.length;
  const deliveryCount = deliveries.length;

  return (
    <div className="flex" style={{ height: 'calc(100vh - 64px)' }}>

      {/* ── Map area ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 relative">
        {loading && !lastUpdate ? (
          <div className="absolute inset-0 bg-gray-100 flex items-center justify-center z-10">
            <div className="text-center">
              <div className="w-8 h-8 border-4 border-[#007DC5] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Chargement de la carte…</p>
            </div>
          </div>
        ) : error ? (
          <div className="absolute inset-0 bg-gray-50 flex items-center justify-center z-10">
            <div className="text-center">
              <AlertCircle size={36} className="text-red-400 mx-auto mb-2" />
              <p className="text-red-500 text-sm font-medium">{error}</p>
              <button
                onClick={loadData}
                className="mt-3 px-4 py-2 bg-[#007DC5] text-white rounded-lg text-sm font-medium hover:opacity-90"
              >
                Réessayer
              </button>
            </div>
          </div>
        ) : (
          <LiveMap drivers={drivers} trips={trips} deliveries={deliveries} />
        )}
      </div>

      {/* ── Sidebar ───────────────────────────────────────────────────────────── */}
      <aside
        className="bg-white border-l border-gray-100 flex flex-col overflow-hidden shadow-md"
        style={{ width: 300 }}
      >
        {/* Header */}
        <div className="px-4 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-900">Activité en direct</h2>
            <button
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <RefreshCw size={11} className={loading ? 'animate-spin text-[#007DC5]' : 'text-gray-500'} />
              Actualiser
            </button>
          </div>

          {/* KPIs */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-blue-50">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                <span className="text-xs font-medium text-blue-700">Chauffeurs en ligne</span>
              </div>
              <span className="text-sm font-bold text-blue-700">{onlineCount}</span>
            </div>
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-green-50">
              <div className="flex items-center gap-2">
                <Car size={12} className="text-green-600" />
                <span className="text-xs font-medium text-green-700">Courses actives</span>
              </div>
              <span className="text-sm font-bold text-green-700">{tripsCount}</span>
            </div>
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-orange-50">
              <div className="flex items-center gap-2">
                <Package size={12} className="text-orange-600" />
                <span className="text-xs font-medium text-orange-700">Livraisons actives</span>
              </div>
              <span className="text-sm font-bold text-orange-700">{deliveryCount}</span>
            </div>
          </div>

          {lastUpdate && (
            <div className="flex items-center gap-1 mt-2.5 text-[11px] text-gray-400">
              <Clock size={10} />
              Mis à jour à {lastUpdate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
          )}
        </div>

        {/* Activity list */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {trips.length === 0 && deliveries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400 text-xs text-center gap-2">
              <Map size={28} className="opacity-30" />
              <p>Aucune activité en cours.</p>
            </div>
          ) : (
            <>
              {trips.length > 0 && (
                <div className="mb-2">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                    Courses ({tripsCount})
                  </p>
                  {trips.map((t) => (
                    <ActivityItem key={t._id ?? t.id} item={t} type="trip" />
                  ))}
                </div>
              )}
              {deliveries.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 mt-3">
                    Livraisons ({deliveryCount})
                  </p>
                  {deliveries.map((d) => (
                    <ActivityItem key={d._id ?? d.id} item={d} type="delivery" />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
