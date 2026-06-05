'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getWallet, rechargeWallet, getTransactions } from '@/lib/api';
import toast from 'react-hot-toast';
import { AlertTriangle, BarChart2, CreditCard, Gift, Radio, Signal, Smartphone, Wallet } from 'lucide-react';
import formatCDF from '@/lib/currency';

const PROVIDERS = [
  { id: 'mpesa',        label: 'M-Pesa',        Icon: Smartphone, color: 'bg-[#CE1126]' },
  { id: 'airtel_money', label: 'Airtel Money',   Icon: Radio,      color: 'bg-red-600'   },
  { id: 'orange_money', label: 'Orange Money',   Icon: Signal,     color: 'bg-orange-500'},
  { id: 'vodacom',      label: 'Vodacom',        Icon: Signal,     color: 'bg-red-700'   },
];

const TX_LABELS = {
  commission_debit:    { label: 'Commission',  Icon: BarChart2,   positive: false },
  mobile_money_credit: { label: 'Recharge',    Icon: CreditCard,  positive: true  },
  bonus:               { label: 'Bonus',       Icon: Gift,        positive: true  },
  penalty:             { label: 'Pénalité',    Icon: AlertTriangle, positive: false },
};

export default function DeliveryWalletPage() {
  const router = useRouter();
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRecharge, setShowRecharge] = useState(false);
  const [form, setForm] = useState({ amount: '', provider: 'mpesa', phone: '', ref: '' });
  const [recharging, setRecharging] = useState(false);

  useEffect(() => {
    Promise.all([getWallet(), getTransactions()])
      .then(([w, t]) => { setWallet(w.data.wallet); setTransactions(t.data.transactions); })
      .catch(() => toast.error('Erreur de chargement'))
      .finally(() => setLoading(false));
  }, []);

  const handleRecharge = async (e) => {
    e.preventDefault();
    if (!form.amount || form.amount <= 0) return toast.error('Montant invalide');
    setRecharging(true);
    try {
      await rechargeWallet({
        amount: parseFloat(form.amount),
        provider: form.provider,
        phone: form.phone,
        transaction_ref: form.ref || `REF-${Date.now()}`,
      });
      toast.success('Wallet rechargé !');
      setShowRecharge(false);
      const [w, t] = await Promise.all([getWallet(), getTransactions()]);
      setWallet(w.data.wallet); setTransactions(t.data.transactions);
    } catch { toast.error('Erreur lors de la recharge'); }
    finally { setRecharging(false); }
  };

  const fmt = (v) => formatCDF(v);
  const fmtDate = (d) => new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0f4f8]">
      <div className="w-8 h-8 border-2 border-[#CE1126] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f0f4f8] flex flex-col">

      {/* ── Header ── */}
      <div className="header-red relative px-6 pt-14 pb-24 text-white overflow-hidden">
        <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/5" />
        <div className="absolute bottom-8 left-6 w-16 h-16 rounded-full bg-white/5" />
        <button onClick={() => router.back()} className="relative text-red-200 text-sm mb-5">← Retour</button>
        <div className="relative flex items-center gap-3 mb-4">
          <Wallet size={28} className="text-white" />
          <h1 className="text-2xl font-black">Mon Wallet</h1>
        </div>

        {/* Balance card */}
        <div className={`relative rounded-2xl p-5 ${wallet?.is_blocked ? 'bg-red-900/60 border border-red-700/50' : 'bg-white/15 backdrop-blur'}`}>
          <p className="text-red-200 text-xs mb-1">Solde actuel</p>
          <p className={`text-4xl font-black ${wallet?.balance < 0 ? 'text-red-300' : 'text-white'}`}>
            {fmt(wallet?.balance)}
          </p>
          {wallet?.is_blocked && (
            <p className="text-red-300 text-sm mt-2 flex items-center gap-1.5">
              <AlertTriangle size={14} /> Compte bloqué — Rechargez pour débloquer
            </p>
          )}
          {wallet?.balance < 0 && !wallet?.is_blocked && (
            <p className="text-yellow-300 text-xs mt-2">
              Limite de dette: {fmt(wallet?.debt_limit)} — {fmt(Math.abs(wallet?.balance - wallet?.debt_limit))} avant blocage
            </p>
          )}
        </div>

        {/* Wave */}
        <div className="absolute bottom-0 left-0 right-0 h-8">
          <svg viewBox="0 0 390 32" preserveAspectRatio="none" className="w-full h-full">
            <path d="M0 32 Q195 0 390 32 L390 32 L0 32 Z" fill="#f0f4f8"/>
          </svg>
        </div>
      </div>

      <div className="flex-1 px-5 py-5 -mt-2 space-y-4">

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 gap-3">
          <div className="card p-4 text-center">
            <p className="text-gray-400 text-xs">Total gagné</p>
            <p className="text-xl font-black text-gray-900 mt-1">{fmt(wallet?.total_earned)}</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-gray-400 text-xs">Total rechargé</p>
            <p className="text-xl font-black text-gray-900 mt-1">{fmt(wallet?.total_paid)}</p>
          </div>
        </div>

        {/* ── Recharge button ── */}
        <button onClick={() => setShowRecharge(!showRecharge)} className="btn-primary btn-red flex items-center justify-center gap-2">
          {showRecharge ? '✕ Fermer' : <><CreditCard size={16} /> Recharger mon wallet</>}
        </button>

        {/* ── Recharge form ── */}
        {showRecharge && (
          <form onSubmit={handleRecharge} className="card p-5 space-y-4 slide-up">
            <h3 className="font-black text-gray-900">Recharge via Mobile Money</h3>

            {/* Providers */}
            <div className="grid grid-cols-2 gap-2">
              {PROVIDERS.map((p) => (
                <button key={p.id} type="button" onClick={() => setForm({ ...form, provider: p.id })}
                  className={`py-3 rounded-2xl text-white text-sm font-bold transition-all flex items-center justify-center gap-2 ${p.color} ${
                    form.provider === p.id ? 'ring-2 ring-offset-2 ring-[#CE1126] opacity-100' : 'opacity-60'
                  }`}>
                  <p.Icon size={16} /> {p.label}
                </button>
              ))}
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">Montant (USD)</label>
              <input type="number" value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="5.00" step="0.5" min="1" className="input-field" />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">Numéro Mobile Money</label>
              <input type="tel" value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+243 81 234 5678" className="input-field" />
            </div>

            <div className="bg-red-50 border border-red-100 p-3 rounded-2xl text-xs text-red-700 leading-relaxed">
              💡 <strong>Instructions:</strong> Envoyez le montant au numéro Transur {PROVIDERS.find(p => p.id === form.provider)?.label}, puis entrez la référence de transaction.
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1.5">Référence transaction</label>
              <input type="text" value={form.ref}
                onChange={(e) => setForm({ ...form, ref: e.target.value })}
                placeholder="Ex: MPE123456" className="input-field" />
            </div>

            <button type="submit" disabled={recharging} className="btn-primary btn-red">
              {recharging
                ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : '✓ Confirmer la recharge'
              }
            </button>
          </form>
        )}

        {/* ── Transactions ── */}
        <div>
          <h3 className="font-black text-gray-900 mb-3">Transactions récentes</h3>
          {transactions.length === 0 ? (
            <div className="card p-8 text-center fade-in">
              <div className="flex justify-center mb-2 text-gray-300">
                <BarChart2 size={40} />
              </div>
              <p className="text-gray-400 text-sm">Aucune transaction</p>
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.map((tx, i) => {
                const info = TX_LABELS[tx.type] || { label: tx.type, Icon: CreditCard, positive: tx.amount > 0 };
                const IconComp = info.Icon;
                return (
                  <div key={tx.id} className="card p-4 flex items-center gap-3 slide-up" style={{animationDelay:`${i*40}ms`}}>
                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                      info.positive ? 'bg-green-50 text-green-600' : 'bg-red-50 text-[#CE1126]'
                    }`}>
                      <IconComp size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900">{info.label}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{fmtDate(tx.created_at)}</p>
                    </div>
                    <div className={`font-black text-base flex-shrink-0 ${info.positive ? 'text-green-600' : 'text-[#CE1126]'}`}>
                      {tx.amount > 0 ? '+' : ''}{fmt(tx.amount)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
