'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { AlertTriangle, Banknote, CheckCircle2, Lock, Navigation2, Phone, Power, Radar } from 'lucide-react';
import { api } from '@/lib/api';
import { appSocket } from '@/lib/socket';
import { prefs } from '@/lib/session';
import { fetchRoute } from '@/lib/geo';
import { greeting, money, PAYMENT_LABELS } from '@/lib/format';
import { MapView } from '@/components/map';
import { useAccount, InboxBell } from '@/components/shell/AppShell';
import { Avatar, Button, Modal, Pill, Stars } from '@/components/ui';
import TripChat from '@/components/trip/TripChat';
import SafetyButton from '@/components/trip/SafetyButton';
import RequestCard from './RequestCard';
import useFleetTracking from './useFleetTracking';

const STEPS = {
  assigned: { title: 'Head to pickup', action: 'I have arrived', call: 'arrive' },
  arrived: { title: 'Waiting at pickup', action: 'Start trip', call: 'start' },
  in_progress: { title: 'On the way to drop-off', action: 'Complete', call: 'complete' },
};

const directions = (to) => `https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lng}&travelmode=driving`;

export default function FleetHome({ role }) {
  const { profile, refresh } = useAccount();
  const isCourier = role === 'courier';
  const [availability, setAvailability] = useState(profile.availability || 'offline');
  const [requests, setRequests] = useState([]);
  const [myBids, setMyBids] = useState({});
  const [job, setJob] = useState(null);
  const [route, setRoute] = useState(null);
  const [today, setToday] = useState(null);
  const [locked, setLocked] = useState(Boolean(profile.wallet_locked));
  const [busy, setBusy] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [summary, setSummary] = useState(null);
  const [riderStars, setRiderStars] = useState(0);
  const dismissed = useRef(new Set());

  const tracking = availability !== 'offline';
  const { position, error: gpsError } = useFleetTracking(tracking);

  const loadJob = useCallback(async () => {
    const { booking } = await api.bookings.current();
    setJob(booking);
    if (booking) setAvailability('busy');
    return booking;
  }, []);

  const loadToday = useCallback(() => api.me.earnings().then((r) => setToday(r.today)).catch(() => {}), []);

  // The cached profile may be stale on first paint; follow the refreshed one.
  useEffect(() => {
    if (profile.availability) setAvailability((current) => (current === 'busy' ? current : profile.availability));
    setLocked(Boolean(profile.wallet_locked));
  }, [profile.availability, profile.wallet_locked]);

  // ── Initial state ──
  useEffect(() => {
    loadJob().catch(() => {});
    loadToday();
    // Come back online automatically after a reload if they were online before.
    if (prefs.get('online') === '1' && profile.availability === 'offline') goOnline(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Socket events ──
  useEffect(() => {
    const socket = appSocket();
    if (!socket) return undefined;
    const handlers = {
      'booking:new': (r) => {
        if (dismissed.current.has(r.bookingId)) return;
        setRequests((list) => (list.some((x) => x.bookingId === r.bookingId) ? list : [r, ...list]));
        if (navigator.vibrate) navigator.vibrate([150, 80, 150]);
      },
      'booking:closed': ({ bookingId }) => {
        setRequests((list) => list.filter((r) => r.bookingId !== bookingId));
      },
      'booking:lost': ({ bookingId }) => {
        setRequests((list) => list.filter((r) => r.bookingId !== bookingId));
        setMyBids((b) => { const n = { ...b }; delete n[bookingId]; return n; });
        toast('The rider chose another offer', { icon: '🙅' });
      },
      'booking:won': ({ booking }) => {
        setRequests([]);
        setMyBids({});
        setJob(booking);
        setAvailability('busy');
        toast.success('Offer accepted — go to pickup!');
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      },
      'booking:cancelled': ({ reason }) => {
        toast.error(reason || 'The booking was cancelled');
        setJob(null);
        setAvailability('online');
        setRoute(null);
      },
      'wallet:locked': () => {
        setLocked(true);
        toast.error('Your wallet is locked. Top up to keep receiving requests.', { duration: 6000 });
      },
      'wallet:updated': () => refresh().then((u) => u && setLocked(Boolean(u.wallet_locked))),
      'tip:received': ({ amount }) => toast.success(`You received a ${money(amount)} tip!`),
    };
    Object.entries(handlers).forEach(([e, h]) => socket.on(e, h));
    const onReconnect = () => {
      loadJob().catch(() => {});
      if (prefs.get('online') === '1') socket.emit('fleet:availability', { availability: 'online' });
    };
    socket.io.on('reconnect', onReconnect);
    return () => {
      Object.entries(handlers).forEach(([e, h]) => socket.off(e, h));
      socket.io.off('reconnect', onReconnect);
    };
  }, [loadJob, refresh]);

  // ── Route for the active job ──
  useEffect(() => {
    if (!job || !position) return setRoute(null);
    const target = job.status === 'in_progress'
      ? { lat: job.dropoff_lat, lng: job.dropoff_lng }
      : { lat: job.pickup_lat, lng: job.pickup_lng };
    fetchRoute(position, target).then(setRoute);
  // Only refetch when the job step changes, not on every GPS fix.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id, job?.status, Boolean(position)]);

  // ── Actions ──
  async function goOnline(silent = false) {
    setBusy(true);
    try {
      const res = await api.me.setAvailability('online', position || undefined);
      setAvailability(res.availability);
      prefs.set('online', '1');
      const { requests: open } = await api.me.openRequests();
      setRequests(open.filter((r) => !dismissed.current.has(r.bookingId)));
      if (!silent) toast.success('You are online');
    } catch (e) {
      if (!silent) toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  const goOffline = async () => {
    setBusy(true);
    try {
      await api.me.setAvailability('offline');
      setAvailability('offline');
      setRequests([]);
      setMyBids({});
      prefs.set('online', null);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const bid = async (request, amount) => {
    try {
      await api.bookings.bid(request.bookingId, amount);
      setMyBids((b) => ({ ...b, [request.bookingId]: amount }));
    } catch (e) {
      toast.error(e.message);
      if (e.status === 409) setRequests((list) => list.filter((r) => r.bookingId !== request.bookingId));
      if (e.status === 403) setLocked(true);
    }
  };

  const withdraw = async (request) => {
    await api.bookings.withdrawBid(request.bookingId).catch(() => {});
    setMyBids((b) => { const n = { ...b }; delete n[request.bookingId]; return n; });
  };

  const dismiss = (request) => {
    dismissed.current.add(request.bookingId);
    setRequests((list) => list.filter((r) => r.bookingId !== request.bookingId));
  };

  const advance = async () => {
    const step = STEPS[job.status];
    if (step.call === 'complete' && job.service === 'parcel' && !pinOpen) return setPinOpen(true);
    setBusy(true);
    try {
      if (step.call === 'complete') {
        const res = await api.bookings.complete(job.id, pin || undefined);
        setPinOpen(false);
        setPin('');
        setSummary({ ...res, bookingId: job.id, riderName: job.rider_name, paymentMethod: job.payment_method });
        setJob(null);
        setAvailability('online');
        loadToday();
        refresh().then((u) => u && setLocked(Boolean(u.wallet_locked)));
      } else {
        await api.bookings[step.call](job.id);
        await loadJob();
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const cancelJob = async () => {
    const reason = window.prompt('Why are you cancelling? (the rider will see this)', 'Unable to reach pickup');
    if (reason === null) return;
    try {
      await api.bookings.cancel(job.id, reason);
      setJob(null);
      setAvailability('online');
    } catch (e) {
      toast.error(e.message);
    }
  };

  const closeSummary = async () => {
    if (riderStars) await api.bookings.rate(summary.bookingId, riderStars).catch(() => {});
    setRiderStars(0);
    setSummary(null);
  };

  // ── Map ──
  const markers = useMemo(() => {
    const list = [];
    if (position) list.push({ id: 'me', kind: job ? 'vehicle' : 'me', ...position });
    if (job) {
      if (job.status !== 'in_progress') list.push({ id: 'pickup', kind: 'pickup', lat: job.pickup_lat, lng: job.pickup_lng });
      list.push({ id: 'dropoff', kind: 'dropoff', lat: job.dropoff_lat, lng: job.dropoff_lng });
    } else {
      requests.forEach((r) => list.push({ id: r.bookingId, kind: 'request', lat: r.pickup.lat, lng: r.pickup.lng }));
    }
    return list;
  }, [position, job, requests]);

  const target = job && (job.status === 'in_progress' ? { lat: job.dropoff_lat, lng: job.dropoff_lng } : { lat: job.pickup_lat, lng: job.pickup_lng });
  const fitTo = job && position ? [position, target] : position ? [position, ...requests.slice(0, 3).map((r) => r.pickup)] : null;
  const step = job && STEPS[job.status];

  return (
    <div className="relative h-[calc(100dvh-5.5rem)] overflow-hidden">
      <div className="absolute inset-0">
        <MapView markers={markers} route={route?.points} fitTo={fitTo} padBottom={job ? 320 : 380} follow={Boolean(job)} />
      </div>

      {/* Top bar */}
      <div className="absolute left-0 right-0 top-0 z-[800] space-y-2 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center gap-3 rounded-2xl bg-white px-3 py-2 shadow-float">
            <Avatar name={profile.full_name} src={profile.avatar_url} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{greeting()}, {profile.full_name.split(' ')[0]}</p>
              <p className="flex items-center gap-1.5 text-xs font-semibold">
                <span className={clsx('h-2 w-2 rounded-full', availability === 'offline' ? 'bg-ink-faint' : availability === 'busy' ? 'bg-amber-500' : 'bg-emerald-500')} />
                {availability === 'offline' ? 'Offline' : availability === 'busy' ? 'On a job' : 'Online'}
                {today && <span className="text-ink-muted">· Today {money(today.net + today.tips)}</span>}
              </p>
            </div>
          </div>
          {job ? <SafetyButton bookingId={job.id} /> : <InboxBell href={`/${role}/inbox`} />}
        </div>
        {locked && (
          <Link href={`/${role}/earnings`} className="flex items-center gap-2 rounded-2xl bg-red-500 px-4 py-3 text-sm font-semibold text-white shadow-float">
            <Lock size={16} /> Wallet locked ({money(profile.wallet_balance)}). Tap to top up.
          </Link>
        )}
        {gpsError && tracking && (
          <p className="flex items-center gap-2 rounded-2xl bg-amber-400 px-4 py-2.5 text-xs font-semibold text-ink shadow-float"><AlertTriangle size={14} /> {gpsError}</p>
        )}
      </div>

      {/* Bottom area */}
      <div className="absolute bottom-0 left-0 right-0 z-[800] max-h-[62%] space-y-3 overflow-y-auto px-4 pb-4">
        {!job && availability === 'offline' && (
          <div className="animate-rise surface p-5 text-center shadow-float">
            <p className="text-lg font-extrabold">You are offline</p>
            <p className="mb-4 text-sm text-ink-muted">Go online to receive {isCourier ? 'delivery' : 'ride'} requests nearby.</p>
            <Button className="w-full py-4 text-base" loading={busy} disabled={locked} onClick={() => goOnline()}>
              <Power size={18} /> Go online
            </Button>
          </div>
        )}

        {!job && availability === 'online' && (
          <>
            {requests.length === 0 && (
              <div className="surface flex items-center gap-3 p-4 shadow-float">
                <span className="relative flex h-11 w-11 items-center justify-center">
                  <span className="animate-radar absolute inset-0 rounded-full bg-emerald-400" />
                  <Radar size={22} className="relative text-emerald-600" />
                </span>
                <div className="flex-1">
                  <p className="font-bold">Looking for requests…</p>
                  <p className="text-xs text-ink-muted">Keep the app open. We will buzz when something comes in.</p>
                </div>
              </div>
            )}
            {requests.map((r) => (
              <RequestCard key={r.bookingId} request={r} myBid={myBids[r.bookingId]} onBid={bid} onWithdraw={withdraw} onDismiss={dismiss} />
            ))}
            <button onClick={goOffline} disabled={busy} className="mx-auto flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-bold shadow-float">
              <Power size={16} className="text-red-500" /> Go offline
            </button>
          </>
        )}

        {job && step && (
          <div className="animate-rise surface space-y-4 p-4 shadow-float">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-brand-600">{step.title}</p>
                <p className="line-clamp-1 text-sm font-semibold">{job.status === 'in_progress' ? job.dropoff_address : job.pickup_address}</p>
              </div>
              <a href={directions(target)} target="_blank" rel="noreferrer" className="tap flex h-11 w-11 items-center justify-center rounded-full bg-brand-500 text-white" aria-label="Navigate">
                <Navigation2 size={20} />
              </a>
            </div>
            <div className="flex items-center gap-3">
              <Avatar name={job.rider_name} src={job.rider_avatar} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{job.rider_name}</p>
                <p className="text-xs text-ink-muted">{job.service === 'parcel' ? `Deliver to ${job.recipient_name} · ${job.recipient_phone}` : 'Passenger'}</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-extrabold">{money(job.agreed_fare)}</p>
                <Pill tone={job.payment_method === 'cash' ? 'green' : 'violet'}>{PAYMENT_LABELS[job.payment_method]}</Pill>
              </div>
            </div>
            {job.rider_note && <p className="rounded-xl bg-canvas px-3 py-2 text-xs">“{job.rider_note}”</p>}
            <div className="flex gap-2">
              <TripChat bookingId={job.id} me={profile.id} counterpart={job.rider_name} side="provider" />
              <a href={`tel:${job.status === 'in_progress' && job.service === 'parcel' ? job.recipient_phone : job.rider_phone}`} className="btn-ghost flex-1"><Phone size={18} /> Call</a>
            </div>
            <Button className="w-full py-4 text-base" loading={busy} onClick={advance}>{step.action}</Button>
            {job.status !== 'in_progress' && (
              <button onClick={cancelJob} className="w-full text-sm font-semibold text-red-500">Cancel job</button>
            )}
          </div>
        )}
      </div>

      <Modal open={pinOpen} onClose={() => setPinOpen(false)} title="Handover PIN">
        <p className="mb-3 text-sm text-ink-muted">Ask {job?.recipient_name || 'the recipient'} for the 4-digit PIN the sender shared with them.</p>
        <input
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          className="field mb-4 text-center text-3xl font-extrabold tracking-[.5em]"
          placeholder="••••"
          autoFocus
        />
        <Button className="w-full" loading={busy} disabled={pin.length !== 4} onClick={advance}>Confirm delivery</Button>
      </Modal>

      <Modal open={Boolean(summary)} onClose={closeSummary} title="Job complete">
        {summary && (
          <div className="space-y-4 text-center">
            <CheckCircle2 size={48} className="mx-auto text-emerald-500" />
            {summary.collectFromRider > 0 ? (
              <div className="rounded-2xl bg-emerald-50 p-4">
                <p className="flex items-center justify-center gap-2 text-sm font-semibold text-emerald-700"><Banknote size={16} /> Collect in cash</p>
                <p className="text-4xl font-extrabold text-emerald-700">{money(summary.collectFromRider)}</p>
                {summary.discount > 0 && <p className="text-xs text-emerald-700/80">Promo of {money(summary.discount)} is credited back to your wallet.</p>}
              </div>
            ) : (
              <p className="text-sm text-ink-muted">Paid in app via {PAYMENT_LABELS[summary.paymentMethod]}. Your earnings were added to your wallet.</p>
            )}
            <p className="text-sm">You earn <span className="font-extrabold">{money(summary.payout)}</span> on this job.</p>
            <div className="flex flex-col items-center gap-1">
              <p className="text-sm font-semibold">Rate {summary.riderName?.split(' ')[0]}</p>
              <Stars value={riderStars} onChange={setRiderStars} />
            </div>
            <Button className="w-full" onClick={closeSummary}>Back to requests</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
