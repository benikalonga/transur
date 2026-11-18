'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import {
  BadgePercent, BarChart3, CalendarRange, Headset, LayoutDashboard, LogOut, Map as MapIcon, Menu,
  ShieldAlert, SlidersHorizontal, UserCog, Users, Wallet, X,
} from 'lucide-react';
import { consoleApi } from '@/lib/api';
import { consoleSession } from '@/lib/session';
import { consoleSocket, closeSockets } from '@/lib/socket';
import { Spinner } from '@/components/ui';
import Logo from '@/components/Logo';

const StaffContext = createContext(null);
export const useStaff = () => useContext(StaffContext);

const NAV = [
  { href: '/console', label: 'Overview', icon: LayoutDashboard },
  { href: '/console/live', label: 'Live map', icon: MapIcon },
  { href: '/console/bookings', label: 'Bookings', icon: CalendarRange },
  { href: '/console/people', label: 'People', icon: Users },
  { href: '/console/wallets', label: 'Wallets', icon: Wallet },
  { href: '/console/finance', label: 'Finance', icon: BarChart3 },
  { href: '/console/fares', label: 'Fares', icon: SlidersHorizontal },
  { href: '/console/promos', label: 'Promotions', icon: BadgePercent },
  { href: '/console/safety', label: 'Safety', icon: ShieldAlert, badge: 'sos' },
  { href: '/console/help', label: 'Help desk', icon: Headset, badge: 'help' },
  { href: '/console/team', label: 'Team', icon: UserCog, owner: true },
];

export default function ConsoleShell({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [staff, setStaff] = useState(null);
  const [menu, setMenu] = useState(false);
  const [badges, setBadges] = useState({ sos: 0, help: 0 });

  const isAuthPage = pathname === '/console/login';

  useEffect(() => {
    if (isAuthPage) return undefined;
    if (!consoleSession.token()) {
      router.replace('/console/login');
      return undefined;
    }
    setStaff(consoleSession.profile());
    consoleApi.me().then((r) => setStaff(r.staff)).catch(() => {});
    consoleApi.overview().then((o) => setBadges({ sos: o.openSos, help: o.openHelp })).catch(() => {});

    const socket = consoleSocket();
    const onSos = (a) => {
      setBadges((b) => ({ ...b, sos: b.sos + 1 }));
      toast.error(`🚨 SOS from ${a.name} (${a.phone})`, { duration: 15000 });
    };
    const onHelp = (m) => m.author_type === 'user' && setBadges((b) => ({ ...b, help: b.help + 1 }));
    socket?.on('sos:new', onSos);
    socket?.on('help:message', onHelp);
    return () => {
      socket?.off('sos:new', onSos);
      socket?.off('help:message', onHelp);
    };
  }, [isAuthPage, router]);

  useEffect(() => setMenu(false), [pathname]);

  if (isAuthPage) return children;
  if (!staff) return <div className="flex min-h-screen items-center justify-center"><Spinner className="text-brand-500" /></div>;

  const signOut = () => {
    closeSockets();
    consoleSession.clear();
    router.replace('/console/login');
  };

  const sidebar = (
    <aside className="flex h-full w-64 flex-col bg-ink text-white">
      <div className="flex items-center justify-between px-5 py-5">
        <Logo size={32} light />
        <button className="lg:hidden" onClick={() => setMenu(false)} aria-label="Close menu"><X size={20} /></button>
      </div>
      <p className="px-5 pb-2 text-[10px] font-bold uppercase tracking-[.2em] text-white/40">Operations console</p>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
        {NAV.filter((n) => !n.owner || staff.role === 'owner').map(({ href, label, icon: Icon, badge }) => {
          const active = href === '/console' ? pathname === href : pathname.startsWith(href);
          const count = badge ? badges[badge] : 0;
          return (
            <Link key={href} href={href} className={clsx('flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold', active ? 'bg-brand-500 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white')}>
              <Icon size={18} />
              <span className="flex-1">{label}</span>
              {count > 0 && <span className={clsx('rounded-full px-2 text-xs leading-5', badge === 'sos' ? 'bg-red-500' : 'bg-volt text-ink')}>{count}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-4">
        <p className="truncate text-sm font-bold">{staff.full_name}</p>
        <p className="truncate text-xs text-white/50">{staff.email} · {staff.role}</p>
        <button onClick={signOut} className="mt-3 flex items-center gap-2 text-sm font-semibold text-white/70 hover:text-white"><LogOut size={16} /> Sign out</button>
      </div>
    </aside>
  );

  return (
    <StaffContext.Provider value={{ staff, setBadges }}>
      <div className="min-h-screen bg-canvas lg:pl-64">
        <div className="fixed inset-y-0 left-0 z-40 hidden lg:block">{sidebar}</div>
        {menu && (
          <div className="fixed inset-0 z-50 flex lg:hidden" onClick={() => setMenu(false)}>
            <div onClick={(e) => e.stopPropagation()}>{sidebar}</div>
            <div className="flex-1 bg-ink/40" />
          </div>
        )}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
          <button onClick={() => setMenu(true)} aria-label="Open menu"><Menu size={22} /></button>
          <Logo size={26} />
        </header>
        <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </StaffContext.Provider>
  );
}

