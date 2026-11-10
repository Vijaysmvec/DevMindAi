import React from 'react';
import {
  Activity,
  BookOpen,
  BrainCircuit,
  Code2,
  Eye,
  FolderGit2,
  LayoutDashboard,
  Lock,
  MessageSquareCode,
  Network,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { ModuleId, useSingularityStore } from '../../src/store/singularityStore';
import { GlassLighting } from './GlassLighting';

const NAV_ITEMS: Array<{ id: ModuleId; label: string; badge?: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'chat', label: 'Singularity Chat', badge: 'RAG', icon: MessageSquareCode },
  { id: 'dashboard', label: 'Command Deck', icon: LayoutDashboard },
  { id: 'repos', label: 'Repositories', icon: FolderGit2 },
  { id: 'architecture', label: 'Architecture Explorer', icon: Network },
  { id: 'review', label: 'AI Code Review', icon: Code2 },
  { id: 'security', label: 'PromptShield', badge: 'SEC', icon: ShieldCheck },
  { id: 'model-doctor', label: 'ModelDoctor', icon: Activity },
  { id: 'memory-mesh', label: 'MemoryMesh', icon: BrainCircuit },
  { id: 'docs', label: 'Docs Generator', icon: BookOpen },
];

export function GlassSidebar() {
  const activeModule = useSingularityStore((s) => s.activeModule);
  const setActiveModule = useSingularityStore((s) => s.setActiveModule);
  const interactionState = useSingularityStore((s) => s.interactionState);
  const visualPreferences = useSingularityStore((s) => s.visualPreferences);
  const toggleFocusMode = useSingularityStore((s) => s.toggleFocusMode);
  const setSettingsModalOpen = useSingularityStore((s) => s.setSettingsModalOpen);
  const user = useSingularityStore((s) => s.user);

  const visibleNavItems =
    user?.role === 'admin'
      ? [...NAV_ITEMS, { id: 'admin' as ModuleId, label: 'Admin Console', badge: 'RBAC', icon: Lock }]
      : NAV_ITEMS;

  return (
    <aside
      data-testid="glass-sidebar"
      data-glass-surface="sidebar"
      aria-label="Primary Navigation"
      className="relative z-10 w-64 shrink-0 h-full rounded-2xl singularity-glass flex flex-col justify-between overflow-hidden"
    >
      <GlassLighting showEdgeParticles accent="cyan" />

      <div className="relative z-10 p-4 flex flex-col gap-5 overflow-y-auto">
        {/* Brand Identity */}
        <div className="flex items-center gap-3 px-1.5 pt-1">
          <div className="relative w-9 h-9 rounded-full bg-black border border-[#FFB347]/70 shadow-[0_0_20px_rgba(255,179,71,0.45)] flex items-center justify-center shrink-0">
            <div className="w-4 h-4 rounded-full bg-black ring-2 ring-[#FFF0D5]/90" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm tracking-wider text-[#FFF0D5]">DEVMIND AI</span>
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#FFB347]/15 text-[#FFB347] border border-[#FFB347]/30">
                EXTREME
              </span>
            </div>
            <p className="text-[11px] tracking-widest text-[#56D9FF]/80 uppercase font-mono">
              SINGULARITY
            </p>
          </div>
        </div>

        {/* Navigation Modules */}
        <nav className="flex flex-col gap-1" role="navigation">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const active = activeModule === item.id;
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`nav-${item.id}`}
                onClick={() => setActiveModule(item.id)}
                className={`group flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all text-left ${
                  active
                    ? 'bg-[#56D9FF]/14 text-[#FFF0D5] border border-[#56D9FF]/45 shadow-[0_0_18px_rgba(86,217,255,0.16)]'
                    : 'text-[#FFF0D5]/72 hover:text-[#FFF0D5] hover:bg-white/[0.05] border border-transparent'
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-colors ${
                      active ? 'text-[#56D9FF]' : 'text-[#FFF0D5]/55 group-hover:text-[#56D9FF]/85'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.badge && (
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                      active
                        ? 'bg-[#56D9FF]/20 text-[#56D9FF]'
                        : 'bg-white/[0.06] text-[#FFF0D5]/55'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Cosmic Status & Quick Controls */}
      <div className="relative z-10 p-3.5 border-t border-white/10 space-y-2.5">
        <div
          data-testid="cosmic-heartbeat-badge"
          className="px-3 py-2 rounded-xl bg-white/[0.03] border border-white/15 flex items-center justify-between"
        >
          <span className="text-[10px] uppercase tracking-wider text-[#FFF0D5]/55 font-mono">
            Horizon State
          </span>
          <span
            data-testid="interaction-state-value"
            className={`text-[10px] font-mono font-semibold flex items-center gap-1.5 ${
              interactionState === 'ERROR'
                ? 'text-[#E88732]'
                : interactionState === 'AI_THINKING'
                  ? 'text-[#56D9FF]'
                  : 'text-[#FFB347]'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                interactionState === 'AI_THINKING'
                  ? 'bg-[#56D9FF] animate-ping'
                  : interactionState === 'ERROR'
                    ? 'bg-[#E88732]'
                    : 'bg-[#FFB347]'
              }`}
            />
            {interactionState}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            data-testid="sidebar-focus-toggle"
            onClick={toggleFocusMode}
            className={`flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-medium border transition-all ${
              visualPreferences.mode === 'focus'
                ? 'bg-[#56D9FF]/20 border-[#56D9FF]/50 text-[#56D9FF]'
                : 'bg-white/[0.04] border-white/10 text-[#FFF0D5]/80 hover:border-[#56D9FF]/35'
            }`}
          >
            {visualPreferences.mode === 'focus' ? (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Cinematic</span>
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5" />
                <span>Focus</span>
              </>
            )}
          </button>

          <button
            type="button"
            data-testid="open-visual-settings"
            onClick={() => setSettingsModalOpen(true)}
            className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-medium bg-white/[0.04] border border-white/10 text-[#FFF0D5]/80 hover:border-[#56D9FF]/35 hover:text-[#FFF0D5] transition-all"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#56D9FF]" />
            <span>Visuals</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
