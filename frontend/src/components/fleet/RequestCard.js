'use client';
import { useEffect, useState } from 'react';
import { Banknote, Navigation, Package, Smartphone, X } from 'lucide-react';
import { km, minutes, money, PAYMENT_LABELS } from '@/lib/format';
import { Button, Pill } from '@/components/ui';
import OfferStepper from '@/components/booking/OfferStepper';

/** An incoming request with quick-accept and counter-offer. */
export default function RequestCard({ request, myBid, onBid, onWithdraw, onDismiss }) {
  const [counter, setCounter] = useState(false);
  const [amount, setAmount] = useState(request.riderOffer);
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(request.expiresInSec || 180);

  useEffect(() => {
    const started = Date.now();
    const total = request.expiresInSec || 180;
    const t = setInterval(() => setLeft(Math.max(0, total - Math.floor((Date.now() - started) / 1000))), 1000);
    return () => clearInterval(t);
  }, [request.bookingId, request.expiresInSec]);

  const submit = async (value) => {
    setBusy(true);
    try {
      await onBid(request, value);
      setCounter(false);
    } finally {
      setBusy(false);
    }
  };

  const PayIcon = request.paymentMethod === 'cash' ? Banknote : Smartphone;

  return (
    <div className="animate-rise surface overflow-hidden">
      <div className="h-1 bg-canvas"><div className="h-full bg-brand-500 transition-all" style={{ width: `${(left / (request.expiresInSec || 180)) * 100}%` }} /></div>
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-2xl font-extrabold">{money(request.riderOffer)}</p>
            <p className="text-xs font-semibold text-ink-muted">Suggested {money(request.quotedFare)}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Pill tone={request.paymentMethod === 'cash' ? 'green' : 'violet'}><PayIcon size={11} /> {PAYMENT_LABELS[request.paymentMethod]}</Pill>
            {request.distanceToPickupKm != null && <span className="flex items-center gap-1 text-xs font-semibold text-ink-muted"><Navigation size={12} /> {km(request.distanceToPickupKm)} away</span>}
          </div>
          <button onClick={() => onDismiss(request)} className="-mr-1 -mt-1 p-1 text-ink-faint" aria-label="Dismiss"><X size={18} /></button>
        </div>

        <div className="space-y-2 text-sm">
          <p className="flex gap-2"><span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-brand-500" /><span className="line-clamp-1 font-semibold">{request.pickup.address}</span></p>
          <p className="flex gap-2"><span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-[2px] bg-ink" /><span className="line-clamp-1 font-semibold">{request.dropoff.address}</span></p>
          <p className="text-xs text-ink-muted">Trip {km(request.distanceKm)} · ~{minutes(request.durationMin)}</p>
        </div>

        {request.service === 'parcel' && (
          <p className="flex items-center gap-2 rounded-xl bg-volt/15 px-3 py-2 text-xs font-semibold text-amber-800">
            <Package size={14} /> {request.parcelSize} parcel{request.parcelDetails ? ` · ${request.parcelDetails}` : ''}
          </p>
        )}
        {request.note && <p className="rounded-xl bg-canvas px-3 py-2 text-xs">“{request.note}”</p>}

        {myBid ? (
          <div className="flex items-center gap-3 rounded-xl bg-brand-50 p-3">
            <div className="flex-1">
              <p className="text-sm font-bold text-brand-700">Offer sent: {money(myBid)}</p>
              <p className="text-xs text-brand-700/70">Waiting for the rider to choose…</p>
            </div>
            <button onClick={() => onWithdraw(request)} className="text-xs font-bold text-ink-muted">Withdraw</button>
          </div>
        ) : counter ? (
          <div className="space-y-2">
            <OfferStepper value={amount} quoted={request.quotedFare} floor={request.floorFare} onChange={setAmount} label="Your price" ceilingFactor={2} audience="provider" />
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setCounter(false)}>Back</Button>
              <Button className="flex-[2]" loading={busy} onClick={() => submit(amount)}>Send {money(amount)}</Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setCounter(true)}>Counter</Button>
            <Button className="flex-[2]" loading={busy} onClick={() => submit(request.riderOffer)}>Accept {money(request.riderOffer)}</Button>
          </div>
        )}
      </div>
    </div>
  );
}
