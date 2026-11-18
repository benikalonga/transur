'use client';
import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { MessageCircle, Send, X } from 'lucide-react';
import { api } from '@/lib/api';
import { appSocket } from '@/lib/socket';
import { Spinner } from '@/components/ui';

const QUICK = {
  rider: ['I am at the pickup point', 'Please call me', 'Running 2 minutes late'],
  provider: ['I have arrived', 'I am stuck in traffic', 'Where exactly are you?'],
};

/** Floating chat button + panel for rider ⇄ provider messages during a booking. */
export default function TripChat({ bookingId, me, counterpart, side = 'rider' }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    if (!bookingId) return undefined;
    setLoading(true);
    api.bookings.messages(bookingId).then((r) => setMessages(r.messages)).catch(() => {}).finally(() => setLoading(false));
    const socket = appSocket();
    const onMessage = (m) => {
      if (m.booking_id !== bookingId) return;
      setMessages((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));
      if (m.sender_id !== me) setUnread((n) => n + 1);
    };
    socket?.on('chat:message', onMessage);
    return () => socket?.off('chat:message', onMessage);
  }, [bookingId, me]);

  useEffect(() => {
    if (open) {
      setUnread(0);
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [open, messages.length]);

  const send = (body = text) => {
    const trimmed = body.trim();
    if (!trimmed) return;
    appSocket()?.emit('chat:send', { bookingId, body: trimmed });
    setText('');
  };

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-ghost relative flex-1">
        <MessageCircle size={18} /> Message
        {unread > 0 && <span className="absolute -right-1 -top-1 min-w-[20px] rounded-full bg-red-500 px-1.5 text-xs leading-5 text-white">{unread}</span>}
      </button>

      {open && (
        <div className="fixed inset-0 z-[2500] mx-auto flex max-w-md flex-col bg-white">
          <header className="flex items-center gap-3 border-b border-line px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
            <div className="flex-1">
              <p className="font-bold">{counterpart || 'Chat'}</p>
              <p className="text-xs text-ink-muted">Messages are kept with this booking</p>
            </div>
            <button onClick={() => setOpen(false)} className="tap flex h-10 w-10 items-center justify-center rounded-full bg-canvas" aria-label="Close chat">
              <X size={18} />
            </button>
          </header>

          <div className="flex-1 space-y-2 overflow-y-auto bg-canvas px-4 py-4">
            {loading && <Spinner className="mx-auto text-ink-faint" />}
            {!loading && messages.length === 0 && <p className="pt-10 text-center text-sm text-ink-muted">Say hello 👋</p>}
            {messages.map((m) => (
              <div key={m.id} className={clsx('flex', m.sender_id === me ? 'justify-end' : 'justify-start')}>
                <div className={clsx('max-w-[78%] rounded-2xl px-3.5 py-2 text-sm', m.sender_id === me ? 'rounded-br-md bg-brand-500 text-white' : 'rounded-bl-md bg-white')}>
                  {m.body}
                  <div className={clsx('mt-0.5 text-[10px]', m.sender_id === me ? 'text-white/70' : 'text-ink-faint')}>
                    {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>

          <div className="border-t border-line bg-white px-3 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-2">
            <div className="mb-2 flex gap-2 overflow-x-auto">
              {QUICK[side === 'rider' ? 'rider' : 'provider'].map((q) => (
                <button key={q} onClick={() => send(q)} className="chip-off flex-shrink-0 py-1.5 text-xs">{q}</button>
              ))}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex gap-2">
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message" className="field flex-1 py-3" maxLength={1000} />
              <button type="submit" disabled={!text.trim()} className="btn-brand px-4" aria-label="Send">
                <Send size={18} />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
