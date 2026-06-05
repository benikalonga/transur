'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { registerClient, registerDriver, registerDelivery } from '@/lib/api';
import toast from 'react-hot-toast';
import { Car, Package, User, Bike } from 'lucide-react';

const ROLES = [
  { id: 'client',   icon: <User size={28} className="text-[#007DC5]" />,    label: 'Passager',       desc: 'Commander un taxi ou une livraison',  grad: 'from-blue-50 to-blue-100',   ring: 'ring-[#007DC5]',  dot: 'bg-[#007DC5]' },
  { id: 'driver',   icon: <Car size={28} className="text-[#007DC5]" />,     label: 'Chauffeur Taxi', desc: 'Transporter des passagers en ville',  grad: 'from-blue-50 to-indigo-100', ring: 'ring-[#007DC5]',  dot: 'bg-[#007DC5]' },
  { id: 'delivery', icon: <Package size={28} className="text-[#CE1126]" />, label: 'Livreur',        desc: 'Livrer des colis et commandes',        grad: 'from-red-50 to-red-100',     ring: 'ring-[#CE1126]',  dot: 'bg-[#CE1126]' },
];

const VEHICLES = ['berline','suv','4x4','minibus','tricycle','moto'];
const TRANSPORTS = [
  { id:'moto',     icon:<Bike size={24} />,    label:'Moto' },
  { id:'velo',     icon:<Bike size={24} />,    label:'Vélo' },
  { id:'pied',     icon:<User size={24} />,    label:'À pied' },
  { id:'voiture',  icon:<Car size={24} />,     label:'Voiture' },
];

export default function RegisterPage() {
  const router = useRouter();
  const [role, setRole]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [photo, setPhoto]     = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [form, setForm] = useState({ name:'', vehicle_type:'berline', vehicle_plate:'', vehicle_color:'', vehicle_brand:'', transport_type:'moto' });

  const handlePhoto = e => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPhoto(f);
    setPhotoPreview(URL.createObjectURL(f));
  };

  const handleSubmit = async e => {
    e.preventDefault();
    const tempToken = localStorage.getItem('transur_temp_token');
    if (!tempToken) { toast.error('Session expirée'); return router.push('/auth/login'); }
    if (!form.name.trim()) return toast.error('Entrez votre nom');
    setLoading(true);
    try {
      let token, user;
      if (role === 'client') {
        const r = await registerClient({ tempToken, name: form.name });
        token = r.data.token; user = r.data.user;
      } else {
        const fd = new FormData();
        fd.append('tempToken', tempToken);
        fd.append('name', form.name);
        if (photo) fd.append('photo', photo);
        if (role === 'driver') {
          ['vehicle_type','vehicle_plate','vehicle_color','vehicle_brand'].forEach(k => fd.append(k, form[k]));
          const r = await registerDriver(fd); token = r.data.token; user = r.data.user;
        } else {
          fd.append('transport_type', form.transport_type);
          if (form.transport_type === 'voiture') {
            ['vehicle_plate','vehicle_color','vehicle_brand'].forEach(k => fd.append(k, form[k]));
          }
          const r = await registerDelivery(fd); token = r.data.token; user = r.data.user;
        }
      }
      localStorage.setItem('transur_token', token);
      localStorage.setItem('transur_user', JSON.stringify(user));
      localStorage.removeItem('transur_temp_token');
      toast.success('Bienvenue sur Transur 🎉');
      router.replace({ client:'/client', driver:'/driver', delivery:'/delivery' }[role]);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erreur d\'inscription');
    } finally { setLoading(false); }
  };

  if (!role) return (
    <div className="min-h-screen flex flex-col bg-white">
      <div className="header-blue relative px-6 pt-14 pb-20 text-white overflow-hidden">
        <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/5" />
        <div className="absolute bottom-6 right-4 w-16 h-16 rounded-full bg-white/5" />
        <button onClick={() => router.back()} className="relative text-blue-200 text-sm mb-5">← Retour</button>
        <h1 className="relative text-2xl font-black">Créer un compte</h1>
        <p className="relative text-blue-100 text-sm mt-1">Choisissez votre type de compte</p>
        <div className="absolute bottom-0 left-0 right-0 h-8">
          <svg viewBox="0 0 390 32" preserveAspectRatio="none" className="w-full h-full">
            <path d="M0 32 Q195 0 390 32 L390 32 L0 32 Z" fill="white"/>
          </svg>
        </div>
      </div>

      <div className="flex-1 px-5 py-6 -mt-2 space-y-3">
        {ROLES.map(r => (
          <button key={r.id} onClick={() => setRole(r.id)}
            className="card card-hover w-full p-5 flex items-center gap-4 text-left">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br ${r.grad} flex-shrink-0`}>
              {r.icon}
            </div>
            <div className="flex-1">
              <p className="font-black text-gray-900">{r.label}</p>
              <p className="text-gray-500 text-sm mt-0.5">{r.desc}</p>
            </div>
            <div className={`w-5 h-5 rounded-full border-2 ${r.ring} flex items-center justify-center`}>
              <div className={`w-2.5 h-2.5 rounded-full ${r.dot} opacity-0`} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  const chosen = ROLES.find(r => r.id === role);
  const isDelivery = role === 'delivery';
  const headerClass = isDelivery ? 'header-red' : 'header-blue';

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <div className={`${headerClass} relative px-6 pt-14 pb-20 text-white overflow-hidden`}>
        <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/5" />
        <button onClick={() => setRole(null)} className="relative text-white/70 text-sm mb-5">← Changer de type</button>
        <div className="relative flex items-center gap-3">
          <span>{chosen.icon}</span>
          <div>
            <h1 className="text-2xl font-black">Inscription</h1>
            <p className="text-white/70 text-sm">{chosen.label}</p>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-8">
          <svg viewBox="0 0 390 32" preserveAspectRatio="none" className="w-full h-full">
            <path d="M0 32 Q195 0 390 32 L390 32 L0 32 Z" fill="white"/>
          </svg>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 px-5 py-6 -mt-2 space-y-4">
        {/* Photo */}
        {role !== 'client' && (
          <div className="flex flex-col items-center">
            <label className="cursor-pointer group">
              <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-white shadow-lg bg-gray-100 flex items-center justify-center relative">
                {photoPreview
                  ? <img src={photoPreview} alt="Photo" className="w-full h-full object-cover" />
                  : <span className="text-4xl">📸</span>}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all rounded-full flex items-end justify-center pb-1">
                  <span className="text-white text-xs opacity-0 group-hover:opacity-100 font-medium">Modifier</span>
                </div>
              </div>
              <input type="file" accept="image/*" onChange={handlePhoto} className="hidden" capture="user" />
            </label>
            <p className="text-gray-400 text-xs mt-2">Photo de profil (recommandé)</p>
          </div>
        )}

        {/* Name */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">Nom complet *</label>
          <input value={form.name} onChange={e => setForm({...form, name:e.target.value})}
            placeholder="Jean Kabila" className="input-field" autoFocus />
        </div>

        {/* Driver fields */}
        {role === 'driver' && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Type de véhicule *</label>
              <div className="grid grid-cols-3 gap-2">
                {VEHICLES.map(v => (
                  <button key={v} type="button" onClick={() => setForm({...form, vehicle_type:v})}
                    className={`py-2.5 rounded-xl text-sm font-semibold capitalize transition-all border-2 ${
                      form.vehicle_type === v
                        ? 'border-[#007DC5] bg-blue-50 text-[#007DC5]'
                        : 'border-gray-100 bg-gray-50 text-gray-500'
                    }`}>{v}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Marque</label>
                <input value={form.vehicle_brand} onChange={e => setForm({...form, vehicle_brand:e.target.value})}
                  placeholder="Toyota" className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Couleur</label>
                <input value={form.vehicle_color} onChange={e => setForm({...form, vehicle_color:e.target.value})}
                  placeholder="Blanc" className="input-field" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Plaque d'immatriculation</label>
              <input value={form.vehicle_plate} onChange={e => setForm({...form, vehicle_plate:e.target.value})}
                placeholder="LBH 1234" className="input-field" />
            </div>
          </div>
        )}

        {/* Delivery fields */}
        {role === 'delivery' && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Moyen de transport *</label>
              <div className="grid grid-cols-2 gap-2">
                {TRANSPORTS.map(t => (
                  <button key={t.id} type="button" onClick={() => setForm({...form, transport_type:t.id})}
                    className={`py-4 rounded-2xl flex flex-col items-center gap-1 border-2 transition-all ${
                      form.transport_type === t.id
                        ? 'border-[#CE1126] bg-red-50'
                        : 'border-gray-100 bg-gray-50'
                    }`}>
                    <span className={form.transport_type === t.id ? 'text-[#CE1126]' : 'text-gray-400'}>{t.icon}</span>
                    <span className={`text-xs font-semibold ${form.transport_type === t.id ? 'text-[#CE1126]' : 'text-gray-500'}`}>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Vehicle details — only shown when voiture is selected */}
            {form.transport_type === 'voiture' && (
              <div className="space-y-3 p-4 bg-red-50 rounded-2xl border border-red-100">
                <p className="text-xs font-bold text-[#CE1126] uppercase tracking-wide">Informations du véhicule</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Marque</label>
                    <input value={form.vehicle_brand} onChange={e => setForm({...form, vehicle_brand:e.target.value})}
                      placeholder="Toyota" className="input-field" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Couleur</label>
                    <input value={form.vehicle_color} onChange={e => setForm({...form, vehicle_color:e.target.value})}
                      placeholder="Blanc" className="input-field" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Plaque d'immatriculation *</label>
                  <input value={form.vehicle_plate} onChange={e => setForm({...form, vehicle_plate:e.target.value})}
                    placeholder="LBH 1234" className="input-field" />
                </div>
              </div>
            )}
          </div>
        )}

        <div className="pt-2">
          <button type="submit" disabled={loading}
            className={`btn-primary ${isDelivery ? 'btn-red' : ''}`}>
            {loading
              ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : 'Créer mon compte'
            }
          </button>
        </div>
      </form>
    </div>
  );
}
