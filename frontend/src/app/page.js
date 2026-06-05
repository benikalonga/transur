'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('transur_token');
    const user = localStorage.getItem('transur_user');

    if (token && user) {
      const parsed = JSON.parse(user);
      const routes = { client: '/client', driver: '/driver', delivery: '/delivery', admin: '/admin' };
      router.replace(routes[parsed.role] || '/auth/login');
    } else {
      router.replace('/auth/login');
    }
  }, [router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center header-blue">
      <div className="text-white text-center">
        <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center font-black text-3xl mx-auto mb-4">T</div>
        <div className="text-3xl font-black mb-1">Transur</div>
        <div className="text-blue-100 text-sm">Taxi & Livraison · Lubumbashi</div>
        <div className="mt-6 w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto" />
      </div>
    </div>
  );
}
