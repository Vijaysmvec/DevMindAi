import { useEffect } from 'react';
import { Eye, FolderGit2, SlidersHorizontal, Sparkles, UserCheck } from 'lucide-react';
import { BlackHoleScene } from '../components/space/BlackHoleScene';
import { GravitationalCursor } from '../components/space/GravitationalCursor';
import { DynamicGlassLighting } from '../components/space/DynamicGlassLighting';
import { GravityTextEffect } from '../components/space/GravityTextEffect';
import { GlassSidebar } from '../components/glass/GlassSidebar';
import { GlassPanel } from '../components/glass/GlassPanel';
import { CodebaseChatModule } from './modules/CodebaseChatModule';
import { DashboardModule } from './modules/DashboardModule';
import { RepositoriesModule } from './modules/RepositoriesModule';
import { ArchitectureModule } from './modules/ArchitectureModule';
import { CodeReviewModule } from './modules/CodeReviewModule';
import { SecurityCenterModule } from './modules/SecurityCenterModule';
import { ModelDoctorModule } from './modules/ModelDoctorModule';
import { MemoryMeshModule } from './modules/MemoryMeshModule';
import { DocsGeneratorModule } from './modules/DocsGeneratorModule';
import { AdminConsoleModule } from './modules/AdminConsoleModule';
import { VisualSettingsModal } from './modules/VisualSettingsModal';
import { AuthModal } from './modules/AuthModal';
import { AuthPortal } from './modules/AuthPortal';
import { CosmicAudioController } from './components/audio/CosmicAudioController';
import { cosmicSimulationManager } from './engine/CosmicSimulationManager';
import { api } from './services/api';
import { useSingularityStore } from './store/singularityStore';

export function App() {
  const activeModule = useSingularityStore((s) => s.activeModule);
  const setActiveModule = useSingularityStore((s) => s.setActiveModule);
  const repos = useSingularityStore((s) => s.repos);
  const selectedRepoId = useSingularityStore((s) => s.selectedRepoId);
  const setRepos = useSingularityStore((s) => s.setRepos);
  const setSelectedRepoId = useSingularityStore((s) => s.setSelectedRepoId);
  const visualPreferences = useSingularityStore((s) => s.visualPreferences);
  const setVisualPreferences = useSingularityStore((s) => s.setVisualPreferences);
  const toggleFocusMode = useSingularityStore((s) => s.toggleFocusMode);
  const setSettingsModalOpen = useSingularityStore((s) => s.setSettingsModalOpen);
  const setAuthModalOpen = useSingularityStore((s) => s.setAuthModalOpen);
  const setAuthReady = useSingularityStore((s) => s.setAuthReady);
  const setAuth = useSingularityStore((s) => s.setAuth);
  const clearAuth = useSingularityStore((s) => s.clearAuth);
  const user = useSingularityStore((s) => s.user);

  // Secure session restoration & workstation bootstrap
  useEffect(() => {
    let cancelled = false;

    const bootstrapSession = async () => {
      const state = useSingularityStore.getState();
      const queryParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const isAutoAuth = queryParams?.get('auto_auth') === '1';

      try {
        if (state.token) {
          const me = await api.getMe();
          if (!cancelled) {
            setAuth(me, state.token, state.refreshToken);
          }
        } else if (state.refreshToken) {
          const refreshed = await api.refreshSession(state.refreshToken);
          if (!cancelled) {
            setAuth(refreshed.user, refreshed.access_token, refreshed.refresh_token);
          }
        } else if (isAutoAuth && import.meta.env.DEV) {
          const devRes = await api.createDevSession();
          if (!cancelled) {
            setAuth(devRes.user, devRes.access_token, devRes.refresh_token);
          }
        } else if (!cancelled) {
          clearAuth();
        }
      } catch {
        clearAuth();
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    };

    void bootstrapSession();
    return () => {
      cancelled = true;
    };
  }, [clearAuth, setAuth, setAuthReady]);

  // Hydrate user-owned repositories & saved visual preferences whenever authenticated identity changes
  useEffect(() => {
    cosmicSimulationManager.hydrateForUser(user?.id ?? null);
    if (!user) return;
    let cancelled = false;

    api
      .listRepos()
      .then((list) => {
        if (!cancelled) setRepos(list);
      })
      .catch(() => {});

    api
      .getVisualSettings()
      .then((saved) => {
        if (cancelled) return;
        const prefersReduced =
          typeof window !== 'undefined' &&
          window.matchMedia &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        setVisualPreferences(prefersReduced ? { ...saved, reduced_motion: true } : saved);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [user, setRepos, setVisualPreferences]);

  // Listen to OS prefers-reduced-motion media query dynamically
  useEffect(() => {
    if (!window.matchMedia) return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e: MediaQueryListEvent) => {
      setVisualPreferences({ reduced_motion: e.matches });
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [setVisualPreferences]);

  const handleOneClickModeToggle = () => {
    const nextMode = visualPreferences.mode === 'focus' ? 'cinematic' : 'focus';
    toggleFocusMode();
    if (user) {
      void api.saveVisualSettings({ ...visualPreferences, mode: nextMode }).catch(() => {});
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#000000] text-[#FFF0D5] select-text">
      {/* Layer 1 & 2: Persistent Real-Time 3D Supermassive Kerr Black Hole + Full-Screen Cosmic Shockwave */}
      <BlackHoleScene />

      {/* Passive Gravitational Cursor Lensing & Dynamic Glass Lighting Controllers */}
      <GravitationalCursor />
      <DynamicGlassLighting />

      {/* Layer 3 (z-2 Sub-Glass) & Layer 6 (z-30 Foreground): Gravitational Text Deletion & Undo Reversal */}
      <GravityTextEffect />

      {/* If NOT authenticated: start directly on Login or Sign Up page */}
      {!user ? (
        <AuthPortal />
      ) : (
        /* Layer 4 & 5: Floating Crystal-Clear Glassmorphism Workstation Interface */
        <div className="relative z-10 w-full h-full p-3 sm:p-4 flex gap-3 sm:gap-4 animate-fade-in">
          <div className="hidden md:block h-full">
            <GlassSidebar />
          </div>

          <div className="flex-1 min-w-0 h-full flex flex-col gap-3">
            {/* Top Glass Navigation & Status Bar */}
            <GlassPanel
              data-testid="top-glass-navbar"
              className="px-4 py-2.5 shrink-0"
              tone="elevated"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Active Repository & Mobile Module Selector */}
                <div className="flex items-center gap-2.5">
                  <select
                    data-testid="mobile-module-select"
                    aria-label="Active workstation module"
                    value={activeModule}
                    onChange={(e) => setActiveModule(e.target.value as typeof activeModule)}
                    className="md:hidden rounded-lg bg-[#090D14]/90 border border-[#56D9FF]/35 px-2.5 py-1 text-xs font-mono text-[#56D9FF]"
                  >
                    <option value="chat">Singularity Chat</option>
                    <option value="dashboard">Command Deck</option>
                    <option value="repos">Repositories</option>
                    <option value="architecture">Architecture</option>
                    <option value="review">Code Review</option>
                    <option value="security">PromptShield</option>
                    <option value="model-doctor">ModelDoctor</option>
                    <option value="memory-mesh">MemoryMesh</option>
                    <option value="docs">Docs Generator</option>
                    {user?.role === 'admin' && <option value="admin">Admin Console</option>}
                  </select>
                  <FolderGit2 className="w-4 h-4 text-[#FFB347]" />
                  <span className="text-xs text-[#FFF0D5]/65 hidden sm:inline">Repository:</span>
                  <select
                    data-testid="top-repo-select"
                    aria-label="Active repository"
                    value={selectedRepoId ?? ''}
                    onChange={(e) => setSelectedRepoId(Number(e.target.value))}
                    className="rounded-lg bg-white/[0.05] border border-white/25 px-2.5 py-1 text-xs font-mono text-[#FFF0D5] focus:outline-none focus:border-[#56D9FF]"
                  >
                    {repos.length === 0 ? (
                      <option value="" className="bg-[#090D14] text-[#FFF0D5]">
                        No repository indexed
                      </option>
                    ) : (
                      repos.map((r) => (
                        <option key={r.id} value={r.id} className="bg-[#090D14] text-[#FFF0D5]">
                          {r.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {/* Right Quick Actions: Cosmic Audio Engine + One-Click Focus/Cinematic Return + Visual Settings + Identity */}
                <div className="flex items-center gap-2">
                  <CosmicAudioController />

                  <button
                    type="button"
                    data-testid="topbar-focus-mode-btn"
                    onClick={handleOneClickModeToggle}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition-all ${
                      visualPreferences.mode === 'focus'
                        ? 'bg-[#56D9FF]/22 border-[#56D9FF]/55 text-[#56D9FF] shadow-[0_0_16px_rgba(86,217,255,0.2)]'
                        : 'bg-white/[0.05] border-white/15 text-[#FFF0D5]/88 hover:border-[#56D9FF]/45'
                    }`}
                  >
                    {visualPreferences.mode === 'focus' ? (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Return to Cinematic Mode</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5 text-[#56D9FF]" />
                        <span>Focus Mode</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setSettingsModalOpen(true)}
                    aria-label="Visual Preferences"
                    className="p-2 rounded-xl bg-white/[0.05] border border-white/15 text-[#FFF0D5]/85 hover:text-[#56D9FF] hover:border-[#56D9FF]/45 transition-all"
                  >
                    <SlidersHorizontal className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    data-testid="open-auth-modal-btn"
                    onClick={() => setAuthModalOpen(true)}
                    className="px-3 py-1.5 rounded-xl text-xs font-mono bg-white/[0.05] border border-white/15 text-[#FFF0D5]/90 hover:border-[#FFB347]/50 flex items-center gap-1.5"
                  >
                    <UserCheck className="w-3.5 h-3.5 text-[#FFB347]" />
                    <span className="max-w-[140px] truncate">
                      {user.display_name || user.username}
                    </span>
                  </button>
                </div>
              </div>
            </GlassPanel>

            {/* Active Module Surface */}
            <main className="flex-1 min-h-0 overflow-hidden" role="main">
              {activeModule === 'chat' && <CodebaseChatModule />}
              {activeModule === 'dashboard' && <DashboardModule />}
              {activeModule === 'repos' && <RepositoriesModule />}
              {activeModule === 'architecture' && <ArchitectureModule />}
              {activeModule === 'review' && <CodeReviewModule />}
              {activeModule === 'security' && <SecurityCenterModule />}
              {activeModule === 'model-doctor' && <ModelDoctorModule />}
              {activeModule === 'memory-mesh' && <MemoryMeshModule />}
              {activeModule === 'docs' && <DocsGeneratorModule />}
              {activeModule === 'admin' && <AdminConsoleModule />}
            </main>
          </div>
        </div>
      )}

      {/* Modals */}
      <VisualSettingsModal />
      {user && <AuthModal />}
    </div>
  );
}
