'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  estimateDelivery, requestDelivery, cancelDelivery, getDeliveryHistory,
  acceptDeliveryOffer,
} from '@/lib/api';
import { getSocket } from '@/lib/socket';
import LocationInput from '@/components/LocationInput';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Navigation, Banknote, Smartphone, Radio, CheckCircle, XCircle,
  Package, Flag, ChevronDown, ChevronUp, Info, Mail, MessageCircle, Minus, Plus, Tag,
} from 'lucide-react';
import formatCDF, { abbreviateCDF, toCDF, USD_TO_CDF } from '@/lib/currency';
import ChatModal, { ChatButton } from '@/components/ChatModal';

const TripMap = dynamic(() => import('@/components/TripMap'), { ssr: false });
const MapPickerModal = dynamic(() => import('@/components/MapPickerModal'), { ssr: false });

const LBH = { lat: -11.6609, lng: 27.4794 };

const PAYMENT = [
  { id: 'cash',         label: 'Cash',   icon: <Banknote size={14} /> },
  { id: 'mpesa',        label: 'M-Pesa', icon: <Smartphone size={14} /> },
  { id: 'airtel_money', label: 'Airtel', icon: <Radio size={14} /> },
  { id: 'orange_money', label: 'Orange', icon: '🟠' },
];

const SIZES = [
  { id: 'small',  icon: <Mail size={20} />,    label: 'Petit',  sub: 'Repas, doc' },
  { id: 'medium', icon: <Package size={20} />, label: 'Moyen',  sub: 'Sac, carton' },
  { id: 'large',  icon: <Package size={20} />, label: 'Grand',  sub: 'Valise, colis lourd' },
];

const TRANSPORT_ICONS = { moto: '🏍️', velo: '🚲', pied: '🚶', voiture: '🚗' };

const STEP_FC = 200;
const snapFC  = (fc) => Math.round(fc / STEP_FC) * STEP_FC;

async function fetchRoute(from, to) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const res  = await fetch(url);
    const data = await res.json();
    if (data.routes?.[0]) return data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  } catch {}
  return null;
}

// ─── Price Picker ─────────────────────────────────────────────────────────────
function PricePicker({ recommendedUSD, minUSD, value, onChange }) {
  const minFC   = snapFC(Math.ceil(minUSD * USD_TO_CDF / STEP_FC) * STEP_FC);
  const recFC   = snapFC(Math.round(recommendedUSD * USD_TO_CDF));
  const maxFC   = snapFC(recFC * 1.5);
  const valueFC = snapFC(Math.round(value * USD_TO_CDF));

  const set = (fc) => onChange(Math.max(minFC, Math.min(maxFC, snapFC(fc))) / USD_TO_CDF);

  const presets = (() => {
    const mid = snapFC(Math.round((minFC + recFC) / 2));
    return [
      { key: 'min', label: 'Minimum',   fc: minFC },
      { key: 'mid', label: 'Moyen',     fc: mid === minFC || mid === recFC ? Math.round((minFC + recFC) / 2 / STEP_FC) * STEP_FC : mid },
      { key: 'rec', label: 'Conseillé', fc: recFC },
    ].filter((p, i, arr) => arr.findIndex(x => x.fc === p.fc) === i);
  })();

  const belowMin = valueFC < minFC;

  return (
    <div className="bg-gray-50 rounded-2xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-gray-700">Votre offre de prix</span>
        <span className="text-xs text-gray-400 bg-white px-2 py-0.5 rounded-full border border-gray-200">
          Conseillé : {recFC.toLocaleString('fr-FR')} FC
        </span>
      </div>

      <div className="flex items-center justify-between gap-3 mb-3">
        <button
          type="button"
          onClick={() => set(valueFC - STEP_FC)}
          disabled={valueFC <= minFC}
          className="w-11 h-11 rounded-2xl border-2 border-gray-200 bg-white flex items-center justify-center font-bold text-gray-600 disabled:opacity-30 active:scale-95 transition-transform"
        >
          <Minus size={18} />
        </button>

        <div className="flex-1 text-center">
          <div className={`text-3xl font-black tracking-tight ${belowMin ? 'text-red-500' : 'text-gray-900'}`}>
            {valueFC.toLocaleString('fr-FR')} FC
          </div>
          {belowMin && (
            <p className="text-red-500 text-xs mt-0.5 font-semibold">
              Minimum : {minFC.toLocaleString('fr-FR')} FC
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => set(valueFC + STEP_FC)}
          disabled={valueFC >= maxFC}
          className="w-11 h-11 rounded-2xl border-2 border-gray-200 bg-white flex items-center justify-center font-bold text-gray-600 disabled:opacity-30 active:scale-95 transition-transform"
        >
          <Plus size={18} />
        </button>
      </div>

      <input
        type="range"
        min={minFC}
        max={maxFC}
        step={STEP_FC}
        value={valueFC}
        onChange={(e) => set(parseInt(e.target.value))}
        className="w-full h-2 rounded-full mb-3 cursor-pointer accent-[#CE1126]"
      />

      <div className="flex gap-2">
        {presets.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => set(p.fc)}
            className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 transition-all active:scale-95 ${
              valueFC === p.fc
                ? 'bg-[#CE1126] text-white border-[#CE1126]'
                : 'bg-white text-gray-600 border-gray-200'
            }`}
          >
            <div>{p.label}</div>
            <div className={`text-[10px] mt-0.5 ${valueFC === p.fc ? 'text-white/80' : 'text-gray-400'}`}>
              {p.fc.toLocaleString('fr-FR')} FC
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Agent Offer Card ─────────────────────────────────────────────────────────
function AgentOfferCard({ offer, recommendedUSD, onAccept, accepting }) {
  const priceFC = toCDF(offer.offeredPrice);
  const recFC   = toCDF(recommendedUSD);
  const diffFC  = priceFC - recFC;
  const absDiff = Math.abs(diffFC);
  const diffLabel = diffFC === 0 ? 'Tarif conseillé'
    : diffFC < 0 ? `-${absDiff.toLocaleString('fr-FR')} FC`
    : `+${absDiff.toLocaleString('fr-FR')} FC`;

  return (
    <div className="bg-white border-2 border-gray-100 rounded-2xl p-4 flex items-center gap-3 mb-3 shadow-sm">
      <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center flex-shrink-0 overflow-hidden font-black text-[#CE1126] text-lg">
        {offer.agent?.photo_url
          ? <img src={offer.agent.photo_url} alt={offer.agent.name} className="w-full h-full object-cover" />
          : (offer.agent?.name?.[0] || '?')
        }
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-bold text-gray-900 text-sm truncate">{offer.agent?.name}</p>
        <p className="text-xs text-gray-400">
          ★ {Number(offer.agent?.rating || 5).toFixed(1)}
          {offer.agent?.transport_type ? ` · ${TRANSPORT_ICONS[offer.agent.transport_type] || '🛵'} ${offer.agent.transport_type}` : ''}
        </p>
        <span className={`inline-block mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
          diffFC <= 0 ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'
        }`}>
          {diffLabel}
        </span>
      </div>

      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
        <span className="text-lg font-black text-gray-900">{priceFC.toLocaleString('fr-FR')} FC</span>
        <button
          onClick={() => onAccept(offer.offerId)}
          disabled={accepting}
          className="bg-[#CE1126] text-white text-xs font-black px-4 py-2 rounded-xl active:scale-95 transition-transform disabled:opacity-50"
        >
          {accepting ? '…' : 'Accepter'}
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DeliveryClientPage() {
  const router     = useRouter();
  const socketRef  = useRef(null);
  const dropRef    = useRef(null);

  const [step,           setStep]           = useState('input');
  const [mapPicker,      setMapPicker]      = useState(null); // 'pickup' | 'dropoff' | null
  const [userPos,        setUserPos]        = useState(null);
  const [pickup,         setPickup]         = useState(null);
  const [dropoff,        setDropoff]        = useState(null);
  const [packageSize,    setPackageSize]    = useState('small');
  const [payment,        setPayment]        = useState('cash');
  const [showExtra,      setShowExtra]      = useState(false);
  const [extra,          setExtra]          = useState({ pickupContact: '', pickupPhone: '', recipientName: '', recipientPhone: '', description: '', instructions: '' });
  const [route,          setRoute]          = useState(null);
  const [estimate,       setEstimate]       = useState(null);
  const [offeredPrice,   setOfferedPrice]   = useState(null);   // USD
  const [recommendedPrice, setRecommendedPrice] = useState(null);
  const [minPrice,       setMinPrice]       = useState(null);
  const [activeDelivery, setActiveDelivery] = useState(null);
  const [agent,          setAgent]          = useState(null);
  const [deliveryOffers, setDeliveryOffers] = useState([]);
  const [accepting,      setAccepting]      = useState(false);
  const [loading,        setLoading]        = useState(false);
  const [geoLoading,     setGeoLoading]     = useState(false);
  const [chatOpen,       setChatOpen]       = useState(false);
  const [unreadCount,    setUnreadCount]    = useState(0);
  const [userId,         setUserId]         = useState(null);

  // Read userId from localStorage
  useEffect(() => {
    const u = JSON.parse(localStorage.getItem('transur_user') || '{}');
    setUserId(u.id);
  }, []);

  // ── Page-reload state recovery ──────────────────────────────────────────────
  useEffect(() => {
    const ACTIVE = ['broadcast', 'accepted', 'pickup'];
    getDeliveryHistory(1).then(({ data }) => {
      const d = data.deliveries?.[0];
      if (!d || !ACTIVE.includes(d.status)) return;
      setActiveDelivery(d);
      if (d.status === 'broadcast') {
        setStep('searching');
      } else {
        if (d.agent_id) {
          setAgent({
            id:             d.agent_id,
            name:           d.agent_name,
            photo_url:      d.agent_photo,
            transport_type: d.transport_type,
            rating:         d.agent_rating,
          });
        }
        setStep(d.status === 'pickup' ? 'ongoing' : 'accepted');
      }
    }).catch(() => {});
  }, []);

  // ── Geolocation + socket setup ──────────────────────────────────────────────
  useEffect(() => {
    if (navigator.geolocation) {
      setGeoLoading(true);
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          const p = { lat: coords.latitude, lng: coords.longitude };
          setUserPos(p); setGeoLoading(false);
        },
        () => { setUserPos(LBH); setGeoLoading(false); },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }

    const socket = getSocket();
    if (!socket) return;
    socketRef.current = socket;

    // Incoming agent offer
    socket.on('delivery_offer', (offer) => {
      setDeliveryOffers((prev) => {
        const exists = prev.find((o) => o.offerId === offer.offerId);
        if (exists) return prev.map((o) => o.offerId === offer.offerId ? offer : o);
        return [offer, ...prev];
      });
      toast('Offre reçue d\'un livreur 📦', { duration: 4000 });
    });

    socket.on('delivery_accepted', ({ agent: a, deliveryId }) => {
      setAgent(a);
      setActiveDelivery(prev => ({ ...prev, id: prev?.id || deliveryId, agentId: a.id }));
      setDeliveryOffers([]);
      setStep('accepted');
      toast.success(`${a.name} est en route !`);
    });
    socket.on('delivery_picked_up', () => { setStep('ongoing'); toast('📦 Colis récupéré !'); });
    socket.on('delivery_completed', ({ fare }) => { toast.success(`Livraison effectuée — ${formatCDF(fare)}`); router.push('/client'); });
    socket.on('delivery_cancelled', ({ reason }) => {
      toast.error(reason || 'Livraison annulée');
      setStep('input'); setActiveDelivery(null); setDeliveryOffers([]);
    });
    socket.on('message', () => {
      if (!chatOpen) setUnreadCount(c => c + 1);
    });

    // Listen for agents coming online — re-fetch estimate to update agent count
    socket.on('provider_online', ({ role }) => {
      if (role === 'delivery' && step === 'confirm' && pickup && dropoff) {
        estimateDelivery({
          pickup_lat: pickup.lat, pickup_lng: pickup.lng,
          dropoff_lat: dropoff.lat, dropoff_lng: dropoff.lng,
        }).then(({ data }) => {
          setEstimate(prev => ({ ...prev, agents_available: data.agents_available }));
        }).catch(() => {});
      }
    });

    return () => {
      socket.off('delivery_offer');
      socket.off('delivery_accepted');
      socket.off('delivery_picked_up');
      socket.off('delivery_completed');
      socket.off('delivery_cancelled');
      socket.off('message');
      socket.off('provider_online');
    };
  }, [router, chatOpen, step, pickup, dropoff]);

  // Set default offered price when estimate is ready
  useEffect(() => {
    if (estimate) {
      setRecommendedPrice(estimate.recommended_price ?? estimate.estimated_fare);
      setMinPrice(estimate.min_price ?? estimate.estimated_fare * 0.5);
      setOfferedPrice(estimate.estimated_fare);
    }
  }, [estimate?.estimated_fare]);

  // ── Draw route ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (pickup && dropoff) fetchRoute(pickup, dropoff).then(setRoute);
    else setRoute(null);
  }, [pickup, dropoff]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleEstimate = async () => {
    if (!pickup || !dropoff) return toast.error('Saisissez les deux adresses');
    setLoading(true);
    try {
      const { data } = await estimateDelivery({
        pickup_lat:  pickup.lat,  pickup_lng:  pickup.lng,
        dropoff_lat: dropoff.lat, dropoff_lng: dropoff.lng,
      });
      setEstimate(data);
      setStep('confirm');
    } catch { toast.error('Impossible d\'estimer la livraison'); }
    finally { setLoading(false); }
  };

  const handleRequest = async () => {
    setLoading(true);
    try {
      const { data } = await requestDelivery({
        pickup_address: pickup.address, pickup_lat: pickup.lat, pickup_lng: pickup.lng,
        pickup_contact_name: extra.pickupContact, pickup_contact_phone: extra.pickupPhone,
        dropoff_address: dropoff.address, dropoff_lat: dropoff.lat, dropoff_lng: dropoff.lng,
        recipient_name: extra.recipientName, recipient_phone: extra.recipientPhone,
        package_description: extra.description, special_instructions: extra.instructions,
        package_size: packageSize, payment_method: payment,
        client_offered_price: offeredPrice,
      });
      setActiveDelivery(data.delivery);
      setDeliveryOffers([]);
      setStep('searching');
      if (data.agents_notified === 0) toast('⚠️ Aucun livreur disponible', { duration: 5000 });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur lors de la commande');
    } finally { setLoading(false); }
  };

  const handleAcceptOffer = async (offerId) => {
    if (!activeDelivery?.id) return;
    setAccepting(true);
    try {
      await acceptDeliveryOffer(activeDelivery.id, offerId);
      // delivery_accepted socket event will update the UI
    } catch (err) {
      toast.error(err.response?.data?.error || 'Offre non disponible');
      setDeliveryOffers((prev) => prev.filter((o) => o.offerId !== offerId));
    } finally { setAccepting(false); }
  };

  const handleCancel = async () => {
    if (!activeDelivery) return setStep('input');
    try {
      await cancelDelivery(activeDelivery.id, 'Annulé par le client');
      setActiveDelivery(null); setDeliveryOffers([]); setStep('input'); toast('Livraison annulée');
    } catch { toast.error('Erreur lors de l\'annulation'); }
  };

  const belowMin = estimate && offeredPrice != null && minPrice != null
    && toCDF(offeredPrice) < snapFC(Math.ceil(minPrice * USD_TO_CDF / STEP_FC) * STEP_FC);

  const sheetHt = {
    input:     480,
    confirm:   560,
    searching: 340,
    accepted:  300,
    ongoing:   200,
  }[step] || 300;

  return (
    <div className="relative w-full overflow-hidden bg-gray-200" style={{ height: '100dvh' }}>

      {/* ── Full-screen map ── */}
      <div className="absolute inset-0">
        <TripMap
          pickup={pickup}
          dropoff={dropoff}
          userPos={userPos}
          route={route}
          sheetHeight={sheetHt}
          accentColor="#CE1126"
        />
      </div>

      {/* ── Floating back button ── */}
      <button
        onClick={() => router.back()}
        className="absolute top-14 left-4 z-[500] w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center font-bold text-gray-800"
      >
        <ArrowLeft size={18} />
      </button>

      {/* ── Floating locate button ── */}
      {step === 'input' && (
        <button
          onClick={() => {
            if (!navigator.geolocation) return;
            setGeoLoading(true);
            navigator.geolocation.getCurrentPosition(
              ({ coords }) => { setUserPos({ lat: coords.latitude, lng: coords.longitude }); setGeoLoading(false); toast.success('Position détectée'); },
              () => { setGeoLoading(false); toast.error('GPS non disponible'); },
              { enableHighAccuracy: true, timeout: 8000 }
            );
          }}
          className="absolute right-4 z-[500] w-11 h-11 bg-white rounded-full shadow-lg flex items-center justify-center"
          style={{ bottom: `${sheetHt + 16}px` }}
        >
          {geoLoading
            ? <span className="w-5 h-5 border-2 border-gray-200 border-t-[#CE1126] rounded-full animate-spin" />
            : <Navigation size={20} />
          }
        </button>
      )}

      {/* ── Bottom sheet ── */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white rounded-t-[28px] shadow-2xl z-[1000]">
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 mb-1" />

        {/* ── STEP: input ── */}
        {step === 'input' && (
          <div className="px-5 pt-3 pb-8 space-y-3 max-h-[85dvh] overflow-y-auto">
            <h2 className="text-[22px] font-black text-gray-900 mb-3">Envoyer un colis</h2>

            <LocationInput
              value={pickup?.address || ''}
              onSelect={(p) => { if (p) { setPickup(p); setTimeout(() => dropRef.current?.focus(), 100); } }}
              placeholder="Récupérer chez…"
              dotColor="#CE1126"
              userPosition={userPos}
              accent="#CE1126"
              onMapOpen={() => setMapPicker('pickup')}
            />
            <LocationInput
              value={dropoff?.address || ''}
              onSelect={(p) => { if (p) setDropoff(p); }}
              placeholder="Livrer à…"
              dotColor="#CE1126"
              userPosition={userPos}
              accent="#CE1126"
              inputRef={dropRef}
              onMapOpen={() => setMapPicker('dropoff')}
            />

            {/* Package size */}
            <div className="grid grid-cols-3 gap-2">
              {SIZES.map(s => (
                <button key={s.id} type="button" onClick={() => setPackageSize(s.id)}
                  className={`py-3 rounded-2xl flex flex-col items-center gap-1 border-2 transition-all ${
                    packageSize === s.id ? 'border-[#CE1126] bg-red-50' : 'border-gray-100 bg-gray-50'
                  }`}>
                  <span className={packageSize === s.id ? 'text-[#CE1126]' : 'text-gray-500'}>{s.icon}</span>
                  <span className={`text-xs font-bold ${packageSize === s.id ? 'text-[#CE1126]' : 'text-gray-500'}`}>{s.label}</span>
                  <span className="text-[10px] text-gray-400 leading-tight text-center">{s.sub}</span>
                </button>
              ))}
            </div>

            {/* Optional extra info */}
            <button type="button" onClick={() => setShowExtra(x => !x)}
              className="w-full flex items-center justify-between py-3 px-4 bg-gray-50 rounded-2xl text-sm font-semibold text-gray-500">
              <span className="flex items-center gap-2"><Info size={16} /> Détails supplémentaires</span>
              {showExtra ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {showExtra && (
              <div className="space-y-2 slide-up">
                {[
                  ['pickupContact',  'Contact chez le vendeur',     'text'],
                  ['pickupPhone',    'Tél vendeur',                  'tel'],
                  ['recipientName',  'Nom du destinataire',          'text'],
                  ['recipientPhone', 'Tél destinataire',             'tel'],
                  ['description',    'Description du colis',         'text'],
                  ['instructions',   'Instructions pour le livreur', 'text'],
                ].map(([key, ph, type]) => (
                  <input key={key} type={type} value={extra[key]}
                    onChange={e => setExtra(x => ({ ...x, [key]: e.target.value }))}
                    placeholder={ph}
                    className="w-full bg-gray-50 rounded-2xl px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#CE1126]"
                  />
                ))}
              </div>
            )}

            {/* Payment chips */}
            <div className="flex gap-2">
              {PAYMENT.map(pm => (
                <button key={pm.id} type="button" onClick={() => setPayment(pm.id)}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 transition-all flex items-center justify-center gap-1 ${
                    payment === pm.id ? 'bg-black text-white border-black' : 'bg-white text-gray-500 border-gray-200'
                  }`}>
                  {pm.icon} {pm.label}
                </button>
              ))}
            </div>

            <button
              onClick={handleEstimate}
              disabled={loading || !pickup || !dropoff}
              className="w-full py-4 bg-[#CE1126] text-white rounded-2xl font-black text-[16px] disabled:opacity-40"
            >
              {loading
                ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                : 'Voir le tarif →'
              }
            </button>
          </div>
        )}

        {/* ── STEP: confirm + price picker ── */}
        {step === 'confirm' && estimate && (
          <div className="px-5 pt-3 pb-6 slide-up overflow-y-auto" style={{ maxHeight: '80dvh' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[22px] font-black text-gray-900">Votre offre</h2>
              <button onClick={() => setStep('input')} className="text-sm text-[#CE1126] font-bold">← Modifier</button>
            </div>

            {/* Route summary */}
            <div className="bg-gray-50 rounded-2xl p-4 mb-3 space-y-2.5">
              <div className="flex items-center gap-3 text-sm">
                <Package size={14} className="flex-shrink-0 text-gray-500" />
                <span className="text-gray-700 truncate">{pickup?.address}</span>
              </div>
              <div className="ml-0.5 w-0.5 h-3 bg-gray-300 ml-3" />
              <div className="flex items-center gap-3 text-sm">
                <Flag size={14} className="flex-shrink-0 text-gray-500" />
                <span className="text-gray-700 truncate">{dropoff?.address}</span>
              </div>
            </div>

            {/* Distance / duration chips */}
            <div className="flex gap-2 mb-3">
              <div className="flex-1 bg-gray-100 rounded-xl py-2 text-center">
                <span className="text-sm font-black text-gray-900">{estimate.distance_km} km</span>
              </div>
              <div className="flex-1 bg-gray-100 rounded-xl py-2 text-center">
                <span className="text-sm font-black text-gray-900">~{estimate.estimated_duration} min</span>
              </div>
              <div className={`flex-1 rounded-xl py-2 text-center flex items-center justify-center gap-1 text-xs font-semibold ${
                estimate.agents_available > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                {estimate.agents_available > 0 ? <CheckCircle size={13} /> : <XCircle size={13} />}
                {estimate.agents_available} livreur{estimate.agents_available !== 1 ? 's' : ''}
              </div>
            </div>

            {/* Price picker */}
            {offeredPrice != null && recommendedPrice != null && minPrice != null && (
              <PricePicker
                recommendedUSD={recommendedPrice}
                minUSD={minPrice}
                value={offeredPrice}
                onChange={setOfferedPrice}
              />
            )}

            <div className="flex gap-3">
              <button onClick={() => setStep('input')} className="flex-1 py-4 border-2 border-gray-200 text-gray-600 rounded-2xl font-bold">
                Annuler
              </button>
              <button
                onClick={handleRequest}
                disabled={loading || belowMin || estimate.agents_available === 0}
                className="flex-[2] py-4 bg-[#CE1126] text-white rounded-2xl font-black disabled:opacity-40 active:scale-[.98]"
              >
                {loading
                  ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                  : belowMin
                    ? '⚠️ Prix trop bas'
                    : `Proposer — ${offeredPrice ? toCDF(offeredPrice).toLocaleString('fr-FR') : 0} FC`
                }
              </button>
            </div>
          </div>
        )}

        {/* ── STEP: searching — live offer list ── */}
        {step === 'searching' && (
          <div className="px-5 pt-3 pb-6 slide-up">
            {deliveryOffers.length === 0 ? (
              <div className="text-center py-2">
                <div className="relative w-20 h-20 mx-auto my-3">
                  <div className="absolute inset-0 rounded-full bg-[#CE1126]/15 ping-slow" />
                  <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center">
                    <Package size={40} className="text-[#CE1126]" />
                  </div>
                </div>
                <h3 className="text-xl font-black text-gray-900 mb-1">En attente d'offres…</h3>
                <p className="text-sm text-gray-400 mb-1">
                  Votre offre : <strong>{offeredPrice ? toCDF(offeredPrice).toLocaleString('fr-FR') : 0} FC</strong>
                </p>
                <p className="text-xs text-gray-300 mb-4">Les livreurs voient votre prix et peuvent faire leur offre</p>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-black text-gray-900">
                    {deliveryOffers.length} offre{deliveryOffers.length > 1 ? 's' : ''} reçue{deliveryOffers.length > 1 ? 's' : ''}
                  </h3>
                  <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-lg flex items-center gap-1">
                    <Tag size={10} /> Votre offre : {offeredPrice ? toCDF(offeredPrice).toLocaleString('fr-FR') : 0} FC
                  </span>
                </div>
                <div className="max-h-52 overflow-y-auto pr-0.5">
                  {deliveryOffers.map((offer) => (
                    <AgentOfferCard
                      key={offer.offerId}
                      offer={offer}
                      recommendedUSD={estimate?.estimated_fare || recommendedPrice || 0}
                      onAccept={handleAcceptOffer}
                      accepting={accepting}
                    />
                  ))}
                </div>
              </div>
            )}
            <button onClick={handleCancel} className="w-full py-3.5 bg-gray-100 text-gray-700 rounded-2xl font-bold text-sm mt-2">
              Annuler la demande
            </button>
          </div>
        )}

        {/* ── STEP: accepted ── */}
        {step === 'accepted' && agent && (
          <div className="px-5 pt-3 pb-8 slide-up">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 rounded-2xl overflow-hidden flex-shrink-0 bg-red-50 flex items-center justify-center text-2xl font-black text-[#CE1126]">
                {agent.photo_url
                  ? <img src={agent.photo_url} alt={agent.name} className="w-full h-full object-cover" />
                  : agent.name?.[0]
                }
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-black text-gray-900 text-lg">{agent.name}</h3>
                <p className="text-sm text-gray-500">
                  {TRANSPORT_ICONS[agent.transport_type] || '🛵'} {agent.transport_type}  ·  ★ {agent.rating || '5.0'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-red-50 rounded-2xl p-3 text-sm text-[#CE1126] font-semibold mb-4">
              <Package size={20} className="animate-bounce" />
              <span>En route vers <strong className="truncate">{pickup?.address}</strong></span>
            </div>
            <div className="flex gap-3">
              <button onClick={handleCancel} className="flex-1 py-4 border-2 border-gray-200 text-gray-600 rounded-2xl font-bold">
                Annuler la livraison
              </button>
              <ChatButton onOpen={() => { setChatOpen(true); setUnreadCount(0); }} accentColor="#CE1126" unread={unreadCount} />
            </div>
          </div>
        )}

        {/* ── STEP: ongoing ── */}
        {step === 'ongoing' && (
          <div className="px-5 pt-3 pb-8 text-center slide-up">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto my-3 float-anim">
              <Package size={36} />
            </div>
            <h3 className="text-xl font-black text-gray-900">Livraison en cours</h3>
            <p className="text-gray-400 text-sm mt-1">Votre colis arrive bientôt</p>
            <div className="mt-4 flex justify-center">
              <ChatButton onOpen={() => { setChatOpen(true); setUnreadCount(0); }} accentColor="#CE1126" unread={unreadCount} />
            </div>
          </div>
        )}
      </div>

      <ChatModal
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        referenceId={activeDelivery?.id}
        referenceType="delivery"
        toUserId={agent?.id}
        currentUserId={userId}
        accentColor="#CE1126"
      />

      {/* ── Map picker modal ── */}
      {mapPicker && (
        <MapPickerModal
          initialLocation={mapPicker === 'pickup' ? pickup : dropoff}
          userPosition={userPos}
          accent="#CE1126"
          label={mapPicker === 'pickup' ? 'Point de collecte' : 'Adresse de livraison'}
          onConfirm={(loc) => {
            if (mapPicker === 'pickup') setPickup(loc);
            else setDropoff(loc);
            setMapPicker(null);
          }}
          onCancel={() => setMapPicker(null)}
        />
      )}
    </div>
  );
}
