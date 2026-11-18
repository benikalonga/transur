'use client';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle2, Clock, Copy, Share2, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { dateOnly } from '@/lib/format';
import { Button, TopBar } from '@/components/ui';

export default function InvitePage() {
  const [data, setData] = useState(null);

  useEffect(() => { api.me.referrals().then(setData).catch(() => {}); }, []);

  const link = data && typeof window !== 'undefined' ? `${window.location.origin}/login?ref=${data.code}` : '';

  const share = async () => {
    const text = `Join me on Transur — rides and deliveries at the price you choose. Use my code ${data.code} for a welcome discount: ${link}`;
    if (navigator.share) await navigator.share({ title: 'Transur', text, url: link }).catch(() => {});
    else {
      await navigator.clipboard.writeText(text);
      toast.success('Invite copied');
    }
  };

  return (
    <main className="pb-6">
      <TopBar title="Invite friends" />
      <div className="space-y-5 p-4">
        <div className="rounded-3xl bg-ink p-6 text-center text-white">
          <Users size={32} className="mx-auto text-volt" />
          <p className="mt-3 text-xl font-extrabold">Give a discount, get a reward</p>
          <p className="mt-1 text-sm text-white/70">Friends who sign up with your code get a welcome discount. When they finish their first trip, you get a reward code.</p>
          <button onClick={() => data && navigator.clipboard.writeText(data.code).then(() => toast.success('Code copied'))} className="mx-auto mt-5 flex items-center gap-3 rounded-2xl border-2 border-dashed border-white/30 px-6 py-3 text-2xl font-extrabold tracking-[.2em]">
            {data?.code || '·······'} <Copy size={18} className="text-white/60" />
          </button>
          <Button className="mt-5 w-full" onClick={share} disabled={!data}><Share2 size={18} /> Share invite</Button>
        </div>

        <section>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-ink-muted">Friends you invited</h2>
          <div className="surface divide-y divide-line">
            {data?.invited.map((f, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1"><p className="font-semibold">{f.full_name}</p><p className="text-xs text-ink-muted">Joined {dateOnly(f.created_at)}</p></div>
                {f.has_travelled ? <CheckCircle2 size={18} className="text-emerald-500" /> : <Clock size={18} className="text-ink-faint" />}
              </div>
            ))}
            {data && data.invited.length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-muted">No invites yet — share your code to get started.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}
