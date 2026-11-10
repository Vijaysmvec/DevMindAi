import { useEffect, useState } from 'react';
import { Cpu, GitBranch, Layers } from 'lucide-react';
import { GlassPanel } from '../../components/glass/GlassPanel';
import { GlassCard } from '../../components/glass/GlassCard';
import { api } from '../services/api';
import { useSingularityStore } from '../store/singularityStore';

interface ArchNode {
  id: string;
  label: string;
  path: string;
  language: string;
  layer: string;
  loc: number;
  complexity: number;
  symbol_count: number;
  symbols: Array<{ name: string; kind: string; line: number }>;
}

interface ArchEdge {
  source: string;
  target: string;
  relation: string;
}

export function ArchitectureModule() {
  const userId = useSingularityStore((s) => s.user?.id ?? null);
  const selectedRepoId = useSingularityStore((s) => s.selectedRepoId);
  const repos = useSingularityStore((s) => s.repos);
  const repoId = selectedRepoId || repos[0]?.id;

  const [nodes, setNodes] = useState<ArchNode[]>([]);
  const [edges, setEdges] = useState<ArchEdge[]>([]);
  const [metrics, setMetrics] = useState({
    module_count: 0,
    dependency_edges: 0,
    average_complexity: 0,
    coupling_index: 0,
  });
  const [selectedNode, setSelectedNode] = useState<ArchNode | null>(null);

  useEffect(() => {
    if (!userId || !repoId) {
      setNodes([]);
      setEdges([]);
      setMetrics({
        module_count: 0,
        dependency_edges: 0,
        average_complexity: 0,
        coupling_index: 0,
      });
      setSelectedNode(null);
      return;
    }
    api
      .getArchitecture(repoId)
      .then((data) => {
        setNodes(data.nodes);
        setEdges(data.edges);
        setMetrics(data.metrics);
        setSelectedNode(data.nodes[0] || null);
      })
      .catch(() => {});
  }, [repoId, userId]);

  // Compute orbital topology node coordinates for SVG visualization
  const positioned = nodes.map((n, idx) => {
    const count = Math.max(1, nodes.length);
    const angle = (idx / count) * Math.PI * 2 - Math.PI / 2;
    const rx = 210;
    const ry = 125;
    return {
      ...n,
      cx: 320 + Math.cos(angle) * rx,
      cy: 185 + Math.sin(angle) * ry,
    };
  });

  const posById = new Map(positioned.map((p) => [p.id, p]));

  return (
    <div className="h-full overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-4 pr-1" data-testid="architecture-module">
      <div className="lg:col-span-8 flex flex-col gap-4">
        <GlassPanel className="p-5" edgeParticles>
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-sm font-semibold text-[#FFF0D5] flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#56D9FF]" />
                <span>Orbital Architecture Explorer</span>
              </h2>
              <p className="text-xs text-[#FFF0D5]/60">
                Interactive AST module dependency topology & complexity telemetry
              </p>
            </div>
            <div className="flex gap-3 text-xs font-mono">
              <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-[#FFB347]">
                Modules: {metrics.module_count}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-[#56D9FF]">
                Edges: {metrics.dependency_edges}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-[#FFF0D5]/80">
                Avg Cpx: {metrics.average_complexity}
              </span>
            </div>
          </div>

          <div className="rounded-xl bg-black/12 border border-white/18 overflow-hidden">
            <svg viewBox="0 0 640 370" className="w-full h-[340px]">
              <defs>
                <radialGradient id="archCoreGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#FFB347" stopOpacity="0.32" />
                  <stop offset="70%" stopColor="#56D9FF" stopOpacity="0.06" />
                  <stop offset="100%" stopColor="#000000" stopOpacity="0" />
                </radialGradient>
              </defs>

              <circle cx="320" cy="185" r="145" fill="url(#archCoreGlow)" />
              <ellipse
                cx="320"
                cy="185"
                rx="210"
                ry="125"
                fill="none"
                stroke="rgba(86,217,255,0.16)"
                strokeDasharray="4 6"
              />

              {/* Dependency Edges */}
              {edges.map((edge, idx) => {
                const s = posById.get(edge.source);
                const t = posById.get(edge.target);
                if (!s || !t) return null;
                return (
                  <line
                    key={`${edge.source}-${edge.target}-${idx}`}
                    x1={s.cx}
                    y1={s.cy}
                    x2={t.cx}
                    y2={t.cy}
                    stroke="#FFB347"
                    strokeOpacity="0.65"
                    strokeWidth="1.8"
                  />
                );
              })}

              {/* Module Nodes */}
              {positioned.map((node) => {
                const isSelected = selectedNode?.id === node.id;
                const stroke =
                  node.layer === 'security'
                    ? '#FFB347'
                    : node.layer === 'shader'
                      ? '#8765D8'
                      : '#56D9FF';
                return (
                  <g
                    key={node.id}
                    onClick={() => setSelectedNode(node)}
                    className="cursor-pointer"
                  >
                    <circle
                      cx={node.cx}
                      cy={node.cy}
                      r={isSelected ? 24 : 19}
                      fill="#090D14"
                      stroke={stroke}
                      strokeWidth={isSelected ? 2.6 : 1.5}
                    />
                    <text
                      x={node.cx}
                      y={node.cy + 36}
                      textAnchor="middle"
                      fill="#FFF0D5"
                      fontSize="11"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {node.label}
                    </text>
                    <text
                      x={node.cx}
                      y={node.cy + 4}
                      textAnchor="middle"
                      fill={stroke}
                      fontSize="9"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {node.layer.slice(0, 4).toUpperCase()}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </GlassPanel>
      </div>

      {/* Right: Selected Module Inspector */}
      <div className="lg:col-span-4">
        <GlassPanel className="p-5 h-full space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#FFF0D5]">
            <Cpu className="w-4 h-4 text-[#FFB347]" />
            <span>AST Node Inspector</span>
          </div>

          {selectedNode ? (
            <div className="space-y-3">
              <GlassCard interactive={false} accent="cyan">
                <div className="text-xs font-mono text-[#56D9FF] break-all">{selectedNode.path}</div>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-mono text-[#FFF0D5]/70">
                  <span>Layer: {selectedNode.layer}</span>
                  <span>·</span>
                  <span>{selectedNode.loc} LOC</span>
                  <span>·</span>
                  <span>Cpx: {selectedNode.complexity}</span>
                </div>
              </GlassCard>

              <div className="space-y-2">
                <div className="text-xs font-mono uppercase tracking-wider text-[#FFB347] flex items-center gap-1.5">
                  <GitBranch className="w-3.5 h-3.5" />
                  <span>Exported & Module Symbols ({selectedNode.symbols.length})</span>
                </div>
                {selectedNode.symbols.length === 0 ? (
                  <p className="text-xs text-[#FFF0D5]/50">Module-scope declarations</p>
                ) : (
                  selectedNode.symbols.map((sym, i) => (
                    <div
                      key={`${sym.name}-${i}`}
                      className="px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10 flex items-center justify-between text-xs font-mono"
                    >
                      <span className="text-[#FFF0D5]">{sym.name}</span>
                      <span className="text-[10px] text-[#56D9FF]">
                        {sym.kind} · L{sym.line}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-[#FFF0D5]/55">Select a node on the orbital graph to inspect symbols.</p>
          )}
        </GlassPanel>
      </div>
    </div>
  );
}
