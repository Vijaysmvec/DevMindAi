import React, { useEffect, useState } from 'react';
import { Check, LogOut, Trash2, UserCog } from 'lucide-react';
import { GlassModal } from '../../components/glass/GlassModal';
import { GlassInput } from '../../components/glass/GlassInput';
import { api } from '../services/api';
import { firebaseSignOutSafe } from '../services/firebaseClient';
import { useSingularityStore } from '../store/singularityStore';

export function AuthModal() {
  const open = useSingularityStore((s) => s.authModalOpen);
  const setOpen = useSingularityStore((s) => s.setAuthModalOpen);
  const user = useSingularityStore((s) => s.user);
  const setAuth = useSingularityStore((s) => s.setAuth);
  const clearAuth = useSingularityStore((s) => s.clearAuth);

  const [displayNameEdit, setDisplayNameEdit] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) {
      setDisplayNameEdit(user.display_name || user.username || '');
    }
    setError(null);
    setConfirmDelete(false);
  }, [user, open]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !displayNameEdit.trim()) return;
    setError(null);
    setBusy(true);
    try {
      const updated = await api.updateProfile({ display_name: displayNameEdit.trim() });
      const { token, refreshToken } = useSingularityStore.getState();
      setAuth(updated, token, refreshToken);
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 1600);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update profile');
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.logoutSession().catch(() => {});
      await firebaseSignOutSafe();
    } finally {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('devmind_logged_out', '1');
      }
      setOpen(false);
      clearAuth();
      setBusy(false);
    }
  };

  const handleDeleteAccount = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.deleteAccount();
      await firebaseSignOutSafe();
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('devmind_logged_out', '1');
      }
      setOpen(false);
      clearAuth();
      setConfirmDelete(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Account deletion failed');
    } finally {
      setBusy(false);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <GlassModal
      open={open}
      onClose={() => setOpen(false)}
      title="Architect Identity & Session Security"
      subtitle="Verified server-side identity, session lifecycle & role-based access control"
      maxWidthClass="max-w-md"
    >
      <div className="space-y-4 text-xs" data-testid="authenticated-profile-panel">
          <div className="p-3.5 rounded-xl bg-white/[0.04] border border-white/10 flex items-center gap-3">
            {user.photo_url ? (
              <img
                src={user.photo_url}
                alt={user.display_name || user.username}
                className="w-11 h-11 rounded-full border border-[#56D9FF]/50 object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-11 h-11 rounded-full bg-[#101827] border border-[#FFB347]/50 flex items-center justify-center font-mono font-bold text-sm text-[#FFB347]">
                {(user.display_name || user.username || 'A').slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm text-[#FFF0D5] truncate">
                {user.display_name || user.username}
              </div>
              <div className="text-[#FFF0D5]/65 font-mono text-[11px] truncate">{user.email}</div>
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                <span className="px-2 py-0.5 rounded bg-[#56D9FF]/15 border border-[#56D9FF]/35 text-[10px] font-mono uppercase text-[#56D9FF]">
                  {user.provider || 'local'}
                </span>
                <span
                  data-testid="profile-role-badge"
                  className={`px-2 py-0.5 rounded border text-[10px] font-mono uppercase ${
                    user.role === 'admin'
                      ? 'bg-[#FFB347]/20 border-[#FFB347]/50 text-[#FFB347]'
                      : 'bg-white/[0.05] border-white/15 text-[#FFF0D5]/80'
                  }`}
                >
                  ROLE: {user.role || 'user'}
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-400/30 text-[10px] font-mono uppercase text-emerald-300">
                  {user.account_status || 'active'}
                </span>
              </div>
            </div>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-2.5">
            <label className="block text-[#FFF0D5]/80 font-medium">Display Name</label>
            <div className="flex gap-2">
              <GlassInput
                data-testid="profile-display-name-input"
                value={displayNameEdit}
                onChange={(e) => setDisplayNameEdit(e.target.value)}
                minLength={2}
                maxLength={120}
                containerClassName="flex-1"
              />
              <button
                type="submit"
                disabled={busy}
                data-testid="save-profile-btn"
                className="px-3.5 py-2 rounded-xl bg-[#56D9FF]/20 hover:bg-[#56D9FF]/30 border border-[#56D9FF]/45 text-[#FFF0D5] font-medium flex items-center gap-1.5 shrink-0"
              >
                {profileSaved ? <Check className="w-3.5 h-3.5 text-[#56D9FF]" /> : <UserCog className="w-3.5 h-3.5 text-[#56D9FF]" />}
                <span>{profileSaved ? 'Saved' : 'Update'}</span>
              </button>
            </div>
          </form>

          {error && (
            <div className="p-2.5 rounded-lg bg-[#FF7838]/15 border border-[#FF7838]/40 text-[#FFB347]">
              {error}
            </div>
          )}

          <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2">
            <button
              type="button"
              disabled={busy}
              data-testid="logout-btn"
              onClick={handleLogout}
              className="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/12 border border-white/15 text-[#FFF0D5] font-medium flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5 text-[#56D9FF]" />
              <span>Sign Out</span>
            </button>

            {!confirmDelete ? (
              <button
                type="button"
                disabled={busy}
                data-testid="delete-account-trigger"
                onClick={() => setConfirmDelete(true)}
                className="px-3 py-2 rounded-xl bg-[#FF7838]/10 hover:bg-[#FF7838]/20 border border-[#FF7838]/30 text-[#FF7838] flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Account</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={busy}
                  data-testid="confirm-delete-account-btn"
                  onClick={handleDeleteAccount}
                  className="px-3 py-1.5 rounded-lg bg-[#FF7838]/30 border border-[#FF7838]/70 text-[#FFF0D5] font-semibold"
                >
                  Confirm Delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="px-2.5 py-1.5 rounded-lg bg-white/10 text-[#FFF0D5]/75"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
    </GlassModal>
  );
}
