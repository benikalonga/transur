'use client';
import { useState } from 'react';
import { Share2, ShieldAlert, Siren } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { locateOnce } from '@/lib/geo';
import { Button, Modal } from '@/components/ui';

/** Shield button that opens the safety toolkit: share live trip + SOS. */
export default function SafetyButton({ bookingId, className = '' }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);

  const share = async () => {
    setBusy('share');
    try {
      const { url } = await api.bookings.share(bookingId);
      if (navigator.share) {
        await navigator.share({ title: 'Follow my Transur trip', text: 'Track my trip live:', url }).catch(() => {});
      } else {
        await navigator.clipboard.writeText(url);
        toast.success('Tracking link copied');
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  };

  const sos = async () => {
    setBusy('sos');
    try {
      const pos = await locateOnce().catch(() => ({}));
      const res = await api.bookings.sos(bookingId, { lat: pos.lat, lng: pos.lng });
      toast.success(`Alert sent to our safety team${res.contactsAlerted ? ` and ${res.contactsAlerted} contact(s)` : ''}.`, { duration: 6000 });
      setOpen(false);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className={`tap flex h-11 w-11 items-center justify-center rounded-full bg-white text-brand-600 shadow-float ${className}`} aria-label="Safety">
        <ShieldAlert size={20} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Safety toolkit">
        <div className="space-y-3">
          <button onClick={share} disabled={busy} className="surface tap flex w-full items-center gap-3 p-4 text-left">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Share2 size={20} /></span>
            <span className="flex-1">
              <span className="block font-semibold">Share live trip</span>
              <span className="block text-xs text-ink-muted">Anyone with the link can follow the vehicle until the trip ends.</span>
            </span>
          </button>
          <div className="rounded-2xl bg-red-50 p-4">
            <p className="flex items-center gap-2 font-bold text-red-600"><Siren size={18} /> Emergency</p>
            <p className="mb-3 mt-1 text-xs text-red-600/80">
              Sends your location to the Transur safety team and texts your trusted contacts. Call local emergency services if you are in immediate danger.
            </p>
            <Button variant="danger" className="w-full" loading={busy === 'sos'} onClick={sos}>Send SOS alert</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
