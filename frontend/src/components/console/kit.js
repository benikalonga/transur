'use client';
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Spinner } from '@/components/ui';

export const PageHead = ({ title, subtitle, actions }) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
      {subtitle && <p className="text-sm text-ink-muted">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </div>
);

export function Stat({ label, value, hint, icon: Icon, tone = 'brand' }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-600',
    green: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-500',
    ink: 'bg-ink text-volt',
  };
  return (
    <div className="surface p-4">
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
        {Icon && <span className={clsx('flex h-8 w-8 items-center justify-center rounded-lg', tones[tone])}><Icon size={16} /></span>}
      </div>
      <p className="mt-2 text-2xl font-extrabold">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

/**
 * columns: [{ key, label, render?(row), className? }]
 */
export function Table({ columns, rows, loading, empty = 'Nothing to show', onRowClick, rowKey = 'id' }) {
  return (
    <div className="surface overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-canvas/60 text-left text-[11px] uppercase tracking-wider text-ink-muted">
              {columns.map((c) => <th key={c.key} className={clsx('whitespace-nowrap px-4 py-3 font-bold', c.className)}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row[rowKey]}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={clsx('border-b border-line/70 last:border-0', onRowClick && 'cursor-pointer hover:bg-canvas/70')}
              >
                {columns.map((c) => (
                  <td key={c.key} className={clsx('px-4 py-3 align-middle', c.className)}>
                    {c.render ? c.render(row) : row[c.key] ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {loading && <div className="flex justify-center py-8"><Spinner className="text-brand-500" /></div>}
      {!loading && rows.length === 0 && <p className="py-10 text-center text-sm text-ink-muted">{empty}</p>}
    </div>
  );
}

export function Pager({ page, total, limit = 25, onChange }) {
  const pages = Math.max(1, Math.ceil((total || 0) / limit));
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-end gap-2 text-sm">
      <span className="text-ink-muted">Page {page} of {pages} · {total} total</span>
      <button disabled={page <= 1} onClick={() => onChange(page - 1)} className="btn-ghost px-2.5 py-2" aria-label="Previous page"><ChevronLeft size={16} /></button>
      <button disabled={page >= pages} onClick={() => onChange(page + 1)} className="btn-ghost px-2.5 py-2" aria-label="Next page"><ChevronRight size={16} /></button>
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Search…' }) {
  return (
    <label className="flex min-w-[220px] items-center gap-2 rounded-xl border border-line bg-white px-3">
      <Search size={16} className="text-ink-faint" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full bg-transparent py-2.5 text-sm outline-none" />
    </label>
  );
}

export function Select({ value, onChange, options, label }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="rounded-xl border border-line bg-white px-3 py-2.5 text-sm font-medium outline-none">
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Tabs({ value, onChange, tabs }) {
  return (
    <div className="mb-4 flex gap-1 border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={clsx('-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold', value === t.value ? 'border-brand-500 text-ink' : 'border-transparent text-ink-muted hover:text-ink')}
        >
          {t.label}
          {t.count != null && <span className="ml-1.5 rounded-full bg-canvas px-1.5 text-xs">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Debounce a value (used by search boxes). */
export function useDebounced(value, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Tiny dependency-free bar chart. series: [{ label, values: [{ key, value, color }] }] */
export function Bars({ data, height = 160, format = (v) => v }) {
  const max = Math.max(1, ...data.map((d) => d.values.reduce((s, x) => s + x.value, 0)));
  return (
    <div className="flex items-end gap-1.5" style={{ height }}>
      {data.map((d) => (
        <div key={d.label} className="group relative flex h-full flex-1 flex-col justify-end">
          <div className="flex flex-col-reverse overflow-hidden rounded-t-md">
            {d.values.map((v) => (
              <div key={v.key} style={{ height: `${(v.value / max) * (height - 22)}px`, background: v.color }} />
            ))}
          </div>
          <span className="mt-1 truncate text-center text-[10px] text-ink-muted">{d.label}</span>
          <span className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] text-white group-hover:block">
            {format(d.values.reduce((s, x) => s + x.value, 0))}
          </span>
        </div>
      ))}
    </div>
  );
}
