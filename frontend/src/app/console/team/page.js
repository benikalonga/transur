'use client';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { consoleApi } from '@/lib/api';
import { dateOnly, timeAgo } from '@/lib/format';
import { PageHead, Table } from '@/components/console/kit';
import { useStaff } from '@/components/console/ConsoleShell';
import { Pill } from '@/components/ui';

const TONE = { active: 'green', pending: 'amber', rejected: 'red' };

export default function TeamPage() {
  const { staff } = useStaff();
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => consoleApi.team().then((r) => setTeam(r.team)).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const act = async (fn, msg) => {
    try {
      await fn();
      toast.success(msg);
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  if (staff.role !== 'owner') return <p className="text-ink-muted">Only owners can manage the team.</p>;

  return (
    <>
      <PageHead title="Team" subtitle="Approve access requests and manage roles. Owners can change fares, promotions and wallets." />
      <Table
        loading={loading}
        rows={team}
        columns={[
          { key: 'full_name', label: 'Name', render: (m) => <div><p className="font-semibold">{m.full_name}{m.id === staff.id ? ' (you)' : ''}</p><p className="text-xs text-ink-muted">{m.email}</p></div> },
          { key: 'role', label: 'Role', render: (m) => <Pill tone={m.role === 'owner' ? 'violet' : 'gray'}>{m.role}</Pill> },
          { key: 'access_status', label: 'Access', render: (m) => <Pill tone={TONE[m.access_status]}>{m.access_status}</Pill> },
          { key: 'last_login_at', label: 'Last sign-in', render: (m) => (m.last_login_at ? timeAgo(m.last_login_at) : 'Never') },
          { key: 'created_at', label: 'Requested', render: (m) => dateOnly(m.created_at) },
          { key: 'actions', label: '', render: (m) => m.id !== staff.id && (
            <div className="flex flex-wrap justify-end gap-1.5">
              {m.access_status !== 'active' && <button onClick={() => act(() => consoleApi.updateMember(m.id, { access_status: 'active' }), 'Access granted')} className="btn-brand px-3 py-1.5 text-xs">Approve</button>}
              {m.access_status === 'pending' && <button onClick={() => act(() => consoleApi.updateMember(m.id, { access_status: 'rejected' }), 'Request declined')} className="btn-ghost px-3 py-1.5 text-xs">Decline</button>}
              {m.access_status === 'active' && (
                <button onClick={() => act(() => consoleApi.updateMember(m.id, { role: m.role === 'owner' ? 'agent' : 'owner' }), 'Role updated')} className="btn-ghost px-3 py-1.5 text-xs">
                  Make {m.role === 'owner' ? 'agent' : 'owner'}
                </button>
              )}
              <button onClick={() => window.confirm(`Remove ${m.full_name}?`) && act(() => consoleApi.removeMember(m.id), 'Removed')} className="btn-ghost px-3 py-1.5 text-xs text-red-500">Remove</button>
            </div>
          ) },
        ]}
      />
    </>
  );
}
