'use client';
import { Clock } from 'lucide-react';
import { money, VEHICLE_LABELS } from '@/lib/format';
import { Avatar, Button, Rating, Verified } from '@/components/ui';

export default function BidCard({ bid, riderOffer, onAccept, busy }) {
  const p = bid.provider || {};
  const diff = bid.amount - riderOffer;
  return (
    <div className="animate-rise surface flex items-center gap-3 p-3.5">
      <Avatar name={p.name} src={p.avatar_url} size={48} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold">
          {p.name} {p.is_verified ? <Verified /> : null}
        </p>
        <p className="truncate text-xs text-ink-muted">
          {[p.vehicle_color, p.vehicle_make || VEHICLE_LABELS[p.vehicle_class]].filter(Boolean).join(' ')}
          {p.plate_number ? ` · ${p.plate_number}` : ''}
        </p>
        <div className="mt-1 flex items-center gap-2">
          <Rating value={p.rating} />
          {bid.etaMin != null && (
            <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-ink-muted"><Clock size={12} /> {bid.etaMin} min away</span>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <span className="text-lg font-extrabold">{money(bid.amount)}</span>
        {Math.abs(diff) >= 0.01 && (
          <span className={`text-[10px] font-bold ${diff > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
            {diff > 0 ? '+' : '−'}{money(Math.abs(diff))}
          </span>
        )}
        <Button className="px-4 py-2 text-sm" loading={busy === bid.bidId} disabled={Boolean(busy)} onClick={() => onAccept(bid)}>
          Accept
        </Button>
      </div>
    </div>
  );
}
