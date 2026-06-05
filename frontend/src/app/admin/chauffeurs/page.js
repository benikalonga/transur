'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Search, Eye, UserCheck, UserX, Ban, RefreshCw,
  ChevronLeft, ChevronRight, Star, Car, User, X, CheckCircle, XCircle,
} from 'lucide-react';
import { getAdminDrivers, updateUserStatus, verifyDriver } from '@/lib/adminApi';

const formatFC = (usd) => {
  const fc = Math.round((parseFloat(usd) || 0) * 2800);
  return fc.toLocaleString('fr-FR') + ' FC';
};

const formatDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';

const STATUS_ONLINE_LABELS = { online: 'En ligne', offline: 'Hors ligne', busy: 'Occupé' };
const STATUS_ONLINE_COLORS = {
  online: 'bg-green-100 text-green-700',
  offline: 'bg-gray-100 text-gray-600',
  busy: 'bg-orange-100 text-orange-700',
};

const USER_STATUS_LABELS = { active: 'Actif', suspended: 'Suspendu', blocked: 'Bloqué', pending: 'En attente' };
const USER_STATUS_COLORS = {
  active: 'bg-green-100 text-green-700',
  suspended: 'bg-yellow-100 text-yellow-700',
  blocked: 'bg-red-100 text-red-700',
  pending: 'bg-gray-100 text-gray-600',
};

function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [toast, onClose]);
  if (!toast) return null;
  return (
    <div className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-lg shadow-lg text-white text-sm font-medium ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
      {toast.msg}
    </div>
  );
}

function Initials({ name, photo, size = 'w-9 h-9' }) {
  if (photo) return <img src={photo} alt={name} className={`${size} rounded-full object-cover`} />;
  const initials = (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className={`${size} rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold`}>
      {initials}
    </div>
  );
}

function ConfirmModal({ open, message, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl p-6 shadow-xl max-w-sm w-full mx-4">
        <p className="text-gray-800 mb-5 text-sm">{message}</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">Annuler</button>
          <button onClick={onConfirm} className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700">Confirmer</button>
        </div>
      </div>
    </div>
  );
}

function DriverDetailModal({ driver, onClose }) {
  if (!driver) return null;
  return (
    <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-semibold text-gray-800">Détails du chauffeur</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-4">
            <Initials name={driver.full_name || driver.name} photo={driver.photo_url} size="w-16 h-16" />
            <div>
              <p className="text-lg font-semibold text-gray-900">{driver.full_name || driver.name || '—'}</p>
              <p className="text-sm text-gray-500">{driver.phone}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_ONLINE_COLORS[driver.online_status] || 'bg-gray-100 text-gray-600'}`}>
                  {STATUS_ONLINE_LABELS[driver.online_status] || driver.online_status || 'Inconnu'}
                </span>
                {driver.is_verified && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700 flex items-center gap-1">
                    <CheckCircle size={11} /> Vérifié
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-gray-500 text-xs mb-0.5">Véhicule</p>
              <p className="font-medium">{driver.vehicle_type || '—'} {driver.vehicle_brand || ''}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-gray-500 text-xs mb-0.5">Plaque / Couleur</p>
              <p className="font-medium">{driver.plate_number || '—'} — {driver.vehicle_color || '—'}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-gray-500 text-xs mb-0.5">Note moyenne</p>
              <p className="font-medium flex items-center gap-1"><Star size={14} className="text-yellow-400 fill-yellow-400" /> {driver.rating ? Number(driver.rating).toFixed(1) : '—'}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-gray-500 text-xs mb-0.5">Courses totales</p>
              <p className="font-medium">{driver.total_trips ?? '—'}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-gray-500 text-xs mb-0.5">Solde portefeuille</p>
              <p className="font-medium text-indigo-600">{formatFC(driver.wallet_balance)}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-gray-500 text-xs mb-0.5">Inscrit le</p>
              <p className="font-medium">{formatDate(driver.created_at)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {[...Array(8)].map((_, i) => (
        <td key={i} className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-full" /></td>
      ))}
    </tr>
  );
}

export default function ChauffeursPage() {
  const [drivers, setDrivers] = useState([]);
  const [stats, setStats] = useState({ total: 0, online: 0, busy: 0, offline: 0, verified: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [onlineStatus, setOnlineStatus] = useState('');
  const [verifiedFilter, setVerifiedFilter] = useState('');
  const [toast, setToast] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [detailDriver, setDetailDriver] = useState(null);
  const [actionDropdown, setActionDropdown] = useState(null);

  const showToast = (msg, type = 'success') => setToast({ msg, type });

  const fetchDrivers = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 15 };
      if (search) params.search = search;
      if (onlineStatus) params.online_status = onlineStatus;
      if (verifiedFilter !== '') params.is_verified = verifiedFilter;
      const r = await getAdminDrivers(params);
      const data = r.data;
      const list = data.chauffeurs || data.drivers || data.data || [];
      setDrivers(list);
      setTotalPages(Math.ceil((data.total || list.length) / 15) || 1);
      if (data.stats) {
        setStats(data.stats);
      } else {
        setStats({
          total: data.total || list.length,
          online: list.filter(d => d.online_status === 'online').length,
          busy: list.filter(d => d.online_status === 'busy').length,
          offline: list.filter(d => d.online_status === 'offline').length,
          verified: list.filter(d => d.is_verified).length,
        });
      }
    } catch {
      showToast('Erreur lors du chargement des chauffeurs', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, search, onlineStatus, verifiedFilter]);

  useEffect(() => { fetchDrivers(); }, [fetchDrivers]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    fetchDrivers();
  };

  const handleStatusAction = (id, newStatus, name) => {
    if (newStatus === 'active') {
      doStatusUpdate(id, newStatus);
    } else {
      setConfirm({
        message: `Voulez-vous vraiment ${newStatus === 'suspended' ? 'suspendre' : 'bloquer'} ${name} ?`,
        onConfirm: () => { doStatusUpdate(id, newStatus); setConfirm(null); },
      });
    }
    setActionDropdown(null);
  };

  const doStatusUpdate = async (id, newStatus) => {
    try {
      await updateUserStatus(id, newStatus);
      showToast('Statut mis à jour avec succès');
      fetchDrivers();
    } catch {
      showToast('Erreur lors de la mise à jour', 'error');
    }
  };

  const handleVerify = async (id) => {
    setActionDropdown(null);
    try {
      await verifyDriver(id);
      showToast('Chauffeur vérifié avec succès');
      fetchDrivers();
    } catch {
      showToast('Erreur lors de la vérification', 'error');
    }
  };

  const statCards = [
    { label: 'Total chauffeurs', value: stats.total, color: 'text-indigo-600' },
    { label: 'En ligne', value: stats.online, color: 'text-green-600' },
    { label: 'Occupés', value: stats.busy, color: 'text-orange-600' },
    { label: 'Hors ligne', value: stats.offline, color: 'text-gray-600' },
    { label: 'Vérifiés', value: stats.verified, color: 'text-blue-600' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <Toast toast={toast} onClose={() => setToast(null)} />
      <ConfirmModal
        open={!!confirm}
        message={confirm?.message}
        onConfirm={confirm?.onConfirm}
        onCancel={() => setConfirm(null)}
      />
      {detailDriver && <DriverDetailModal driver={detailDriver} onClose={() => setDetailDriver(null)} />}

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Gestion des chauffeurs</h1>
        <p className="text-gray-500 text-sm mt-1">Chauffeurs inscrits sur la plateforme Transur</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        {statCards.map(s => (
          <div key={s.label} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <p className="text-xs text-gray-500 mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <form onSubmit={handleSearch} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-5 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher par nom ou téléphone…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
        <select value={onlineStatus} onChange={e => { setOnlineStatus(e.target.value); setPage(1); }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <option value="">Tous les statuts</option>
          <option value="online">En ligne</option>
          <option value="offline">Hors ligne</option>
          <option value="busy">Occupé</option>
        </select>
        <select value={verifiedFilter} onChange={e => { setVerifiedFilter(e.target.value); setPage(1); }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <option value="">Tous (vérif.)</option>
          <option value="true">Vérifiés</option>
          <option value="false">Non vérifiés</option>
        </select>
        <button type="submit" className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">
          <Search size={15} /> Rechercher
        </button>
        <button type="button" onClick={() => { setSearch(''); setOnlineStatus(''); setVerifiedFilter(''); setPage(1); }}
          className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-500">
          <RefreshCw size={15} />
        </button>
      </form>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full min-w-[1000px]">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Chauffeur</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Véhicule</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Statut</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Note</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Courses</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Solde</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Vérifié</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              [...Array(8)].map((_, i) => <SkeletonRow key={i} />)
            ) : drivers.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-16 text-center text-gray-400">
                  <Car size={40} className="mx-auto mb-3 text-gray-300" />
                  <p className="text-sm">Aucun chauffeur trouvé</p>
                </td>
              </tr>
            ) : drivers.map(d => (
              <tr key={d.id || d._id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Initials name={d.full_name || d.name} photo={d.photo_url} />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{d.full_name || d.name || '—'}</p>
                      <p className="text-xs text-gray-500">{d.phone}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <p className="text-sm font-medium text-gray-800">{d.vehicle_type || '—'} {d.vehicle_brand || ''}</p>
                  <p className="text-xs text-gray-500">{d.plate_number || ''}{d.vehicle_color ? ` · ${d.vehicle_color}` : ''}</p>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_ONLINE_COLORS[d.online_status] || 'bg-gray-100 text-gray-600'}`}>
                    {STATUS_ONLINE_LABELS[d.online_status] || d.online_status || '—'}
                  </span>
                  {d.status && d.status !== 'active' && (
                    <span className={`ml-1 text-xs px-2 py-1 rounded-full font-medium ${USER_STATUS_COLORS[d.status]}`}>
                      {USER_STATUS_LABELS[d.status]}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-1 text-sm">
                    <Star size={14} className="text-yellow-400 fill-yellow-400" />
                    {d.rating ? Number(d.rating).toFixed(1) : '—'}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">{d.total_trips ?? '—'}</td>
                <td className="px-4 py-3 text-sm font-medium text-indigo-700">{formatFC(d.wallet_balance)}</td>
                <td className="px-4 py-3">
                  {d.is_verified
                    ? <CheckCircle size={18} className="text-green-500" />
                    : <XCircle size={18} className="text-gray-300" />}
                </td>
                <td className="px-4 py-3 relative">
                  <button
                    onClick={() => setActionDropdown(actionDropdown === (d.id || d._id) ? null : (d.id || d._id))}
                    className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600"
                  >
                    Actions ▾
                  </button>
                  {actionDropdown === (d.id || d._id) && (
                    <div className="absolute right-4 top-10 z-30 bg-white border border-gray-200 rounded-xl shadow-lg w-44 py-1">
                      <button onClick={() => { setDetailDriver(d); setActionDropdown(null); }}
                        className="flex items-center gap-2 w-full px-4 py-2 text-sm hover:bg-gray-50 text-gray-700">
                        <Eye size={14} /> Voir détails
                      </button>
                      <button onClick={() => handleStatusAction(d.id || d._id, 'active', d.full_name || d.name)}
                        className="flex items-center gap-2 w-full px-4 py-2 text-sm hover:bg-gray-50 text-green-600">
                        <UserCheck size={14} /> Activer
                      </button>
                      <button onClick={() => handleStatusAction(d.id || d._id, 'suspended', d.full_name || d.name)}
                        className="flex items-center gap-2 w-full px-4 py-2 text-sm hover:bg-gray-50 text-yellow-600">
                        <UserX size={14} /> Suspendre
                      </button>
                      <button onClick={() => handleStatusAction(d.id || d._id, 'blocked', d.full_name || d.name)}
                        className="flex items-center gap-2 w-full px-4 py-2 text-sm hover:bg-gray-50 text-red-600">
                        <Ban size={14} /> Bloquer
                      </button>
                      {!d.is_verified && (
                        <button onClick={() => handleVerify(d.id || d._id)}
                          className="flex items-center gap-2 w-full px-4 py-2 text-sm hover:bg-gray-50 text-blue-600">
                          <CheckCircle size={14} /> Vérifier
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
        <p>Page {page} sur {totalPages}</p>
        <div className="flex gap-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40">
            <ChevronLeft size={15} /> Précédent
          </button>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40">
            Suivant <ChevronRight size={15} />
          </button>
        </div>
      </div>

      {actionDropdown && (
        <div className="fixed inset-0 z-20" onClick={() => setActionDropdown(null)} />
      )}
    </div>
  );
}
