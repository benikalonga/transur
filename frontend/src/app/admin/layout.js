'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  Users,
  Car,
  Package,
  Map,
  DollarSign,
  Wallet,
  MessageSquare,
  Settings,
  Shield,
  LogOut,
  Bell,
  Truck,
} from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Tableau de bord', href: '/admin',            icon: LayoutDashboard },
  { label: 'Utilisateurs',    href: '/admin/utilisateurs', icon: Users },
  { label: 'Chauffeurs',      href: '/admin/chauffeurs',   icon: Car },
  { label: 'Livreurs',        href: '/admin/livreurs',     icon: Truck },
  { label: 'Courses',         href: '/admin/courses',      icon: Map },
  { label: 'Livraisons',      href: '/admin/livraisons',   icon: Package },
  { label: 'Finances',        href: '/admin/finance',      icon: DollarSign },
  { label: 'Portefeuilles',   href: '/admin/portefeuilles', icon: Wallet },
  { label: 'Carte Live',      href: '/admin/carte',        icon: Map },
  { label: 'Support Client',  href: '/admin/support',      icon: MessageSquare, supportBadge: true },
  { label: 'Tarifs',          href: '/admin/tarifs',       icon: Settings },
];

const SUPERADMIN_ITEMS = [
  { label: 'Admins', href: '/admin/admins', icon: Shield },
];

const PAGE_TITLES = {
  '/admin':               'Tableau de bord',
  '/admin/utilisateurs':  'Utilisateurs',
  '/admin/chauffeurs':    'Chauffeurs',
  '/admin/livreurs':      'Livreurs',
  '/admin/courses':       'Courses',
  '/admin/livraisons':    'Livraisons',
  '/admin/finance':       'Finances',
  '/admin/portefeuilles': 'Portefeuilles',
  '/admin/carte':         'Carte Live',
  '/admin/support':       'Support Client',
  '/admin/tarifs':        'Tarifs',
  '/admin/admins':        'Gestion des Admins',
};

function NavItem({ item, active, unreadSupport }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 px-4 py-2.5 rounded-lg mx-2 transition-all text-sm font-medium group ${
        active
          ? 'bg-[#007DC5] text-white'
          : 'text-slate-300 hover:bg-white/10 hover:text-white'
      }`}
    >
      <Icon size={17} className="shrink-0" />
      <span className="flex-1">{item.label}</span>
      {item.supportBadge && unreadSupport > 0 && (
        <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none">
          {unreadSupport > 99 ? '99+' : unreadSupport}
        </span>
      )}
    </Link>
  );
}

export default function AdminLayout({ children }) {
  const router   = useRouter();
  const pathname = usePathname();

  const [admin, setAdmin]               = useState(null);
  const [unreadSupport, setUnreadSupport] = useState(0);
  const [ready, setReady]               = useState(false);

  const isLoginPage = pathname.startsWith('/admin/login');

  // Override the mobile-first body constraint for admin pages
  useEffect(() => {
    const body = document.body;
    const prev = body.getAttribute('class') || '';
    body.style.maxWidth = '100%';
    body.style.margin   = '0';
    body.style.background = '#f1f5f9';
    return () => {
      body.style.maxWidth  = '';
      body.style.margin    = '';
      body.style.background = '';
    };
  }, []);

  useEffect(() => {
    if (isLoginPage) { setReady(true); return; }

    const token = localStorage.getItem('admin_token');
    if (!token) { router.replace('/admin/login'); return; }

    try {
      const stored = localStorage.getItem('admin_user');
      if (stored) setAdmin(JSON.parse(stored));
    } catch (_) {}

    setReady(true);
  }, [isLoginPage, router]);

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    router.replace('/admin/login');
  };

  // Don't render chrome on login page
  if (isLoginPage) {
    return <>{children}</>;
  }

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-100">
        <div className="w-8 h-8 border-4 border-[#007DC5] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isSuperAdmin = admin?.role === 'superadmin';
  const allNavItems  = isSuperAdmin ? [...NAV_ITEMS, ...SUPERADMIN_ITEMS] : NAV_ITEMS;

  // Determine active nav: exact match for /admin, startsWith for others
  const getActive = (href) =>
    href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);

  // Current page title
  const pageTitle =
    Object.entries(PAGE_TITLES)
      .sort((a, b) => b[0].length - a[0].length)
      .find(([key]) => pathname.startsWith(key))?.[1] ?? 'Administration';

  // Admin initials for avatar
  const initials = admin?.name
    ? admin.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : 'A';

  return (
    <div className="min-h-screen bg-slate-100">
      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside
        className="fixed inset-y-0 left-0 z-40 flex flex-col"
        style={{ width: 240, background: '#0A1628' }}
      >
        {/* Logo */}
        <div className="px-6 pt-6 pb-5 border-b border-white/10">
          <div className="text-white text-xl font-bold tracking-tight">
            🚖 Transur
          </div>
          <div className="text-slate-400 text-xs mt-0.5 font-medium uppercase tracking-widest">
            Administration
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 space-y-0.5">
          {allNavItems.map((item) => (
            <NavItem
              key={item.href}
              item={item}
              active={getActive(item.href)}
              unreadSupport={unreadSupport}
            />
          ))}
        </nav>

        {/* Bottom: admin info + logout */}
        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-[#007DC5] flex items-center justify-center text-white text-xs font-bold shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-white text-sm font-semibold truncate">
                {admin?.name ?? 'Admin'}
              </p>
              <p className="text-slate-400 text-xs truncate">
                {admin?.email ?? ''}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-slate-400 hover:bg-white/10 hover:text-white transition-colors text-sm font-medium"
          >
            <LogOut size={15} />
            Déconnexion
          </button>
        </div>
      </aside>

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <header
        className="fixed top-0 right-0 z-30 flex items-center bg-white shadow-sm"
        style={{ left: 240, height: 64 }}
      >
        <div className="flex-1 px-6">
          <h1 className="text-lg font-semibold text-gray-900">{pageTitle}</h1>
        </div>
        <div className="flex items-center gap-3 px-6">
          {/* Notifications bell */}
          <button className="relative w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center transition-colors">
            <Bell size={18} className="text-gray-600" />
          </button>

          {/* Admin avatar */}
          <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
            <div className="w-8 h-8 rounded-full bg-[#007DC5] flex items-center justify-center text-white text-xs font-bold">
              {initials}
            </div>
            <span className="text-sm font-medium text-gray-700 max-w-[120px] truncate">
              {admin?.name ?? 'Admin'}
            </span>
          </div>
        </div>
      </header>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <main
        className="overflow-auto min-h-screen"
        style={{ marginLeft: 240, paddingTop: 64 }}
      >
        {children}
      </main>
    </div>
  );
}
