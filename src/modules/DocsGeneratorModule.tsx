import { useEffect, useState } from 'react';
import { BookOpen, Check, Copy, FileText } from 'lucide-react';
import { GlassPanel } from '../../components/glass/GlassPanel';
import { GlassCard } from '../../components/glass/GlassCard';
import { api } from '../services/api';
import { useSingularityStore } from '../store/singularityStore';

export function DocsGeneratorModule() {
  const userId = useSingularityStore((s) => s.user?.id ?? null);
  const selectedRepoId = useSingularityStore((s) => s.selectedRepoId);
  const repos = useSingularityStore((s) => s.repos);
  const setInteractionState = useSingularityStore((s) => s.setInteractionState);
  const repoId = selectedRepoId || repos[0]?.id;

  const [docType, setDocType] = useState('architecture_guide');
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeDoc, setActiveDoc] = useState<{ title: string; markdown_content: string } | null>(null);
  const [history, setHistory] = useState<Array<{ id: number; title: string; markdown_content: string }>>([]);

  useEffect(() => {
    if (!userId || !repoId) {
      setHistory([]);
      setActiveDoc(null);
      return;
    }
    api
      .listGeneratedDocs(repoId)
      .then((list) => {
        setHistory(list);
        setActiveDoc(list.length > 0 ? list[0] : null);
      })
      .catch(() => {});
  }, [repoId, userId]);

  const handleGenerate = async () => {
    if (!repoId) return;
    setGenerating(true);
    setErrorMsg(null);
    setInteractionState('AI_THINKING');
    try {
      const doc = await api.generateDocs(repoId, docType);
      setActiveDoc(doc);
      const updated = await api.listGeneratedDocs(repoId);
      setHistory(updated);
      setInteractionState('AI_RESPONSE', 1300);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to synthesize documentation');
      setInteractionState('ERROR', 1600);
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!activeDoc) return;
    await navigator.clipboard.writeText(activeDoc.markdown_content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="h-full overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-4 pr-1" data-testid="docs-module">
      <div className="lg:col-span-4 space-y-4">
        <GlassPanel className="p-5 space-y-4" edgeParticles>
          <h2 className="text-sm font-semibold text-[#FFF0D5] flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-[#56D9FF]" />
            <span>Documentation Generator</span>
          </h2>

          <div>
            <label className="block text-xs text-[#FFF0D5]/70 mb-1.5">Blueprint Template</label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              aria-label="Documentation blueprint type"
              className="w-full rounded-xl bg-[#090D14]/90 border border-white/15 px-3 py-2.5 text-xs text-[#FFF0D5] focus:outline-none focus:border-[#56D9FF]"
            >
              <option value="architecture_guide">System Architecture Guide</option>
              <option value="api_reference">AST & Module API Reference</option>
              <option value="onboarding_runbook">Developer Onboarding Runbook</option>
              <option value="security_governance">Security & PromptShield Spec</option>
            </select>
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded-lg bg-[#FF7838]/15 border border-[#FF7838]/40 text-xs text-[#FFB347]">
              {errorMsg}
            </div>
          )}

          <button
            type="button"
            data-testid="generate-docs-btn"
            onClick={handleGenerate}
            disabled={generating || !repoId}
            className="w-full py-2.5 rounded-xl text-xs font-semibold bg-[#56D9FF]/20 hover:bg-[#56D9FF]/30 disabled:opacity-45 border border-[#56D9FF]/50 text-[#FFF0D5]"
          >
            {generating ? 'Synthesizing Markdown...' : 'Generate Repository Documentation'}
          </button>

          {history.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-white/10">
              <div className="text-[11px] font-mono uppercase text-[#FFF0D5]/55">Saved Blueprints</div>
              {history.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => setActiveDoc(h)}
                  className="w-full text-left px-3 py-2 rounded-lg bg-white/[0.04] hover:bg-[#56D9FF]/12 border border-white/10 text-xs text-[#FFF0D5]/85 flex items-center gap-2"
                >
                  <FileText className="w-3.5 h-3.5 text-[#FFB347] shrink-0" />
                  <span className="truncate">{h.title}</span>
                </button>
              ))}
            </div>
          )}
        </GlassPanel>
      </div>

      <div className="lg:col-span-8">
        <GlassPanel className="p-5 h-full flex flex-col">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10">
            <h3 className="text-sm font-semibold text-[#FFF0D5]">
              {activeDoc ? activeDoc.title : 'Documentation Preview'}
            </h3>
            {activeDoc && (
              <button
                type="button"
                onClick={handleCopy}
                className="px-3 py-1.5 rounded-lg text-xs font-mono bg-white/[0.06] hover:bg-[#56D9FF]/15 text-[#56D9FF] flex items-center gap-1.5"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy Markdown'}</span>
              </button>
            )}
          </div>

          {activeDoc ? (
            <GlassCard
              interactive={false}
              accent="gold"
              className="flex-1 overflow-y-auto bg-white/[0.02]"
              data-testid="generated-doc-preview"
            >
              <pre className="text-xs font-mono text-[#FFF0D5]/90 whitespace-pre-wrap leading-relaxed">
                {activeDoc.markdown_content}
              </pre>
            </GlassCard>
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-[#FFF0D5]/50 font-mono">
              Click "Generate Repository Documentation" to synthesize structured Markdown from AST symbols.
            </div>
          )}
        </GlassPanel>
      </div>
    </div>
  );
}
