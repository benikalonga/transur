'use client';

import { useState, useEffect } from 'react';
import { getAdminStats, getFinanceSummary, getFinanceDaily, getTopDrivers } from '@/lib/adminApi';

const formatFC = (usd) => Math.round((parseFloat(usd) || 0) * 2800).toLocaleString('fr-FR') + ' FC';

// ── SVG Bar Chart ──────────────────────────────────────────────────────────────

const BarChart = ({ taxiData, livData, height = 200 }) => {
  const [tooltip, setTooltip] = useState(null);

  const n = taxiData.length;
  if (n === 0) return <div className="h-[200px] flex items-center justify-center text-slate-400 text-sm">Aucune donnée</div>;

  const barW = 14;
  const gap = 4;
  const groupW = barW * 2 + gap + 6;
  const svgW = n * groupW;
  const maxVal = Math.max(...taxiData.map(d => d.value), ...livData.map(d => d.value), 1);
  const paddingTop = 10;

  const barHeight = (val) => ((val / maxVal) * (height - paddingTop - 20));

  return (
    <div className="relative overflow-x-auto" style={{ height: height + 24 }}>
      <svg
        viewBox={`0 0 ${svgW} ${height}`}
        className="w-full"
        style={{ height: height, maxHeight: height }}
        onMouseLeave={() => setTooltip(null)}
      >
        {taxiData.map((d, i) => {
          const x = i * groupW;
          const taxiH = barHeight(d.value);
          const livH = barHeight(livData[i]?.value ?? 0);
          return (
            <g key={i}>
              {/* Taxi bar */}
              <rect
                x={x + 3}
                y={height - 20 - taxiH}
                width={barW}
                height={taxiH}
                fill="#007DC5"
                rx={2}
                onMouseEnter={() => setTooltip({ i, x: x + 3, label: d.label, taxi: d.value, liv: livData[i]?.value ?? 0 })}
              />
              {/* Livraison bar */}
              <rect
                x={x + 3 + barW + gap}
                y={height - 20 - livH}
                width={barW}
                height={livH}
                fill="#f97316"
                rx={2}
                onMouseEnter={() => setTooltip({ i, x: x + 3, label: d.label, taxi: d.value, liv: livData[i]?.value ?? 0 })}
              />
              {/* X label — every 5 days */}
              {i % 5 === 0 && (
                <text x={x + groupW / 2} y={height - 4} textAnchor="middle" fontSize={7} fill="#94a3b8">
                  {d.label?.slice(5) ?? ''}
                </text>
              )}
            </g>
          );
        })}

        {/* Tooltip */}
        {tooltip && (() => {
          const tw = 120;
          const tx = Math.min(tooltip.x, svgW - tw - 4);
          const ty = 4;
          return (
            <g>
              <rect x={tx} y={ty} width={tw} height={50} rx={4} fill="white" stroke="#e2e8f0" strokeWidth={1} />
              <text x={tx + 6} y={ty + 13} fontSize={8} fontWeight="600" fill="#1e293b">{tooltip.label}</text>
              <circle cx={tx + 10} cy={ty + 24} r={3} fill="#007DC5" />
              <text x={tx + 16} y={ty + 27} fontSize={7} fill="#475569">Taxi: {formatFC(tooltip.taxi)}</text>
              <circle cx={tx + 10} cy={ty + 37} r={3} fill="#f97316" />
              <text x={tx + 16} y={ty + 40} fontSize={7} fill="#475569">Livraison: {formatFC(tooltip.liv)}</text>
            </g>
          );
        })()}
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-5 mt-2 text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-[#007DC5]" />
          Taxi
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-orange-500" />
          Livraison
        </div>
      </div>
    </div>
  );
};

// ── KPI Card ───────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
      <p className="text-sm text-slate-500 font-medium">{label}</p>
      <p className={`text-2xl font-bold mt-1 leading-tight ${color ?? 'text-slate-800'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

// ── % change indicator ─────────────────────────────────────────────────────────

function ChangeIndicator({ current, previous }) {
  if (!previous || previous === 0) return <span className="text-xs text-slate-400">—</span>;
  const pct = ((current - previous) / previous) * 100;
  const up = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-sm font-semibold ${up ? 'text-green-600' : 'text-red-500'}`}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

// ── CSV Export ─────────────────────────────────────────────────────────────────

function exportCSV(dailyData) {
  const headers = ['Date', 'Courses Taxi', 'CA Taxi (FC)', 'Courses Livraison', 'CA Livraison (FC)', 'Total CA (FC)'];
  const rows = dailyData.map(d => [
    d.date ?? '',
    d.trips_count ?? d.trip_count ?? 0,
    Math.round((parseFloat(d.trips_revenue ?? d.trip_revenue) || 0) * 2800),
    d.deliveries_count ?? d.delivery_count ?? 0,
    Math.round((parseFloat(d.delivery_revenue) || 0) * 2800),
    Math.round(((parseFloat(d.trips_revenue ?? d.trip_revenue) || 0) + (parseFloat(d.delivery_revenue) || 0)) * 2800),
  ]);
  const csv = [headers, ...rows].map(r => r.join(';')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `transur-finances-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function FinancePage() {
  const [summary, setSummary] = useState(null);
  const [daily, setDaily] = useState([]);
  const [topDrivers, setTopDrivers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      getFinanceSummary(),
      getFinanceDaily(),
      getTopDrivers(),
      getAdminStats(),
    ]).then(([sumRes, dailyRes, driversRes, statsRes]) => {
      setSummary(sumRes.data);
      setDaily(dailyRes.data?.daily ?? dailyRes.data?.days ?? dailyRes.data?.data ?? []);
      setTopDrivers(driversRes.data?.drivers ?? driversRes.data?.data ?? []);
      setStats(statsRes.data);
    }).catch(() => {
      setError('Erreur lors du chargement des données financières.');
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-[#007DC5] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-red-500 text-sm">{error}</p>
      </div>
    );
  }

  // ── Derive numbers ────────────────────────────────────────────────────────

  const totalRevenue   = parseFloat(summary?.total_revenue ?? 0);
  const totalComm      = parseFloat(summary?.total_commission ?? 0);
  const totalEarnings  = parseFloat(summary?.total_driver_earnings ?? summary?.total_earnings ?? 0);
  const completedCount = (summary?.trips?.total_trips ?? 0) + (summary?.delivery?.total_deliveries ?? 0);

  const taxiRevenue   = parseFloat(summary?.trips?.total_fares ?? 0);
  const taxiComm      = parseFloat(summary?.trips?.total_commission ?? 0);
  const taxiCount     = summary?.trips?.total_trips ?? 0;

  const livRevenue    = parseFloat(summary?.delivery?.total_fares ?? 0);
  const livComm       = parseFloat(summary?.delivery?.total_commission ?? 0);
  const livCount      = summary?.delivery?.total_deliveries ?? 0;

  // Monthly comparison (not provided by API, keep as 0)
  const thisMonthRev  = parseFloat(summary?.this_month_revenue ?? 0);
  const lastMonthRev  = parseFloat(summary?.last_month_revenue ?? 0);

  // Build chart data (last 30 days)
  // Daily API returns: { date, trips_revenue, delivery_revenue, trips_count, deliveries_count, ... }
  const last30 = daily.slice(-30);
  const fmtLabel = (d) => d?.date ? new Date(d.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '';
  const taxiChartData = last30.map(d => ({
    label: fmtLabel(d),
    value: parseFloat(d.trips_revenue ?? d.trip_revenue ?? 0),
  }));
  const livChartData = last30.map(d => ({
    label: fmtLabel(d),
    value: parseFloat(d.delivery_revenue ?? 0),
  }));

  const commRate = (rev, comm) => rev > 0 ? ((comm / rev) * 100).toFixed(0) + '%' : '—';

  return (
    <div className="p-6 space-y-6">

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Revenus Totaux"
          value={formatFC(totalRevenue)}
          sub="toutes périodes"
          color="text-[#007DC5]"
        />
        <KpiCard
          label="Commissions Totales"
          value={formatFC(totalComm)}
          sub="15% du CA"
          color="text-orange-600"
        />
        <KpiCard
          label="Gains Chauffeurs/Livreurs"
          value={formatFC(totalEarnings)}
          sub="nets après commission"
          color="text-green-600"
        />
        <KpiCard
          label="Courses Complétées"
          value={Number(completedCount).toLocaleString('fr-FR')}
          sub="taxi + livraison"
          color="text-slate-800"
        />
      </div>

      {/* Revenue Chart */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-slate-800">Revenus — 30 derniers jours</h2>
            <p className="text-xs text-slate-400 mt-0.5">Comparaison taxi vs livraison</p>
          </div>
          <button
            onClick={() => exportCSV(daily)}
            className="flex items-center gap-2 bg-[#007DC5] hover:bg-[#006aad] text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Exporter CSV
          </button>
        </div>
        <BarChart taxiData={taxiChartData} livData={livChartData} height={220} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* By Service Table */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800">Résultats par service</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {['Service', 'Courses', 'CA Total', 'Commissions', 'Taux'].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr className="hover:bg-slate-50">
                  <td className="px-5 py-3.5 font-medium text-slate-800 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#007DC5] inline-block" />
                    Taxi
                  </td>
                  <td className="px-5 py-3.5 text-slate-600">{Number(taxiCount).toLocaleString('fr-FR')}</td>
                  <td className="px-5 py-3.5 text-slate-800 font-medium">{formatFC(taxiRevenue)}</td>
                  <td className="px-5 py-3.5 text-orange-600 font-medium">{formatFC(taxiComm)}</td>
                  <td className="px-5 py-3.5 text-slate-500">{commRate(taxiRevenue, taxiComm)}</td>
                </tr>
                <tr className="hover:bg-slate-50">
                  <td className="px-5 py-3.5 font-medium text-slate-800 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" />
                    Livraison
                  </td>
                  <td className="px-5 py-3.5 text-slate-600">{Number(livCount).toLocaleString('fr-FR')}</td>
                  <td className="px-5 py-3.5 text-slate-800 font-medium">{formatFC(livRevenue)}</td>
                  <td className="px-5 py-3.5 text-orange-600 font-medium">{formatFC(livComm)}</td>
                  <td className="px-5 py-3.5 text-slate-500">{commRate(livRevenue, livComm)}</td>
                </tr>
                <tr className="bg-slate-50 font-semibold border-t-2 border-slate-200">
                  <td className="px-5 py-3.5 text-slate-800">TOTAL</td>
                  <td className="px-5 py-3.5 text-slate-800">{(Number(taxiCount) + Number(livCount)).toLocaleString('fr-FR')}</td>
                  <td className="px-5 py-3.5 text-[#007DC5]">{formatFC(totalRevenue)}</td>
                  <td className="px-5 py-3.5 text-orange-600">{formatFC(totalComm)}</td>
                  <td className="px-5 py-3.5 text-slate-500">—</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Monthly Comparison */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-800 mb-4">Comparaison mensuelle</h2>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-slate-400 mb-1">Ce mois</p>
              <p className="text-xl font-bold text-slate-800">{formatFC(thisMonthRev)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Mois dernier</p>
              <p className="text-xl font-bold text-slate-500">{formatFC(lastMonthRev)}</p>
            </div>
            <div className="pt-3 border-t border-slate-100">
              <p className="text-xs text-slate-400 mb-1">Évolution</p>
              <ChangeIndicator current={thisMonthRev} previous={lastMonthRev} />
            </div>
            {/* Simple visual comparison bar */}
            {lastMonthRev > 0 && (
              <div className="space-y-2 pt-2">
                <div>
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span>Ce mois</span>
                    <span>{formatFC(thisMonthRev)}</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#007DC5] rounded-full transition-all"
                      style={{ width: `${Math.min((thisMonthRev / Math.max(thisMonthRev, lastMonthRev)) * 100, 100)}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span>Mois dernier</span>
                    <span>{formatFC(lastMonthRev)}</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-slate-300 rounded-full transition-all"
                      style={{ width: `${Math.min((lastMonthRev / Math.max(thisMonthRev, lastMonthRev)) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Top 5 Chauffeurs */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Top 5 Chauffeurs / Livreurs</h2>
          <p className="text-xs text-slate-400 mt-0.5">Classés par gains totaux</p>
        </div>
        {topDrivers.length === 0 ? (
          <div className="text-center py-10 text-slate-400 text-sm">Aucune donnée disponible.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {['Rang', 'Nom', 'Courses', 'Gains totaux', 'Commission versée'].map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topDrivers.slice(0, 5).map((driver, idx) => (
                  <tr key={driver.id ?? idx} className="hover:bg-slate-50">
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                        idx === 0 ? 'bg-yellow-100 text-yellow-700' :
                        idx === 1 ? 'bg-slate-200 text-slate-600' :
                        idx === 2 ? 'bg-orange-100 text-orange-600' :
                        'bg-slate-100 text-slate-500'
                      }`}>
                        {idx + 1}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-medium text-slate-800">
                      {driver.name || driver.driver_name || '—'}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">
                      {Number(driver.trip_count ?? driver.trips ?? 0).toLocaleString('fr-FR')}
                    </td>
                    <td className="px-5 py-3.5 font-medium text-green-600">
                      {formatFC(driver.total_earnings ?? driver.earnings ?? 0)}
                    </td>
                    <td className="px-5 py-3.5 text-orange-600">
                      {formatFC(driver.commission_paid ?? driver.commission ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
