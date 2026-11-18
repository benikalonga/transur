'use client';
import { Package as Car, ClipboardList, UserRound, Wallet } from 'lucide-react';
import AppShell from '@/components/shell/AppShell';

const NAV = {
  items: [
    { href: '/courier', label: 'Deliver', icon: Car },
    { href: '/courier/earnings', label: 'Earnings', icon: Wallet },
    { href: '/courier/jobs', label: 'Jobs', icon: ClipboardList },
    { href: '/courier/account', label: 'Account', icon: UserRound },
  ],
};

export default function CourierLayout({ children }) {
  return <AppShell role="courier" nav={NAV}>{children}</AppShell>;
}
