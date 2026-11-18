'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { CalendarClock, MessageSquare, Receipt, RotateCcw } from 'lucide-react';
import { api } from '@/lib/api';
import { dateTime, km, money, PAYMENT_LABELS, VEHICLE_LABELS } from '@/lib/format';
import { MapView } from '@/components/map';
import { Avatar, Button, Rating, Spinner, Stars, StatusPill, TopBar } from '@/components/ui';

const Line = ({ label, value, strong, tone }) => (
  <div className={`flex justify-between py-1.5 text-sm ${strong ? 'font-extrabold' : ''}`}>
    <span className={strong ? '' : 'text-ink-muted'}>{label}</span>
    <span className={tone}>{value}</span>
  </div>
);

export default function BookingDetailScreen({ id, perspective = 'rider' }) {
  const router = useRouter();
  const [b, setB] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [stars, setStars] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const { booking } = await api.bookings.get(id);
      setB(booking);
      if (booking.status === 'completed') api.bookings.receipt(id).then((r) => setReceipt(r.receipt)).catch(() => {});
    } catch (e) {
      toast.error(e.message);
      router.back();
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [id]);

  if (!b) return <div className="flex h-[60vh] items-center justify-center"><Spinner className="text-brand-500" /></div>;

  const isRider = perspective === 'rider';
  const counterpartName = isRider ? b.provider_name : b.rider_name;
  const alreadyRated = isRider ? b.rider_rating : b.provider_rating;

  const rate = async () => {
    setBusy(true);
    try {
      await api.bookings.rate(b.id, stars, feedback);
      toast.success('Thanks for rating!');
      load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!window.confirm('Cancel this booking?')) return;
    try {
      await api.bookings.cancel(b.id, 'Cancelled from trip details');
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const rebook = () => {
    const to = `${b.dropoff_lat},${b.dropoff_lng},${encodeURIComponent(b.dropoff_address)}`;
    router.push(`/rider/${b.service === 'parcel' ? 'send' : 'ride'}?to=${to}`);
  };

  return (
    <main className="pb-6">
      <TopBar title={b.service === 'parcel' ? 'Delivery details' : 'Ride details'} subtitle={`#${b.id.slice(0, 8)} · ${dateTime(b.created_at)}`} right={<StatusPill status={b.status} />} />

      <div className="h-48">
        <MapView
          interactive={false}
          markers={[{ id: 'p', kind: 'pickup', lat: b.pickup_lat, lng: b.pickup_lng }, { id: 'd', kind: 'dropoff', lat: b.dropoff_lat, lng: b.dropoff_lng }]}
          fitTo={[{ lat: b.pickup_lat, lng: b.pickup_lng }, { lat: b.dropoff_lat, lng: b.dropoff_lng }]}
          padTop={20}
          padBottom={-10}
        />
      </div>

      <div className="space-y-4 px-4 pt-4">
        <div className="surface space-y-3 p-4">
          <div className="flex gap-3">
            <span className="mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-brand-500" />
            <div><p className="text-xs text-ink-muted">From</p><p className="text-sm font-semibold">{b.pickup_address}</p></div>
          </div>
          <div className="flex gap-3">
            <span className="mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-[3px] bg-ink" />
            <div><p className="text-xs text-ink-muted">To</p><p className="text-sm font-semibold">{b.dropoff_address}</p></div>
          </div>
          {b.status === 'scheduled' && (
            <p className="flex items-center gap-2 rounded-xl bg-brand-50 p-3 text-sm font-semibold text-brand-700">
              <CalendarClock size={16} /> Pickup scheduled for {dateTime(b.scheduled_for)}
            </p>
          )}
          {b.service === 'parcel' && (
            <div className="rounded-xl bg-canvas p-3 text-sm">
              <p><span className="text-ink-muted">Parcel:</span> {b.parcel_details || '—'} ({b.parcel_size})</p>
              <p><span className="text-ink-muted">Recipient:</span> {b.recipient_name} · {b.recipient_phone}</p>
              {isRider && b.handover_pin && b.status !== 'completed' && <p className="mt-1 font-bold">Handover PIN: <span className="tracking-[.25em]">{b.handover_pin}</span></p>}
            </div>
          )}
          {b.cancel_reason && b.status === 'cancelled' && <p className="text-sm text-red-500">Cancelled: {b.cancel_reason}</p>}
        </div>

        {counterpartName && (
          <div className="surface flex items-center gap-3 p-4">
            <Avatar name={counterpartName} src={isRider ? b.provider_avatar : b.rider_avatar} />
            <div className="flex-1">
              <p className="font-bold">{counterpartName}</p>
              {isRider && (
                <p className="text-xs text-ink-muted">
                  {[b.vehicle_color, b.vehicle_make || VEHICLE_LABELS[b.provider_vehicle_class], b.plate_number].filter(Boolean).join(' · ')}
                </p>
              )}
              {isRider && <Rating value={b.provider_rating_avg} />}
            </div>
          </div>
        )}

        {receipt && (
          <div className="surface p-4">
            <p className="mb-2 flex items-center gap-2 font-bold"><Receipt size={16} /> Receipt</p>
            <Line label={`Fare · ${km(receipt.distance_km)} · ${receipt.duration_min} min`} value={money(receipt.fare)} />
            {receipt.discount > 0 && <Line label={`Promo ${receipt.promo_code || ''}`} value={`−${money(receipt.discount)}`} tone="text-emerald-600" />}
            {receipt.tip > 0 && <Line label="Tip" value={money(receipt.tip)} />}
            {!isRider && <Line label="Service fee" value={`−${money(b.platform_fee)}`} />}
            <div className="my-2 border-t border-dashed border-line" />
            {isRider
              ? <Line strong label={`Total · ${PAYMENT_LABELS[receipt.payment_method]}`} value={money(receipt.total)} />
              : <Line strong label="You earned" value={money((b.provider_payout || 0) + (b.tip_amount || 0))} />}
          </div>
        )}

        {b.status === 'completed' && !alreadyRated && (
          <div className="surface space-y-3 p-4 text-center">
            <p className="font-bold">Rate {counterpartName?.split(' ')[0]}</p>
            <div className="flex justify-center"><Stars value={stars} onChange={setStars} /></div>
            {isRider && stars > 0 && (
              <textarea className="field min-h-[80px] text-sm" placeholder="Anything to add? (optional)" value={feedback} onChange={(e) => setFeedback(e.target.value)} maxLength={500} />
            )}
            <Button className="w-full" disabled={!stars} loading={busy} onClick={rate}>Submit rating</Button>
          </div>
        )}
        {b.rider_feedback && isRider && (
          <p className="flex items-start gap-2 text-sm text-ink-muted"><MessageSquare size={14} className="mt-0.5" /> “{b.rider_feedback}”</p>
        )}

        {isRider && ['scheduled', 'searching', 'assigned', 'arrived'].includes(b.status) && (
          <Button variant="ghost" className="w-full text-red-500" onClick={cancel}>Cancel booking</Button>
        )}
        {isRider && ['completed', 'cancelled'].includes(b.status) && (
          <Button variant="ink" className="w-full" onClick={rebook}><RotateCcw size={16} /> Book again</Button>
        )}
      </div>
    </main>
  );
}
