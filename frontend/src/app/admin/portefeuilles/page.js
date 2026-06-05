'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Wallet,
  Search,
  RefreshCw,
  AlertCircle,
  ChevronDown,
  X,
  Plus,
  Minus,
  List,
  Lock,
  Unlock,
} from 'lucide-react';
import {
  getAdminWallets,
  blockWallet,
  creditUserWallet,
  debitUserWallet,
  getAdminTransactions,
} from '@/lib/adminApi';

// ── Helpers ───────────────────────────────────────────────────────────────────

const formatFC = (usd) =>
  Math.round((parseFloat(usd) || 0) * 2800).toLocaleString('fr-FR') + ' FC';

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function initials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// ── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, color = '#007DC5', bg = '#EBF5FB', icon: Icon }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-start gap-4">
      <div className="rounded-xl p-3 shrink-0" style={{ background: bg }}>
        <Icon size={22} style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-gray-500 font-medium">{label}</p>
        <p className="text-xl font-bold text-gray-900 mt-0.5 leading-tight">{value}</p>
      </div>
    </div>
  );
}

// ── Role Badge ───────────────────────────────────────────────────────────────

function RoleBadge({ role }) {
  const meta =
    role === 'driver'
      ? { label: 'Chauffeur', color: '#007DC5', bg: '#EBF5FB' }
      : (role === 'delivery_agent' || role === 'delivery')
      ? { label: 'Livreur', color: '#7C3AED', bg: '#F5F3FF' }
      : { label: role ?? '—', color: '#6B7280', bg: '#F3F4F6' };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: meta.bg, color: meta.color }}
    >
      {meta.label}
    </span>
  );
}

// ── Transaction Type Badge ───────────────────────────────────────────────────

function TxBadge({ type }) {
  const map = {
    commission_debit: { label: 'Commission', color: '#EF4444', bg: '#FEF2F2' },
    bonus: { label: 'Bonus', color: '#059669', bg: '#ECFDF5' },
    mobile_money_credit: { label: 'Mobile Money', color: '#3B82F6', bg: '#EFF6FF' },
    credit: { label: 'Crédit', color: '#059669', bg: '#ECFDF5' },
    debit: { label: 'Débit', color: '#EF4444', bg: '#FEF2F2' },
  };
  const meta = map[type] ?? { label: type ?? '—', color: '#6B7280', bg: '#F3F4F6' };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: meta.bg, color: meta.color }}
    >
      {meta.label}
    </span>
  );
}

// ── Toggle Switch ────────────────────────────────────────────────────────────

function ToggleSwitch({ checked, onChange, loading }) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={loading}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
        checked ? 'bg-red-500' : 'bg-gray-200'
      } ${loading ? 'opacity-50 cursor-wait' : ''}`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

// ── Modal wrapper ────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors"
          >
            <X size={16} className="text-gray-500" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PortefeuillesPage() {
  const [wallets, setWallets]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);

  // Filters
  const [search, setSearch]         = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [blockedFilter, setBlockedFilter] = useState('');

  // Block toggle loading per wallet
  const [blockLoading, setBlockLoading] = useState({});

  // Credit/debit modal
  const [walletModal, setWalletModal] = useState(null); // { user, mode: 'credit'|'debit' }
  const [modalAmount, setModalAmount] = useState('');
  const [modalReason, setModalReason] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError]   = useState('');

  // Transactions modal
  const [txModal, setTxModal]       = useState(null); // { user }
  const [txList, setTxList]         = useState([]);
  const [txLoading, setTxLoading]   = useState(false);

  // ── Load wallets ───────────────────────────────────────────────────────────

  const loadWallets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAdminWallets({
        search: search || undefined,
        role: roleFilter || undefined,
        blocked: blockedFilter || undefined,
      });
      const raw = res.data;
      setWallets(Array.isArray(raw) ? raw : raw?.wallets ?? raw?.data ?? []);
    } catch (err) {
      setError('Impossible de charger les portefeuilles.');
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, blockedFilter]);

  useEffect(() => {
    const t = setTimeout(loadWallets, 300);
    return () => clearTimeout(t);
  }, [loadWallets]);

  // ── Stats ──────────────────────────────────────────────────────────────────

  const stats = (() => {
    if (!wallets.length) return { totalSolde: '0 FC', blocked: 0, moyenne: '0 FC', totalGagne: '0 FC' };
    const total   = wallets.reduce((s, w) => s + (parseFloat(w.balance) || 0), 0);
    const blocked = wallets.filter((w) => !!w.is_blocked).length;
    const moyenne = total / wallets.length;
    const earned  = wallets.reduce((s, w) => s + (parseFloat(w.total_earned) || 0), 0);
    return {
      totalSolde: formatFC(total),
      blocked,
      moyenne: formatFC(moyenne),
      totalGagne: formatFC(earned),
    };
  })();

  // ── Toggle block ───────────────────────────────────────────────────────────

  async function handleBlock(wallet) {
    const userId = wallet.user_id ?? wallet.userId ?? wallet._id;
    setBlockLoading((prev) => ({ ...prev, [userId]: true }));
    try {
      await blockWallet(userId, !wallet.is_blocked);
      setWallets((prev) =>
        prev.map((w) =>
          (w.user_id ?? w.userId ?? w._id) === userId
            ? { ...w, is_blocked: !w.is_blocked }
            : w
        )
      );
    } catch (err) {
      alert('Erreur lors du blocage du portefeuille.');
    } finally {
      setBlockLoading((prev) => ({ ...prev, [userId]: false }));
    }
  }

  // ── Credit / Debit ─────────────────────────────────────────────────────────

  async function handleModalSubmit() {
    const amountFC = parseFloat(modalAmount.replace(/\s/g, '').replace(',', '.'));
    if (!amountFC || amountFC <= 0) {
      setModalError('Veuillez saisir un montant valide.');
      return;
    }
    const amountUSD = amountFC / 2800;
    const userId = walletModal.user.user_id ?? walletModal.user.userId ?? walletModal.user._id;
    setModalLoading(true);
    setModalError('');
    try {
      if (walletModal.mode === 'credit') {
        await creditUserWallet(userId, { amount: amountUSD, reason: modalReason });
      } else {
        await debitUserWallet(userId, { amount: amountUSD, reason: modalReason });
      }
      setWalletModal(null);
      setModalAmount('');
      setModalReason('');
      loadWallets();
    } catch (err) {
      setModalError(err?.response?.data?.message ?? 'Erreur lors de la transaction.');
    } finally {
      setModalLoading(false);
    }
  }

  // ── Load transactions ──────────────────────────────────────────────────────

  async function openTxModal(wallet) {
    const userId = wallet.user_id ?? wallet.userId ?? wallet._id;
    setTxModal(wallet);
    setTxList([]);
    setTxLoading(true);
    try {
      const res = await getAdminTransactions({ userId, limit: 20 });
      const raw = res.data;
      setTxList(Array.isArray(raw) ? raw : raw?.data ?? raw?.transactions ?? []);
    } catch (_) {
      setTxList([]);
    } finally {
      setTxLoading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6">

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total Solde Système" value={stats.totalSolde} color="#007DC5" bg="#EBF5FB" icon={Wallet} />
        <StatCard label="Wallets Bloqués"      value={stats.blocked}   color="#EF4444" bg="#FEF2F2" icon={Lock} />
        <StatCard label="Solde Moyen"           value={stats.moyenne}   color="#F59E0B" bg="#FFF8E1" icon={Wallet} />
        <StatCard label="Total Gagné Système"   value={stats.totalGagne} color="#059669" bg="#ECFDF5" icon={Wallet} />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex flex-wrap gap-3 items-center">
          {/* Search */}
          <div className="relative flex-1 min-w-[220px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher nom ou téléphone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#007DC5]/30 focus:border-[#007DC5]"
            />
          </div>

          {/* Role filter */}
          <div className="relative">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#007DC5]/30 focus:border-[#007DC5] bg-white"
            >
              <option value="">Tous les rôles</option>
              <option value="driver">Chauffeur</option>
              <option value="delivery_agent">Livreur</option>
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>

          {/* Blocked filter */}
          <div className="relative">
            <select
              value={blockedFilter}
              onChange={(e) => setBlockedFilter(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#007DC5]/30 focus:border-[#007DC5] bg-white"
            >
              <option value="">Tous</option>
              <option value="false">Actif</option>
              <option value="true">Bloqué</option>
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>

          <button
            onClick={loadWallets}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin text-[#007DC5]' : 'text-gray-500'} />
            Actualiser
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {error ? (
          <div className="flex items-center justify-center py-16 gap-2 text-red-500">
            <AlertCircle size={18} />
            <span className="text-sm font-medium">{error}</span>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-[#007DC5] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : wallets.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
            Aucun portefeuille trouvé.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Utilisateur</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Rôle</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Solde</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Limite Dette</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Gagné</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Payé</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Bloqué</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {wallets.map((wallet) => {
                  const userId = wallet.user_id ?? wallet.userId ?? wallet._id;
                  const name   = wallet.user?.name ?? wallet.name ?? '—';
                  const phone  = wallet.user?.phone ?? wallet.phone ?? '';
                  const role   = wallet.user?.role ?? wallet.role ?? '';
                  const balance = parseFloat(wallet.balance) || 0;
                  const balanceFC = Math.round(balance * 2800);

                  let balanceColor = 'text-green-600';
                  if (balanceFC < 0) balanceColor = 'text-red-600';
                  else if (balanceFC < 2000) balanceColor = 'text-orange-500';

                  return (
                    <tr key={userId} className="hover:bg-gray-50/50 transition-colors">
                      {/* User */}
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-[#007DC5]/10 flex items-center justify-center text-[#007DC5] text-xs font-bold shrink-0">
                            {initials(name)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 truncate">{name}</p>
                            {phone && <p className="text-xs text-gray-400">{phone}</p>}
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-4 py-3">
                        <RoleBadge role={role} />
                      </td>

                      {/* Solde */}
                      <td className={`px-4 py-3 text-right font-semibold tabular-nums ${balanceColor}`}>
                        {balanceFC.toLocaleString('fr-FR')} FC
                      </td>

                      {/* Limite dette */}
                      <td className="px-4 py-3 text-right text-gray-700 tabular-nums">
                        {formatFC(wallet.debt_limit ?? wallet.debtLimit ?? 0)}
                      </td>

                      {/* Total gagné */}
                      <td className="px-4 py-3 text-right text-gray-700 tabular-nums">
                        {formatFC(wallet.total_earned ?? wallet.totalEarned ?? 0)}
                      </td>

                      {/* Total payé */}
                      <td className="px-4 py-3 text-right text-gray-700 tabular-nums">
                        {formatFC(wallet.total_paid ?? wallet.totalPaid ?? 0)}
                      </td>

                      {/* Toggle bloqué */}
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center">
                          <ToggleSwitch
                            checked={!!wallet.is_blocked}
                            onChange={() => handleBlock(wallet)}
                            loading={!!blockLoading[userId]}
                          />
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => { setWalletModal({ user: wallet, mode: 'credit' }); setModalAmount(''); setModalReason(''); setModalError(''); }}
                            title="Créditer"
                            className="w-7 h-7 rounded-lg bg-green-50 hover:bg-green-100 text-green-600 flex items-center justify-center transition-colors"
                          >
                            <Plus size={13} />
                          </button>
                          <button
                            onClick={() => { setWalletModal({ user: wallet, mode: 'debit' }); setModalAmount(''); setModalReason(''); setModalError(''); }}
                            title="Débiter"
                            className="w-7 h-7 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 flex items-center justify-center transition-colors"
                          >
                            <Minus size={13} />
                          </button>
                          <button
                            onClick={() => openTxModal(wallet)}
                            title="Voir transactions"
                            className="w-7 h-7 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-500 flex items-center justify-center transition-colors"
                          >
                            <List size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Credit / Debit Modal */}
      {walletModal && (
        <Modal
          title={walletModal.mode === 'credit' ? 'Créditer le portefeuille' : 'Débiter le portefeuille'}
          onClose={() => setWalletModal(null)}
        >
          <div className="space-y-4">
            {/* User info */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
              <div className="w-10 h-10 rounded-full bg-[#007DC5]/10 flex items-center justify-center text-[#007DC5] text-sm font-bold shrink-0">
                {initials(walletModal.user?.user?.name ?? walletModal.user?.name)}
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">
                  {walletModal.user?.user?.name ?? walletModal.user?.name ?? '—'}
                </p>
                <p className="text-xs text-gray-400">
                  Solde actuel : {formatFC(walletModal.user?.balance ?? 0)}
                </p>
              </div>
            </div>

            {/* Amount */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Montant (FC)
              </label>
              <input
                type="number"
                min="0"
                step="100"
                placeholder="Ex : 5000"
                value={modalAmount}
                onChange={(e) => setModalAmount(e.target.value)}
                className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#007DC5]/30 focus:border-[#007DC5]"
              />
              {modalAmount && parseFloat(modalAmount) > 0 && (
                <p className="text-xs text-gray-400 mt-1">
                  ≈ ${(parseFloat(modalAmount) / 2800).toFixed(4)} USD
                </p>
              )}
            </div>

            {/* Reason */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Motif
              </label>
              <input
                type="text"
                placeholder="Raison de la transaction…"
                value={modalReason}
                onChange={(e) => setModalReason(e.target.value)}
                className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#007DC5]/30 focus:border-[#007DC5]"
              />
            </div>

            {modalError && (
              <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">
                <AlertCircle size={14} />
                {modalError}
              </div>
            )}

            {/* Confirm */}
            <button
              onClick={handleModalSubmit}
              disabled={modalLoading}
              className={`w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity ${
                walletModal.mode === 'credit' ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'
              } ${modalLoading ? 'opacity-60 cursor-wait' : ''}`}
            >
              {modalLoading
                ? 'Traitement…'
                : walletModal.mode === 'credit'
                ? 'Confirmer le crédit'
                : 'Confirmer le débit'}
            </button>
          </div>
        </Modal>
      )}

      {/* Transactions Modal */}
      {txModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  Transactions — {txModal?.user?.name ?? txModal?.name ?? '—'}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">20 dernières transactions</p>
              </div>
              <button
                onClick={() => setTxModal(null)}
                className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors"
              >
                <X size={16} className="text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {txLoading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="w-7 h-7 border-4 border-[#007DC5] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : txList.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-10">Aucune transaction trouvée.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/60">
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Type</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500">Montant</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500">Avant → Après</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Description</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {txList.map((tx, i) => (
                      <tr key={tx._id ?? i} className="hover:bg-gray-50/50">
                        <td className="px-3 py-2.5">
                          <TxBadge type={tx.type} />
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-gray-800">
                          {formatFC(tx.amount ?? 0)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-xs text-gray-500 tabular-nums whitespace-nowrap">
                          {formatFC(tx.balance_before ?? tx.balanceBefore ?? 0)}
                          <span className="mx-1 text-gray-300">→</span>
                          {formatFC(tx.balance_after ?? tx.balanceAfter ?? 0)}
                        </td>
                        <td className="px-3 py-2.5 text-gray-600 max-w-[160px] truncate">
                          {tx.description ?? tx.reason ?? '—'}
                        </td>
                        <td className="px-3 py-2.5 text-gray-400 text-xs whitespace-nowrap">
                          {formatDate(tx.createdAt ?? tx.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
