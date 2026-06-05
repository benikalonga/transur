'use client';
import { completeDelivery, getDeliveryHistory, getWallet, pickupDelivery, setDriverStatus, submitDeliveryOffer } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { AlertTriangle, Bike, Clock, Flag, Loader2, MapPin, Package, User, Wallet, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import formatCDF from '@/lib/currency';
import dynamic from 'next/dynamic';
import ChatModal, { ChatButton } from '@/components/ChatModal';
const TripMap = dynamic(() => import('@/components/TripMap'), { ssr: false });

const DELIVERY_STEPS = {
  accepted: { label: 'Aller chercher le colis',        action: 'Colis récupéré ✓',      icon: <Bike size={24} /> },
  pickup:   { label: 'En route vers le destinataire',  action: 'Livraison effectuée ✓',  icon: <Package size={24} /> },
};

const TRANSPORT_ICONS = { moto: '🏍️', velo: '🚲', pied: '🚶' };

const USD_TO_CDF = 2800;
const STEP_FC    = 200;
const snapFC     = (fc) => Math.round(fc / STEP_FC) * STEP_FC;
const toFC       = (usd) => snapFC(Math.round((usd ?? 0) * USD_TO_CDF));
const toUSD      = (fc)  => fc / USD_TO_CDF;

// ─── Delivery Offer Form ──────────────────────────────────────────────────────
function OfferForm({ delivery, onSubmit, onIgnore, submitting }) {
  const clientFC = toFC(delivery.clientPrice ?? delivery.estimatedFare);
  const recFC    = toFC(delivery.recommendedPrice ?? delivery.estimatedFare);
  const minFC    = toFC(delivery.minPrice ?? 0);
  const midFC    = snapFC(Math.round((clientFC + recFC) / 2 / STEP_FC) * STEP_FC);

  const presets = [...new Set([clientFC, midFC, recFC])];

  const [selectedFC, setSelectedFC] = useState(clientFC);
  const [inputVal, setInputVal]     = useState(String(clientFC));

  const handlePreset = (fc) => { setSelectedFC(fc); setInputVal(String(fc)); };
  const handleInput  = (v)  => {
    setInputVal(v);
    const n = parseInt(v, 10);
    if (!isNaN(n)) setSelectedFC(snapFC(n));
  };

  const belowMin = selectedFC < minFC;

  return (
    <div className="space-y-4">
      {/* Price comparison */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-red-50 rounded-2xl p-3 text-center">
          <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-0.5">Prix client</p>
          <p className="text-lg font-black text-[#CE1126]">{clientFC.toLocaleString()} FC</p>
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
                  ? 'bg-[#CE1126] text-white border-[#CE1126]'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-[#CE1126]'
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
            className="w-full border-2 border-gray-200 rounded-2xl px-4 py-3 text-lg font-bold text-gray-900 focus:outline-none focus:border-[#CE1126] pr-14"
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
          className="btn-primary btn-red flex-1 flex items-center justify-center gap-2"
          style={{ padding: '12px' }}
        >
          {submitting ? <Loader2 size={16} className="animate-spin" /> : 'Faire mon offre'}
        </button>
      </div>
    </div>
  );
}

// ─── Offer Submitted State ─────────────────────────────────────────────────────
function OfferPending({ offeredFC, onCancel }) {
  return (
    <div className="space-y-4 text-center">
      <div className="flex flex-col items-center gap-3 py-4">
        <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center">
          <Loader2 size={28} className="text-[#CE1126] animate-spin" />
        </div>
        <div>
          <p className="font-black text-gray-900">Offre envoyée !</p>
          <p className="text-gray-500 text-sm">En attente de la réponse du client…</p>
        </div>
      </div>

      <div className="bg-red-50 rounded-2xl p-4">
        <p className="text-xs text-gray-500 mb-1">Votre offre</p>
        <p className="text-3xl font-black text-[#CE1126]">{offeredFC.toLocaleString()} FC</p>
      </div>

      <button onClick={onCancel} className="btn-outline w-full" style={{ padding: '12px' }}>
        Annuler l'offre
      </button>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function DeliveryDashboard() {
  const router = useRouter();
  const socketRef    = useRef(null);
  const locationRef  = useRef(null);
  const keepaliveRef = useRef(null);
  const [user, setUser] = useState(null);
  const [greeting, setGreeting] = useState('');
  const [status, setStatus] = useState('offline');
  const [wallet, setWallet] = useState(null);
  const [pendingDelivery, setPendingDelivery] = useState(null);
  const [activeDelivery, setActiveDelivery] = useState(null);
  const [deliveryStatus, setDeliveryStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [agentPos, setAgentPos] = useState(null);
  const [route, setRoute] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // InDrive offer state
  const [offerState, setOfferState]     = useState('idle');   // 'idle' | 'submitted'
  const [offeredFC, setOfferedFC]       = useState(0);
  const [offerLoading, setOfferLoading] = useState(false);

  // ── Restore active delivery on mount (handles page reloads) ──────────────────
  useEffect(() => {
    const ACTIVE = ['accepted', 'pickup'];
    getDeliveryHistory(1).then(({ data }) => {
      const d = data.deliveries?.[0];
      if (!d || !ACTIVE.includes(d.status) || !d.agent_id) return;
      setActiveDelivery({
        id:           d.id,
        deliveryId:   d.id,
        clientId:     d.client_id,
        pickup:  { address: d.pickup_address,  lat: parseFloat(d.pickup_lat),  lng: parseFloat(d.pickup_lng)  },
        dropoff: { address: d.dropoff_address, lat: parseFloat(d.dropoff_lat), lng: parseFloat(d.dropoff_lng) },
        estimatedFare: parseFloat(d.final_agreed_price ?? d.estimated_fare),
        paymentMethod: d.payment_method,
      });
      setDeliveryStatus(d.status);
      setStatus('busy');
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem('transur_user');
    if (!stored) return router.replace('/auth/login');
    const u = JSON.parse(stored);
    if (u.role !== 'delivery') return router.replace('/auth/login');
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

    socket.on('new_delivery_request', (delivery) => {
      setPendingDelivery(delivery);
      setOfferState('idle');
      toast('Nouvelle livraison disponible !', { icon: '📦', duration: 30000 });
    });

    socket.on('delivery_taken', ({ deliveryId }) => {
      if (pendingDelivery?.deliveryId === deliveryId) {
        setPendingDelivery(null);
        setOfferState('idle');
        toast('Cette livraison a été prise.');
      }
    });

    // Client accepted our offer
    socket.on('delivery_offer_accepted', ({ deliveryId, finalPrice, clientId, pickup, dropoff, paymentMethod, distanceKm }) => {
      toast.success(`Offre acceptée ! ${toFC(finalPrice).toLocaleString()} FC`);
      setActiveDelivery({
        id:           deliveryId,
        deliveryId,
        clientId,
        pickup,
        dropoff,
        estimatedFare: finalPrice,
        paymentMethod,
        distanceKm,
      });
      setDeliveryStatus('accepted');
      setStatus('busy');
      localStorage.setItem('transur_driver_online', '1');
      setPendingDelivery(null);
      setOfferState('idle');
    });

    // Client chose another agent
    socket.on('delivery_offer_declined', ({ deliveryId }) => {
      if (pendingDelivery?.deliveryId === deliveryId) {
        toast('Le client a choisi un autre livreur.', { icon: '😕' });
        setOfferState('idle');
        setPendingDelivery(null);
      }
    });

    // Delivery cancelled while offer was pending
    socket.on('delivery_cancelled', ({ deliveryId }) => {
      if (pendingDelivery?.deliveryId === deliveryId) {
        toast('La livraison a été annulée par le client.', { icon: '❌' });
        setPendingDelivery(null);
        setOfferState('idle');
      }
    });

    socket.on('status_updated', ({ status: s }) => setStatus(s));

    socket.on('message', () => {
      if (!chatOpen) setUnreadCount(c => c + 1);
    });

    return () => {
      socket.off('new_delivery_request');
      socket.off('delivery_taken');
      socket.off('delivery_offer_accepted');
      socket.off('delivery_offer_declined');
      socket.off('delivery_cancelled');
      socket.off('status_updated');
      socket.off('message');
    };
  }, [router, pendingDelivery, chatOpen]);

  const toggleOnline = async () => {
    const newStatus = status === 'offline' ? 'online' : 'offline';
    try {
      await setDriverStatus(newStatus);
      setStatus(newStatus);
      localStorage.setItem('transur_driver_online', newStatus === 'online' ? '1' : '0');
      socketRef.current?.emit('set_status', { status: newStatus });
      if (newStatus === 'online') { startLocationTracking(); toast.success('Vous êtes disponible'); }
      else { stopLocationTracking(); toast('Vous êtes hors ligne'); }
    } catch { toast.error('Erreur'); }
  };

  const sendLocation = (lat, lng) => {
    socketRef.current?.emit('location_update', { latitude: lat, longitude: lng });
    setAgentPos({ lat, lng });
  };

  const startLocationTracking = () => {
    const fallback = { lat: -11.6609, lng: 27.4794 };
    if (!navigator.geolocation) { sendLocation(fallback.lat, fallback.lng); return; }

    const onPos = (pos) => sendLocation(pos.coords.latitude, pos.coords.longitude);
    const onErr = ()    => sendLocation(fallback.lat, fallback.lng);

    navigator.geolocation.getCurrentPosition(onPos, onErr, { enableHighAccuracy: true, timeout: 8000 });
    locationRef.current = navigator.geolocation.watchPosition(onPos, onErr, {
      enableHighAccuracy: true, timeout: 10000, maximumAge: 5000,
    });

    // Keepalive: re-ping GPS every 5 min so the DB record never goes stale
    clearInterval(keepaliveRef.current);
    keepaliveRef.current = setInterval(() => {
      navigator.geolocation.getCurrentPosition(onPos, onErr, {
        enableHighAccuracy: false, timeout: 5000, maximumAge: 60000,
      });
    }, 5 * 60 * 1000);
  };

  const stopLocationTracking = () => {
    if (locationRef.current) { navigator.geolocation.clearWatch(locationRef.current); locationRef.current = null; }
    clearInterval(keepaliveRef.current);
    keepaliveRef.current = null;
  };

  async function fetchRoute(from, to) {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.routes?.[0]) return data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    } catch {}
    return null;
  }

  // Fetch route when delivery becomes active
  useEffect(() => {
    if (activeDelivery && agentPos) {
      const target = deliveryStatus === 'pickup'
        ? { lat: activeDelivery.dropoff?.lat, lng: activeDelivery.dropoff?.lng }
        : { lat: activeDelivery.pickup?.lat,  lng: activeDelivery.pickup?.lng  };
      if (target.lat) fetchRoute(agentPos, target).then(setRoute);
    } else {
      setRoute(null);
    }
  }, [activeDelivery, deliveryStatus, agentPos]);

  // ── Offer submission ───────────────────────────────────────────────────────
  const handleSubmitOffer = async (priceUSD) => {
    if (!pendingDelivery) return;
    setOfferLoading(true);
    try {
      await submitDeliveryOffer(pendingDelivery.deliveryId, priceUSD);
      setOfferedFC(toFC(priceUSD));
      setOfferState('submitted');
      toast.success('Offre envoyée au client !');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur lors de l\'envoi');
    } finally {
      setOfferLoading(false);
    }
  };

  const handleAction = async () => {
    if (!activeDelivery) return;
    setLoading(true);
    try {
      const id = activeDelivery.deliveryId || activeDelivery.id;
      if (deliveryStatus === 'accepted') {
        await pickupDelivery(id);
        setDeliveryStatus('pickup');
        toast.success('Colis récupéré !');
      } else if (deliveryStatus === 'pickup') {
        await completeDelivery(id);
        toast.success('Livraison effectuée !');
        setActiveDelivery(null);
        setDeliveryStatus(null);
        setStatus('online');
        localStorage.setItem('transur_driver_online', '1');
        getWallet().then((r) => setWallet(r.data.wallet)).catch(() => {});
      }
    } catch (err) { toast.error(err.response?.data?.error || 'Erreur'); }
    finally { setLoading(false); }
  };

  if (!user) return null;

  const walletBlocked = !!wallet?.is_blocked;
  const transportIcon = TRANSPORT_ICONS[user.transport_type] || '🛵';

  return (
    <div className="min-h-screen bg-[#f0f4f8] flex flex-col">

      {/* ── Header ── */}
      <div className="header-red relative px-6 pt-14 pb-24 text-white overflow-hidden">
        <div className="absolute -top-10 -right-10 w-44 h-44 rounded-full bg-white/5" />
        <div className="absolute bottom-4 left-6 w-20 h-20 rounded-full bg-white/5" />

        <div className="relative flex items-center justify-between mb-3">
          <div>
            <p className="text-red-200 text-sm">{greeting} 👋</p>
            <h1 className="text-2xl font-black mt-0.5">{user.name}</h1>
            <p className="text-red-100 text-xs mt-0.5">{transportIcon} Livreur</p>
          </div>
          <div className="flex gap-2">
            <Link href="/delivery/wallet" className="w-10 h-10 rounded-full bg-white/15 backdrop-blur flex items-center justify-center text-lg">
              <Wallet size={18} className="text-white" />
            </Link>
            <Link href="/delivery/profile" className="w-10 h-10 rounded-full bg-white/15 backdrop-blur flex items-center justify-center font-bold text-base">
              {user.name?.[0]?.toUpperCase()}
            </Link>
          </div>
        </div>

        {/* Wallet */}
        <div className={`relative rounded-2xl p-4 ${walletBlocked ? 'bg-red-900/60 border border-red-700/50' : 'bg-white/15 backdrop-blur'}`}>
          <p className="text-red-200 text-xs">Solde wallet</p>
          <p className={`text-3xl font-black mt-0.5 ${walletBlocked ? 'text-red-300' : 'text-white'}`}>
            {formatCDF(wallet?.balance ?? 0)}
          </p>
          {walletBlocked && (
            <p className="text-red-300 text-xs mt-1 flex items-center gap-1">
              <AlertTriangle size={12} /> Rechargez pour continuer
            </p>
          )}
        </div>

        {/* Wave */}
        <div className="absolute bottom-0 left-0 right-0 h-8">
          <svg viewBox="0 0 390 32" preserveAspectRatio="none" className="w-full h-full">
            <path d="M0 32 Q195 0 390 32 L390 32 L0 32 Z" fill="#f0f4f8"/>
          </svg>
        </div>
      </div>

      {/* ── Map (active delivery) ── */}
      {activeDelivery && agentPos && (
        <div className="relative" style={{ height: '220px' }}>
          <TripMap
            pickup={activeDelivery.pickup}
            dropoff={activeDelivery.dropoff}
            userPos={agentPos}
            route={route}
            sheetHeight={0}
            accentColor="#CE1126"
          />
        </div>
      )}

      <div className="flex-1 px-5 py-5 -mt-2 space-y-4">

        {/* Wallet blocked */}
        {walletBlocked && (
          <Link href="/delivery/wallet" className="card p-4 border-l-4 border-[#CE1126] block">
            <p className="font-black text-gray-900 text-sm">Wallet bloqué</p>
            <p className="text-[#CE1126] font-semibold text-sm mt-1">Recharger maintenant →</p>
          </Link>
        )}

        {/* ── Pending delivery (InDrive offer UI) ── */}
        {pendingDelivery && status === 'online' && !activeDelivery && (
          <div className="card p-5 border-2 border-[#CE1126] slide-up">
            {/* Header */}
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2.5 h-2.5 bg-[#CE1126] rounded-full ping-slow flex-shrink-0" />
              <h3 className="font-black text-gray-900 flex-1 flex items-center gap-1.5">
                <Package size={16} className="text-[#CE1126]" /> Nouvelle livraison !
              </h3>
            </div>

            {/* Route */}
            <div className="space-y-2 text-sm bg-red-50 p-3 rounded-2xl mb-3">
              <div className="flex items-start gap-2">
                <MapPin size={14} className="text-[#CE1126] flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] text-gray-400 uppercase font-semibold">Récupérer chez</p>
                  <p className="text-gray-700">{pendingDelivery.pickup?.address}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Flag size={14} className="text-[#CE1126] flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] text-gray-400 uppercase font-semibold">Livrer à</p>
                  <p className="text-gray-700">{pendingDelivery.dropoff?.address}</p>
                </div>
              </div>
            </div>

            {/* Meta */}
            <div className="flex gap-2 text-xs text-gray-500 mb-4">
              <span className="bg-gray-100 px-2 py-1 rounded-lg flex items-center gap-1"><MapPin size={11} /> {pendingDelivery.agentDistance} km</span>
              <span className="bg-gray-100 px-2 py-1 rounded-lg">📏 {pendingDelivery.distanceKm} km trajet</span>
              <span className="bg-gray-100 px-2 py-1 rounded-lg flex items-center gap-1 capitalize"><Package size={11} /> {pendingDelivery.packageSize}</span>
            </div>

            {/* Offer form or pending state */}
            {offerState === 'idle' ? (
              <OfferForm
                delivery={pendingDelivery}
                onSubmit={handleSubmitOffer}
                onIgnore={() => { setPendingDelivery(null); setOfferState('idle'); }}
                submitting={offerLoading}
              />
            ) : (
              <OfferPending
                offeredFC={offeredFC}
                onCancel={() => setOfferState('idle')}
              />
            )}
          </div>
        )}

        {/* ── Active delivery ── */}
        {activeDelivery && deliveryStatus && DELIVERY_STEPS[deliveryStatus] && (
          <div className="card p-5 border-l-4 border-[#CE1126] slide-up">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center flex-shrink-0 text-[#CE1126]">
                {DELIVERY_STEPS[deliveryStatus].icon}
              </div>
              <div>
                <h3 className="font-black text-gray-900">{DELIVERY_STEPS[deliveryStatus].label}</h3>
                <p className="text-gray-400 text-xs">
                  Livraison #{(activeDelivery.deliveryId || activeDelivery.id || '').slice(0, 8)}
                </p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-xs text-gray-400">Prix convenu</p>
                <p className="text-lg font-black text-[#CE1126]">
                  {toFC(activeDelivery.estimatedFare).toLocaleString()} FC
                </p>
              </div>
            </div>

            <div className="space-y-2 text-sm bg-gray-50 p-3 rounded-2xl mb-4">
              <div className="flex items-center gap-2">
                <Package size={14} className="text-[#CE1126] flex-shrink-0" />
                <span className="text-gray-700">{activeDelivery.pickup?.address}</span>
              </div>
              <div className="flex items-center gap-2">
                <Flag size={14} className="text-[#CE1126] flex-shrink-0" />
                <span className="text-gray-700">{activeDelivery.dropoff?.address}</span>
              </div>
            </div>

            <button onClick={handleAction} disabled={loading} className="btn-primary btn-red">
              {loading
                ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : DELIVERY_STEPS[deliveryStatus].action}
            </button>
            <ChatButton
              onOpen={() => { setChatOpen(true); setUnreadCount(0); }}
              accentColor="#CE1126"
              unread={unreadCount}
            />
          </div>
        )}

        {/* ── Toggle online ── */}
        {!activeDelivery && (
          <div className="text-center py-4">
            <button
              onClick={toggleOnline}
              disabled={walletBlocked}
              className={`relative w-40 h-40 rounded-full font-black text-white text-lg shadow-2xl transition-all active:scale-95 disabled:opacity-50 ${
                status === 'online'
                  ? 'bg-gradient-to-br from-[#CE1126] to-[#a50e1e] shadow-red-200'
                  : 'bg-gradient-to-br from-gray-400 to-gray-600 shadow-gray-200'
              }`}
            >
              {status === 'online' && <div className="absolute inset-0 rounded-full bg-[#CE1126]/30 ping-slow" />}
              <span className="relative z-10 flex flex-col items-center gap-1">
                <Package size={28} className="text-white" />
                <span className="text-sm font-black">{status === 'online' ? 'DISPONIBLE' : 'HORS LIGNE'}</span>
              </span>
            </button>
            <p className="text-gray-400 text-sm mt-4">
              {status === 'online' ? 'Appuyez pour vous déconnecter' : 'Appuyez pour recevoir des livraisons'}
            </p>
          </div>
        )}

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 gap-3">
          <div className="card p-4">
            <p className="text-gray-400 text-xs">Total gagné</p>
            <p className="text-2xl font-black text-gray-900 mt-1">{formatCDF(wallet?.total_earned ?? 0)}</p>
          </div>
          <Link href="/delivery/history" className="card p-4 flex flex-col justify-between">
            <p className="text-gray-400 text-xs">Historique</p>
            <p className="text-[#CE1126] font-black text-sm mt-1">Voir livraisons →</p>
          </Link>
        </div>
      </div>

      <ChatModal
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        referenceId={activeDelivery?.deliveryId || activeDelivery?.id}
        referenceType="delivery"
        toUserId={activeDelivery?.clientId}
        currentUserId={user?.id}
        accentColor="#CE1126"
      />

      {/* ── Bottom nav ── */}
      <nav className="bottom-nav px-6 pt-3 pb-safe flex justify-around">
        <button className="flex flex-col items-center gap-1">
          <div className="w-8 h-8 rounded-xl bg-[#CE1126] flex items-center justify-center">
            <Package size={18} className="text-white" />
          </div>
          <span className="text-[10px] font-bold text-[#CE1126]">Accueil</span>
        </button>
        <Link href="/delivery/history" className="flex flex-col items-center gap-1">
          <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center">
            <Clock size={18} className="text-gray-500" />
          </div>
          <span className="text-[10px] text-gray-400 font-medium">Livraisons</span>
        </Link>
        <Link href="/delivery/wallet" className="flex flex-col items-center gap-1">
          <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center">
            <Wallet size={18} className="text-gray-500" />
          </div>
          <span className="text-[10px] text-gray-400 font-medium">Portefeuille</span>
        </Link>
        <Link href="/delivery/profile" className="flex flex-col items-center gap-1">
          <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center">
            <User size={18} className="text-gray-500" />
          </div>
          <span className="text-[10px] text-gray-400 font-medium">Profil</span>
        </Link>
      </nav>
    </div>
  );
}
