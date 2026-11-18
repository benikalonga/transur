'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Bike, CalendarClock, Car, CarFront, Check, Package, Phone, Tag, Truck, Users, X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { appSocket } from '@/lib/socket';
import { fetchRoute, locateOnce } from '@/lib/geo';
import { km, minutes, money, PAYMENT_LABELS, VEHICLE_LABELS } from '@/lib/format';
import { MapView, PinPicker, PlaceSearch } from '@/components/map';
import { Avatar, Button, Pill, Rating, Stars } from '@/components/ui';
import { useAccount } from '@/components/shell/AppShell';
import OfferStepper from './OfferStepper';
import BidCard from './BidCard';
import TripChat from '@/components/trip/TripChat';
import SafetyButton from '@/components/trip/SafetyButton';

const CLASS_ICON = { moto: Bike, economy: Car, comfort: CarFront, xl: Truck, standard: Package };
const PAYMENTS = ['cash', 'mpesa', 'airtel_money', 'orange_money', 'mtn_momo'];
const SIZES = [
  { id: 'small', label: 'Small', hint: 'Fits in a bag' },
  { id: 'medium', label: 'Medium', hint: 'Shoebox to backpack' },
  { id: 'large', label: 'Large', hint: 'Needs both arms' },
];
const SHEET_HEIGHT = { where: 330, options: 560, searching: 420, live: 330, done: 420 };
const TIPS = [0.5, 1, 2];

export default function BookingFlow({ service }) {
  const router = useRouter();
  const params = useSearchParams();
  const { profile } = useAccount();
  const isParcel = service === 'parcel';
  const noun = isParcel ? 'delivery' : 'ride';
  const providerNoun = isParcel ? 'courier' : 'driver';

  const [step, setStep] = useState('where');
  const [me, setMe] = useState(null);
  const [pickup, setPickup] = useState(null);
  const [dropoff, setDropoff] = useState(null);
  const [picker, setPicker] = useState(null);
  const [places, setPlaces] = useState([]);
  const [route, setRoute] = useState(null);

  const [quote, setQuote] = useState(null);
  const [vehicleClass, setVehicleClass] = useState(isParcel ? 'standard' : 'economy');
  const [offer, setOffer] = useState(0);
  const [payment, setPayment] = useState('cash');
  const [promo, setPromo] = useState('');
  const [promoState, setPromoState] = useState(null);
  const [schedule, setSchedule] = useState('');
  const [note, setNote] = useState('');
  const [parcel, setParcel] = useState({ parcel_size: 'small', parcel_details: '', recipient_name: '', recipient_phone: '' });

  const [booking, setBooking] = useState(null);
  const [bids, setBids] = useState([]);
  const [accepting, setAccepting] = useState(null);
  const [providerPos, setProviderPos] = useState(null);
  const [result, setResult] = useState(null);
  const [rating, setRating] = useState(0);
  const [busy, setBusy] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(null);
  const bookingRef = useRef(null);
  bookingRef.current = booking;

  // ── Restore an active booking after reload, load saved places & location ──
  useEffect(() => {
    api.me.places().then((r) => setPlaces(r.places)).catch(() => {});
    api.bookings.current().then(({ booking: b }) => {
      if (!b || b.service !== service) return;
      adopt(b);
    }).catch(() => {});
    locateOnce().then((p) => {
      setMe(p);
      setPickup((cur) => cur || { address: 'Current location', lat: p.lat, lng: p.lng });
    }).catch(() => {});
    const to = params.get('to');
    if (to) {
      const [lat, lng, ...rest] = to.split(',');
      setDropoff({ lat: parseFloat(lat), lng: parseFloat(lng), address: decodeURIComponent(rest.join(',')) || 'Saved place' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service]);

  const adopt = (b) => {
    setBooking(b);
    setPickup({ address: b.pickup_address, lat: b.pickup_lat, lng: b.pickup_lng });
    setDropoff({ address: b.dropoff_address, lat: b.dropoff_lat, lng: b.dropoff_lng });
    setOffer(b.rider_offer);
    if (b.provider_lat) setProviderPos({ lat: b.provider_lat, lng: b.provider_lng });
    if (b.status === 'searching') {
      setStep('searching');
      api.bookings.bids(b.id).then((r) => setBids(r.bids)).catch(() => {});
    } else {
      setStep('live');
    }
  };

  // ── Route preview ──
  useEffect(() => {
    if (pickup && dropoff) fetchRoute(pickup, dropoff).then((r) => setRoute(r));
    else setRoute(null);
  }, [pickup, dropoff]);

  // ── Live events ──
  const reloadBooking = useCallback(async (id) => {
    const { booking: b } = await api.bookings.get(id);
    setBooking(b);
    if (b.provider_lat) setProviderPos({ lat: b.provider_lat, lng: b.provider_lng });
    return b;
  }, []);

  useEffect(() => {
    const socket = appSocket();
    if (!socket) return undefined;
    const mine = (id) => bookingRef.current?.id === id;

    const handlers = {
      'booking:bid': (bid) => {
        if (!mine(bid.bookingId)) return;
        setBids((list) => [bid, ...list.filter((b) => b.provider?.id !== bid.provider?.id)].sort((a, b) => a.amount - b.amount));
        if (navigator.vibrate) navigator.vibrate(80);
      },
      'booking:bid_withdrawn': ({ bookingId, providerId }) => mine(bookingId) && setBids((l) => l.filter((b) => b.provider?.id !== providerId)),
      'booking:assigned': async ({ bookingId }) => {
        if (!mine(bookingId)) return;
        await reloadBooking(bookingId);
        setBids([]);
        setStep('live');
        toast.success(`Your ${providerNoun} is on the way`);
      },
      'booking:arrived': ({ bookingId }) => {
        if (!mine(bookingId)) return;
        reloadBooking(bookingId);
        toast(`Your ${providerNoun} has arrived`, { icon: '📍' });
        if (navigator.vibrate) navigator.vibrate([100, 60, 100]);
      },
      'booking:started': ({ bookingId }) => mine(bookingId) && reloadBooking(bookingId),
      'booking:completed': (payload) => {
        if (!mine(payload.bookingId)) return;
        setResult(payload);
        setStep('done');
      },
      'booking:cancelled': ({ bookingId, reason, by }) => {
        if (!mine(bookingId)) return;
        toast.error(by === 'system' ? `No ${providerNoun} accepted in time. Try raising your offer.` : reason || `Your ${noun} was cancelled`);
        reset();
      },
      'booking:released': ({ bookingId }) => mine(bookingId) && setStep('searching'),
      'provider:position': ({ bookingId, lat, lng, heading }) => mine(bookingId) && setProviderPos({ lat, lng, heading }),
    };
    Object.entries(handlers).forEach(([e, h]) => socket.on(e, h));
    // When the socket reconnects, catch up on anything we missed.
    const onReconnect = () => bookingRef.current && reloadBooking(bookingRef.current.id).then((b) => {
      if (b.status === 'completed') setStep('done');
      else if (b.status === 'cancelled') reset();
      else if (b.status !== 'searching') setStep('live');
    }).catch(() => {});
    socket.io.on('reconnect', onReconnect);
    return () => {
      Object.entries(handlers).forEach(([e, h]) => socket.off(e, h));
      socket.io.off('reconnect', onReconnect);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadBooking]);

  // ── Countdown while searching ──
  useEffect(() => {
    if (step !== 'searching' || !booking?.broadcast_at) return setSecondsLeft(null);
    const ttl = 180;
    const tick = () => setSecondsLeft(Math.max(0, ttl - Math.floor((Date.now() - new Date(booking.broadcast_at).getTime()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [step, booking?.broadcast_at]);

  const reset = () => {
    setBooking(null);
    setBids([]);
    setResult(null);
    setProviderPos(null);
    setRating(0);
    setStep('where');
  };

  // ── Actions ──
  const getQuote = async ({ promoCode = promo, size = parcel.parcel_size } = {}) => {
    if (!pickup || !dropoff) return toast.error('Choose where from and where to');
    setBusy(true);
    try {
      const q = await api.bookings.quote({
        service,
        pickup_lat: pickup.lat, pickup_lng: pickup.lng,
        dropoff_lat: dropoff.lat, dropoff_lng: dropoff.lng,
        parcel_size: size,
        promo_code: promoCode || undefined,
      });
      setQuote(q);
      setPromoState(promoCode ? (q.promo ? { ok: true, ...q.promo } : { ok: false, error: q.promoError }) : null);
      const chosen = q.options.find((o) => o.vehicle_class === vehicleClass) || q.options[0];
      if (chosen) {
        setVehicleClass(chosen.vehicle_class);
        setOffer(chosen.quoted_fare);
      }
      setStep('options');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const option = quote?.options.find((o) => o.vehicle_class === vehicleClass);
  const estimatedDiscount = promoState?.ok && option
    ? Math.min(offer, promoState.discount_type === 'percent'
      ? Math.min((offer * promoState.discount_value) / 100, promoState.max_discount || Infinity)
      : promoState.discount_value)
    : 0;

  const request = async () => {
    if (isParcel && (!parcel.recipient_name.trim() || parcel.recipient_phone.replace(/\D/g, '').length < 8)) {
      return toast.error('Add the recipient name and phone number');
    }
    setBusy(true);
    try {
      const { booking: b, providersReached } = await api.bookings.create({
        service,
        vehicle_class: vehicleClass,
        pickup_address: pickup.address, pickup_lat: pickup.lat, pickup_lng: pickup.lng,
        dropoff_address: dropoff.address, dropoff_lat: dropoff.lat, dropoff_lng: dropoff.lng,
        rider_offer: offer,
        payment_method: payment,
        promo_code: promoState?.ok ? promoState.code : undefined,
        scheduled_for: schedule ? new Date(schedule).toISOString() : undefined,
        note: note || undefined,
        ...(isParcel ? parcel : {}),
      });
      if (b.status === 'scheduled') {
        toast.success(`Scheduled! We will start looking ${new Date(b.scheduled_for).toLocaleString()}.`);
        router.push(`/rider/trips/${b.id}`);
        return;
      }
      setBooking(b);
      setBids([]);
      setStep('searching');
      if (!providersReached) toast(`No ${providerNoun}s nearby right now — we will keep your request open.`, { icon: '⏳', duration: 5000 });
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const acceptBid = async (bid) => {
    setAccepting(bid.bidId);
    try {
      await api.bookings.acceptBid(booking.id, bid.bidId);
      await reloadBooking(booking.id);
      setBids([]);
      setStep('live');
    } catch (e) {
      toast.error(e.message);
      setBids((l) => l.filter((b) => b.bidId !== bid.bidId));
    } finally {
      setAccepting(null);
    }
  };

  const cancel = async () => {
    if (!booking) return reset();
    if (!window.confirm(`Cancel this ${noun}?`)) return;
    try {
      await api.bookings.cancel(booking.id, 'Cancelled by rider');
      toast(`${noun[0].toUpperCase()}${noun.slice(1)} cancelled`);
      reset();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const finish = async (tipAmount) => {
    setBusy(true);
    try {
      if (rating) await api.bookings.rate(booking.id, rating);
      if (tipAmount) await api.bookings.tip(booking.id, tipAmount, payment === 'cash' ? 'cash' : payment);
      if (rating || tipAmount) toast.success('Thanks for your feedback!');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
      router.push(`/rider/trips/${booking.id}`);
    }
  };

  const useMyLocation = async () => {
    try {
      const p = await locateOnce();
      setMe(p);
      setPickup({ address: 'Current location', lat: p.lat, lng: p.lng });
    } catch (e) {
      toast.error(e.message);
    }
  };

  // ── Map data ──
  const markers = useMemo(() => {
    const list = [];
    if (me && step === 'where') list.push({ id: 'me', kind: 'me', ...me });
    if (pickup) list.push({ id: 'pickup', kind: 'pickup', ...pickup });
    if (dropoff) list.push({ id: 'dropoff', kind: 'dropoff', ...dropoff });
    if (providerPos && step === 'live') list.push({ id: 'vehicle', kind: 'vehicle', ...providerPos });
    return list;
  }, [me, pickup, dropoff, providerPos, step]);

  const fitTo = step === 'live' && providerPos
    ? [providerPos, booking?.status === 'in_progress' ? dropoff : pickup]
    : [pickup, dropoff].filter(Boolean).length ? [pickup, dropoff] : me ? [me] : null;

  const status = booking?.status;
  const liveTitle = {
    assigned: `${booking?.provider_name?.split(' ')[0] || 'Your ' + providerNoun} is on the way`,
    arrived: isParcel ? 'Courier is at pickup' : 'Your driver has arrived',
    in_progress: isParcel ? 'Parcel on its way' : 'Enjoy your ride',
  }[status];

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden">
      <div className="absolute inset-0">
        <MapView markers={markers} route={route?.points} fitTo={fitTo} padBottom={SHEET_HEIGHT[step]} follow={step === 'live'} />
      </div>

      <div className="absolute left-0 right-0 top-0 z-[800] flex items-center justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button
          onClick={() => (step === 'options' ? setStep('where') : router.push('/rider'))}
          className="tap flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-float"
          aria-label="Back"
        >
          <ArrowLeft size={20} />
        </button>
        {booking && ['live', 'searching'].includes(step) && <SafetyButton bookingId={booking.id} />}
      </div>

      <div className="sheet max-h-[85dvh] overflow-y-auto">
        <div className="grabber" />

        {/* ── Where ── */}
        {step === 'where' && (
          <div className="animate-rise space-y-3 px-5 pb-2 pt-2">
            <h2 className="text-2xl font-extrabold">{isParcel ? 'Send a parcel' : 'Where to?'}</h2>
            <PlaceSearch
              value={pickup}
              onSelect={setPickup}
              placeholder={isParcel ? 'Collect from' : 'Pickup point'}
              marker="pickup"
              near={me}
              savedPlaces={places}
              onUseLocation={useMyLocation}
              onPickOnMap={() => setPicker('pickup')}
            />
            <PlaceSearch
              value={dropoff}
              onSelect={setDropoff}
              placeholder={isParcel ? 'Deliver to' : 'Destination'}
              marker="dropoff"
              near={me || pickup}
              savedPlaces={places}
              onPickOnMap={() => setPicker('dropoff')}
            />
            {route && (
              <p className="px-1 text-xs font-semibold text-ink-muted">{km(route.km)} · about {minutes(route.min)} {route.straight ? '(estimate)' : 'by road'}</p>
            )}
            <Button className="w-full" loading={busy} disabled={!pickup || !dropoff} onClick={() => getQuote()}>
              See prices
            </Button>
          </div>
        )}

        {/* ── Options & offer ── */}
        {step === 'options' && quote && (
          <div className="animate-rise space-y-4 px-5 pb-2 pt-2">
            <div className="flex items-baseline justify-between">
              <h2 className="text-xl font-extrabold">{isParcel ? 'Delivery details' : 'Choose a ride'}</h2>
              <span className="text-xs font-semibold text-ink-muted">{km(quote.distance_km)} · ~{minutes(quote.duration_min)}</span>
            </div>

            {!isParcel && (
              <div className="space-y-2">
                {quote.options.map((o) => {
                  const Icon = CLASS_ICON[o.vehicle_class] || Car;
                  const active = o.vehicle_class === vehicleClass;
                  return (
                    <button
                      key={o.vehicle_class}
                      onClick={() => { setVehicleClass(o.vehicle_class); setOffer(o.quoted_fare); }}
                      className={clsx('tap flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-left', active ? 'border-brand-500 bg-brand-50/60' : 'border-line')}
                    >
                      <span className={clsx('flex h-11 w-11 items-center justify-center rounded-xl', active ? 'bg-brand-500 text-white' : 'bg-canvas')}><Icon size={22} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 font-bold">
                          {o.label}
                          <span className="inline-flex items-center gap-0.5 text-xs font-medium text-ink-muted"><Users size={12} />{o.seats}</span>
                          {o.surge > 1 && <Pill tone="amber">Busy ×{o.surge}</Pill>}
                        </span>
                        <span className="block text-xs text-ink-muted">
                          {o.nearby ? `${o.nearby} nearby · pickup ~${o.pickup_eta_min} min` : 'No drivers nearby yet'}
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block font-extrabold">{money(o.quoted_fare)}</span>
                        {o.discount > 0 && <span className="block text-[11px] font-bold text-emerald-600">−{money(o.discount)}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {isParcel && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  {SIZES.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => { setParcel((p) => ({ ...p, parcel_size: s.id })); getQuote({ size: s.id }); }}
                      className={clsx('tap rounded-2xl border-2 p-3 text-left', parcel.parcel_size === s.id ? 'border-brand-500 bg-brand-50/60' : 'border-line')}
                    >
                      <Package size={s.id === 'small' ? 16 : s.id === 'medium' ? 20 : 24} className="text-brand-500" />
                      <span className="mt-1 block text-sm font-bold">{s.label}</span>
                      <span className="block text-[11px] leading-tight text-ink-muted">{s.hint}</span>
                    </button>
                  ))}
                </div>
                <input className="field" placeholder="What are you sending?" value={parcel.parcel_details} onChange={(e) => setParcel((p) => ({ ...p, parcel_details: e.target.value }))} />
                <div className="grid grid-cols-2 gap-2">
                  <input className="field" placeholder="Recipient name" value={parcel.recipient_name} onChange={(e) => setParcel((p) => ({ ...p, recipient_name: e.target.value }))} />
                  <input className="field" type="tel" placeholder="Recipient phone" value={parcel.recipient_phone} onChange={(e) => setParcel((p) => ({ ...p, recipient_phone: e.target.value }))} />
                </div>
                <p className="text-xs text-ink-muted">The recipient gets an SMS when the parcel is delivered. You will receive a 4-digit handover PIN to share with them.</p>
              </div>
            )}

            {option && (
              <OfferStepper value={offer} quoted={option.quoted_fare} floor={option.floor_fare} onChange={setOffer} />
            )}

            <div>
              <span className="label">Payment</span>
              <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
                {PAYMENTS.map((p) => (
                  <button key={p} onClick={() => setPayment(p)} className={clsx('flex-shrink-0', payment === p ? 'chip-on' : 'chip-off')}>
                    {PAYMENT_LABELS[p]}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className={clsx('flex items-center gap-2 rounded-xl bg-canvas px-3', promoState?.ok && 'ring-2 ring-emerald-400')}>
                <Tag size={16} className="flex-shrink-0 text-ink-faint" />
                <input
                  value={promo}
                  onChange={(e) => { setPromo(e.target.value.toUpperCase()); setPromoState(null); }}
                  onBlur={() => promo && getQuote({ promoCode: promo })}
                  placeholder="Promo code"
                  className="w-full bg-transparent py-3 text-sm font-semibold uppercase outline-none placeholder:normal-case placeholder:font-normal"
                />
                {promoState?.ok && <Check size={16} className="text-emerald-600" />}
              </div>
              <label className="flex items-center gap-2 rounded-xl bg-canvas px-3">
                <CalendarClock size={16} className="flex-shrink-0 text-ink-faint" />
                <input
                  type="datetime-local"
                  value={schedule}
                  min={new Date(Date.now() + 16 * 60000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                  onChange={(e) => setSchedule(e.target.value)}
                  className="w-full bg-transparent py-3 text-sm font-semibold outline-none"
                  aria-label="Schedule for later"
                />
                {schedule && <button onClick={() => setSchedule('')} aria-label="Clear schedule"><X size={14} /></button>}
              </label>
            </div>
            {promoState && !promoState.ok && <p className="-mt-2 text-xs font-semibold text-red-500">{promoState.error}</p>}
            {!isParcel && (
              <input className="field py-3 text-sm" placeholder="Note for the driver (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={255} />
            )}

            <Button className="w-full" loading={busy} onClick={request}>
              {schedule ? 'Schedule' : 'Request'} {noun} · {money(Math.max(0, offer - estimatedDiscount))}
            </Button>
          </div>
        )}

        {/* ── Searching / bids ── */}
        {step === 'searching' && booking && (
          <div className="animate-rise px-5 pb-2 pt-2">
            {bids.length === 0 ? (
              <div className="py-4 text-center">
                <div className="relative mx-auto mb-4 h-24 w-24">
                  <span className="animate-radar absolute inset-0 rounded-full bg-brand-400" />
                  <span className="animate-radar absolute inset-0 rounded-full bg-brand-400 [animation-delay:.6s]" />
                  <span className="relative flex h-24 w-24 items-center justify-center rounded-full bg-brand-500 text-white">
                    {isParcel ? <Package size={36} /> : <Car size={36} />}
                  </span>
                </div>
                <h3 className="text-xl font-extrabold">Waiting for offers…</h3>
                <p className="mt-1 text-sm text-ink-muted">Nearby {providerNoun}s can accept your {money(booking.rider_offer)} or counter-offer.</p>
                {secondsLeft != null && <p className="mt-3 text-xs font-semibold text-ink-faint">Request open for {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}</p>}
              </div>
            ) : (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-lg font-extrabold">{bids.length} offer{bids.length > 1 ? 's' : ''}</h3>
                  <span className="text-xs font-semibold text-ink-muted">You offered {money(booking.rider_offer)}</span>
                </div>
                <div className="max-h-[40dvh] space-y-2 overflow-y-auto pb-2">
                  {bids.map((b) => <BidCard key={b.bidId} bid={b} riderOffer={booking.rider_offer} onAccept={acceptBid} busy={accepting} />)}
                </div>
              </div>
            )}
            <button onClick={cancel} className="btn-ghost mt-3 w-full">Cancel request</button>
          </div>
        )}

        {/* ── Live trip ── */}
        {step === 'live' && booking && (
          <div className="animate-rise space-y-4 px-5 pb-2 pt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-extrabold">{liveTitle}</h3>
              <span className="text-lg font-extrabold">{money(booking.agreed_fare ?? booking.rider_offer)}</span>
            </div>
            <div className="flex items-center gap-3">
              <Avatar name={booking.provider_name} src={booking.provider_avatar} size={56} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{booking.provider_name}</p>
                <p className="truncate text-sm text-ink-muted">
                  {[booking.vehicle_color, booking.vehicle_make || VEHICLE_LABELS[booking.provider_vehicle_class]].filter(Boolean).join(' ')}
                </p>
                <Rating value={booking.provider_rating_avg} />
              </div>
              {booking.plate_number && <span className="rounded-lg bg-ink px-2.5 py-1.5 text-sm font-extrabold tracking-wider text-volt">{booking.plate_number}</span>}
            </div>
            {isParcel && booking.handover_pin && (
              <div className="flex items-center justify-between rounded-2xl bg-volt/15 p-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Handover PIN</p>
                  <p className="text-xs text-amber-700/80">Share with {booking.recipient_name || 'the recipient'} only</p>
                </div>
                <span className="text-2xl font-extrabold tracking-[.3em]">{booking.handover_pin}</span>
              </div>
            )}
            <div className="flex gap-2">
              <TripChat bookingId={booking.id} me={profile?.id} counterpart={booking.provider_name} side="rider" />
              {booking.provider_phone && (
                <a href={`tel:${booking.provider_phone}`} className="btn-ghost flex-1"><Phone size={18} /> Call</a>
              )}
            </div>
            {status !== 'in_progress' && (
              <button onClick={cancel} className="w-full py-2 text-sm font-semibold text-red-500">Cancel {noun}</button>
            )}
          </div>
        )}

        {/* ── Done ── */}
        {step === 'done' && booking && (
          <div className="animate-rise space-y-4 px-5 pb-2 pt-2 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white"><Check size={32} /></div>
            <div>
              <h3 className="text-xl font-extrabold">{isParcel ? 'Delivered!' : 'You have arrived'}</h3>
              <p className="text-3xl font-extrabold">{money(result?.total ?? booking.final_fare)}</p>
              <p className="text-sm text-ink-muted">
                {(result?.paymentMethod || booking.payment_method) === 'cash' ? `Pay your ${providerNoun} in cash` : `Charged via ${PAYMENT_LABELS[booking.payment_method]}`}
                {result?.discount > 0 && ` · saved ${money(result.discount)}`}
              </p>
            </div>
            <div className="flex flex-col items-center gap-2">
              <p className="text-sm font-semibold">How was {booking.provider_name?.split(' ')[0]}?</p>
              <Stars value={rating} onChange={setRating} size={34} />
            </div>
            <div>
              <p className="label">Add a tip</p>
              <div className="flex justify-center gap-2">
                {TIPS.map((t) => (
                  <button key={t} disabled={busy} onClick={() => finish(t)} className="chip-off">{money(t)}</button>
                ))}
              </div>
            </div>
            <Button className="w-full" loading={busy} onClick={() => finish(0)}>Done</Button>
          </div>
        )}
      </div>

      {picker && (
        <PinPicker
          title={picker === 'pickup' ? 'Set pickup point' : 'Set destination'}
          initial={(picker === 'pickup' ? pickup : dropoff) || pickup || me}
          onClose={() => setPicker(null)}
          onConfirm={(loc) => {
            (picker === 'pickup' ? setPickup : setDropoff)(loc);
            setPicker(null);
          }}
        />
      )}
    </div>
  );
}
