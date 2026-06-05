'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  estimateTrip, requestTrip, cancelTrip, getTripHistory, getTrip,
  acceptTripOffer,
} from '@/lib/api';
import { getSocket } from '@/lib/socket';
import LocationInput from '@/components/LocationInput';
import toast from 'react-hot-toast';
import {
  ArrowLeft, MapPin, Navigation, Banknote, Smartphone, Radio,
  CheckCircle, XCircle, Car, Minus, Plus, ChevronRight, Tag,
} from 'lucide-react';
import formatCDF, { abbreviateCDF, toCDF, USD_TO_CDF } from '@/lib/currency';
import ChatModal, { ChatButton } from '@/components/ChatModal';

const TripMap = dynamic(() => import('@/components/TripMap'), { ssr: false });
const MapPickerModal = dynamic(() => import('@/components/MapPickerModal'), { ssr: false });
const LBH = { lat: -11.6609, lng: 27.4794 };

const PAYMENT = [
  { id: 'cash',         label: 'Espèces', icon: <Banknote size={14} /> },
  { id: 'mpesa',        label: 'M-Pesa',  icon: <Smartphone size={14} /> },
  { id: 'airtel_money', label: 'Airtel',  icon: <Radio size={14} /> },
  { id: 'orange_money', label: 'Orange',  icon: '🟠' },
];

const STEP_FC = 200; // smallest price increment in FC

/** Round FC to nearest STEP_FC */
const snapFC = (fc) => Math.round(fc / STEP_FC) * STEP_FC;

async function fetchRoute(from, to) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const res  = await fetch(url);
    const data = await res.json();
    if (data.routes?.[0])
      return data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  } catch {}
  return null;
}

// ─── Price Picker ─────────────────────────────────────────────────────────────
function PricePicker({ recommendedUSD, minUSD, value, onChange }) {
  const minFC = snapFC(Math.ceil(minUSD * USD_TO_CDF / STEP_FC) * STEP_FC);
  const recFC = snapFC(Math.round(recommendedUSD * USD_TO_CDF));
  const maxFC = snapFC(recFC * 1.5);
  const valueFC = snapFC(Math.round(value * USD_TO_CDF));

  const set = (fc) => onChange(Math.max(minFC, Math.min(maxFC, snapFC(fc))) / USD_TO_CDF);

  const presets = (() => {
    const mid = snapFC(Math.round((minFC + recFC) / 2));
    return [
      { key: 'min', label: 'Minimum',  fc: minFC },
      { key: 'mid', label: 'Moyen',    fc: mid === minFC || mid === recFC ? Math.round((minFC + recFC) / 2 / STEP_FC) * STEP_FC : mid },
      { key: 'rec', label: 'Conseillé', fc: recFC },
    ].filter((p, i, arr) => arr.findIndex(x => x.fc === p.fc) === i);
  })();

  const belowMin = valueFC < minFC;

  return (
    <div className="bg-gray-50 rounded-2xl p-4 mb-4">
      {/* Label */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-gray-700">Votre offre de prix</span>
        <span className="text-xs text-gray-400 bg-white px-2 py-0.5 rounded-full border border-gray-200">
          Conseillé : {recFC.toLocaleString('fr-FR')} FC
        </span>
      </div>

      {/* Main price display + stepper */}
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

      {/* Slider */}
      <input
        type="range"
        min={minFC}
        max={maxFC}
        step={STEP_FC}
        value={valueFC}
        onChange={(e) => set(parseInt(e.target.value))}
        className="w-full h-2 rounded-full mb-3 cursor-pointer accent-[#007DC5]"
      />

      {/* Preset chips */}
      <div className="flex gap-2">
        {presets.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => set(p.fc)}
            className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 transition-all active:scale-95 ${
              valueFC === p.fc
                ? 'bg-[#007DC5] text-white border-[#007DC5]'
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

// ─── Driver Offer Card ────────────────────────────────────────────────────────
function DriverOfferCard({ offer, recommendedUSD, onAccept, accepting }) {
  const priceFC = toCDF(offer.offeredPrice);
  const recFC   = toCDF(recommendedUSD);
  const diffFC  = priceFC - recFC;
  const absDiff = Math.abs(diffFC);
  const diffLabel = diffFC === 0 ? 'Tarif conseillé'
    : diffFC < 0 ? `-${absDiff.toLocaleString('fr-FR')} FC`
    : `+${absDiff.toLocaleString('fr-FR')} FC`;

  return (
    <div className="bg-white border-2 border-gray-100 rounded-2xl p-4 flex items-center gap-3 mb-3 shadow-sm">
      {/* Avatar */}
      <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center flex-shrink-0 overflow-hidden font-black text-[#007DC5] text-lg">
        {offer.driver.photo_url
          ? <img src={offer.driver.photo_url} alt={offer.driver.name} className="w-full h-full object-cover" />
          : (offer.driver.name?.[0] || '?')
        }
      </div>

      {/* Driver info */}
      <div className="flex-1 min-w-0">
        <p className="font-bold text-gray-900 text-sm truncate">{offer.driver.name}</p>
        <p className="text-xs text-gray-400">
          ★ {Number(offer.driver.rating || 5).toFixed(1)}
          {offer.driver.vehicle_type ? ` · ${offer.driver.vehicle_type}` : ''}
          {offer.driver.vehicle_plate ? ` · ${offer.driver.vehicle_plate}` : ''}
        </p>
        <span className={`inline-block mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
          diffFC <= 0 ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'
        }`}>
          {diffLabel}
        </span>
      </div>

      {/* Price + Accept */}
      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
        <span className="text-lg font-black text-gray-900">{priceFC.toLocaleString('fr-FR')} FC</span>
        <button
          onClick={() => onAccept(offer.offerId)}
          disabled={accepting}
          className="bg-[#007DC5] text-white text-xs font-black px-4 py-2 rounded-xl active:scale-95 transition-transform disabled:opacity-50"
        >
          {accepting ? '…' : 'Accepter'}
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TaxiPage() {
  const router    = useRouter();
  const socketRef = useRef(null);
  const dropRef   = useRef(null);

  const [step,         setStep]         = useState('input');
  const [userPos,      setUserPos]      = useState(null);
  const [pickup,       setPickup]       = useState(null);
  const [dropoff,      setDropoff]      = useState(null);
  const [mapPicker,    setMapPicker]    = useState(null); // 'pickup' | 'dropoff' | null
  const [payment,      setPayment]      = useState('cash');
  const [route,        setRoute]        = useState(null);
  const [estimate,     setEstimate]     = useState(null);
  const [offeredPrice, setOfferedPrice] = useState(null);   // USD
  const [activeTrip,   setActiveTrip]   = useState(null);
  const [driver,       setDriver]       = useState(null);
  const [driverOffers, setDriverOffers] = useState([]);     // incoming offers
  const [accepting,    setAccepting]    = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [geoLoading,   setGeoLoading]   = useState(false);
  const [chatOpen,     setChatOpen]     = useState(false);
  const [unreadCount,  setUnreadCount]  = useState(0);
  const [userId,       setUserId]       = useState(null);

  useEffect(() => {
    const u = JSON.parse(localStorage.getItem('transur_user') || '{}');
    setUserId(u.id);
  }, []);

  // Restore active trip on page reload
  useEffect(() => {
    const ACTIVE = ['accepted', 'pickup', 'ongoing'];
    getTripHistory(1).then(({ data }) => {
      const t = data.trips?.[0];
      if (!t || !ACTIVE.includes(t.status)) return;
      getTrip(t.id).then(({ data: full }) => {
        const tr = full.trip;
        if (!tr || !ACTIVE.includes(tr.status)) return;
        setActiveTrip({ id: tr.id, driverId: tr.driver_id });
        if (tr.driver_id) {
          setDriver({
            id: tr.driver_id, name: tr.driver_name, photo_url: tr.driver_photo,
            vehicle_type: tr.vehicle_type, vehicle_plate: tr.vehicle_plate,
            vehicle_color: tr.vehicle_color, rating: tr.driver_rating,
          });
        }
        setStep(tr.status === 'ongoing' ? 'ongoing' : 'accepted');
      }).catch(() => {});
    }).catch(() => {});
  }, []);

  // Geolocation + socket
  useEffect(() => {
    if (navigator.geolocation) {
      setGeoLoading(true);
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          const p = { lat: coords.latitude, lng: coords.longitude };
          setUserPos(p);
          setPickup({ address: 'Ma position actuelle', lat: p.lat, lng: p.lng });
          setGeoLoading(false);
        },
        () => { setUserPos(LBH); setGeoLoading(false); },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }

    const socket = getSocket();
    if (!socket) return;
    socketRef.current = socket;

    // Incoming driver offer (new)
    socket.on('driver_offer', (offer) => {
      setDriverOffers((prev) => {
        const exists = prev.find((o) => o.offerId === offer.offerId);
        if (exists) return prev.map((o) => o.offerId === offer.offerId ? offer : o);
        return [offer, ...prev];
      });
      toast('Offre reçue d\'un chauffeur 🚗', { duration: 4000 });
    });

    socket.on('trip_accepted', ({ driver: d, tripId }) => {
      setDriver(d);
      setActiveTrip((prev) => ({ ...prev, id: prev?.id || tripId, driverId: d.id }));
      setDriverOffers([]);
      setStep('accepted');
      toast.success(`${d.name} accepté !`);
    });
    socket.on('driver_arrived',  () => toast('🚗 Votre chauffeur est arrivé !'));
    socket.on('trip_started',    () => { setStep('ongoing'); toast('🚀 Course démarrée !'); });
    socket.on('trip_completed',  ({ fare }) => { toast.success(`Terminée — ${formatCDF(fare)}`); router.push('/client'); });
    socket.on('trip_cancelled',  ({ reason }) => {
      toast.error(reason || 'Course annulée');
      setStep('input'); setActiveTrip(null); setDriverOffers([]);
    });
    socket.on('message', () => { if (!chatOpen) setUnreadCount((c) => c + 1); });

    return () => {
      ['driver_offer','trip_accepted','driver_arrived','trip_started',
       'trip_completed','trip_cancelled','message'].forEach((e) => socket.off(e));
    };
  }, [router, chatOpen]);

  // Route on map
  useEffect(() => {
    if (pickup && dropoff) fetchRoute(pickup, dropoff).then(setRoute);
    else setRoute(null);
  }, [pickup, dropoff]);

  // Set default offered price when estimate is ready
  useEffect(() => {
    if (estimate) setOfferedPrice(estimate.estimated_fare);
  }, [estimate?.estimated_fare]);

  const handleGeolocate = () => {
    if (!navigator.geolocation) return toast.error('GPS non disponible');
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const p = { lat: coords.latitude, lng: coords.longitude };
        setUserPos(p); setPickup({ address: 'Ma position actuelle', ...p }); setGeoLoading(false);
        toast.success('Position détectée');
      },
      () => { setGeoLoading(false); toast.error('GPS non disponible'); },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleEstimate = async () => {
    if (!pickup || !dropoff) return toast.error('Saisissez les deux adresses');
    setLoading(true);
    try {
      const { data } = await estimateTrip({
        pickup_lat: pickup.lat, pickup_lng: pickup.lng,
        dropoff_lat: dropoff.lat, dropoff_lng: dropoff.lng,
      });
      setEstimate(data);
      setStep('confirm');
    } catch { toast.error('Impossible d\'estimer le trajet'); }
    finally { setLoading(false); }
  };

  const handleRequest = async () => {
    setLoading(true);
    try {
      const { data } = await requestTrip({
        pickup_address: pickup.address, pickup_lat: pickup.lat, pickup_lng: pickup.lng,
        dropoff_address: dropoff.address, dropoff_lat: dropoff.lat, dropoff_lng: dropoff.lng,
        payment_method: payment,
        offered_price: offeredPrice,
      });
      setActiveTrip(data.trip);
      setDriverOffers([]);
      setStep('searching');
      if (data.drivers_notified === 0) toast('⚠️ Aucun chauffeur disponible', { duration: 5000 });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur lors de la commande');
    } finally { setLoading(false); }
  };

  const handleAcceptOffer = async (offerId) => {
    if (!activeTrip?.id) return;
    setAccepting(true);
    try {
      await acceptTripOffer(activeTrip.id, offerId);
      // trip_accepted socket will fire and switch step → driver will be set there
    } catch (err) {
      toast.error(err.response?.data?.error || 'Offre non disponible');
      setDriverOffers((prev) => prev.filter((o) => o.offerId !== offerId));
    } finally { setAccepting(false); }
  };

  const handleCancel = async () => {
    if (!activeTrip?.id) return setStep('input');
    try {
      await cancelTrip(activeTrip.id, 'Annulé par le client');
      setActiveTrip(null); setDriverOffers([]); setStep('input');
      toast('Course annulée');
    } catch { toast.error('Erreur lors de l\'annulation'); }
  };

  const belowMin = estimate && offeredPrice != null
    && toCDF(offeredPrice) < snapFC(Math.ceil((estimate.min_price || 0) * USD_TO_CDF / STEP_FC) * STEP_FC);

  const sheetHt = { input: 400, confirm: 520, searching: 340, accepted: 300, ongoing: 200 }[step] || 300;

  return (
    <div className="relative w-full overflow-hidden bg-gray-200" style={{ height: '100dvh' }}>

      {/* Map */}
      <div className="absolute inset-0">
        <TripMap pickup={pickup} dropoff={dropoff} userPos={userPos} route={route}
          sheetHeight={sheetHt} accentColor="#007DC5" />
      </div>

      {/* Back button */}
      <button onClick={() => router.back()}
        className="absolute top-14 left-4 z-[500] w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center font-bold text-gray-800">
        <ArrowLeft size={18} />
      </button>

      {/* Locate button */}
      {step === 'input' && (
        <button onClick={handleGeolocate}
          className="absolute right-4 z-[500] w-11 h-11 bg-white rounded-full shadow-lg flex items-center justify-center"
          style={{ bottom: `${sheetHt + 16}px` }}>
          {geoLoading
            ? <span className="w-5 h-5 border-2 border-gray-200 border-t-[#007DC5] rounded-full animate-spin" />
            : <Navigation size={20} />}
        </button>
      )}

      {/* Bottom sheet */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white rounded-t-[28px] shadow-2xl z-[1000]">
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 mb-1" />

        {/* ── STEP: input ── */}
        {step === 'input' && (
          <div className="px-5 pt-3 pb-8 space-y-3">
            <h2 className="text-[22px] font-black text-gray-900 mb-4">Où allez-vous ?</h2>
            <LocationInput value={pickup?.address || ''} onSelect={(p) => { if (p) { setPickup(p); setTimeout(() => dropRef.current?.focus(), 100); } }}
              placeholder="Point de départ" dotColor="#007DC5" userPosition={userPos} accent="#007DC5"
              onMapOpen={() => setMapPicker('pickup')} />
            <LocationInput value={dropoff?.address || ''} onSelect={(p) => { if (p) setDropoff(p); }}
              placeholder="Destination" dotColor="#CE1126" userPosition={userPos} accent="#CE1126" inputRef={dropRef}
              onMapOpen={() => setMapPicker('dropoff')} />
            <div className="flex gap-2 pt-1">
              {PAYMENT.map((pm) => (
                <button key={pm.id} type="button" onClick={() => setPayment(pm.id)}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border-2 flex items-center justify-center gap-1 transition-all ${
                    payment === pm.id ? 'bg-black text-white border-black' : 'bg-white text-gray-500 border-gray-200'}`}>
                  {pm.icon} {pm.label}
                </button>
              ))}
            </div>
            <button onClick={handleEstimate} disabled={loading || !pickup || !dropoff}
              className="w-full py-4 bg-[#007DC5] text-white rounded-2xl font-black text-[16px] disabled:opacity-40 active:scale-[.98]">
              {loading ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" /> : 'Voir le tarif →'}
            </button>
          </div>
        )}

        {/* ── STEP: confirm + price picker ── */}
        {step === 'confirm' && estimate && (
          <div className="px-5 pt-3 pb-6 slide-up overflow-y-auto" style={{ maxHeight: '80dvh' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[22px] font-black text-gray-900">Votre offre</h2>
              <button onClick={() => setStep('input')} className="text-sm text-[#007DC5] font-bold">← Modifier</button>
            </div>

            {/* Route summary */}
            <div className="bg-gray-50 rounded-2xl p-4 mb-3 space-y-2">
              <div className="flex items-center gap-3 text-sm">
                <span className="w-2.5 h-2.5 bg-[#007DC5] rounded-full flex-shrink-0" />
                <span className="text-gray-700 truncate">{pickup?.address}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <MapPin size={14} className="flex-shrink-0 text-gray-500" />
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
                estimate.drivers_available > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                {estimate.drivers_available > 0 ? <CheckCircle size={13} /> : <XCircle size={13} />}
                {estimate.drivers_available} chauffeur{estimate.drivers_available !== 1 ? 's' : ''}
              </div>
            </div>

            {/* Price picker */}
            {offeredPrice != null && (
              <PricePicker
                recommendedUSD={estimate.estimated_fare}
                minUSD={estimate.min_price || estimate.estimated_fare * 0.5}
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
                disabled={loading || belowMin || estimate.drivers_available === 0}
                className="flex-[2] py-4 bg-[#007DC5] text-white rounded-2xl font-black disabled:opacity-40 active:scale-[.98]"
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
            {driverOffers.length === 0 ? (
              /* No offers yet — spinner */
              <div className="text-center py-2">
                <div className="relative w-20 h-20 mx-auto my-3">
                  <div className="absolute inset-0 rounded-full bg-[#007DC5]/15 ping-slow" />
                  <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center">
                    <Car size={40} className="text-[#007DC5]" />
                  </div>
                </div>
                <h3 className="text-xl font-black text-gray-900 mb-1">En attente d'offres…</h3>
                <p className="text-sm text-gray-400 mb-1">
                  Votre offre : <strong>{offeredPrice ? toCDF(offeredPrice).toLocaleString('fr-FR') : 0} FC</strong>
                </p>
                <p className="text-xs text-gray-300 mb-4">Les chauffeurs voient votre prix et peuvent faire leur offre</p>
              </div>
            ) : (
              /* Offers received */
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-black text-gray-900">
                    {driverOffers.length} offre{driverOffers.length > 1 ? 's' : ''} reçue{driverOffers.length > 1 ? 's' : ''}
                  </h3>
                  <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-lg flex items-center gap-1">
                    <Tag size={10} /> Votre offre : {offeredPrice ? toCDF(offeredPrice).toLocaleString('fr-FR') : 0} FC
                  </span>
                </div>
                <div className="max-h-52 overflow-y-auto pr-0.5">
                  {driverOffers.map((offer) => (
                    <DriverOfferCard
                      key={offer.offerId}
                      offer={offer}
                      recommendedUSD={estimate?.estimated_fare || 0}
                      onAccept={handleAcceptOffer}
                      accepting={accepting}
                    />
                  ))}
                </div>
              </div>
            )}
            <button onClick={handleCancel} className="w-full py-3.5 bg-gray-100 text-gray-700 rounded-2xl font-bold text-sm">
              Annuler la demande
            </button>
          </div>
        )}

        {/* ── STEP: accepted ── */}
        {step === 'accepted' && driver && (
          <div className="px-5 pt-3 pb-8 slide-up">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 rounded-2xl overflow-hidden flex-shrink-0 bg-blue-50 flex items-center justify-center text-2xl font-black text-[#007DC5]">
                {driver.photo_url
                  ? <img src={driver.photo_url} alt={driver.name} className="w-full h-full object-cover" />
                  : driver.name?.[0]}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-black text-gray-900 text-lg">{driver.name}</h3>
                <p className="text-sm text-gray-500">
                  ★ {driver.rating || '5.0'} · <span className="capitalize">{driver.vehicle_type} {driver.vehicle_color || ''}</span>
                </p>
              </div>
              {driver.vehicle_plate && (
                <div className="bg-gray-900 text-white text-sm font-black px-3 py-1.5 rounded-xl flex-shrink-0">
                  {driver.vehicle_plate}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 bg-blue-50 rounded-2xl p-3 text-sm text-[#007DC5] font-semibold mb-4">
              <Car size={20} className="animate-bounce" />
              <span>Votre chauffeur est en route…</span>
            </div>
            <div className="flex gap-3">
              <button onClick={handleCancel} className="flex-1 py-4 border-2 border-gray-200 text-gray-600 rounded-2xl font-bold">
                Annuler
              </button>
              <ChatButton onOpen={() => { setChatOpen(true); setUnreadCount(0); }} accentColor="#007DC5" unread={unreadCount} />
            </div>
          </div>
        )}

        {/* ── STEP: ongoing ── */}
        {step === 'ongoing' && (
          <div className="px-5 pt-3 pb-8 text-center slide-up">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto my-3 float-anim">
              <Car size={36} className="text-[#007DC5]" />
            </div>
            <h3 className="text-xl font-black text-gray-900">Course en cours</h3>
            {estimate?.estimated_duration && (
              <p className="text-gray-400 text-sm mt-1">Arrivée dans ~{estimate.estimated_duration} min</p>
            )}
            <div className="mt-4 flex justify-center">
              <ChatButton onOpen={() => { setChatOpen(true); setUnreadCount(0); }} accentColor="#007DC5" unread={unreadCount} />
            </div>
          </div>
        )}
      </div>

      <ChatModal isOpen={chatOpen} onClose={() => setChatOpen(false)}
        referenceId={activeTrip?.id} referenceType="trip"
        toUserId={driver?.id} currentUserId={userId} accentColor="#007DC5" />

      {/* ── Map picker modal ── */}
      {mapPicker && (
        <MapPickerModal
          initialLocation={mapPicker === 'pickup' ? pickup : dropoff}
          userPosition={userPos}
          accent={mapPicker === 'pickup' ? '#007DC5' : '#CE1126'}
          label={mapPicker === 'pickup' ? 'Point de départ' : 'Destination'}
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
