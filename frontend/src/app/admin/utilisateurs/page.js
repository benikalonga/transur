'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Search, Eye, UserCheck, UserX, Ban, RefreshCw,
  ChevronLeft, ChevronRight, User, X, Wallet, CreditCard,
} from 'lucide-react';
import { getAdminUsers, updateUserStatus, getAdminUser, creditUserWallet, debitUserWallet } from '@/lib/adminApi';

const formatFC = (usd) => {
  const fc = Math.round((parseFloat(usd) || 0) * 2800);
  return fc.toLocaleString('fr-FR') + ' FC';
};

const formatDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';

const ROLE_LABELS = { client: 'Passager', passenger: 'Passager', driver: 'Chauffeur', delivery: 'Livreur' };
const ROLE_COLORS = {
  client: 'bg-blue-100 text-blue-700',
  passenger: 'bg-blue-100 text-blue-700',
  driver: 'bg-green-100 text-green-700',
  delivery: 'bg-orange-100 text-orange-700',
};
const STATUS_LABELS = { active: 'Actif', suspended: 'Suspendu', blocked: 'Bloqué', pending: 'En attente' };
const STATUS_COLORS = {
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
    <div className={`fixed top-5 right-5 z-50 px-5 py-3 rounded-lg shadow-lg text-white text-sm font-medium transition-all ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
      {toast.msg}
    </div>
  );
}

function Initials({ name, photo, size = 'w-9 h-9' }) {
  if (photo) return <img src={photo} alt={name} className={`${size} rounded-full object-cover`} />;
  const initials = (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className={`${size} rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold`}>
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

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {[...Array(7)].map((_, i) => (
        <td key={i} className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-full" /></td>
      ))}
    </tr>
  );
}

function UserDetailModal({ userId, onClose, showToast }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [walletAmount, setWalletAmount] = useState('');
  const [walletNote, setWalletNote] = useState('');

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    getAdminUser(userId)
      .then(r => setUser(r.data))   // r.data = { user, wallet, trip_stats, delivery_stats }
      .catch(() => showToast('Erreur lors du chargement', 'error'))
      .finally(() => setLoading(false));
  }, [userId]);

  // Destructure once loaded
  const userInfo   = user?.user   ?? null;
  const walletInfo = user?.wallet ?? null;
  const tripStats  = user?.trip_stats     ?? [];
  const delStats   = user?.delivery_stats ?? [];

  const handleWallet = async (type) => {
    const amt = parseFloat(walletAmount);
    if (!amt || amt <= 0) { showToast('Montant invalide', 'error'); return; }
    try {
      const fn = type === 'credit' ? creditUserWallet : debitUserWallet;
      await fn(userId, { amount: amt, note: walletNote });
      showToast(type === 'credit' ? 'Crédit effectué' : 'Débit effectué', 'success');
      const r = await getAdminUser(userId);
      setUser(r.data);
      setWalletAmount(''); setWalletNote('');
    } catch {
      showToast('Erreur portefeuille', 'error');
    }
  };

  const handleStatus = async (status) => {
    try {
      await updateUserStatus(userId, status);
      showToast('Statut mis à jour', 'success');
      const r = await getAdminUser(userId);
      setUser(r.data);
    } catch {
      showToast('Erreur mise à jour', 'error');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-semibold text-gray-800">Détails de l'utilisateur</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400">Chargement…</div>
        ) : !userInfo ? (
          <div className="p-8 text-center text-gray-400">Utilisateur introuvable.</div>
        ) : (
          <div className="p-5 space-y-5">
            {/* Header */}
            <div className="flex items-center gap-4">
              <Initials name={userInfo.name} photo={userInfo.photo_url} size="w-16 h-16" />
              <div>
                <p className="text-lg font-semibold text-gray-900">{userInfo.name || '—'}</p>
                <p className="text-sm text-gray-500">{userInfo.phone}</p>
                <div className="flex gap-2 mt-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[userInfo.role] || 'bg-gray-100 text-gray-600'}`}>
                    {ROLE_LABELS[userInfo.role] || userInfo.role}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[userInfo.status] || 'bg-gray-100 text-gray-600'}`}>
                    {STATUS_LABELS[userInfo.status] || userInfo.status}
                  </span>
                </div>
              </div>
            </div>

            {/* Info grid */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-gray-500 text-xs mb-0.5">Inscrit le</p>
                <p className="font-medium">{formatDate(userInfo.created_at)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-gray-500 text-xs mb-0.5">Rôle</p>
                <p className="font-medium">{ROLE_LABELS[userInfo.role] || userInfo.role || '—'}</p>
              </div>
              {userInfo.role === 'driver' && (
                <>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-gray-500 text-xs mb-0.5">Véhicule</p>
                    <p className="font-medium">{userInfo.vehicle_type || '—'} {userInfo.vehicle_brand || ''} {userInfo.vehicle_color || ''}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-gray-500 text-xs mb-0.5">Plaque</p>
                    <p className="font-medium">{userInfo.vehicle_plate || '—'}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-gray-500 text-xs mb-0.5">Note</p>
                    <p className="font-medium">⭐ {userInfo.driver_rating ? Number(userInfo.driver_rating).toFixed(1) : '—'}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-gray-500 text-xs mb-0.5">Courses totales</p>
                    <p className="font-medium">{userInfo.total_trips ?? '—'}</p>
                  </div>
                </>
              )}
              {userInfo.role === 'delivery' && (
                <>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-gray-500 text-xs mb-0.5">Transport</p>
                    <p className="font-medium">{userInfo.transport_type || '—'}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-gray-500 text-xs mb-0.5">Note</p>
                    <p className="font-medium">⭐ {userInfo.livreur_rating ? Number(userInfo.livreur_rating).toFixed(1) : '—'}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-gray-500 text-xs mb-0.5">Livraisons totales</p>
                    <p className="font-medium">{userInfo.total_deliveries ?? '—'}</p>
                  </div>
                </>
              )}
            </div>

            {/* Wallet */}
            {walletInfo && (
              <div className="border rounded-xl p-4">
                <p className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2"><Wallet size={16} /> Portefeuille</p>
                <p className="text-2xl font-bold text-indigo-600 mb-1">{formatFC(walletInfo.balance)}</p>
                <p className="text-xs text-gray-400 mb-3">Gains totaux: {formatFC(walletInfo.total_earned)} · Payé: {formatFC(walletInfo.total_paid)}</p>

                {/* Wallet actions */}
                <div className="flex gap-2 mt-2">
                  <input
                    type="number"
                    placeholder="Montant (USD)"
                    value={walletAmount}
                    onChange={e => setWalletAmount(e.target.value)}
                    className="border rounded-lg px-3 py-1.5 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                  <input
                    type="text"
                    placeholder="Note"
                    value={walletNote}
                    onChange={e => setWalletNote(e.target.value)}
                    className="border rounded-lg px-3 py-1.5 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                  <button onClick={() => handleWallet('credit')} className="px-3 py-1.5 text-xs rounded-lg bg-green-600 text-white hover:bg-green-700">Créditer</button>
                  <button onClick={() => handleWallet('debit')} className="px-3 py-1.5 text-xs rounded-lg bg-red-600 text-white hover:bg-red-700">Débiter</button>
                </div>
              </div>
            )}

            {/* Trip / Delivery stats */}
            {(tripStats.length > 0 || delStats.length > 0) && (
              <div className="grid grid-cols-2 gap-3 text-sm">
                {tripStats.length > 0 && (
                  <div className="bg-blue-50 rounded-lg p-3">
                    <p className="text-blue-600 font-semibold text-xs mb-1">Courses</p>
                    {tripStats.map((s, i) => (
                      <div key={i} className="flex justify-between">
                        <span className="text-gray-500 capitalize">{s.status}</span>
                        <span className="font-medium">{s.cnt}</span>
                      </div>
                    ))}
                  </div>
                )}
                {delStats.length > 0 && (
                  <div className="bg-purple-50 rounded-lg p-3">
                    <p className="text-purple-600 font-semibold text-xs mb-1">Livraisons</p>
                    {delStats.map((s, i) => (
                      <div key={i} className="flex justify-between">
                        <span className="text-gray-500 capitalize">{s.status}</span>
                        <span className="font-medium">{s.cnt}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Status actions */}
            <div className="flex gap-2 flex-wrap pt-1">
              <button onClick={() => handleStatus('active')} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700">
                <UserCheck size={15} /> Activer
              </button>
              <button onClick={() => handleStatus('suspended')} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-yellow-500 text-white hover:bg-yellow-600">
                <UserX size={15} /> Suspendre
              </button>
              <button onClick={() => handleStatus('blocked')} className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700">
                <Ban size={15} /> Bloquer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function UtilisateursPage() {
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState({ total: 0, active: 0, suspended: 0, blocked: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [toast, setToast] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [detailUserId, setDetailUserId] = useState(null);
  const [actionDropdown, setActionDropdown] = useState(null);

  const showToast = (msg, type = 'success') => setToast({ msg, type });

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 15 };
      if (search) params.search = search;
      if (role) params.role = role;
      if (status) params.status = status;
      const r = await getAdminUsers(params);
      const data = r.data;
      setUsers(data.users || data.data || []);
      setTotalPages(Math.ceil((data.total || (data.users || data.data || []).length) / 15) || 1);
      if (data.stats) setStats(data.stats);
      else {
        const all = data.users || data.data || [];
        setStats({
          total: data.total || all.length,
          active: all.filter(u => u.status === 'active').length,
          suspended: all.filter(u => u.status === 'suspended').length,
          blocked: all.filter(u => u.status === 'blocked').length,
        });
      }
    } catch {
      showToast('Erreur lors du chargement des utilisateurs', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, search, role, status]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    fetchUsers();
  };

  const handleStatusAction = (userId, newStatus, name) => {
    if (newStatus === 'active') {
      doStatusUpdate(userId, newStatus);
    } else {
      setConfirm({
        message: `Voulez-vous vraiment ${newStatus === 'suspended' ? 'suspendre' : 'bloquer'} ${name} ?`,
        onConfirm: () => { doStatusUpdate(userId, newStatus); setConfirm(null); },
      });
    }
    setActionDropdown(null);
  };

  const doStatusUpdate = async (userId, newStatus) => {
    try {
      await updateUserStatus(userId, newStatus);
      showToast('Statut mis à jour avec succès');
      fetchUsers();
    } catch {
      showToast('Erreur lors de la mise à jour', 'error');
    }
  };

  const statCards = [
    { label: 'Total utilisateurs', value: stats.total, color: 'text-indigo-600' },
    { label: 'Actifs', value: stats.active, color: 'text-green-600' },
    { label: 'Suspendus', value: stats.suspended, color: 'text-yellow-600' },
    { label: 'Bloqués', value: stats.blocked, color: 'text-red-600' },
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
      {detailUserId && (
        <UserDetailModal userId={detailUserId} onClose={() => setDetailUserId(null)} showToast={showToast} />
      )}

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Gestion des utilisateurs</h1>
        <p className="text-gray-500 text-sm mt-1">Clients, chauffeurs et livreurs de la plateforme</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
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
        <select value={role} onChange={e => { setRole(e.target.value); setPage(1); }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <option value="">Tous les rôles</option>
          <option value="client">Passager</option>
          <option value="driver">Chauffeur</option>
          <option value="delivery">Livreur</option>
        </select>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300">
          <option value="">Tous les statuts</option>
          <option value="active">Actif</option>
          <option value="suspended">Suspendu</option>
          <option value="blocked">Bloqué</option>
          <option value="pending">En attente</option>
        </select>
        <button type="submit" className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">
          <Search size={15} /> Rechercher
        </button>
        <button type="button" onClick={() => { setSearch(''); setRole(''); setStatus(''); setPage(1); }}
          className="p-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-500">
          <RefreshCw size={15} />
        </button>
      </form>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Photo</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nom & Téléphone</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Rôle</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Statut</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Portefeuille</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Inscrit le</th>
              <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              [...Array(8)].map((_, i) => <SkeletonRow key={i} />)
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center text-gray-400">
                  <User size={40} className="mx-auto mb-3 text-gray-300" />
                  <p className="text-sm">Aucun utilisateur trouvé</p>
                </td>
              </tr>
            ) : users.map(u => (
              <tr key={u.id || u._id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <Initials name={u.full_name || u.name} photo={u.photo_url} />
                </td>
                <td className="px-4 py-3">
                  <p className="text-sm font-medium text-gray-900">{u.full_name || u.name || '—'}</p>
                  <p className="text-xs text-gray-500">{u.phone}</p>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${ROLE_COLORS[u.role] || 'bg-gray-100 text-gray-600'}`}>
                    {ROLE_LABELS[u.role] || u.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLORS[u.status] || 'bg-gray-100 text-gray-600'}`}>
                    {STATUS_LABELS[u.status] || u.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-700">
                  {(u.role === 'driver' || u.role === 'delivery') ? formatFC(u.wallet_balance) : '—'}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">{formatDate(u.created_at)}</td>
                <td className="px-4 py-3 relative">
                  <button
                    onClick={() => setActionDropdown(actionDropdown === (u.id || u._id) ? null : (u.id || u._id))}
                    className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600"
                  >
                    Actions ▾
                  </button>
                  {actionDropdown === (u.id || u._id) && (
                    <div className="absolute right-4 top-10 z-30 bg-white border border-gray-200 rounded-xl shadow-lg w-44 py-1">
                      <button onClick={() => { setDetailUserId(u.id || u._id); setActionDropdown(null); }}
                        className="flex items-center gap-2 w-full px-4 py-2 text-sm hover:bg-gray-50 text-gray-700">
                        <Eye size={14} /> Voir détails
                      </button>
                      <button onClick={() => handleStatusAction(u.id || u._id, 'active', u.full_name || u.name)}
                        className="flex items-center gap-2 w-full px-4 py-2 text-sm hover:bg-gray-50 text-green-600">
                        <UserCheck size={14} /> Activer
                      </button>
                      <button onClick={() => handleStatusAction(u.id || u._id, 'suspended', u.full_name || u.name)}
                        className="flex items-center gap-2 w-full px-4 py-2 text-sm hover:bg-gray-50 text-yellow-600">
                        <UserX size={14} /> Suspendre
                      </button>
                      <button onClick={() => handleStatusAction(u.id || u._id, 'blocked', u.full_name || u.name)}
                        className="flex items-center gap-2 w-full px-4 py-2 text-sm hover:bg-gray-50 text-red-600">
                        <Ban size={14} /> Bloquer
                      </button>
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
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40"
          >
            <ChevronLeft size={15} /> Précédent
          </button>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40"
          >
            Suivant <ChevronRight size={15} />
          </button>
        </div>
      </div>

      {/* Close dropdown on outside click */}
      {actionDropdown && (
        <div className="fixed inset-0 z-20" onClick={() => setActionDropdown(null)} />
      )}
    </div>
  );
}
