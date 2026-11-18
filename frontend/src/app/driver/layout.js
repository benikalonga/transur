'use client';
import { Car, ClipboardList, UserRound, Wallet } from 'lucide-react';
import AppShell from '@/components/shell/AppShell';

const NAV = {
  items: [
    { href: '/driver', label: 'Drive', icon: Car },
    { href: '/driver/earnings', label: 'Earnings', icon: Wallet },
    { href: '/driver/jobs', label: 'Jobs', icon: ClipboardList },
    { href: '/driver/account', label: 'Account', icon: UserRound },
  ],
};

export default function DriverLayout({ children }) {
  return <AppShell role="driver" nav={NAV}>{children}</AppShell>;
}
