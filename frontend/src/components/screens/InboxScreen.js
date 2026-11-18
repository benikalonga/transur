'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { Bell, CarFront, Gift, Receipt, ShieldCheck, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { useAccount } from '@/components/shell/AppShell';
import { Empty, Spinner, TopBar } from '@/components/ui';

const ICONS = { booking: CarFront, receipt: Receipt, promo: Gift, safety: ShieldCheck, earnings: Wallet };

export default function InboxScreen({ tripsPath }) {
  const { setUnread } = useAccount();
  const [items, setItems] = useState(null);

  useEffect(() => {
    api.notifications.list()
      .then((r) => {
        setItems(r.notifications);
        if (r.unread) api.notifications.markRead().then(() => setUnread(0)).catch(() => {});
      })
      .catch(() => setItems([]));
  }, [setUnread]);

  return (
    <main>
      <TopBar title="Inbox" back={false} />
      {!items && <Spinner className="mx-auto my-10 block text-brand-500" />}
      {items?.length === 0 && <Empty icon={Bell} title="You are all caught up" text="Trip updates, receipts and offers will appear here." />}
      <ul className="divide-y divide-line bg-white">
        {items?.map((n) => {
          const Icon = ICONS[n.category] || Bell;
          const body = (
            <div className={clsx('flex gap-3 px-4 py-4', !n.read_at && 'bg-brand-50/40')}>
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-canvas text-brand-600"><Icon size={18} /></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold">{n.title}</p>
                  <span className="flex-shrink-0 text-[11px] text-ink-faint">{timeAgo(n.created_at)}</span>
                </div>
                <p className="mt-0.5 text-sm text-ink-muted">{n.body}</p>
              </div>
            </div>
          );
          return (
            <li key={n.id}>
              {n.booking_id && tripsPath ? <Link href={`${tripsPath}/${n.booking_id}`}>{body}</Link> : body}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
