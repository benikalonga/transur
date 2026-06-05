'use client';

import { useState, useEffect, useCallback } from 'react';
import { Shield, Check, X, Trash2, UserCheck, Clock, RefreshCw } from 'lucide-react';
import { getAdmins, approveAdmin, rejectAdmin, deleteAdmin } from '@/lib/adminApi';

const formatDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
const formatDateTime = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Jamais';

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

function ConfirmModal({ open, title, message, confirmLabel, confirmClass, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 shadow-xl max-w-sm w-full">
        {title && <h3 className="font-semibold text-gray-900 mb-2 text-base">{title}</h3>}
        <p className="text-gray-600 text-sm mb-5">{message}</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">
            Annuler
          </button>
          <button onClick={onConfirm} className={`px-4 py-2 text-sm rounded-lg text-white ${confirmClass || 'bg-indigo-600 hover:bg-indigo-700'}`}>
            {confirmLabel || 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Avatar({ name, size = 'w-9 h-9', textSize = 'text-sm' }) {
  const initials = (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className={`${size} rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center ${textSize} font-bold flex-shrink-0`}>
      {initials}
    </div>
  );
}

function RoleBadge({ role }) {
  if (role === 'superadmin') {
    return <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-purple-100 text-purple-700">Superadmin</span>;
  }
  return <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700">Admin</span>;
}

function StatusBadge({ status }) {
  const map = {
    active: { label: 'Actif', cls: 'bg-green-100 text-green-700' },
    pending: { label: 'En attente', cls: 'bg-yellow-100 text-yellow-700' },
    rejected: { label: 'Rejeté', cls: 'bg-red-100 text-red-700' },
  };
  const s = map[status] || { label: status, cls: 'bg-gray-100 text-gray-600' };
  return <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${s.cls}`}>{s.label}</span>;
}

export default function AdminsPage() {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(null); // null = loading

  const showToast = (msg, type = 'success') => setToast({ msg, type });

  // Check superadmin on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem('admin_user');
      if (raw) {
        const user = JSON.parse(raw);
        setCurrentUser(user);
        setIsSuperAdmin(user.role === 'superadmin');
      } else {
        setIsSuperAdmin(false);
      }
    } catch {
      setIsSuperAdmin(false);
    }
  }, []);

  const fetchAdmins = useCallback(async () => {
    setLoading(true);
    try {
      const r = await getAdmins();
      const data = r.data;
      setAdmins(Array.isArray(data) ? data : data.admins || data.data || []);
    } catch {
      showToast('Erreur lors du chargement des admins', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin) fetchAdmins();
  }, [isSuperAdmin, fetchAdmins]);

  const pending = admins.filter(a => a.status === 'pending');
  const stats = {
    total: admins.length,
    pending: pending.length,
    active: admins.filter(a => a.status === 'active').length,
    rejected: admins.filter(a => a.status === 'rejected').length,
  };

  // Approve
  const handleApprove = (admin) => {
    setConfirm({
      title: 'Approuver cet administrateur',
      message: `Êtes-vous sûr de vouloir approuver ${admin.name || admin.full_name || admin.email} en tant qu'administrateur ?`,
      confirmLabel: 'Approuver',
      confirmClass: 'bg-green-600 hover:bg-green-700',
      onConfirm: async () => {
        setConfirm(null);
        try {
          await approveAdmin(admin.id || admin._id);
          showToast(`${admin.name || admin.email} approuvé avec succès`, 'success');
          fetchAdmins();
        } catch {
          showToast("Erreur lors de l'approbation", 'error');
        }
      },
    });
  };

  // Reject
  const handleReject = (admin) => {
    setConfirm({
      title: 'Rejeter cette demande',
      message: `Voulez-vous rejeter la demande de ${admin.name || admin.full_name || admin.email} ?`,
      confirmLabel: 'Rejeter',
      confirmClass: 'bg-red-600 hover:bg-red-700',
      onConfirm: async () => {
        setConfirm(null);
        try {
          await rejectAdmin(admin.id || admin._id);
          showToast('Demande rejetée', 'success');
          fetchAdmins();
        } catch {
          showToast('Erreur lors du rejet', 'error');
        }
      },
    });
  };

  // Delete
  const handleDelete = (admin) => {
    setConfirm({
      title: 'Supprimer cet administrateur',
      message: `Cette action est irréversible. Supprimer ${admin.name || admin.full_name || admin.email} ?`,
      confirmLabel: 'Supprimer',
      confirmClass: 'bg-red-600 hover:bg-red-700',
      onConfirm: async () => {
        setConfirm(null);
        try {
          await deleteAdmin(admin.id || admin._id);
          showToast('Administrateur supprimé', 'success');
          fetchAdmins();
        } catch {
          showToast('Erreur lors de la suppression', 'error');
        }
      },
    });
  };

  // Loading auth check
  if (isSuperAdmin === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <RefreshCw size={24} className="animate-spin text-indigo-500" />
      </div>
    );
  }

  // Access denied
  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-red-200 p-10 max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <Shield size={32} className="text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Accès refusé</h2>
          <p className="text-gray-500 text-sm">Seul le superadmin peut accéder à cette page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <Toast toast={toast} onClose={() => setToast(null)} />
      <ConfirmModal
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        confirmClass={confirm?.confirmClass}
        onConfirm={confirm?.onConfirm}
        onCancel={() => setConfirm(null)}
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Shield size={24} className="text-indigo-600" />
            Gestion des Admins
          </h1>
          <p className="text-gray-500 text-sm mt-1">Seul le superadmin peut approuver les demandes</p>
        </div>
        <button
          onClick={fetchAdmins}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 text-gray-600 disabled:opacity-50"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Actualiser
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500 mb-1">Total admins</p>
          <p className="text-2xl font-bold text-indigo-600">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500 mb-1">En attente d'approbation</p>
          <div className="flex items-center gap-2">
            <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
            {stats.pending > 0 && (
              <span className="text-xs bg-yellow-100 text-yellow-700 font-semibold px-2 py-0.5 rounded-full">!</span>
            )}
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500 mb-1">Actifs</p>
          <p className="text-2xl font-bold text-green-600">{stats.active}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500 mb-1">Rejetés</p>
          <p className="text-2xl font-bold text-red-500">{stats.rejected}</p>
        </div>
      </div>

      {/* Pending approvals */}
      <div className="bg-white rounded-2xl shadow-sm border-2 border-yellow-300 mb-6 overflow-hidden">
        <div className="px-5 py-4 bg-yellow-50 flex items-center gap-2">
          <Clock size={18} className="text-yellow-600" />
          <h2 className="font-semibold text-yellow-800 text-base">
            Demandes en attente ({stats.pending})
          </h2>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <RefreshCw size={20} className="animate-spin text-gray-400 mx-auto" />
          </div>
        ) : pending.length === 0 ? (
          <div className="px-5 py-8 text-center text-gray-400 text-sm">
            Aucune demande en attente
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nom</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date de demande</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pending.map(a => (
                  <tr key={a.id || a._id} className="hover:bg-yellow-50/30 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={a.name || a.full_name || a.email} />
                        <span className="text-sm font-medium text-gray-900">{a.name || a.full_name || '—'}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-600">{a.email}</td>
                    <td className="px-5 py-3 text-sm text-gray-500">{formatDate(a.created_at)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleApprove(a)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-green-600 text-white hover:bg-green-700 font-medium"
                        >
                          <Check size={13} /> Approuver
                        </button>
                        <button
                          onClick={() => handleReject(a)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-red-100 text-red-700 hover:bg-red-200 font-medium"
                        >
                          <X size={13} /> Rejeter
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* All admins table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800 text-base flex items-center gap-2">
            <UserCheck size={18} className="text-indigo-500" />
            Tous les administrateurs
          </h2>
          <span className="text-xs text-gray-400">{admins.length} au total</span>
        </div>

        {loading ? (
          <div className="p-8 text-center">
            <RefreshCw size={20} className="animate-spin text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Chargement…</p>
          </div>
        ) : admins.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <Shield size={40} className="mx-auto mb-3 text-gray-300" />
            <p className="text-sm">Aucun administrateur trouvé</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Administrateur</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Rôle</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Statut</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Dernière connexion</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date création</th>
                  <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {admins.map(a => {
                  const id = a.id || a._id;
                  const isSelf = currentUser && (currentUser.id === id || currentUser._id === id);
                  const isSuper = a.role === 'superadmin';
                  return (
                    <tr key={id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={a.name || a.full_name || a.email} />
                          <div>
                            <p className="text-sm font-medium text-gray-900">{a.name || a.full_name || '—'}</p>
                            <p className="text-xs text-gray-500">{a.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3"><RoleBadge role={a.role} /></td>
                      <td className="px-5 py-3"><StatusBadge status={a.status} /></td>
                      <td className="px-5 py-3 text-sm text-gray-500">{formatDateTime(a.last_login || a.last_login_at)}</td>
                      <td className="px-5 py-3 text-sm text-gray-500">{formatDate(a.created_at)}</td>
                      <td className="px-5 py-3">
                        {!isSuper && !isSelf ? (
                          <button
                            onClick={() => handleDelete(a)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-red-50 text-red-600 hover:bg-red-100 font-medium"
                          >
                            <Trash2 size={13} /> Supprimer
                          </button>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
