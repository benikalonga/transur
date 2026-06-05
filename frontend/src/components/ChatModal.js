'use client';
import { useState, useEffect, useRef } from 'react';
import { X, Send, MessageCircle } from 'lucide-react';
import { getSocket } from '@/lib/socket';
import { getChatHistory } from '@/lib/api';

export default function ChatModal({
  isOpen,
  onClose,
  referenceId,      // trip ID or delivery ID
  referenceType,    // 'trip' or 'delivery'
  toUserId,         // recipient user ID
  currentUserId,    // sender user ID
  accentColor = '#007DC5'
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const inputRef = useRef('');
  const bottomRef = useRef(null);
  const socketRef = useRef(null);

  // Load history and listen for new messages
  useEffect(() => {
    if (!isOpen || !referenceId) return;

    // Load history
    getChatHistory(referenceType, referenceId)
      .then(({ data }) => setMessages(data.messages || []))
      .catch(() => {});

    // Listen on socket
    const socket = getSocket();
    if (!socket) return;
    socketRef.current = socket;

    const handler = (msg) => {
      // Only show messages for this trip/delivery
      const refId = msg.tripId || msg.deliveryId;
      if (refId && refId !== referenceId) return;
      setMessages(prev => {
        // Avoid duplicates by id
        if (msg.id && prev.find(m => m.id === msg.id)) return prev;
        return [...prev, {
          id: msg.id,
          sender_id: msg.from,
          sender_name: msg.fromName,
          message: msg.text,
          created_at: msg.at
        }];
      });
    };

    socket.on('message', handler);
    return () => socket.off('message', handler);
  }, [isOpen, referenceId, referenceType]);

  // Scroll to bottom on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = () => {
    const text = inputRef.current.trim();
    if (!text || !toUserId) return;
    setSending(true);
    const socket = socketRef.current || getSocket();
    socket?.emit('message', {
      to: toUserId,
      text,
      ...(referenceType === 'trip' ? { tripId: referenceId } : { deliveryId: referenceId }),
      referenceType,
    });
    inputRef.current = '';
    setInput('');
    setSending(false);
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const fmtTime = (d) => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex flex-col bg-white" style={{ maxWidth: '28rem', left: '50%', transform: 'translateX(-50%)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100" style={{ background: accentColor }}>
        <div className="flex items-center gap-3">
          <MessageCircle size={20} className="text-white" />
          <h2 className="text-white font-black text-base">Messagerie</h2>
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
          <X size={18} className="text-white" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <MessageCircle size={40} className="text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">Aucun message pour l'instant</p>
            <p className="text-gray-300 text-xs mt-1">Envoyez un message pour commencer</p>
          </div>
        )}
        {messages.map((msg, i) => {
          const isMine = msg.sender_id === currentUserId;
          return (
            <div key={msg.id || i} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
              {!isMine && (
                <span className="text-xs text-gray-400 mb-1 ml-1">{msg.sender_name}</span>
              )}
              <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${
                isMine
                  ? 'text-white rounded-br-sm'
                  : 'bg-white text-gray-900 rounded-bl-sm shadow-sm border border-gray-100'
              }`} style={isMine ? { background: accentColor } : {}}>
                {msg.message}
              </div>
              <span className="text-[10px] text-gray-300 mt-1 mx-1">{fmtTime(msg.created_at)}</span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 bg-white border-t border-gray-100 flex items-center gap-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        <input
          value={input}
          onChange={e => { inputRef.current = e.target.value; setInput(e.target.value); }}
          onKeyDown={handleKey}
          placeholder="Écrire un message…"
          className="flex-1 bg-gray-100 rounded-2xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
        />
        <button
          onClick={sendMessage}
          disabled={!input.trim() || sending}
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-40 transition-opacity"
          style={{ background: accentColor }}
        >
          <Send size={16} className="text-white" />
        </button>
      </div>
    </div>
  );
}

// ── ChatButton: floating button to open chat ──────────────────────────────────
export function ChatButton({ onOpen, accentColor = '#007DC5', unread = 0 }) {
  return (
    <button
      onClick={onOpen}
      className="relative flex items-center gap-2 px-4 py-2.5 rounded-2xl text-white text-sm font-bold shadow-lg"
      style={{ background: accentColor }}
    >
      <MessageCircle size={16} />
      <span>Chat</span>
      {unread > 0 && (
        <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center">
          {unread}
        </span>
      )}
    </button>
  );
}
