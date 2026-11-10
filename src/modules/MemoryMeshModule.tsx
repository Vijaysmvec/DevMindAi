import React, { useEffect, useState } from 'react';
import { BrainCircuit, Plus, Search, Trash2 } from 'lucide-react';
import { GlassPanel } from '../../components/glass/GlassPanel';
import { GlassCard } from '../../components/glass/GlassCard';
import { GlassInput, GlassTextarea } from '../../components/glass/GlassInput';
import { api } from '../services/api';
import { useSingularityStore } from '../store/singularityStore';

interface MemoryItem {
  id: number;
  title: string;
  content: string;
  category: string;
  tags: string[];
  importance: number;
  score?: number;
}

export function MemoryMeshModule() {
  const userId = useSingularityStore((s) => s.user?.id ?? null);
  const selectedRepoId = useSingularityStore((s) => s.selectedRepoId);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [query, setQuery] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tagsText, setTagsText] = useState('architecture, rag');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadAll = () => {
    api.listMemories().then(setMemories).catch(() => {});
  };

  useEffect(() => {
    if (!userId) {
      setMemories([]);
      return;
    }
    loadAll();
  }, [userId]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!query.trim()) {
      loadAll();
      return;
    }
    try {
      const ranked = await api.searchMemories(query.trim());
      setMemories(ranked);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to search MemoryMesh');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setErrorMsg(null);
    const tags = tagsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    try {
      await api.createMemory({
        title: title.trim(),
        content: content.trim(),
        category: 'architecture',
        tags,
        importance: 0.9,
        repo_id: selectedRepoId,
      });
      setTitle('');
      setContent('');
      loadAll();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to commit memory node');
    }
  };

  return (
    <div className="h-full overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-4 pr-1" data-testid="memory-mesh-module">
      <div className="lg:col-span-7 space-y-4">
        <GlassPanel className="p-5 space-y-4" edgeParticles>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-[#FFF0D5] flex items-center gap-2">
              <BrainCircuit className="w-4 h-4 text-[#8765D8]" />
              <span>MemoryMesh Associative Semantic Graph</span>
            </h2>
          </div>

          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="flex-1">
              <GlassInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Semantic vector search across architectural memories..."
              />
            </div>
            <button
              type="submit"
              className="px-4 rounded-xl text-xs font-medium bg-[#56D9FF]/18 hover:bg-[#56D9FF]/28 border border-[#56D9FF]/45 text-[#FFF0D5] flex items-center gap-1.5"
            >
              <Search className="w-3.5 h-3.5 text-[#56D9FF]" />
              <span>Query</span>
            </button>
          </form>

          <div className="space-y-3">
            {memories.map((m) => (
              <GlassCard key={m.id} accent="violet" interactive={false}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-[#FFF0D5]">{m.title}</h3>
                      {typeof m.score === 'number' && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#56D9FF]/20 text-[#56D9FF]">
                          sim {m.score.toFixed(2)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#FFF0D5]/75 mt-1 leading-relaxed">{m.content}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      {m.tags.map((t) => (
                        <span
                          key={t}
                          className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#8765D8]/20 text-[#FFF0D5]/80 border border-[#8765D8]/35"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      void api
                        .deleteMemory(m.id)
                        .then(loadAll)
                        .catch((err) =>
                          setErrorMsg(err instanceof Error ? err.message : 'Unable to delete memory')
                        )
                    }
                    className="p-1.5 rounded-lg text-[#FFF0D5]/45 hover:text-[#FF7838]"
                    aria-label={`Delete memory ${m.title}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </GlassCard>
            ))}
          </div>
        </GlassPanel>
      </div>

      <div className="lg:col-span-5">
        <GlassPanel className="p-5">
          <form onSubmit={handleCreate} className="space-y-3.5">
            <h3 className="text-sm font-semibold text-[#FFF0D5] flex items-center gap-2">
              <Plus className="w-4 h-4 text-[#56D9FF]" />
              <span>Commit New Memory Node</span>
            </h3>

            <div>
              <label className="block text-xs text-[#FFF0D5]/70 mb-1">Decision / Pattern Title</label>
              <GlassInput
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. WebGL Instanced Particle Budget"
                required
              />
            </div>

            <div>
              <label className="block text-xs text-[#FFF0D5]/70 mb-1">Contextual Knowledge</label>
              <GlassTextarea
                rows={5}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Record architectural invariants, conventions, or debugging insights..."
                required
              />
            </div>

            <div>
              <label className="block text-xs text-[#FFF0D5]/70 mb-1">Tags (comma-separated)</label>
              <GlassInput value={tagsText} onChange={(e) => setTagsText(e.target.value)} />
            </div>

            {errorMsg && (
              <div className="p-2.5 rounded-lg bg-[#FF7838]/15 border border-[#FF7838]/40 text-xs text-[#FFB347]">
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              data-testid="create-memory-btn"
              className="w-full py-2.5 rounded-xl text-xs font-semibold bg-[#56D9FF]/20 hover:bg-[#56D9FF]/30 border border-[#56D9FF]/50 text-[#FFF0D5]"
            >
              Embed & Persist into MemoryMesh
            </button>
          </form>
        </GlassPanel>
      </div>
    </div>
  );
}
