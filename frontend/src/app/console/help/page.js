'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { Headset, Send } from 'lucide-react';
import { consoleApi } from '@/lib/api';
import { consoleSocket } from '@/lib/socket';
import { ROLE_LABELS, timeAgo } from '@/lib/format';
import { PageHead, Tabs } from '@/components/console/kit';
import { Avatar, Empty, Pill } from '@/components/ui';

const CANNED = ['Thanks for reaching out — looking into this now.', 'Could you share the booking reference?', 'This has been resolved. Anything else we can help with?'];

function HelpDesk() {
  const params = useSearchParams();
  const [state, setState] = useState('open');
  const [threads, setThreads] = useState([]);
  const [activeId, setActiveId] = useState(params.get('thread'));
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const endRef = useRef(null);
  const activeRef = useRef(activeId);
  activeRef.current = activeId;

  const loadThreads = () => consoleApi.threads({ state: state || undefined }).then((r) => setThreads(r.threads)).catch(() => {});

  useEffect(() => {
    loadThreads();
    const socket = consoleSocket();
    const onMessage = (m) => {
      if (m.thread_id === activeRef.current) setMessages((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));
      loadThreads();
    };
    socket?.on('help:message', onMessage);
    return () => socket?.off('help:message', onMessage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  useEffect(() => {
    if (!activeId) return;
    consoleApi.thread(activeId).then((r) => { setActive(r.thread); setMessages(r.messages); }).catch((e) => toast.error(e.message));
  }, [activeId]);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages.length]);

  const send = async (body = text) => {
    if (!body.trim()) return;
    setText('');
    try {
      const { message } = await consoleApi.reply(activeId, body);
      setMessages((list) => (list.some((x) => x.id === message.id) ? list : [...list, message]));
    } catch (e) {
      toast.error(e.message);
    }
  };

  const setThreadState = async (s) => {
    await consoleApi.setThreadState(activeId, s).catch((e) => toast.error(e.message));
    setActive((a) => ({ ...a, state: s }));
    loadThreads();
  };

  return (
    <>
      <PageHead title="Help desk" subtitle="Live conversations with riders, drivers and couriers." />
      <div className="grid h-[calc(100vh-200px)] min-h-[520px] gap-4 lg:grid-cols-[340px_1fr]">
        <div className="surface flex flex-col overflow-hidden">
          <div className="px-3 pt-3"><Tabs value={state} onChange={setState} tabs={[{ value: 'open', label: 'Open' }, { value: 'pending', label: 'Replied' }, { value: 'closed', label: 'Closed' }]} /></div>
          <div className="flex-1 divide-y divide-line overflow-y-auto">
            {threads.map((t) => (
              <button key={t.id} onClick={() => setActiveId(t.id)} className={clsx('flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-canvas', t.id === activeId && 'bg-brand-50')}>
                <Avatar name={t.full_name} src={t.avatar_url} size={38} />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-2"><p className="truncate text-sm font-bold">{t.full_name}</p><span className="flex-shrink-0 text-[11px] text-ink-faint">{timeAgo(t.last_message_at || t.created_at)}</span></div>
                  <p className="truncate text-xs text-ink-muted">{t.last_message || 'No messages yet'}</p>
                </div>
                {t.unread_staff > 0 && <span className="rounded-full bg-brand-500 px-1.5 text-[11px] font-bold leading-5 text-white">{t.unread_staff}</span>}
              </button>
            ))}
            {threads.length === 0 && <p className="p-6 text-center text-sm text-ink-muted">No conversations.</p>}
          </div>
        </div>

        <div className="surface flex flex-col overflow-hidden">
          {!active ? (
            <div className="flex flex-1 items-center justify-center"><Empty icon={Headset} title="Pick a conversation" /></div>
          ) : (
            <>
              <div className="flex items-center gap-3 border-b border-line px-5 py-3">
                <div className="flex-1">
                  <p className="font-bold">{active.full_name}</p>
                  <p className="text-xs text-ink-muted">{ROLE_LABELS[active.role]} · {active.phone}</p>
                </div>
                <Pill tone={active.state === 'closed' ? 'gray' : active.state === 'open' ? 'amber' : 'green'}>{active.state}</Pill>
                {active.state !== 'closed'
                  ? <button onClick={() => setThreadState('closed')} className="btn-ghost px-3 py-1.5 text-xs">Close</button>
                  : <button onClick={() => setThreadState('open')} className="btn-ghost px-3 py-1.5 text-xs">Reopen</button>}
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto bg-canvas/60 p-5">
                {messages.map((m) => (
                  <div key={m.id} className={clsx('flex', m.author_type === 'staff' ? 'justify-end' : 'justify-start')}>
                    <div className={clsx('max-w-[70%] rounded-2xl px-3.5 py-2 text-sm', m.author_type === 'staff' ? 'rounded-br-md bg-brand-500 text-white' : 'rounded-bl-md bg-white')}>
                      <p className={clsx('mb-0.5 text-[11px] font-bold', m.author_type === 'staff' ? 'text-white/70' : 'text-brand-600')}>{m.author_name}</p>
                      {m.body}
                    </div>
                  </div>
                ))}
                <div ref={endRef} />
              </div>
              <div className="border-t border-line p-3">
                <div className="mb-2 flex flex-wrap gap-2">
                  {CANNED.map((c) => <button key={c} onClick={() => send(c)} className="chip-off py-1 text-xs">{c.slice(0, 38)}…</button>)}
                </div>
                <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex gap-2">
                  <input value={text} onChange={(e) => setText(e.target.value)} className="field flex-1 py-3" placeholder="Write a reply" />
                  <button className="btn-brand px-4" disabled={!text.trim()} aria-label="Send"><Send size={18} /></button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default function HelpPage() {
  return <Suspense><HelpDesk /></Suspense>;
}
