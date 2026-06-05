'use client';

import { useState, useEffect, useCallback } from 'react';
import { Settings, Edit3, Save, X, RefreshCw } from 'lucide-react';
import { getAdminPricing, updatePricing } from '@/lib/adminApi';

const toFC     = (usd) => Math.round((parseFloat(usd) || 0) * 2800).toLocaleString('fr-FR') + ' FC';
const formatDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const FIELDS = [
  { key: 'base_fare',        label: 'Tarif de base',         unit: 'FC' },
  { key: 'per_km_rate',      label: 'Tarif / km',            unit: 'FC/km' },
  { key: 'minimum_fare',     label: 'Tarif minimum',         unit: 'FC' },
  { key: 'commission_rate',  label: 'Commission',            unit: '%', raw: true },
  { key: 'surge_multiplier', label: 'Multiplicateur rush',   unit: '×', raw: true },
];

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

function PricingCard({ pricing, onSaved, showToast }) {
  const isTaxi = pricing.service_type === 'taxi';
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});

  const handleEdit = () => {
    const init = {};
    FIELDS.forEach(f => { init[f.key] = pricing[f.key] ?? ''; });
    setForm(init);
    setEditing(true);
  };

  const handleCancel = () => setEditing(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updatePricing(pricing.id, form);
      showToast('Tarif mis à jour avec succès', 'success');
      setEditing(false);
      onSaved();
    } catch {
      showToast('Erreur lors de la mise à jour du tarif', 'error');
    } finally {
      setSaving(false);
    }
  };

  const displayVal = (f) => {
    const v = parseFloat(pricing[f.key]);
    if (isNaN(v)) return '—';
    if (f.raw) return `${v} ${f.unit}`;
    return `${toFC(pricing[f.key])} / ${toFC(pricing[f.key]).replace(/\d[\d\s]* FC/, '')}`;
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 flex flex-col">
      {/* Header */}
      <div className={`rounded-t-2xl px-5 py-4 flex items-center gap-3 ${isTaxi ? 'bg-indigo-50' : 'bg-orange-50'}`}>
        <span className="text-2xl">{isTaxi ? '🚖' : '📦'}</span>
        <div>
          <p className="font-bold text-gray-900 text-base">{isTaxi ? 'Taxi / Course' : 'Livraison'}</p>
          <p className="text-xs text-gray-500 capitalize">{pricing.city || 'lubumbashi'}</p>
        </div>
        <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${pricing.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {pricing.is_active ? 'Actif' : 'Inactif'}
        </span>
      </div>

      {/* Fields */}
      <div className="px-5 py-3 flex-1 divide-y divide-gray-100">
        {FIELDS.map(f => (
          <div key={f.key} className="flex items-center justify-between py-2.5">
            <span className="text-sm text-gray-600">{f.label}</span>
            {editing ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  step="0.01"
                  value={form[f.key] ?? ''}
                  onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  className="w-28 text-right border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
                <span className="text-xs text-gray-400 w-12">{f.unit}</span>
              </div>
            ) : (
              <span className="text-sm font-semibold text-gray-900">
                {f.raw
                  ? `${parseFloat(pricing[f.key]) || 0} ${f.unit}`
                  : toFC(pricing[f.key])}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-5 pb-4 pt-2 flex items-center justify-between border-t border-gray-100">
        <p className="text-xs text-gray-400">Mis à jour le {formatDate(pricing.updated_at)}</p>
        {editing ? (
          <div className="flex gap-2">
            <button onClick={handleCancel} disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50">
              <X size={14} /> Annuler
            </button>
            <button onClick={handleSave} disabled={saving}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg text-white disabled:opacity-50 ${isTaxi ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-orange-500 hover:bg-orange-600'}`}>
              {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
              Enregistrer
            </button>
          </div>
        ) : (
          <button onClick={handleEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-700">
            <Edit3 size={14} /> Modifier
          </button>
        )}
      </div>
    </div>
  );
}

function PricingCalculator({ pricingList }) {
  const [distance, setDistance] = useState(5);
  if (!pricingList || pricingList.length === 0) return null;

  const calcFor = (p) => {
    const base   = (parseFloat(p.base_fare)       || 0) * 2800;
    const perKm  = (parseFloat(p.per_km_rate)      || 0) * 2800;
    const min    = (parseFloat(p.minimum_fare)     || 0) * 2800;
    const comm   = parseFloat(p.commission_rate)   || 0;
    const surge  = parseFloat(p.surge_multiplier)  || 1;
    const raw    = (base + perKm * distance) * surge;
    const fare   = Math.max(raw, min);
    const commFC = Math.round(fare * comm / 100);
    return { fare: Math.round(fare), comm: commFC, driver: Math.round(fare - commFC) };
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mt-6">
      <h2 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
        <Settings size={18} className="text-indigo-500" />
        Simulateur de tarif
      </h2>
      <div className="mb-5">
        <div className="flex justify-between text-sm text-gray-600 mb-1">
          <span>Distance</span>
          <span className="font-semibold text-gray-900">{distance} km</span>
        </div>
        <input type="range" min={1} max={50} value={distance}
          onChange={e => setDistance(parseInt(e.target.value))}
          className="w-full h-2 rounded-full accent-indigo-600 cursor-pointer" />
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>1 km</span><span>50 km</span>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {pricingList.map(p => {
          const { fare, comm, driver } = calcFor(p);
          const isTaxi = p.service_type === 'taxi';
          return (
            <div key={p.id} className={`rounded-xl p-4 ${isTaxi ? 'bg-indigo-50' : 'bg-orange-50'}`}>
              <p className="text-sm font-semibold text-gray-700 mb-2">{isTaxi ? '🚖 Taxi' : '📦 Livraison'}</p>
              <p className={`text-lg font-bold mb-1 ${isTaxi ? 'text-indigo-700' : 'text-orange-700'}`}>
                {fare.toLocaleString('fr-FR')} FC <span className="text-sm font-normal">pour {distance} km</span>
              </p>
              <p className="text-xs text-gray-500">Commission : {comm.toLocaleString('fr-FR')} FC ({p.commission_rate}%)</p>
              <p className="text-xs text-gray-500">Chauffeur reçoit : {driver.toLocaleString('fr-FR')} FC</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function TarifsPage() {
  const [pricingList, setPricingList] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [toast, setToast]             = useState(null);

  const showToast = (msg, type = 'success') => setToast({ msg, type });

  const fetchPricing = useCallback(async () => {
    setLoading(true);
    try {
      const r = await getAdminPricing();
      const data = r.data;
      setPricingList(Array.isArray(data) ? data : data.configs || data.pricing || []);
    } catch {
      showToast('Erreur lors du chargement des tarifs', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPricing(); }, [fetchPricing]);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <Toast toast={toast} onClose={() => setToast(null)} />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Settings size={24} className="text-indigo-600" />
            Configuration des Tarifs
          </h1>
          <p className="text-gray-500 text-sm mt-1">Gérez les tarifs de course et de livraison</p>
        </div>
        <button onClick={fetchPricing} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 text-gray-600 disabled:opacity-50">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Actualiser
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[0, 1].map(i => (
            <div key={i} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 animate-pulse">
              <div className="h-14 bg-gray-100 rounded-xl mb-4" />
              {[...Array(5)].map((_, j) => <div key={j} className="h-8 bg-gray-100 rounded mb-2" />)}
            </div>
          ))}
        </div>
      ) : pricingList.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400">
          <Settings size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="text-sm">Aucune configuration de tarif trouvée</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {pricingList.map(p => (
              <PricingCard key={p.id} pricing={p} onSaved={fetchPricing} showToast={showToast} />
            ))}
          </div>
          <PricingCalculator pricingList={pricingList} />
        </>
      )}

      <div className="mt-6 flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 text-sm text-blue-800">
        <span className="text-base mt-0.5">ℹ️</span>
        <p><span className="font-semibold">Note :</span> Les modifications de tarifs s'appliquent aux nouvelles courses uniquement.</p>
      </div>
    </div>
  );
}
