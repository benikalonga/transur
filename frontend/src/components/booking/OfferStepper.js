'use client';
import clsx from 'clsx';
import { Minus, Plus } from 'lucide-react';
import { money, PRICE_STEP, snap, toBase, toDisplay } from '@/lib/format';

const COPY = {
  rider: {
    presets: ['Lowest', 'Fair', 'Fast pick-up'],
    below: 'Below suggested — may take longer',
    above: 'Above suggested — faster offers',
  },
  provider: {
    presets: ['Minimum', 'Suggested', 'Premium'],
    below: 'Below suggested — more likely to win',
    above: 'Above suggested — the rider may pick someone else',
  },
};

/**
 * Name-your-price control. Works in display currency internally and reports
 * base-currency amounts through onChange.
 */
export default function OfferStepper({ value, quoted, floor, onChange, label = 'Your offer', ceilingFactor = 1.8, audience = 'rider' }) {
  const copy = COPY[audience];
  const minD = Math.ceil(toDisplay(floor) / PRICE_STEP) * PRICE_STEP;
  const maxD = snap(toDisplay(quoted) * ceilingFactor);
  const valD = snap(toDisplay(value));
  const set = (d) => onChange(toBase(Math.min(maxD, Math.max(minD, snap(d)))));

  const presets = [
    { label: copy.presets[0], base: toBase(minD) },
    { label: copy.presets[1], base: quoted },
    { label: copy.presets[2], base: toBase(snap(toDisplay(quoted) * 1.15)) },
  ];

  return (
    <div className="rounded-2xl bg-canvas p-4">
      <div className="mb-2 flex items-center justify-between text-xs font-semibold text-ink-muted">
        <span className="uppercase tracking-wide">{label}</span>
        <span>Suggested {money(quoted)}</span>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => set(valD - PRICE_STEP)} disabled={valD <= minD} className="tap flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-white disabled:opacity-30" aria-label="Lower offer">
          <Minus size={20} />
        </button>
        <div className="flex-1 text-center">
          <div className="text-[32px] font-extrabold leading-none tracking-tight">{money(value)}</div>
          <div className={clsx('mt-1 text-xs font-semibold', value < quoted ? 'text-amber-600' : value > quoted ? 'text-emerald-600' : 'text-ink-muted')}>
            {value < quoted ? copy.below : value > quoted ? copy.above : 'Recommended price'}
          </div>
        </div>
        <button type="button" onClick={() => set(valD + PRICE_STEP)} disabled={valD >= maxD} className="tap flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-white disabled:opacity-30" aria-label="Raise offer">
          <Plus size={20} />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onChange(p.base)}
            className={clsx('tap rounded-xl border py-2 text-xs font-bold', Math.abs(p.base - value) < 0.005 ? 'border-ink bg-ink text-white' : 'border-line bg-white')}
          >
            {p.label}
            <span className="block font-medium opacity-70">{money(p.base)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
