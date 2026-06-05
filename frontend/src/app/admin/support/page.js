'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Search,
  Send,
  X,
  Plus,
  MessageSquare,
  AlertCircle,
  Check,
  ChevronDown,
  RefreshCw,
} from 'lucide-react';
import {
  getSupportConversations,
  getSupportMessages,
  replySupportConversation,
  updateConvStatus,
  createSupportConversation,
  getAdminUsers,
  getAdminSocket,
} from '@/lib/adminApi';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatFC(usd) {
  return Math.round((parseFloat(usd) || 0) * 2800).toLocaleString('fr-FR') + ' FC';
}

function timeAgo(date) {
  if (!date) return '';
  const d   = new Date(date);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60)   return 'À l\'instant';
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

function initials(name) {
  if (!name) return '?';
  return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

// ── Conversation status ───────────────────────────────────────────────────────

const STATUS_META = {
  open:     { label: 'Ouvert',    color: '#F59E0B', bg: '#FFF8E1' },
  assigned: { label: 'Assigné',   color: '#3B82F6', bg: '#EFF6FF' },
  resolved: { label: 'Résolu',    color: '#059669', bg: '#ECFDF5' },
  closed:   { label: 'Fermé',     color: '#6B7280', bg: '#F3F4F6' },
};

function ConvStatusBadge({ status }) {
  const meta = STATUS_META[status] ?? { label: status ?? '—', color: '#6B7280', bg: '#F3F4F6' };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ background: meta.bg, color: meta.color }}
    >
      {meta.label}
    </span>
  );
}

// ── Role Badge ────────────────────────────────────────────────────────────────

function RoleBadge({ role }) {
  const map = {
    driver:         { label: 'Chauffeur', color: '#007DC5', bg: '#EBF5FB' },
    delivery_agent: { label: 'Livreur',   color: '#7C3AED', bg: '#F5F3FF' },
    client:         { label: 'Client',    color: '#059669', bg: '#ECFDF5' },
    passenger:      { label: 'Passager',  color: '#059669', bg: '#ECFDF5' },
  };
  const meta = map[role] ?? { label: role ?? '—', color: '#6B7280', bg: '#F3F4F6' };
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ background: meta.bg, color: meta.color }}
    >
      {meta.label}
    </span>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg, isAdmin }) {
  const time = msg.createdAt ?? msg.created_at;
  return (
    <div className={`flex ${isAdmin ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-[72%] ${isAdmin ? 'items-end' : 'items-start'} flex flex-col`}>
        <div
          className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
            isAdmin
              ? 'bg-[#007DC5] text-white rounded-br-sm'
              : 'bg-gray-100 text-gray-800 rounded-bl-sm'
          }`}
        >
          {msg.message ?? msg.content ?? msg.text ?? ''}
        </div>
        <div className={`flex items-center gap-1 mt-1 text-[11px] text-gray-400 ${isAdmin ? 'flex-row-reverse' : ''}`}>
          <span>
            {time
              ? new Date(time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
              : ''}
          </span>
          {msg.sender_name ?? msg.senderName ? (
            <span>· {msg.sender_name ?? msg.senderName}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ── New conversation modal ────────────────────────────────────────────────────

function NewConvModal({ onClose, onCreate }) {
  const [userSearch, setUserSearch] = useState('');
  const [users, setUsers]           = useState([]);
  const [loading, setLoading]       = useState(false);
  const [selected, setSelected]     = useState(null);
  const [creating, setCreating]     = useState(false);
  const [err, setErr]               = useState('');

  useEffect(() => {
    if (!userSearch.trim()) { setUsers([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await getAdminUsers({ search: userSearch, limit: 10 });
        const raw = res.data;
        setUsers(Array.isArray(raw) ? raw : raw?.users ?? raw?.data ?? []);
      } catch (_) {
        setUsers([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [userSearch]);

  async function handleCreate() {
    if (!selected) return;
    setCreating(true);
    setErr('');
    try {
      const res = await createSupportConversation(selected._id ?? selected.id);
      onCreate(res.data?.conversation ?? res.data);
      onClose();
    } catch (e) {
      setErr(e?.response?.data?.message ?? 'Erreur lors de la création.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">Nouvelle conversation</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center"
          >
            <X size={16} className="text-gray-500" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Rechercher un utilisateur
            </label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Nom ou téléphone…"
                value={userSearch}
                onChange={(e) => { setUserSearch(e.target.value); setSelected(null); }}
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#007DC5]/30 focus:border-[#007DC5]"
              />
            </div>
          </div>

          {/* User results */}
          {loading && (
            <p className="text-xs text-gray-400 text-center">Recherche…</p>
          )}
          {users.length > 0 && (
            <ul className="border border-gray-100 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
              {users.map((u) => {
                const uid = u._id ?? u.id;
                return (
                  <li
                    key={uid}
                    onClick={() => setSelected(u)}
                    className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                      selected?._id === uid || selected?.id === uid
                        ? 'bg-[#007DC5]/8 border-l-2 border-[#007DC5]'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full bg-[#007DC5]/10 flex items-center justify-center text-[#007DC5] text-xs font-bold shrink-0">
                      {initials(u.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{u.name ?? '—'}</p>
                      <p className="text-xs text-gray-400">{u.phone ?? u.email ?? ''}</p>
                    </div>
                    <RoleBadge role={u.role} />
                    {(selected?._id === uid || selected?.id === uid) && (
                      <Check size={13} className="text-[#007DC5] shrink-0" />
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {selected && (
            <div className="flex items-center gap-2 px-3 py-2 bg-[#007DC5]/6 rounded-xl text-sm text-[#007DC5] font-medium">
              <Check size={14} />
              {selected.name ?? 'Utilisateur'} sélectionné
            </div>
          )}

          {err && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">
              <AlertCircle size={14} />
              {err}
            </div>
          )}

          <button
            onClick={handleCreate}
            disabled={!selected || creating}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-[#007DC5] hover:bg-[#006bb0] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {creating ? 'Création…' : 'Créer la conversation'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function SupportPage() {
  const [convs,       setConvs]       = useState([]);
  const [convSearch,  setConvSearch]  = useState('');
  const [convsLoading, setConvsLoading] = useState(true);

  const [activeConv,  setActiveConv]  = useState(null);
  const [messages,    setMessages]    = useState([]);
  const [msgsLoading, setMsgsLoading] = useState(false);

  const [inputMsg,    setInputMsg]    = useState('');
  const [sending,     setSending]     = useState(false);

  const [showNewModal, setShowNewModal] = useState(false);

  const messagesEndRef = useRef(null);

  // ── Load conversations ─────────────────────────────────────────────────────

  const loadConvs = useCallback(async () => {
    setConvsLoading(true);
    try {
      const res = await getSupportConversations({ search: convSearch || undefined });
      const raw = res.data;
      setConvs(Array.isArray(raw) ? raw : raw?.conversations ?? raw?.data ?? []);
    } catch (_) {
      setConvs([]);
    } finally {
      setConvsLoading(false);
    }
  }, [convSearch]);

  useEffect(() => {
    const t = setTimeout(loadConvs, 250);
    return () => clearTimeout(t);
  }, [loadConvs]);

  // ── Load messages when active conv changes ────────────────────────────────

  useEffect(() => {
    if (!activeConv) return;
    setMsgsLoading(true);
    setMessages([]);
    getSupportMessages(activeConv._id ?? activeConv.id)
      .then((res) => {
        const raw = res.data;
        setMessages(Array.isArray(raw) ? raw : raw?.messages ?? raw?.data ?? []);
        // Mark as read: reset unread in list
        setConvs((prev) =>
          prev.map((c) =>
            (c._id ?? c.id) === (activeConv._id ?? activeConv.id)
              ? { ...c, unread_count: 0, unreadCount: 0 }
              : c
          )
        );
      })
      .catch(() => setMessages([]))
      .finally(() => setMsgsLoading(false));
  }, [activeConv?._id, activeConv?.id]);

  // ── Auto-scroll messages ──────────────────────────────────────────────────

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Socket real-time ──────────────────────────────────────────────────────

  useEffect(() => {
    const socket = getAdminSocket();
    if (!socket) return;

    socket.on('support_message', (msg) => {
      const convId = msg.conversation_id ?? msg.conversationId;

      // Update conversations list unread count
      setConvs((prev) =>
        prev.map((c) => {
          const cid = c._id ?? c.id;
          if (cid !== convId) return c;
          const isActive =
            activeConv && (activeConv._id ?? activeConv.id) === convId;
          return {
            ...c,
            last_message:  msg.message ?? msg.content ?? '',
            lastMessage:   msg.message ?? msg.content ?? '',
            updated_at:    msg.createdAt ?? new Date().toISOString(),
            updatedAt:     msg.createdAt ?? new Date().toISOString(),
            unread_count:  isActive ? 0 : (c.unread_count ?? c.unreadCount ?? 0) + 1,
            unreadCount:   isActive ? 0 : (c.unread_count ?? c.unreadCount ?? 0) + 1,
          };
        })
      );

      // If active conversation, add message to messages list
      if (activeConv && (activeConv._id ?? activeConv.id) === convId) {
        setMessages((prev) => [...prev, msg]);
      }
    });

    return () => socket.off('support_message');
  }, [activeConv]);

  // ── Send message ──────────────────────────────────────────────────────────

  async function handleSend() {
    const text = inputMsg.trim();
    if (!text || !activeConv || sending) return;
    const convId = activeConv._id ?? activeConv.id;
    setSending(true);
    setInputMsg('');
    try {
      const res = await replySupportConversation(convId, text);
      const newMsg = res.data?.message ?? res.data ?? { message: text, isAdmin: true, createdAt: new Date().toISOString() };
      setMessages((prev) => [...prev, newMsg]);
      setConvs((prev) =>
        prev.map((c) =>
          (c._id ?? c.id) === convId
            ? { ...c, last_message: text, lastMessage: text, updated_at: new Date().toISOString() }
            : c
        )
      );
    } catch (_) {
      setInputMsg(text); // restore on error
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // ── Status change ─────────────────────────────────────────────────────────

  async function handleStatusChange(convId, status) {
    try {
      await updateConvStatus(convId, status);
      setConvs((prev) =>
        prev.map((c) => (c._id ?? c.id) === convId ? { ...c, status } : c)
      );
      if (activeConv && (activeConv._id ?? activeConv.id) === convId) {
        setActiveConv((prev) => ({ ...prev, status }));
      }
    } catch (_) {}
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const activeId = activeConv?._id ?? activeConv?.id;

  return (
    <div className="flex" style={{ height: 'calc(100vh - 64px)' }}>

      {/* ── LEFT: Conversations list ─────────────────────────────────────────── */}
      <aside
        className="bg-white border-r border-gray-100 flex flex-col overflow-hidden"
        style={{ width: 350 }}
      >
        {/* Header */}
        <div className="px-4 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-900">Support Client</h2>
            <div className="flex items-center gap-1.5">
              <button
                onClick={loadConvs}
                className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors"
              >
                <RefreshCw size={12} className={convsLoading ? 'animate-spin text-[#007DC5]' : 'text-gray-400'} />
              </button>
              <button
                onClick={() => setShowNewModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#007DC5] text-white text-xs font-semibold rounded-lg hover:bg-[#006bb0] transition-colors"
              >
                <Plus size={12} />
                Nouvelle conv.
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher une conversation…"
              value={convSearch}
              onChange={(e) => setConvSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#007DC5]/30 focus:border-[#007DC5]"
            />
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {convsLoading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-6 h-6 border-3 border-[#007DC5] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : convs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400 text-xs text-center gap-2">
              <MessageSquare size={28} className="opacity-30" />
              <p>Aucune conversation trouvée.</p>
            </div>
          ) : (
            convs.map((conv) => {
              const cid     = conv._id ?? conv.id;
              const name    = conv.user_name ?? conv.user?.name ?? conv.userName ?? '—';
              const role    = conv.user?.role ?? conv.userRole ?? '';
              const preview = conv.last_message ?? conv.lastMessage ?? '';
              const time    = conv.updated_at ?? conv.updatedAt ?? conv.createdAt;
              const unread  = conv.unread_count ?? conv.unreadCount ?? 0;
              const isActive = cid === activeId;

              return (
                <div
                  key={cid}
                  onClick={() => setActiveConv(conv)}
                  className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors border-b border-gray-50 ${
                    isActive ? 'bg-[#007DC5]/6 border-l-2 border-[#007DC5]' : 'hover:bg-gray-50'
                  }`}
                >
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full bg-[#007DC5]/10 flex items-center justify-center text-[#007DC5] text-xs font-bold shrink-0 mt-0.5">
                    {initials(name)}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-sm font-semibold text-gray-900 truncate">{name}</span>
                      <RoleBadge role={role} />
                    </div>
                    <p className="text-xs text-gray-500 truncate">{preview || 'Aucun message'}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <ConvStatusBadge status={conv.status} />
                    </div>
                  </div>

                  {/* Right side: time + unread */}
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-[10px] text-gray-400">{timeAgo(time)}</span>
                    {unread > 0 && (
                      <span className="w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                        {unread > 9 ? '9+' : unread}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* ── RIGHT: Active conversation ───────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden bg-gray-50">
        {!activeConv ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3">
            <MessageSquare size={44} className="opacity-20" />
            <p className="text-sm font-medium">Sélectionnez une conversation</p>
          </div>
        ) : (
          <>
            {/* Conversation header */}
            <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-center gap-4 shadow-sm">
              <div className="w-9 h-9 rounded-full bg-[#007DC5]/10 flex items-center justify-center text-[#007DC5] text-sm font-bold shrink-0">
                {initials(activeConv.user_name ?? activeConv.user?.name ?? activeConv.userName)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900 text-sm">
                    {activeConv.user_name ?? activeConv.user?.name ?? activeConv.userName ?? '—'}
                  </span>
                  <RoleBadge role={activeConv.user?.role ?? activeConv.userRole} />
                </div>
              </div>

              {/* Status selector */}
              <div className="flex items-center gap-2">
                <ConvStatusBadge status={activeConv.status} />
                <div className="relative">
                  <select
                    value={activeConv.status ?? 'open'}
                    onChange={(e) => handleStatusChange(activeId, e.target.value)}
                    className="appearance-none pl-2 pr-7 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#007DC5]/30 bg-white text-gray-700 font-medium"
                  >
                    <option value="open">Ouvert</option>
                    <option value="assigned">Assigné</option>
                    <option value="resolved">Résolu</option>
                    <option value="closed">Fermé</option>
                  </select>
                  <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>

                <button
                  onClick={() => handleStatusChange(activeId, 'resolved')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 text-white text-xs font-semibold rounded-lg hover:bg-green-600 transition-colors"
                >
                  <Check size={12} />
                  Résoudre
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {msgsLoading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="w-7 h-7 border-4 border-[#007DC5] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center py-10 text-gray-400 text-sm">
                  Aucun message dans cette conversation.
                </div>
              ) : (
                messages.map((msg, i) => {
                  const isAdmin = msg.sender_type === 'admin' || msg.senderType === 'admin' || msg.isAdmin;
                  return <MessageBubble key={msg._id ?? i} msg={msg} isAdmin={isAdmin} />;
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input bar */}
            <div className="bg-white border-t border-gray-100 px-4 py-3 flex items-end gap-3">
              <textarea
                rows={1}
                value={inputMsg}
                onChange={(e) => setInputMsg(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Écrire un message… (Entrée pour envoyer)"
                className="flex-1 resize-none px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#007DC5]/30 focus:border-[#007DC5] min-h-[42px] max-h-24 overflow-auto leading-relaxed"
                style={{ overflowY: 'auto' }}
              />
              <button
                onClick={handleSend}
                disabled={!inputMsg.trim() || sending}
                className="w-10 h-10 rounded-xl bg-[#007DC5] text-white flex items-center justify-center hover:bg-[#006bb0] transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                <Send size={16} />
              </button>
            </div>
          </>
        )}
      </main>

      {/* New conversation modal */}
      {showNewModal && (
        <NewConvModal
          onClose={() => setShowNewModal(false)}
          onCreate={(newConv) => {
            if (newConv) {
              setConvs((prev) => [newConv, ...prev]);
              setActiveConv(newConv);
            } else {
              loadConvs();
            }
          }}
        />
      )}
    </div>
  );
}
