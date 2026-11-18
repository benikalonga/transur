'use client';
import clsx from 'clsx';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Star, X, BadgeCheck } from 'lucide-react';
import { assetUrl } from '@/lib/api';
import { initials, STATUS_LABELS, STATUS_TONE } from '@/lib/format';

export const Spinner = ({ className = '', size = 18 }) => (
  <Loader2 size={size} className={clsx('animate-spin', className)} />
);

export function Button({ variant = 'brand', loading, children, className, ...props }) {
  return (
    <button className={clsx(`btn-${variant}`, className)} disabled={loading || props.disabled} {...props}>
      {loading ? <Spinner /> : children}
    </button>
  );
}

const TONES = {
  green: 'bg-emerald-50 text-emerald-700',
  red: 'bg-red-50 text-red-600',
  amber: 'bg-amber-50 text-amber-700',
  blue: 'bg-sky-50 text-sky-700',
  violet: 'bg-brand-50 text-brand-600',
  gray: 'bg-canvas text-ink-muted',
};

export const Pill = ({ tone = 'gray', children, className }) => (
  <span className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold', TONES[tone], className)}>
    {children}
  </span>
);

export const StatusPill = ({ status }) => <Pill tone={STATUS_TONE[status] || 'gray'}>{STATUS_LABELS[status] || status}</Pill>;

export function Avatar({ name, src, size = 44, className }) {
  const url = assetUrl(src);
  return (
    <div
      className={clsx('flex flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-brand-100 font-bold text-brand-700', className)}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {url ? <img src={url} alt={name || ''} className="h-full w-full object-cover" /> : initials(name)}
    </div>
  );
}

export const Verified = () => <BadgeCheck size={15} className="inline text-brand-500" aria-label="Verified" />;

export function Stars({ value = 0, onChange, size = 28 }) {
  return (
    <div className="flex items-center gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(n)}
          className="tap disabled:active:scale-100"
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
        >
          <Star size={size} className={n <= value ? 'fill-volt text-volt' : 'text-line'} />
        </button>
      ))}
    </div>
  );
}

export const Rating = ({ value }) => (
  <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-ink-muted">
    <Star size={12} className="fill-volt text-volt" /> {Number(value || 5).toFixed(1)}
  </span>
);

export function TopBar({ title, back = true, right, subtitle }) {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-white/90 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur">
      {back && (
        <button onClick={() => router.back()} className="tap -ml-1 flex h-10 w-10 items-center justify-center rounded-full hover:bg-canvas" aria-label="Back">
          <ArrowLeft size={20} />
        </button>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-bold">{title}</h1>
        {subtitle && <p className="truncate text-xs text-ink-muted">{subtitle}</p>}
      </div>
      {right}
    </header>
  );
}

export function Empty({ icon: Icon, title, text, action }) {
  return (
    <div className="flex flex-col items-center px-8 py-16 text-center">
      {Icon && (
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-brand-50 text-brand-500">
          <Icon size={28} />
        </div>
      )}
      <p className="font-bold">{title}</p>
      {text && <p className="mt-1 text-sm text-ink-muted">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-ink/50 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        className={clsx('animate-rise max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 sm:rounded-3xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-md')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="tap flex h-9 w-9 items-center justify-center rounded-full bg-canvas" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Row({ href, icon: Icon, label, hint, right, onClick, danger }) {
  const body = (
    <>
      {Icon && (
        <span className={clsx('flex h-10 w-10 items-center justify-center rounded-xl', danger ? 'bg-red-50 text-red-500' : 'bg-canvas text-ink-soft')}>
          <Icon size={18} />
        </span>
      )}
      <span className="min-w-0 flex-1 text-left">
        <span className={clsx('block text-[15px] font-semibold', danger && 'text-red-500')}>{label}</span>
        {hint && <span className="block truncate text-xs text-ink-muted">{hint}</span>}
      </span>
      {right}
    </>
  );
  const cls = 'tap flex w-full items-center gap-3 px-4 py-3.5 hover:bg-canvas';
  if (href) return <Link href={href} className={cls}>{body}</Link>;
  return <button type="button" onClick={onClick} className={cls}>{body}</button>;
}

export const Section = ({ title, children, className }) => (
  <section className={clsx('px-4', className)}>
    {title && <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-ink-muted">{title}</h2>}
    {children}
  </section>
);

export function Segmented({ value, onChange, options }) {
  return (
    <div className="flex rounded-xl bg-canvas p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={clsx('flex-1 rounded-lg py-2 text-sm font-semibold transition', value === o.value ? 'bg-white text-ink shadow-sm' : 'text-ink-muted')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
