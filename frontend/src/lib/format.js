/**
 * Money and display helpers. The API stores every amount in its base currency;
 * the web app converts for display with NEXT_PUBLIC_CURRENCY_RATE.
 */
export const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY || 'USD';
export const RATE = parseFloat(process.env.NEXT_PUBLIC_CURRENCY_RATE || '1') || 1;
export const PRICE_STEP = parseFloat(process.env.NEXT_PUBLIC_PRICE_STEP || '0.25') || 0.25;

const decimals = RATE >= 100 ? 0 : 2;
const moneyFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: CURRENCY,
  minimumFractionDigits: decimals,
  maximumFractionDigits: decimals,
});

/** Base amount → display amount (number). */
export const toDisplay = (base) => (Number(base) || 0) * RATE;
/** Display amount → base amount (number, rounded to cents). */
export const toBase = (display) => Math.round(((Number(display) || 0) / RATE) * 100) / 100;
/** Snap a display amount to the price step. */
export const snap = (display) => Math.round(display / PRICE_STEP) * PRICE_STEP;

export const money = (base) => moneyFmt.format(toDisplay(base));
export const signedMoney = (base) => `${base > 0 ? '+' : base < 0 ? '−' : ''}${moneyFmt.format(Math.abs(toDisplay(base)))}`;

export const km = (n) => (n == null ? '—' : n < 1 ? `${Math.round(n * 1000)} m` : `${Number(n).toFixed(1)} km`);
export const minutes = (n) => (n == null ? '—' : n < 60 ? `${n} min` : `${Math.floor(n / 60)} h ${n % 60} min`);

export const dateTime = (v) =>
  v ? new Date(v).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
export const dateOnly = (v) =>
  v ? new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export const timeAgo = (v) => {
  if (!v) return '';
  const s = Math.round((Date.now() - new Date(v).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return dateOnly(v);
};

export const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

export const initials = (name = '') =>
  name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';

// ─── Labels ───────────────────────────────────────────────────────────────────

export const VEHICLE_LABELS = {
  moto: 'Moto',
  economy: 'Economy',
  comfort: 'Comfort',
  xl: 'XL',
  standard: 'Standard',
  bicycle: 'Bicycle',
  car: 'Car',
  on_foot: 'On foot',
};

export const PAYMENT_LABELS = {
  cash: 'Cash',
  mpesa: 'M-Pesa',
  airtel_money: 'Airtel Money',
  orange_money: 'Orange Money',
  mtn_momo: 'MTN MoMo',
};

export const STATUS_LABELS = {
  scheduled: 'Scheduled',
  searching: 'Finding provider',
  assigned: 'On the way',
  arrived: 'Arrived',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const STATUS_TONE = {
  scheduled: 'violet',
  searching: 'amber',
  assigned: 'blue',
  arrived: 'blue',
  in_progress: 'blue',
  completed: 'green',
  cancelled: 'red',
};

export const ROLE_LABELS = { rider: 'Rider', driver: 'Driver', courier: 'Courier' };
