'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { getSocket } from '@/lib/socket';
import {
  setDriverStatus, getWallet, acceptTrip, confirmPickup,
  startTrip, completeTrip, getTripHistory, submitTripOffer,
} from '@/lib/api';
import toast from 'react-hot-toast';
import Link from 'next/link';
import {
  Car, Wallet, User, Clock, Flag, MapPin,
  ChevronRight, AlertTriangle, CheckCircle, Loader2,
} from 'lucide-react';
import ChatModal, { ChatButton } from '@/components/ChatModal';
const TripMap = dynamic(() => import('@/components/TripMap'), { ssr: false });
import formatCDF from '@/lib/currency';

const USD_TO_CDF = 2800;
const STEP_FC    = 200;
const snapFC     = (fc) => Math.round(fc / STEP_FC) * STEP_FC;
const toFC       = (usd) => snapFC(Math.round(usd * USD_TO_CDF));
const toUSD      = (fc)  => fc / USD_TO_CDF;

const STATUS_CONFIG = {
  offline: { label: 'Hors ligne', dot: 'bg-gray-400',  badge: 'bg-gray-100 text-gray-500'    },
  online:  { label: 'En ligne',   dot: 'bg-green-400', badge: 'bg-green-100 text-green-700'  },
  busy:    { label: 'En course',  dot: 'bg-[#007DC5]', badge: 'bg-blue-100 text-[#007DC5]'   },
};

const TRIP_STEPS = {
  accepted: { label: 'Aller chercher le passager', action: 'Je suis arrivé ✓' },
  pickup:   { label: 'En attente du passager',     action: 'Démarrer la course 🚀' },
  ongoing:  { label: 'Course en cours',            action: 'Terminer la course ✓' },
};

const STEP_ICONS = { accepted: Car, pickup: User, ongoing: Flag };

// ─── Price offer form ──────────────────────────────────────────────────────────
function OfferForm({ trip, onSubmit, onIgnore, submitting }) {
  const clientFC    = toFC(trip.clientPrice     ?? trip.estimatedFare);
  const recFC       = toFC(trip.recommendedPrice ?? trip.estimatedFare);
  const minFC       = toFC(trip.minPrice        ?? 0);
  const midpointFC  = snapFC(Math.round((clientFC + recFC) / 2 / STEP_FC) * STEP_FC);

  // Deduplicate presets
  const presets = [...new Set([clientFC, midpointFC, recFC])];

  const [selectedFC, setSelectedFC] = useState(clientFC);
  const [inputVal, setInputVal]    = useState(String(clientFC));

  const handlePreset = (fc) => {
    setSelectedFC(fc);
    setInputVal(String(fc));
  };

  const handleInput = (v) => {
    setInputVal(v);
    const n = parseInt(v, 10);
    if (!isNaN(n)) setSelectedFC(snapFC(n));
  };

  const belowMin = selectedFC < minFC;

  return (
    <div className="space-y-4">
      {/* Price comparison */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-blue-50 rounded-2xl p-3 text-center">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Prix client</p>
          <p className="text-lg font-black text-[#007DC5]">{clientFC.toLocaleString()} FC</p>
        </div>
        <div className="bg-green-50 rounded-2xl p-3 text-center">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Conseillé</p>
          <p className="text-lg font-black text-green-700">{recFC.toLocaleString()} FC</p>
        </div>
      </div>

      {/* Preset chips */}
      <div>
        <p className="text-xs text-gray-500 mb-2">Offres rapides</p>
        <div className="flex gap-2">
          {presets.map((fc) => (
            <button
              key={fc}
              onClick={() => handlePreset(fc)}
              className={`flex-1 py-2.5 rounded-2xl text-sm font-bold border-2 transition-all ${
                selectedFC === fc
                  ? 'bg-[#007DC5] text-white border-[#007DC5]'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-[#007DC5]'
              }`}
            >
              {fc.toLocaleString()}
            </button>
          ))}
        </div>
        <div className="flex gap-2 mt-1">
          {presets.map((fc, i) => (
            <p key={fc} className="flex-1 text-center text-[9px] text-gray-400">
              {i === 0 ? 'Client' : i === presets.length - 1 ? 'Conseillé' : 'Moyen'}
            </p>
          ))}
        </div>
      </div>

      {/* Custom input */}
      <div>
        <p className="text-xs text-gray-500 mb-1.5">Votre prix personnalisé (FC)</p>
        <div className="relative">
          <input
            type="number"
            value={inputVal}
            onChange={(e) => handleInput(e.target.value)}
            step={STEP_FC}
            min={minFC}
            className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 text-lg font-bold text-gray-900 focus:outline-none focus:border-[#007DC5] pr-14"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">FC</span>
        </div>
        {belowMin && (
          <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
            <AlertTriangle size={11} /> Prix minimum : {minFC.toLocaleString()} FC
          </p>
        )}
      </div>

      {/* Selected price summary */}
      <div className={`rounded-2xl p-3 text-center ${belowMin ? 'bg-red-50' : 'bg-gray-50'}`}>
        <p className="text-xs text-gray-500 mb-0.5">Votre offre</p>
        <p className={`text-2xl font-black ${belowMin ? 'text-red-500' : 'text-gray-900'}`}>
          {selectedFC.toLocaleString()} FC
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button onClick={onIgnore} className="btn-outline flex-1" style={{ padding: '12px' }}>
          Ignorer
        </button>
        <button
          onClick={() => onSubmit(toUSD(selectedFC))}
          disabled={belowMin || submitting}
          className="btn-primary flex-1 flex items-center justify-center gap-2"
          style={{ padding: '12px' }}
        >
          {submitting
            ? <Loader2 size={16} className="animate-spin" />
            : 'Faire mon offre'}
        </button>
      </div>
    </div>
  );
}

// ─── Offer submitted state ─────────────────────────────────────────────────────
function OfferPending({ trip, offeredFC, onCancel }) {
  return (
    <div className="space-y-4 text-center">
      <div className="flex flex-col items-center gap-3 py-4">
        <div className="w-14 h-14 bg-blue-50 rounded-full flex items-center justify-center">
          <Loader2 size={28} className="text-[#007DC5] animate-spin" />
        </div>
        <div>
          <p className="font-black text-gray-900">Offre envoyée !</p>
          <p className="text-gray-500 text-sm">En attente de la réponse du client…</p>
        </div>
      </div>

      <div className="bg-blue-50 rounded-2xl p-4">
        <p className="text-xs text-gray-500 mb-1">Votre offre</p>
        <p className="text-3xl font-black text-[#007DC5]">{offeredFC.toLocaleString()} FC</p>
      </div>

      <button onClick={onCancel} className="btn-outline w-full" style={{ padding: '12px' }}>
        Annuler l'offre
      </button>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function DriverDashboard() {
  const router      = useRouter();
  const socketRef     = useRef(null);
  const locationRef   = useRef(null);
  const keepaliveRef  = useRef(null);   // interval to re-ping location every 5 min

  const [user, setUser]           = useState(null);
  const [greeting, setGreeting]   = useState('');
  const [status, setStatus]       = useState('offline');
  const [wallet, setWallet]       = useState(null);
  const [pendingTrip, setPendingTrip] = useState(null);
  const [activeTrip, setActiveTrip]   = useState(null);
  const [tripStatus, setTripStatus]   = useState(null);
  const [loading, setLoading]         = useState(false);
  const [driverPos, setDriverPos]     = useState(null);
  const [route, setRoute]             = useState(null);
  const [chatOpen, setChatOpen]       = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // InDrive offer state
  const [offerState, setOfferState]   = useState('idle');   // 'idle' | 'submitted'
  const [offeredFC, setOfferedFC]     = useState(0);
  const [offerLoading, setOfferLoading] = useState(false);

  // Restore active trip on mount (handles page reloads / backend restarts)
  useEffect(() => {
    const ACTIVE = ['accepted', 'pickup', 'ongoing'];
    getTripHistory(1).then(({ data }) => {
      const t = data.trips?.[0];
      if (!t || !ACTIVE.includes(t.status) || !t.driver_id) return;
      setActiveTrip({
        id: t.id, tripId: t.id,
        clientId: t.client_id,
        pickup:  { address: t.pickup_address,  lat: parseFloat(t.pickup_lat),  lng: parseFloat(t.pickup_lng)  },
        dropoff: { address: t.dropoff_address, lat: parseFloat(t.dropoff_lat), lng: parseFloat(t.dropoff_lng) },
        estimatedFare: parseFloat(t.final_agreed_price ?? t.estimated_fare),
        paymentMethod: t.payment_method,
      });
      setTripStatus(t.status);
      setStatus('busy');
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem('transur_user');
    if (!stored) return router.replace('/auth/login');
    const u = JSON.parse(stored);
    if (u.role !== 'driver') return router.replace('/auth/login');
    setUser(u);
    const h = new Date().getHours();
    setGreeting(h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir');

    getWallet().then((r) => setWallet(r.data.wallet)).catch(() => {});

    // Restore online status from localStorage as fallback
    const savedOnline = localStorage.getItem('transur_driver_online');
    if (savedOnline === '1') setStatus('online');

    const socket = getSocket();
    if (!socket) return;
    socketRef.current = socket;

    // If was online before reload, restart location tracking immediately
    if (savedOnline === '1') {
      startLocationTracking();
      socket.emit('set_status', { status: 'online' });
    }

    socket.on('new_trip_request', (trip) => {
      if (status === 'online') {
        setPendingTrip(trip);
        setOfferState('idle');
        toast('Nouvelle course disponible !', { icon: '🚗', duration: 30000 });
      }
    });

    socket.on('trip_taken', ({ tripId }) => {
      if (pendingTrip?.tripId === tripId) {
        setPendingTrip(null);
        setOfferState('idle');
        toast('Course déjà prise.');
      }
    });

    // Client accepted our offer → start the trip
    socket.on('offer_accepted', ({ tripId, agreedPrice }) => {
      if (pendingTrip?.tripId === tripId) {
        const agreedFC = toFC(agreedPrice);
        toast.success(`Offre acceptée ! ${agreedFC.toLocaleString()} FC`);
        setActiveTrip({
          ...pendingTrip,
          estimatedFare: agreedPrice,
        });
        setTripStatus('accepted');
        setStatus('busy');
        setPendingTrip(null);
        setOfferState('idle');
      }
    });

    // Client chose another driver
    socket.on('offer_declined', ({ tripId }) => {
      if (pendingTrip?.tripId === tripId) {
        toast('Le client a choisi un autre chauffeur.', { icon: '😕' });
        setOfferState('idle');
        setPendingTrip(null);
      }
    });

    // Trip cancelled while we had a pending offer
    socket.on('trip_cancelled', ({ tripId }) => {
      if (pendingTrip?.tripId === tripId) {
        toast('La course a été annulée par le client.', { icon: '❌' });
        setPendingTrip(null);
        setOfferState('idle');
      }
    });

    socket.on('status_updated', ({ status: s }) => setStatus(s));

    socket.on('message', () => {
      if (!chatOpen) setUnreadCount((c) => c + 1);
    });

    return () => {
      socket.off('new_trip_request');
      socket.off('trip_taken');
      socket.off('offer_accepted');
      socket.off('offer_declined');
      socket.off('trip_cancelled');
      socket.off('status_updated');
      socket.off('message');
    };
  }, [router, status, pendingTrip, chatOpen]);

  // ── Location tracking ──────────────────────────────────────────────────────
  const toggleOnline = async () => {
    const newStatus = status === 'offline' ? 'online' : 'offline';
    try {
      await setDriverStatus(newStatus);
      setStatus(newStatus);
      localStorage.setItem('transur_driver_online', newStatus === 'online' ? '1' : '0');
      socketRef.current?.emit('set_status', { status: newStatus });
      if (newStatus === 'online') {
        startLocationTracking();
        toast.success('Vous êtes maintenant en ligne');
      } else {
        stopLocationTracking();
        toast('Vous êtes hors ligne');
      }
    } catch { toast.error('Erreur de connexion'); }
  };

  const sendLocation = (lat, lng, heading = null, speed = null) => {
    socketRef.current?.emit('location_update', { latitude: lat, longitude: lng, heading, speed });
    setDriverPos({ lat, lng });
  };

  const startLocationTracking = () => {
    const fallback = { lat: -11.6609, lng: 27.4794 };
    const onPos = (p) => sendLocation(p.coords.latitude, p.coords.longitude, p.coords.heading, p.coords.speed);
    const onErr = () => sendLocation(fallback.lat, fallback.lng);

    if (!navigator.geolocation) { sendLocation(fallback.lat, fallback.lng); }
    else {
      navigator.geolocation.getCurrentPosition(onPos, onErr, { enableHighAccuracy: true, timeout: 8000 });
      locationRef.current = navigator.geolocation.watchPosition(onPos, onErr,
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 3000 });
    }

    // Keepalive: re-ping GPS every 5 min so the DB location never goes stale
    clearInterval(keepaliveRef.current);
    keepaliveRef.current = setInterval(() => {
      if (!navigator.geolocation) { sendLocation(fallback.lat, fallback.lng); return; }
      navigator.geolocation.getCurrentPosition(onPos, onErr, { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 });
    }, 5 * 60 * 1000);
  };

  const stopLocationTracking = () => {
    if (locationRef.current) {
      navigator.geolocation.clearWatch(locationRef.current);
      locationRef.current = null;
    }
    clearInterval(keepaliveRef.current);
    keepaliveRef.current = null;
  };

  async function fetchRoute(from, to) {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
      const res  = await fetch(url);
      const data = await res.json();
      if (data.routes?.[0]) return data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    } catch {}
    return null;
  }

  useEffect(() => {
    if (activeTrip && driverPos) {
      const target = tripStatus === 'ongoing'
        ? { lat: activeTrip.dropoff?.lat, lng: activeTrip.dropoff?.lng }
        : { lat: activeTrip.pickup?.lat,  lng: activeTrip.pickup?.lng  };
      if (target.lat) fetchRoute(driverPos, target).then(setRoute);
    } else {
      setRoute(null);
    }
  }, [activeTrip, tripStatus, driverPos]);

  // ── Offer submission ───────────────────────────────────────────────────────
  const handleSubmitOffer = async (priceUSD) => {
    if (!pendingTrip) return;
    setOfferLoading(true);
    try {
      await submitTripOffer(pendingTrip.tripId, priceUSD);
      setOfferedFC(toFC(priceUSD));
      setOfferState('submitted');
      toast.success('Offre envoyée au client !');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur lors de l\'envoi');
    } finally {
      setOfferLoading(false);
    }
  };

  // ── Active trip actions ────────────────────────────────────────────────────
  const handleTripAction = async () => {
    if (!activeTrip) return;
    setLoading(true);
    try {
      const id = activeTrip.tripId || activeTrip.id;
      if (tripStatus === 'accepted') {
        await confirmPickup(id);
        setTripStatus('pickup');
        toast('Arrivée confirmée');
      } else if (tripStatus === 'pickup') {
        await startTrip(id);
        setTripStatus('ongoing');
        toast.success('Course démarrée !');
      } else if (tripStatus === 'ongoing') {
        await completeTrip(id, {});
        toast.success('Course terminée !');
        setActiveTrip(null);
        setTripStatus(null);
        setStatus('online');
        getWallet().then((r) => setWallet(r.data.wallet)).catch(() => {});
      }
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
    finally { setLoading(false); }
  };

  if (!user) return null;

  const walletBlocked = !!wallet?.is_blocked;
  const sc = STATUS_CONFIG[status] || STATUS_CONFIG.offline;

  return (
    <div className="min-h-screen bg-[#f0f4f8] flex flex-col">

      {/* ── Header ── */}
      <div className="header-dark relative px-6 pt-14 pb-24 text-white overflow-hidden">
        <div className="absolute -top-10 -right-10 w-44 h-44 rounded-full bg-white/5" />
        <div className="absolute bottom-4 right-6 w-20 h-20 rounded-full bg-white/5" />
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 right-8 w-1.5 h-full bg-[#007DC5] opacity-30" style={{ transform: 'rotate(15deg) scaleY(1.5)' }} />
          <div className="absolute top-0 right-11 w-0.5 h-full bg-[#CE1126] opacity-30" style={{ transform: 'rotate(15deg) scaleY(1.5)' }} />
        </div>

        <div className="relative flex items-center justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-2.5 h-2.5 rounded-full ${sc.dot}`} />
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${sc.badge}`}>{sc.label}</span>
            </div>
            <p className="text-gray-400 text-sm">{greeting} 👋</p>
            <h1 className="text-2xl font-black mt-0.5">{user.name}</h1>
          </div>
          <div className="flex gap-2">
            <Link href="/driver/wallet" className="w-10 h-10 rounded-full bg-white/10 backdrop-blur flex items-center justify-center">
              <Wallet size={18} />
            </Link>
            <Link href="/driver/profile" className="w-10 h-10 rounded-full bg-white/10 backdrop-blur flex items-center justify-center font-bold text-base">
              {user.name?.[0]?.toUpperCase()}
            </Link>
          </div>
        </div>

        <div className={`relative rounded-2xl p-4 ${walletBlocked ? 'bg-red-900/60 border border-red-700/50' : 'bg-white/10 backdrop-blur'}`}>
          <p className="text-gray-300 text-xs">Solde wallet</p>
          <p className={`text-3xl font-black mt-0.5 ${walletBlocked ? 'text-red-300' : 'text-white'}`}>
            {formatCDF(wallet?.balance ?? 0)}
          </p>
          {walletBlocked && (
            <p className="text-red-300 text-xs mt-1 flex items-center gap-1">
              <AlertTriangle size={12} /> Wallet bloqué — Rechargez pour reprendre
            </p>
          )}
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-8">
          <svg viewBox="0 0 390 32" preserveAspectRatio="none" className="w-full h-full">
            <path d="M0 32 Q195 0 390 32 L390 32 L0 32 Z" fill="#f0f4f8" />
          </svg>
        </div>
      </div>

      {/* ── Map (active trip) ── */}
      {activeTrip && driverPos && (
        <div className="relative" style={{ height: '220px' }}>
          <TripMap
            pickup={activeTrip.pickup}
            dropoff={activeTrip.dropoff}
            userPos={driverPos}
            route={route}
            sheetHeight={0}
            accentColor="#007DC5"
          />
        </div>
      )}

      <div className="flex-1 px-5 py-5 -mt-2 space-y-4">

        {/* Wallet blocked */}
        {walletBlocked && (
          <div className="card p-4 border-l-4 border-[#CE1126]">
            <p className="font-black text-gray-900 text-sm">Compte bloqué</p>
            <p className="text-gray-500 text-xs mt-0.5">Votre solde est trop bas. Rechargez votre wallet.</p>
            <Link href="/driver/wallet" className="block mt-3 text-center btn-primary btn-red" style={{ padding: '10px' }}>
              Recharger maintenant
            </Link>
          </div>
        )}

        {/* ── Pending trip (InDrive offer UI) ── */}
        {pendingTrip && status === 'online' && !activeTrip && (
          <div className="card p-5 border-2 border-[#007DC5] slide-up">
            {/* Trip header */}
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2.5 h-2.5 bg-[#007DC5] rounded-full ping-slow flex-shrink-0" />
              <h3 className="font-black text-gray-900 flex items-center gap-2">
                <Car size={16} className="text-[#007DC5]" /> Nouvelle course
              </h3>
            </div>

            {/* Route */}
            <div className="space-y-2 text-sm bg-blue-50 p-3 rounded-2xl mb-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-[#007DC5] rounded-full flex-shrink-0" />
                <span className="flex-1 text-gray-700 line-clamp-1">{pendingTrip.pickup?.address}</span>
              </div>
              <div className="ml-1 w-0.5 h-3 bg-blue-200" />
              <div className="flex items-center gap-2">
                <Flag size={14} className="text-gray-400 flex-shrink-0" />
                <span className="flex-1 text-gray-700 line-clamp-1">{pendingTrip.dropoff?.address}</span>
              </div>
            </div>

            {/* Trip meta */}
            <div className="flex gap-2 text-xs text-gray-500 mb-4">
              <span className="bg-gray-100 px-2 py-1 rounded-lg flex items-center gap-1">
                <MapPin size={10} /> {pendingTrip.driverDistance} km de vous
              </span>
              <span className="bg-gray-100 px-2 py-1 rounded-lg">{pendingTrip.distanceKm} km trajet</span>
              <span className="bg-gray-100 px-2 py-1 rounded-lg capitalize">
                {pendingTrip.paymentMethod === 'cash' ? 'Espèces' : 'Mobile'}
              </span>
            </div>

            {/* Offer form or pending state */}
            {offerState === 'idle' ? (
              <OfferForm
                trip={pendingTrip}
                onSubmit={handleSubmitOffer}
                onIgnore={() => { setPendingTrip(null); setOfferState('idle'); }}
                submitting={offerLoading}
              />
            ) : (
              <OfferPending
                trip={pendingTrip}
                offeredFC={offeredFC}
                onCancel={() => setOfferState('idle')}
              />
            )}
          </div>
        )}

        {/* ── Active trip ── */}
        {activeTrip && tripStatus && TRIP_STEPS[tripStatus] && (() => {
          const StepIcon = STEP_ICONS[tripStatus] || Car;
          return (
            <div className="card p-5 border-l-4 border-[#007DC5] slide-up">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <StepIcon size={24} className="text-[#007DC5]" />
                </div>
                <div>
                  <h3 className="font-black text-gray-900">{TRIP_STEPS[tripStatus].label}</h3>
                  <p className="text-gray-400 text-xs">
                    Course #{(activeTrip.tripId || activeTrip.id || '').slice(0, 8)}
                  </p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-xs text-gray-400">Prix convenu</p>
                  <p className="text-lg font-black text-[#007DC5]">
                    {toFC(activeTrip.estimatedFare).toLocaleString()} FC
                  </p>
                </div>
              </div>

              <div className="space-y-2 text-sm bg-gray-50 p-3 rounded-2xl mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-[#007DC5] rounded-full flex-shrink-0" />
                  <span className="text-gray-700">{activeTrip.pickup?.address}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Flag size={14} className="text-gray-400 flex-shrink-0" />
                  <span className="text-gray-700">{activeTrip.dropoff?.address}</span>
                </div>
              </div>

              <button onClick={handleTripAction} disabled={loading} className="btn-primary">
                {loading
                  ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : TRIP_STEPS[tripStatus].action}
              </button>
              <ChatButton
                onOpen={() => { setChatOpen(true); setUnreadCount(0); }}
                accentColor="#007DC5"
                unread={unreadCount}
              />
            </div>
          );
        })()}

        {/* ── Go online button ── */}
        {!activeTrip && (
          <div className="text-center py-4">
            <button
              onClick={toggleOnline}
              disabled={walletBlocked}
              className={`relative w-40 h-40 rounded-full font-black text-white text-lg shadow-2xl transition-all active:scale-95 disabled:opacity-50 ${
                status === 'online'
                  ? 'bg-gradient-to-br from-green-400 to-green-600 shadow-green-200'
                  : 'bg-gradient-to-br from-gray-400 to-gray-600 shadow-gray-200'
              }`}
            >
              {status === 'online' && (
                <div className="absolute inset-0 rounded-full bg-green-400/30 ping-slow" />
              )}
              <span className="relative z-10 flex flex-col items-center gap-2">
                <Car size={28} />
                <span className="text-sm font-black">{status === 'online' ? 'EN LIGNE' : 'HORS LIGNE'}</span>
              </span>
            </button>
            <p className="text-gray-400 text-sm mt-4">
              {status === 'online'
                ? 'Appuyez pour vous déconnecter'
                : 'Appuyez pour commencer à recevoir des courses'}
            </p>
          </div>
        )}

        {/* ── Stats ── */}
        {!activeTrip && (
          <div className="grid grid-cols-2 gap-3">
            <div className="card p-4">
              <p className="text-gray-400 text-xs">Gains totaux</p>
              <p className="text-2xl font-black text-gray-900 mt-1">{formatCDF(wallet?.total_earned ?? 0)}</p>
            </div>
            <Link href="/driver/history" className="card p-4 flex flex-col justify-between">
              <p className="text-gray-400 text-xs">Historique</p>
              <p className="text-[#007DC5] font-black text-sm mt-1 flex items-center gap-1">
                Voir les courses <ChevronRight size={14} />
              </p>
            </Link>
          </div>
        )}
      </div>

      <ChatModal
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        referenceId={activeTrip?.tripId || activeTrip?.id}
        referenceType="trip"
        toUserId={activeTrip?.clientId}
        currentUserId={user?.id}
        accentColor="#007DC5"
      />

      {/* ── Bottom nav ── */}
      <nav className="bottom-nav px-6 pt-3 pb-safe flex justify-around">
        <button className="flex flex-col items-center gap-1">
          <div className="w-8 h-8 rounded-xl bg-[#007DC5] flex items-center justify-center">
            <Car size={18} className="text-white" />
          </div>
          <span className="text-[10px] font-bold text-[#007DC5]">Accueil</span>
        </button>
        <Link href="/driver/history" className="flex flex-col items-center gap-1">
          <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center">
            <Clock size={18} className="text-gray-500" />
          </div>
          <span className="text-[10px] text-gray-400 font-medium">Courses</span>
        </Link>
        <Link href="/driver/wallet" className="flex flex-col items-center gap-1">
          <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center">
            <Wallet size={18} className="text-gray-500" />
          </div>
          <span className="text-[10px] text-gray-400 font-medium">Portefeuille</span>
        </Link>
        <Link href="/driver/profile" className="flex flex-col items-center gap-1">
          <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center">
            <User size={18} className="text-gray-500" />
          </div>
          <span className="text-[10px] text-gray-400 font-medium">Profil</span>
        </Link>
      </nav>
    </div>
  );
}
