'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Users,
  Car,
  Package,
  DollarSign,
  Map,
  MessageSquare,
  Settings,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';
import { getAdminStats, getFinanceDaily } from '@/lib/adminApi';

// ── Helpers ───────────────────────────────────────────────────────────────────

const FC_RATE = 2800;

function formatFC(usd) {
  const fc = Math.round((usd ?? 0) * FC_RATE);
  return fc.toLocaleString('fr-FR').replace(/ /g, ' ') + ' FC';
}

function formatNum(n) {
  return (n ?? 0).toLocaleString('fr-FR');
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, color = '#007DC5', bg = '#EBF5FB' }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-start gap-4">
      <div className="rounded-xl p-3 shrink-0" style={{ background: bg }}>
        <Icon size={22} style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-gray-500 font-medium">{label}</p>
        <p className="text-2xl font-bold text-gray-900 mt-0.5 leading-tight">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <h2 className="text-base font-semibold text-gray-800 mb-3">{children}</h2>
  );
}

const STATUS_META = {
  broadcast:  { label: 'En diffusion',  color: '#F59E0B', bg: '#FFF8E1' },
  accepted:   { label: 'Acceptée',      color: '#3B82F6', bg: '#EFF6FF' },
  ongoing:    { label: 'En cours',      color: '#007DC5', bg: '#EBF5FB' },
  completed:  { label: 'Terminée',      color: '#059669', bg: '#ECFDF5' },
  cancelled:  { label: 'Annulée',       color: '#EF4444', bg: '#FEF2F2' },
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status] ?? { label: status, color: '#6B7280', bg: '#F3F4F6' };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: meta.bg, color: meta.color }}
    >
      {meta.label}
    </span>
  );
}

// Simple SVG bar chart for last 7 days revenue
function RevenueBarChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-36 text-gray-400 text-sm">
        Aucune donnée disponible
      </div>
    );
  }

  const getVal = (d) => Number(d.total_commission ?? d.commission ?? 0);
  const maxVal = Math.max(...data.map(getVal), 1);
  const BAR_H  = 120;
  const BAR_W  = 28;
  const GAP    = 14;
  const TOTAL_W = data.length * (BAR_W + GAP) - GAP;

  return (
    <div className="overflow-x-auto">
      <svg
        width={TOTAL_W + 8}
        height={BAR_H + 36}
        className="overflow-visible"
      >
        {data.map((d, i) => {
          const h   = Math.max(4, Math.round((getVal(d) / maxVal) * BAR_H));
          const x   = i * (BAR_W + GAP);
          const y   = BAR_H - h;
          const day = d.date
            ? new Date(d.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })
            : `J${i + 1}`;
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={BAR_W}
                height={h}
                rx={5}
                fill="#007DC5"
                opacity={0.85}
              />
              {/* value on top */}
              <text
                x={x + BAR_W / 2}
                y={y - 4}
                textAnchor="middle"
                fontSize={9}
                fill="#6B7280"
                fontWeight="600"
              >
                {getVal(d) > 0 ? `$${getVal(d).toFixed(0)}` : ''}
              </text>
              {/* day label */}
              <text
                x={x + BAR_W / 2}
                y={BAR_H + 16}
                textAnchor="middle"
                fontSize={9}
                fill="#9CA3AF"
                fontWeight="500"
              >
                {day}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// Progress bar row
function ProgressRow({ label, value, max, color = '#007DC5' }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="mb-3">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-600 font-medium">{label}</span>
        <span className="text-gray-800 font-semibold">{formatNum(value)}</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const router = useRouter();

  const [stats,   setStats]   = useState(null);
  const [daily,   setDaily]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const [statsRes, dailyRes] = await Promise.all([
          getAdminStats(),
          getFinanceDaily(),
        ]);
        setStats(statsRes.data);
        // API returns { daily: [...] }
        const raw = dailyRes.data;
        setDaily(Array.isArray(raw) ? raw : raw?.daily ?? raw?.data ?? []);
      } catch (err) {
        setError('Impossible de charger les données.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-[#007DC5] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Chargement du tableau de bord…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <div className="text-center">
          <AlertCircle size={40} className="text-red-400 mx-auto mb-3" />
          <p className="text-red-500 font-medium">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-[#007DC5] text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  // ── Derive values from API shape ─────────────────────────────────────────
  // API returns arrays grouped by role/status; aggregate here
  const usersArr      = stats?.users      ?? [];
  const tripsArr      = stats?.trips      ?? [];
  const deliveriesArr = stats?.deliveries ?? [];
  const revenueArr    = stats?.revenue    ?? [];

  // total users (all roles, active)
  const totalUsers      = usersArr.reduce((s, r) => s + Number(r.cnt ?? 0), 0);
  // total trips (all statuses)
  const totalTrips      = tripsArr.reduce((s, r) => s + Number(r.cnt ?? 0), 0);
  // total deliveries
  const totalDeliveries = deliveriesArr.reduce((s, r) => s + Number(r.cnt ?? 0), 0);
  // total commission (sum of both services)
  const totalCommission = revenueArr.reduce((s, r) => s + Number(r.commission ?? 0), 0);
  // active today
  const activeToday     = Number(stats?.active_today ?? 0);
  // no real-time online count from stats endpoint — show 0 (Carte Live has it)
  const onlineDrivers   = 0;
  // recent activity — not returned by stats endpoint, show empty
  const activity        = [];

  // Users by role breakdown
  const passengers = usersArr.filter(r => r.role === 'client').reduce((s, r) => s + Number(r.cnt), 0);
  const chauffeurs = usersArr.filter(r => r.role === 'driver').reduce((s, r) => s + Number(r.cnt), 0);
  const livreurs   = usersArr.filter(r => r.role === 'delivery').reduce((s, r) => s + Number(r.cnt), 0);

  // Trips by status — build a lookup map
  const tripStatusMap = Object.fromEntries(tripsArr.map(r => [r.status, Number(r.cnt)]));

  // Finance daily data — API returns { daily: [...] }
  const dailyData = Array.isArray(daily) ? daily : daily?.daily ?? [];
  const last7 = dailyData.slice(-7);

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">

      {/* ── Row 1: main KPIs ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          label="Total Utilisateurs"
          value={formatNum(totalUsers)}
          sub={`${formatNum(passengers)} passagers · ${formatNum(chauffeurs)} chauffeurs`}
          color="#007DC5"
          bg="#EBF5FB"
        />
        <StatCard
          icon={Map}
          label="Courses Totales"
          value={formatNum(totalTrips)}
          sub={`${formatNum(tripStatusMap['completed'] ?? 0)} terminées`}
          color="#059669"
          bg="#ECFDF5"
        />
        <StatCard
          icon={Package}
          label="Livraisons Totales"
          value={formatNum(totalDeliveries)}
          sub={`${formatNum(deliveriesArr.filter(r => r.status === 'delivered').reduce((s,r) => s+Number(r.cnt),0))} terminées`}
          color="#7C3AED"
          bg="#F5F3FF"
        />
        <StatCard
          icon={DollarSign}
          label="Revenus Total"
          value={formatFC(totalCommission)}
          sub={`$${(totalCommission).toFixed(2)} USD`}
          color="#F59E0B"
          bg="#FFF8E1"
        />
      </div>

      {/* ── Row 2: live activity ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
          <div className="rounded-xl p-3 bg-blue-50 shrink-0">
            <Users size={22} className="text-blue-500" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Utilisateurs actifs aujourd'hui</p>
            <p className="text-3xl font-bold text-gray-900 mt-0.5">{formatNum(activeToday)}</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
          <div className="rounded-xl p-3 shrink-0" style={{ background: '#ECFDF5' }}>
            <Car size={22} style={{ color: '#059669' }} />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Chauffeurs en ligne maintenant</p>
            <p className="text-3xl font-bold text-gray-900 mt-0.5">{formatNum(onlineDrivers)}</p>
            <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium mt-1">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              Temps réel
            </span>
          </div>
        </div>
      </div>

      {/* ── Row 3: chart + activity feed ─────────────────────────────────────── */}
      <div className="grid grid-cols-[1fr_380px] gap-4">

        {/* Revenue chart */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <SectionTitle>Revenus — 7 derniers jours</SectionTitle>
              <p className="text-xs text-gray-400 -mt-2">Commissions en USD</p>
            </div>
            <TrendingUp size={18} className="text-[#007DC5]" />
          </div>
          <RevenueBarChart data={last7} />
          {last7.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-50 flex gap-6 text-sm">
              <div>
                <span className="text-gray-400">Total 7j :</span>{' '}
                <span className="font-semibold text-gray-800">
                  {formatFC(last7.reduce((s, d) => s + Number(d.total_commission ?? d.commission ?? 0), 0))}
                </span>
              </div>
              <div>
                <span className="text-gray-400">Courses :</span>{' '}
                <span className="font-semibold text-gray-800">
                  {formatNum(last7.reduce((s, d) => s + Number(d.trips_count ?? d.trips ?? 0), 0))}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Activity feed */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col">
          <SectionTitle>Activité récente</SectionTitle>
          {activity.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
              Aucune activité récente
            </div>
          ) : (
            <ul className="space-y-3 flex-1 overflow-y-auto">
              {activity.slice(0, 5).map((item, i) => (
                <li key={i} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                    {item.type === 'delivery'
                      ? <Package size={14} className="text-purple-500" />
                      : <Map size={14} className="text-blue-500" />
                    }
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {item.type === 'delivery' ? 'Livraison' : 'Course'} #{String(item._id ?? item.id ?? '').slice(-6)}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {item.createdAt
                        ? new Date(item.createdAt).toLocaleString('fr-FR', {
                            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                          })
                        : '—'}
                    </p>
                  </div>
                  <StatusBadge status={item.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── Row 4: quick actions + breakdowns ────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">

        {/* Quick actions */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionTitle>Actions rapides</SectionTitle>
          <div className="space-y-2">
            {[
              { label: 'Voir la carte live',  href: '/admin/carte',   icon: Map,            color: '#007DC5' },
              { label: 'Support client',       href: '/admin/support', icon: MessageSquare,  color: '#7C3AED' },
              { label: 'Gérer les tarifs',     href: '/admin/tarifs',  icon: Settings,       color: '#059669' },
            ].map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.href}
                  href={action.href}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 transition-colors group"
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: action.color + '18' }}
                  >
                    <Icon size={16} style={{ color: action.color }} />
                  </div>
                  <span className="flex-1 text-sm font-medium text-gray-700">{action.label}</span>
                  <ArrowRight size={14} className="text-gray-300 group-hover:text-gray-500 transition-colors" />
                </Link>
              );
            })}
          </div>
        </div>

        {/* Users by role */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionTitle>Utilisateurs par rôle</SectionTitle>
          <ProgressRow label="Passagers"  value={passengers} max={totalUsers} color="#007DC5" />
          <ProgressRow label="Chauffeurs" value={chauffeurs} max={totalUsers} color="#059669" />
          <ProgressRow label="Livreurs"   value={livreurs}   max={totalUsers} color="#7C3AED" />
          <div className="mt-4 pt-3 border-t border-gray-50 text-xs text-gray-400">
            Total : <span className="font-semibold text-gray-700">{formatNum(totalUsers)}</span> utilisateurs
          </div>
        </div>

        {/* Trips by status */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionTitle>Courses par statut</SectionTitle>
          {Object.entries(STATUS_META).map(([key, meta]) => {
            const count = tripStatusMap[key] ?? 0;
            return (
              <ProgressRow
                key={key}
                label={meta.label}
                value={count}
                max={totalTrips}
                color={meta.color}
              />
            );
          })}
          <div className="mt-4 pt-3 border-t border-gray-50 text-xs text-gray-400">
            Total : <span className="font-semibold text-gray-700">{formatNum(totalTrips)}</span> courses
          </div>
        </div>
      </div>

    </div>
  );
}
