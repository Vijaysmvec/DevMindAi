import { useEffect, useState } from 'react';
import {
  Activity,
  BrainCircuit,
  Code2,
  FolderGit2,
  Network,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { GlassPanel } from '../../components/glass/GlassPanel';
import { GlassCard } from '../../components/glass/GlassCard';
import { api } from '../services/api';
import { ModuleId, useSingularityStore } from '../store/singularityStore';

export function DashboardModule() {
  const userId = useSingularityStore((s) => s.user?.id ?? null);
  const repos = useSingularityStore((s) => s.repos);
  const setActiveModule = useSingularityStore((s) => s.setActiveModule);
  const [health, setHealth] = useState<{
    database_mode: string;
    gemini_configured: boolean;
    gemini_model: string;
  } | null>(null);
  const [memoryCount, setMemoryCount] = useState(0);
  const [doctorScore, setDoctorScore] = useState(99.0);

  useEffect(() => {
    api.getHealth().then(setHealth).catch(() => {});
    if (!userId) {
      setMemoryCount(0);
      return;
    }
    api.listMemories().then((m) => setMemoryCount(m.length)).catch(() => {});
    api.getModelDoctorStatus().then((s) => setDoctorScore(s.system_health_score)).catch(() => {});
  }, [userId]);

  const totalFiles = repos.reduce((acc, r) => acc + r.file_count, 0);
  const totalSymbols = repos.reduce((acc, r) => acc + r.symbol_count, 0);
  const totalChunks = repos.reduce((acc, r) => acc + r.chunk_count, 0);

  const cards: Array<{
    title: string;
    value: string | number;
    sub: string;
    module: ModuleId;
    accent: 'cyan' | 'gold' | 'violet';
    icon: typeof FolderGit2;
  }> = [
    {
      title: 'Indexed Repositories',
      value: repos.length,
      sub: `${totalFiles} source files · ${totalSymbols} AST symbols`,
      module: 'repos',
      accent: 'cyan',
      icon: FolderGit2,
    },
    {
      title: 'Vector Knowledge Chunks',
      value: totalChunks,
      sub: health?.database_mode || 'Hybrid Vector Store',
      module: 'chat',
      accent: 'gold',
      icon: Sparkles,
    },
    {
      title: 'Architecture Graph',
      value: `${totalFiles} Nodes`,
      sub: 'AST dependency & layer topology',
      module: 'architecture',
      accent: 'cyan',
      icon: Network,
    },
    {
      title: 'PromptShield Posture',
      value: 'ACTIVE',
      sub: 'Pre-flight injection & CWE scanner',
      module: 'security',
      accent: 'gold',
      icon: ShieldCheck,
    },
    {
      title: 'ModelDoctor Health',
      value: `${doctorScore}%`,
      sub: health?.gemini_model || 'gemini-3.5-flash',
      module: 'model-doctor',
      accent: 'cyan',
      icon: Activity,
    },
    {
      title: 'MemoryMesh Nodes',
      value: memoryCount,
      sub: 'Associative semantic context graph',
      module: 'memory-mesh',
      accent: 'violet',
      icon: BrainCircuit,
    },
  ];

  return (
    <div className="h-full overflow-y-auto space-y-4 pr-1" data-testid="dashboard-module">
      <GlassPanel className="p-6" edgeParticles accent="gold">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-[11px] font-mono uppercase tracking-widest text-[#FFB347]">
              Event Horizon 2.0 · Living Gravitational Intelligence
            </span>
            <h1 className="text-xl font-bold text-[#FFF0D5]">
              DEVMIND AI — SINGULARITY COMMAND DECK
            </h1>
            <p className="text-xs text-[#FFF0D5]/68 max-w-2xl">
              Full-stack repository intelligence workstation suspended above a real-time relativistic accretion engine. Select any subsystem card below to inspect architecture, review code, audit security, or synthesize documentation.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setActiveModule('chat')}
            className="px-4 py-2.5 rounded-xl text-xs font-medium bg-[#56D9FF]/18 hover:bg-[#56D9FF]/28 border border-[#56D9FF]/45 text-[#FFF0D5] flex items-center gap-2 transition-all"
          >
            <Code2 className="w-4 h-4 text-[#56D9FF]" />
            <span>Open Singularity Chat</span>
          </button>
        </div>
      </GlassPanel>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <GlassCard
              key={c.title}
              accent={c.accent}
              edgeParticles
              onClick={() => setActiveModule(c.module)}
              className="cursor-pointer space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#FFF0D5]/70">{c.title}</span>
                <div className="p-2 rounded-lg bg-white/[0.05] text-[#56D9FF]">
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-bold tracking-tight text-[#FFF0D5] font-mono">
                {c.value}
              </div>
              <div className="text-[11px] text-[#FFF0D5]/55 font-mono">{c.sub}</div>
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}
