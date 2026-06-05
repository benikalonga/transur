'use client';

import { useState, useEffect, useCallback } from 'react';
import { getAdminDeliveries, getAdminDelivery } from '@/lib/adminApi';

const formatFC = (usd) => Math.round((parseFloat(usd) || 0) * 2800).toLocaleString('fr-FR') + ' FC';

const STATUS_LABELS = {
  broadcast: 'En attente',
  accepted: 'Acceptée',
  pickup: 'Collecte',
  delivered: 'Livrée',
  cancelled: 'Annulée',
};

const STATUS_COLORS = {
  broadcast: 'bg-yellow-100 text-yellow-800',
  accepted: 'bg-blue-100 text-blue-800',
  pickup: 'bg-blue-100 text-blue-800',
  delivered: 'bg-gray-100 text-gray-700',
  cancelled: 'bg-red-100 text-red-700',
};

const PACKAGE_SIZE_LABELS = {
  small: 'Petit',
  medium: 'Moyen',
  large: 'Grand',
  extra_large: 'Très grand',
};

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function truncate(str, n = 30) {
  if (!str) return '—';
  return str.length > n ? str.slice(0, n) + '…' : str;
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

function StatCard({ label, value, color }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
      <p className="text-sm text-slate-500 font-medium">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color ?? 'text-slate-800'}`}>{value}</p>
    </div>
  );
}

function DetailModal({ delivery, onClose }) {
  if (!delivery) return null;
  const d = delivery;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Détails de la livraison</h2>
            <p className="text-xs text-slate-500 mt-0.5">ID: {d.id}</p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={d.status} />
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Trajet */}
          <section>
            <h3 className="text-xs font-semibold uppercase text-slate-400 mb-3 tracking-wider">Trajet</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Adresse de collecte</p>
                <p className="text-sm text-slate-700">{d.pickup_address || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Adresse de livraison</p>
                <p className="text-sm text-slate-700">{d.dropoff_address || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Distance</p>
                <p className="text-sm text-slate-700">{d.distance_km ? `${parseFloat(d.distance_km).toFixed(1)} km` : '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Durée estimée</p>
                <p className="text-sm text-slate-700">{d.estimated_duration ? `${d.estimated_duration} min` : '—'}</p>
              </div>
            </div>
          </section>

          {/* Colis */}
          <section>
            <h3 className="text-xs font-semibold uppercase text-slate-400 mb-3 tracking-wider">Colis</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Taille</p>
                <p className="text-sm text-slate-700">{PACKAGE_SIZE_LABELS[d.package_size] || d.package_size || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 mb-0.5">Description</p>
                <p className="text-sm text-slate-700">{d.package_description || '—'}</p>
              </div>
            </div>
          </section>

          {/* Personnes */}
          <section>
            <h3 className="text-xs font-semibold uppercase text-slate-400 mb-3 tracking-wider">Personnes</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-400 mb-1">Client</p>
                <p className="text-sm font-medium text-slate-800">{d.client?.name || d.client_name || '—'}</p>
                <p className="text-xs text-slate-500">{d.client?.phone || d.client_phone || ''}</p>
              </div>
              <div className="bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-400 mb-1">Livreur</p>
                <p className="text-sm font-medium text-slate-800">{d.agent?.name || d.driver?.name || d.driver_name || 'Non assigné'}</p>
                <p className="text-xs text-slate-500">{d.agent?.phone || d.driver?.phone || ''}</p>
              </div>
            </div>
            {(d.recipient_name || d.recipient_phone) && (
              <div className="mt-3 bg-slate-50 rounded-lg p-3">
                <p className="text-xs text-slate-400 mb-1">Destinataire</p>
                <p className="text-sm font-medium text-slate-800">{d.recipient_name || '—'}</p>
                <p className="text-xs text-slate-500">{d.recipient_phone || ''}</p>
              </div>
            )}
          </section>

          {/* Finances */}
          <section>
            <h3 className="text-xs font-semibold uppercase text-slate-400 mb-3 tracking-wider">Détail financier</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-sm text-slate-500">Tarif estimé</span>
                <span className="text-sm font-medium text-slate-700">{formatFC(d.estimated_fare)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-sm text-slate-500">Tarif final</span>
                <span className="text-sm font-medium text-slate-700">{formatFC(d.final_fare)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-sm text-slate-500">Commission</span>
                <span className="text-sm font-medium text-orange-600">{formatFC(d.commission)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-sm text-slate-500">Gains livreur</span>
                <span className="text-sm font-medium text-green-600">{formatFC(d.driver_earnings || d.agent_earnings)}</span>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-slate-400">Paiement :</span>
              <span className="text-xs font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                {d.payment_method === 'mobile' ? 'Mobile Money' : 'Espèces'}
              </span>
              {d.payment_status && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${d.payment_status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                  {d.payment_status === 'paid' ? 'Payé' : d.payment_status}
                </span>
              )}
            </div>
          </section>

          {/* Horodatage */}
          <section>
            <h3 className="text-xs font-semibold uppercase text-slate-400 mb-3 tracking-wider">Horodatage</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                ['Demandé', d.created_at],
                ['Accepté', d.accepted_at],
                ['Collecté', d.started_at || d.picked_up_at],
                ['Livré', d.delivered_at || d.completed_at || d.cancelled_at],
              ].map(([label, val]) => (
                <div key={label}>
                  <p className="text-xs text-slate-400">{label}</p>
                  <p className="text-sm text-slate-700">{formatDate(val)}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default function LivraisonsPage() {
  const [deliveries, setDeliveries] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

  const [selectedDelivery, setSelectedDelivery] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);

  const [stats, setStats] = useState({ total: 0, ongoing: 0, completed: 0, cancelled: 0 });

  const fetchDeliveries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { page, limit };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;

      const res = await getAdminDeliveries(params);
      const data = res.data;
      setDeliveries(data.deliveries ?? data.data ?? []);
      setTotal(data.total ?? data.count ?? 0);
    } catch (e) {
      setError('Erreur lors du chargement des livraisons.');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, dateFrom, dateTo]);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    Promise.all([
      getAdminDeliveries({ limit: 1 }),
      getAdminDeliveries({ status: 'accepted,pickup', limit: 1 }),
      getAdminDeliveries({ status: 'delivered', date_from: today, date_to: today, limit: 1 }),
      getAdminDeliveries({ status: 'cancelled', date_from: today, date_to: today, limit: 1 }),
    ]).then(([all, ongoingRes, deliveredRes, cancelledRes]) => {
      setStats({
        total: all.data.total ?? all.data.count ?? 0,
        ongoing: ongoingRes.data.total ?? ongoingRes.data.count ?? 0,
        completed: deliveredRes.data.total ?? deliveredRes.data.count ?? 0,
        cancelled: cancelledRes.data.total ?? cancelledRes.data.count ?? 0,
      });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    fetchDeliveries();
  }, [fetchDeliveries]);

  const handleSearch = (e) => { e.preventDefault(); setPage(1); fetchDeliveries(); };

  const openDetail = async (id) => {
    setModalLoading(true);
    setSelectedDelivery({ id });
    try {
      const res = await getAdminDelivery(id);
      setSelectedDelivery(res.data.delivery ?? res.data);
    } catch {
      setSelectedDelivery(null);
    } finally {
      setModalLoading(false);
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="p-6 space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total livraisons" value={stats.total.toLocaleString('fr-FR')} />
        <StatCard label="En cours" value={stats.ongoing.toLocaleString('fr-FR')} color="text-blue-600" />
        <StatCard label="Livrées aujourd'hui" value={stats.completed.toLocaleString('fr-FR')} color="text-green-600" />
        <StatCard label="Annulées aujourd'hui" value={stats.cancelled.toLocaleString('fr-FR')} color="text-red-500" />
      </div>

      {/* Filters */}
      <form onSubmit={handleSearch} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-slate-500 mb-1">Recherche</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nom client, livreur ou ID..."
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#007DC5]/40 focus:border-[#007DC5]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Statut</label>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#007DC5]/40 focus:border-[#007DC5] bg-white"
            >
              <option value="">Tous</option>
              <option value="broadcast">En attente</option>
              <option value="accepted">Acceptée</option>
              <option value="pickup">Collecte</option>
              <option value="delivered">Livrée</option>
              <option value="cancelled">Annulée</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Du</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#007DC5]/40 focus:border-[#007DC5]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Au</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#007DC5]/40 focus:border-[#007DC5]"
            />
          </div>
          <button
            type="submit"
            className="bg-[#007DC5] hover:bg-[#006aad] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Filtrer
          </button>
          <button
            type="button"
            onClick={() => { setSearch(''); setStatusFilter(''); setDateFrom(''); setDateTo(''); setPage(1); }}
            className="border border-slate-300 text-slate-600 hover:bg-slate-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Réinitialiser
          </button>
        </div>
      </form>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">
            Livraisons{total > 0 ? ` — ${total.toLocaleString('fr-FR')} résultats` : ''}
          </h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-[#007DC5] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-16 text-red-500 text-sm">{error}</div>
        ) : deliveries.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-sm">Aucune livraison trouvée.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {['ID', 'Client', 'Livreur', 'Départ → Destination', 'Colis', 'Destinataire', 'Distance', 'Tarif', 'Paiement', 'Statut', 'Date', 'Actions'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {deliveries.map((del) => (
                  <tr key={del.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{String(del.id).slice(0, 8)}</td>
                    <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                      {del.client?.name || del.client_name || '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {del.agent?.name || del.driver?.name || del.driver_name || <span className="text-slate-400 italic">Non assigné</span>}
                    </td>
                    <td className="px-4 py-3 max-w-[200px]">
                      <span className="text-slate-700">{truncate(del.pickup_address, 18)}</span>
                      <span className="text-slate-400 mx-1">→</span>
                      <span className="text-slate-700">{truncate(del.dropoff_address, 18)}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-xs text-slate-600">{PACKAGE_SIZE_LABELS[del.package_size] || del.package_size || '—'}</div>
                      {del.package_description && (
                        <div className="text-xs text-slate-400">{truncate(del.package_description, 18)}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">
                      {del.recipient_name || '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {del.distance_km ? `${parseFloat(del.distance_km).toFixed(1)} km` : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-800 font-medium whitespace-nowrap">
                      {formatFC(del.final_fare || del.estimated_fare)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${del.payment_method === 'mobile' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'}`}>
                        {del.payment_method === 'mobile' ? 'Mobile' : 'Espèces'}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge status={del.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">
                      {formatDate(del.created_at)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button
                        onClick={() => openDetail(del.id)}
                        className="text-[#007DC5] hover:underline text-xs font-medium"
                      >
                        Voir détails
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between text-sm text-slate-500">
            <span>Page {page} sur {totalPages}</span>
            <div className="flex gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50 transition-colors text-xs"
              >
                Précédent
              </button>
              <button
                disabled={page === totalPages}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50 transition-colors text-xs"
              >
                Suivant
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {(selectedDelivery || modalLoading) && (
        modalLoading ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-2xl p-8 flex items-center gap-3">
              <div className="w-6 h-6 border-4 border-[#007DC5] border-t-transparent rounded-full animate-spin" />
              <span className="text-slate-600 text-sm">Chargement...</span>
            </div>
          </div>
        ) : (
          <DetailModal delivery={selectedDelivery} onClose={() => setSelectedDelivery(null)} />
        )
      )}
    </div>
  );
}
