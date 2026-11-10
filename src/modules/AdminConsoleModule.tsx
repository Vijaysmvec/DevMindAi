import { useEffect, useState } from 'react';
import { Lock, RefreshCw, ShieldAlert, UserCheck, UserX } from 'lucide-react';
import { GlassPanel } from '../../components/glass/GlassPanel';
import { GlassCard } from '../../components/glass/GlassCard';
import { api } from '../services/api';
import { UserProfile, useSingularityStore } from '../store/singularityStore';

interface AuditRow {
  id: number;
  request_id: string;
  user_id: number | null;
  event_type: string;
  ip_address: string;
  target_resource: string;
  status: string;
  details: Record<string, unknown>;
  created_at: string;
}

export function AdminConsoleModule() {
  const currentUser = useSingularityStore((s) => s.user);
  const currentUserId = currentUser?.id ?? null;
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAdminData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [uList, aList] = await Promise.all([api.adminListUsers(), api.adminListAuditLogs()]);
      setUsers(uList);
      setLogs(aList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Administrative access denied');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!currentUserId) {
      setUsers([]);
      setLogs([]);
      setLoading(false);
      return;
    }
    void loadAdminData();
  }, [currentUserId]);

  const toggleStatus = async (u: UserProfile) => {
    const nextStatus = u.account_status === 'disabled' ? 'active' : 'disabled';
    try {
      const updated = await api.adminUpdateUserStatus(u.id, { account_status: nextStatus });
      setUsers((prev) => prev.map((item) => (item.id === u.id ? updated : item)));
      const freshLogs = await api.adminListAuditLogs();
      setLogs(freshLogs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update account status');
    }
  };

  return (
    <div className="h-full flex flex-col gap-3 overflow-y-auto pr-1" data-testid="admin-console-module">
      <GlassPanel className="px-5 py-3.5 shrink-0" edgeParticles>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#FFB347]/15 border border-[#FFB347]/40 text-[#FFB347]">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-[#FFF0D5]">
                Singularity Administrative Security Console
              </h1>
              <p className="text-xs text-[#FFF0D5]/60">
                Server-enforced RBAC user governance &amp; structured Request-ID security audit trail
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={loadAdminData}
            className="px-3 py-1.5 rounded-xl text-xs bg-white/[0.05] hover:bg-white/10 border border-white/15 text-[#FFF0D5] flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#56D9FF] ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </GlassPanel>

      {error ? (
        <GlassCard interactive={false} accent="gold" className="border-[#FF7838]/40">
          <div className="flex items-center gap-2 text-xs text-[#FFB347]">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 flex-1 min-h-0">
          <GlassPanel className="p-4 flex flex-col overflow-hidden">
            <h2 className="text-xs font-mono uppercase tracking-wider text-[#56D9FF] mb-3">
              Registered Identities ({users.length})
            </h2>
            <div className="flex-1 overflow-y-auto space-y-2">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="p-3 rounded-xl bg-black/35 border border-white/10 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-[#FFF0D5] truncate">
                      {u.display_name || u.username}{' '}
                      <span className="font-mono text-[10px] text-[#FFB347]">[{u.role}]</span>
                    </div>
                    <div className="font-mono text-[11px] text-[#FFF0D5]/60 truncate">{u.email}</div>
                    <div className="text-[10px] font-mono text-[#FFF0D5]/45 mt-0.5">
                      Provider: {u.provider} • Status: {u.account_status}
                    </div>
                  </div>
                  {currentUser?.id !== u.id && u.account_status !== 'deleted' && (
                    <button
                      type="button"
                      onClick={() => toggleStatus(u)}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-mono border flex items-center gap-1 shrink-0 ${
                        u.account_status === 'disabled'
                          ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
                          : 'bg-[#FF7838]/15 border-[#FF7838]/40 text-[#FFB347]'
                      }`}
                    >
                      {u.account_status === 'disabled' ? (
                        <>
                          <UserCheck className="w-3 h-3" />
                          <span>Enable</span>
                        </>
                      ) : (
                        <>
                          <UserX className="w-3 h-3" />
                          <span>Disable</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </GlassPanel>

          <GlassPanel className="p-4 flex flex-col overflow-hidden">
            <h2 className="text-xs font-mono uppercase tracking-wider text-[#FFB347] mb-3">
              Recent Security Audit Events ({logs.length})
            </h2>
            <div className="flex-1 overflow-y-auto space-y-2 font-mono text-[11px]">
              {logs.map((l) => (
                <div key={l.id} className="p-2.5 rounded-xl bg-black/35 border border-white/10 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[#56D9FF] font-semibold">{l.event_type}</span>
                    <span
                      className={
                        l.status === 'denied' || l.status === 'blocked'
                          ? 'text-[#FF7838]'
                          : 'text-emerald-300'
                      }
                    >
                      {l.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-[#FFF0D5]/60 truncate">
                    uid={l.user_id ?? 'anon'} • ip={l.ip_address || 'local'} • req={l.request_id.slice(0, 10)}
                  </div>
                  {l.target_resource && (
                    <div className="text-[#FFB347]/80 truncate">target: {l.target_resource}</div>
                  )}
                </div>
              ))}
            </div>
          </GlassPanel>
        </div>
      )}
    </div>
  );
}
