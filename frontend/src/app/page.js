'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { appSession, homeFor } from '@/lib/session';
import Logo from '@/components/Logo';

export default function Splash() {
  const router = useRouter();

  useEffect(() => {
    const profile = appSession.profile();
    const target = appSession.token() && profile ? homeFor(profile.role) : '/login';
    const t = setTimeout(() => router.replace(target), 450);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-ink text-white">
      <Logo size={64} light />
      <p className="mt-4 text-sm text-white/60">Rides & deliveries, at your price.</p>
      <div className="mt-10 h-1 w-24 overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-1/2 animate-pulse rounded-full bg-volt" />
      </div>
    </main>
  );
}
