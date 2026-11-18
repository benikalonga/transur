'use client';
import { Bell, Clock3, Home, UserRound } from 'lucide-react';
import AppShell from '@/components/shell/AppShell';

const NAV = {
  items: [
    { href: '/rider', label: 'Home', icon: Home },
    { href: '/rider/trips', label: 'Activity', icon: Clock3 },
    { href: '/rider/inbox', label: 'Inbox', icon: Bell },
    { href: '/rider/account', label: 'Account', icon: UserRound },
  ],
  hideOn: ['/rider/ride', '/rider/send'],
};

export default function RiderLayout({ children }) {
  return <AppShell role="rider" nav={NAV}>{children}</AppShell>;
}
