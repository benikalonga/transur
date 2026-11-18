'use client';
import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Headset, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { appSocket } from '@/lib/socket';
import { Spinner, TopBar } from '@/components/ui';

const FAQ = [
  'I left something in the vehicle',
  'I was charged the wrong amount',
  'My driver/courier was rude',
  'I need help with my wallet',
];

/** Live chat with the Transur help desk. */
export default function HelpScreen() {
  const [thread, setThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    api.help.thread().then((r) => { setThread(r.thread); setMessages(r.messages); }).catch((e) => toast.error(e.message));
    const socket = appSocket();
    const onMessage = (m) => setMessages((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));
    socket?.on('help:message', onMessage);
    return () => socket?.off('help:message', onMessage);
  }, []);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages.length]);

  const send = (body = text) => {
    const trimmed = body.trim();
    if (!trimmed || !thread) return;
    const socket = appSocket();
    if (!socket?.connected) return toast.error('You are offline. Try again when you have signal.');
    setSending(true);
    socket.emit('help:send', { threadId: thread.id, body: trimmed }, (res) => {
      setSending(false);
      if (res?.error) toast.error(res.error);
    });
    setText('');
  };

  return (
    <main className="flex h-[calc(100dvh-5.5rem)] flex-col">
      <TopBar title="Help centre" subtitle="We usually reply within a few minutes" />
      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {!thread && <Spinner className="mx-auto block text-brand-500" />}
        {thread && messages.length === 0 && (
          <div className="py-6 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-500"><Headset size={26} /></div>
            <p className="font-bold">How can we help?</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {FAQ.map((q) => <button key={q} onClick={() => send(q)} className="chip-off text-xs">{q}</button>)}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={clsx('flex', m.author_type === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={clsx('max-w-[80%] rounded-2xl px-3.5 py-2 text-sm', m.author_type === 'user' ? 'rounded-br-md bg-brand-500 text-white' : 'rounded-bl-md bg-white')}>
              {m.author_type === 'staff' && <p className="mb-0.5 text-[11px] font-bold text-brand-600">{m.author_name} · Transur</p>}
              {m.body}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex gap-2 border-t border-line bg-white p-3">
        <input value={text} onChange={(e) => setText(e.target.value)} className="field flex-1 py-3" placeholder="Write a message" maxLength={2000} />
        <button className="btn-brand px-4" disabled={!text.trim() || sending} aria-label="Send"><Send size={18} /></button>
      </form>
    </main>
  );
}
