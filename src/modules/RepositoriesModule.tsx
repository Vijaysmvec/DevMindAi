import React, { useEffect, useState } from 'react';
import { CheckCircle2, FileCode, FolderPlus, Sparkles, Trash2, Upload } from 'lucide-react';
import { GlassPanel } from '../../components/glass/GlassPanel';
import { GlassCard } from '../../components/glass/GlassCard';
import { GlassInput, GlassTextarea } from '../../components/glass/GlassInput';
import { api } from '../services/api';
import { useSingularityStore } from '../store/singularityStore';

export function RepositoriesModule() {
  const userId = useSingularityStore((s) => s.user?.id ?? null);
  const repos = useSingularityStore((s) => s.repos);
  const selectedRepoId = useSingularityStore((s) => s.selectedRepoId);
  const setRepos = useSingularityStore((s) => s.setRepos);
  const setSelectedRepoId = useSingularityStore((s) => s.setSelectedRepoId);
  const setInteractionState = useSingularityStore((s) => s.setInteractionState);

  const [repoName, setRepoName] = useState('');
  const [repoDesc, setRepoDesc] = useState('');
  const [filePath, setFilePath] = useState('src/services/quantumCache.ts');
  const [fileContent, setFileContent] = useState(
    `export class QuantumCache<T> {\n  private store = new Map<string, T>();\n\n  public set(key: string, value: T): void {\n    this.store.set(key, value);\n  }\n\n  public get(key: string): T | undefined {\n    return this.store.get(key);\n  }\n}\n`
  );
  const [filesPreview, setFilesPreview] = useState<
    Array<{ id: number; path: string; language: string; loc: number; complexity: number }>
  >([]);
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const refreshRepos = async () => {
    const list = await api.listRepos();
    setRepos(list);
  };

  useEffect(() => {
    if (userId && selectedRepoId) {
      api
        .getRepoFiles(selectedRepoId)
        .then((list) => setFilesPreview(list))
        .catch(() => setFilesPreview([]));
    } else {
      setFilesPreview([]);
    }
  }, [selectedRepoId, userId]);

  const handleProvisionStarterRepo = async () => {
    setBusy(true);
    setInteractionState('AI_THINKING');
    try {
      const starter = await api.provisionStarterRepo();
      await refreshRepos();
      setSelectedRepoId(starter.id);
      setStatusMsg(
        `Provisioned starter repository "${starter.name}" (${starter.file_count} files, ${starter.symbol_count} symbols)`
      );
      setInteractionState('AI_RESPONSE', 1200);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Starter provisioning failed');
      setInteractionState('ERROR', 1800);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteRepo = async (id: number, name: string) => {
    setBusy(true);
    try {
      await api.deleteRepo(id);
      await refreshRepos();
      setStatusMsg(`Deleted repository "${name}"`);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Repository deletion failed');
      setInteractionState('ERROR', 1800);
    } finally {
      setBusy(false);
    }
  };

  const handleCreateInlineRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoName.trim() || !filePath.trim() || !fileContent.trim()) return;
    setBusy(true);
    setInteractionState('AI_THINKING');
    try {
      const created = await api.createRepo(repoName.trim(), repoDesc.trim(), [
        { path: filePath.trim(), content: fileContent },
      ]);
      await refreshRepos();
      setSelectedRepoId(created.id);
      setRepoName('');
      setRepoDesc('');
      setStatusMsg(`Indexed "${created.name}" (${created.symbol_count} AST symbols, ${created.chunk_count} vector chunks)`);
      setInteractionState('AI_RESPONSE', 1200);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Indexing failed');
      setInteractionState('ERROR', 1800);
    } finally {
      setBusy(false);
    }
  };

  const handleZipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setInteractionState('AI_THINKING');
    try {
      const baseName = file.name.replace(/\.zip$/i, '');
      const created = await api.uploadRepoZip(baseName, 'Uploaded ZIP archive', file);
      await refreshRepos();
      setSelectedRepoId(created.id);
      setStatusMsg(`Uploaded & indexed ZIP "${created.name}" (${created.file_count} files)`);
      setInteractionState('AI_RESPONSE', 1200);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'ZIP upload failed');
      setInteractionState('ERROR', 1800);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  return (
    <div className="h-full overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-4 pr-1" data-testid="repos-module">
      {/* Left: Existing Indexed Repositories */}
      <div className="lg:col-span-7 space-y-4">
        <GlassPanel className="p-5 space-y-4" edgeParticles>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-[#FFF0D5]">Indexed Repositories</h2>
              <p className="text-xs text-[#FFF0D5]/60">
                Select an active repository for RAG Chat, Architecture Explorer, Security Audit & Docs
              </p>
            </div>
            <div className="flex items-center gap-2">
              {repos.length === 0 && (
                <button
                  type="button"
                  data-testid="provision-starter-repo-btn"
                  disabled={busy}
                  onClick={handleProvisionStarterRepo}
                  className="px-3.5 py-2 rounded-xl text-xs font-medium bg-[#FFB347]/15 hover:bg-[#FFB347]/25 border border-[#FFB347]/40 text-[#FFB347] flex items-center gap-1.5 transition-all"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Provision Starter Repo</span>
                </button>
              )}
              <label className="cursor-pointer px-3.5 py-2 rounded-xl text-xs font-medium bg-[#56D9FF]/15 hover:bg-[#56D9FF]/25 border border-[#56D9FF]/40 text-[#56D9FF] flex items-center gap-1.5 transition-all">
                <Upload className="w-3.5 h-3.5" />
                <span>Upload .ZIP</span>
                <input type="file" accept=".zip" onChange={handleZipUpload} className="hidden" />
              </label>
            </div>
          </div>

          {statusMsg && (
            <div className="px-3.5 py-2 rounded-xl bg-[#56D9FF]/12 border border-[#56D9FF]/30 text-xs text-[#56D9FF]">
              {statusMsg}
            </div>
          )}

          <div className="space-y-2.5">
            {repos.map((r) => {
              const active = r.id === selectedRepoId;
              return (
                <GlassCard
                  key={r.id}
                  accent={active ? 'cyan' : 'gold'}
                  onClick={() => setSelectedRepoId(r.id)}
                  className={`cursor-pointer ${
                    active ? 'border-[#56D9FF]/55 bg-[#56D9FF]/10' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[#FFF0D5]">{r.name}</span>
                        {active && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#56D9FF]/20 text-[#56D9FF]">
                            <CheckCircle2 className="w-3 h-3" /> Active
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#FFF0D5]/65">{r.description || 'Indexed repository'}</p>
                      <div className="flex flex-wrap gap-3 pt-1 text-[11px] font-mono text-[#FFB347]">
                        <span>{r.file_count} files</span>
                        <span>{r.symbol_count} symbols</span>
                        <span>{r.chunk_count} vector chunks</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        void handleDeleteRepo(r.id, r.name);
                      }}
                      className="p-1.5 rounded-lg text-[#FFF0D5]/45 hover:text-[#FF7838] hover:bg-white/5"
                      aria-label={`Delete ${r.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </GlassCard>
              );
            })}
          </div>
        </GlassPanel>

        {/* Active Repo File Inventory */}
        <GlassPanel className="p-5 space-y-3">
          <h3 className="text-xs font-mono uppercase tracking-wider text-[#56D9FF]">
            Parsed AST Modules ({filesPreview.length})
          </h3>
          <div className="space-y-2">
            {filesPreview.map((f) => (
              <div
                key={f.id}
                className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.03] border border-white/10 text-xs"
              >
                <span className="flex items-center gap-2 font-mono text-[#FFF0D5]/90">
                  <FileCode className="w-3.5 h-3.5 text-[#FFB347]" />
                  {f.path}
                </span>
                <span className="text-[11px] font-mono text-[#FFF0D5]/55">
                  {f.language} · {f.loc} LOC · Cpx {f.complexity}
                </span>
              </div>
            ))}
          </div>
        </GlassPanel>
      </div>

      {/* Right: Quick Source Repository Indexer */}
      <div className="lg:col-span-5">
        <GlassPanel className="p-5">
          <form onSubmit={handleCreateInlineRepo} className="space-y-3.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#FFF0D5]">
              <FolderPlus className="w-4 h-4 text-[#56D9FF]" />
              <span>Index New Codebase Module</span>
            </div>

            <div>
              <label className="block text-xs text-[#FFF0D5]/70 mb-1">Repository Name</label>
              <GlassInput
                value={repoName}
                onChange={(e) => setRepoName(e.target.value)}
                placeholder="e.g. Hyperion Payment Gateway"
                required
              />
            </div>

            <div>
              <label className="block text-xs text-[#FFF0D5]/70 mb-1">Description</label>
              <GlassInput
                value={repoDesc}
                onChange={(e) => setRepoDesc(e.target.value)}
                placeholder="Core service architecture & handlers"
              />
            </div>

            <div>
              <label className="block text-xs text-[#FFF0D5]/70 mb-1">Entry File Path</label>
              <GlassInput
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
                className="font-mono text-xs"
                required
              />
            </div>

            <div>
              <label className="block text-xs text-[#FFF0D5]/70 mb-1">Source Code</label>
              <GlassTextarea
                rows={9}
                value={fileContent}
                onChange={(e) => setFileContent(e.target.value)}
                className="font-mono text-xs"
                required
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 rounded-xl text-xs font-semibold bg-[#56D9FF]/20 hover:bg-[#56D9FF]/30 border border-[#56D9FF]/50 text-[#FFF0D5] transition-all"
            >
              {busy ? 'Parsing AST & Generating Embeddings...' : 'Parse & Index Repository'}
            </button>
          </form>
        </GlassPanel>
      </div>
    </div>
  );
}
