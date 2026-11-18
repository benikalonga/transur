'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import clsx from 'clsx';
import { Bell } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { appSession, homeFor } from '@/lib/session';
import { appSocket } from '@/lib/socket';
import { Spinner } from '@/components/ui';

const AccountContext = createContext(null);
export const useAccount = () => useContext(AccountContext);

/**
 * Wraps every signed-in area: checks the session and role, keeps the profile
 * fresh, surfaces live notifications and renders the bottom navigation.
 */
export default function AppShell({ role, nav, children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [profile, setProfile] = useState(null);
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const { user } = await api.me.get();
      setProfile(user);
      appSession.updateProfile(user);
      return user;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    const stored = appSession.profile();
    if (!appSession.token() || !stored) return router.replace('/login');
    if (stored.role !== role) return router.replace(homeFor(stored.role));
    setProfile(stored);
    refresh();
    api.notifications.list().then((r) => setUnread(r.unread)).catch(() => {});

    const socket = appSocket();
    if (!socket) return undefined;
    const onNotification = (n) => {
      setUnread((c) => c + 1);
      if (n.category !== 'booking') toast(n.body, { icon: '🔔', duration: 5000 });
    };
    const onSuspended = () => {
      toast.error('Your account has been suspended.');
      appSession.clear();
      router.replace('/login');
    };
    socket.on('notification', onNotification);
    socket.on('account:suspended', onSuspended);
    return () => {
      socket.off('notification', onNotification);
      socket.off('account:suspended', onSuspended);
    };
  }, [role, router, refresh]);

  if (!profile) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <Spinner size={28} className="text-brand-500" />
      </div>
    );
  }

  const fullScreen = nav.hideOn?.some((p) => pathname.startsWith(p));
  const base = nav.items[0].href;

  return (
    <AccountContext.Provider value={{ profile, refresh, unread, setUnread, role }}>
      <div className={clsx('phone-frame', !fullScreen && 'pb-nav')}>
        {children}
        {!fullScreen && (
          <nav className="fixed bottom-0 left-1/2 z-[900] w-full max-w-md -translate-x-1/2 border-t border-line bg-white/95 pb-[max(.5rem,env(safe-area-inset-bottom))] backdrop-blur">
            <ul className="flex">
              {nav.items.map(({ href, label, icon: Icon }) => {
                const active = href === base ? pathname === base : pathname.startsWith(href);
                return (
                  <li key={href} className="flex-1">
                    <Link href={href} className="relative flex flex-col items-center gap-1 pt-2.5 text-[11px] font-semibold">
                      <Icon size={22} className={active ? 'text-brand-500' : 'text-ink-faint'} strokeWidth={active ? 2.4 : 2} />
                      <span className={active ? 'text-ink' : 'text-ink-faint'}>{label}</span>
                      {href.endsWith('/inbox') && unread > 0 && (
                        <span className="absolute right-[calc(50%-18px)] top-1.5 min-w-[18px] rounded-full bg-red-500 px-1 text-center text-[10px] leading-[18px] text-white">
                          {unread > 9 ? '9+' : unread}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </div>
    </AccountContext.Provider>
  );
}

/** Bell shortcut used in page headers. */
export function InboxBell({ href }) {
  const { unread } = useAccount();
  return (
    <Link href={href} className="tap relative flex h-11 w-11 items-center justify-center rounded-full bg-white text-ink shadow-sm" aria-label="Notifications">
      <Bell size={20} />
      {unread > 0 && <span className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-red-500" />}
    </Link>
  );
}
