import Link from 'next/link';
import Logo from '@/components/Logo';

export default function NotFound() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 p-6 text-center">
      <Logo size={48} />
      <h1 className="text-2xl font-extrabold">Wrong turn</h1>
      <p className="text-ink-muted">We could not find that page.</p>
      <Link href="/" className="btn-brand">Back to Transur</Link>
    </main>
  );
}
