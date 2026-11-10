import { useEffect, useState } from 'react';
import { CheckCircle, Code2, Sparkles } from 'lucide-react';
import { GlassPanel } from '../../components/glass/GlassPanel';
import { GlassCard } from '../../components/glass/GlassCard';
import { GlassTextarea } from '../../components/glass/GlassInput';
import { api } from '../services/api';
import { useSingularityStore } from '../store/singularityStore';

export function CodeReviewModule() {
  const userId = useSingularityStore((s) => s.user?.id ?? null);
  const selectedRepoId = useSingularityStore((s) => s.selectedRepoId);
  const repos = useSingularityStore((s) => s.repos);
  const setInteractionState = useSingularityStore((s) => s.setInteractionState);
  const repoId = selectedRepoId || repos[0]?.id;

  const [repoFiles, setRepoFiles] = useState<Array<{ path: string; content: string }>>([]);
  const [selectedPath, setSelectedPath] = useState('src/core/singularityEngine.ts');
  const [code, setCode] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<{
    quality_score: number;
    summary: string;
    findings: Array<{ severity: string; category: string; line: number; title: string; suggestion: string }>;
    model_used: string;
  } | null>(null);

  useEffect(() => {
    if (!userId || !repoId) {
      setRepoFiles([]);
      return;
    }
    api
      .getRepoFiles(repoId)
      .then((files) => {
        setRepoFiles(files);
        if (files.length > 0) {
          setSelectedPath(files[0].path);
          setCode(files[0].content);
        }
      })
      .catch(() => {});
  }, [repoId, userId]);

  const handleRunReview = async () => {
    if (!code.trim()) return;
    setReviewing(true);
    setErrorMsg(null);
    setInteractionState('AI_THINKING');
    try {
      const res = await api.analyzeCodeReview({
        repo_id: repoId,
        file_path: selectedPath,
        code,
      });
      setResult(res);
      setInteractionState('AI_RESPONSE', 1300);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to run AI code review');
      setInteractionState('ERROR', 1800);
    } finally {
      setReviewing(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-4 pr-1" data-testid="review-module">
      <div className="lg:col-span-6 space-y-4">
        <GlassPanel className="p-5 space-y-3.5" edgeParticles>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[#FFF0D5] flex items-center gap-2">
              <Code2 className="w-4 h-4 text-[#56D9FF]" />
              <span>AI Code Review Workbench</span>
            </h2>

            <select
              value={selectedPath}
              onChange={(e) => {
                const p = e.target.value;
                setSelectedPath(p);
                const match = repoFiles.find((f) => f.path === p);
                if (match) setCode(match.content);
              }}
              aria-label="Select repository file to review"
              className="rounded-lg bg-white/[0.05] border border-white/20 px-2.5 py-1.5 text-xs font-mono text-[#FFF0D5] focus:outline-none focus:border-[#56D9FF]"
            >
              {repoFiles.map((f) => (
                <option key={f.path} value={f.path} className="bg-[#090D14] text-[#FFF0D5]">
                  {f.path}
                </option>
              ))}
            </select>
          </div>

          <GlassTextarea
            rows={14}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="font-mono text-xs"
            aria-label="Source code for AI review"
          />

          {errorMsg && (
            <div className="p-2.5 rounded-lg bg-[#FF7838]/15 border border-[#FF7838]/40 text-xs text-[#FFB347]">
              {errorMsg}
            </div>
          )}

          <button
            type="button"
            data-testid="run-code-review-btn"
            onClick={handleRunReview}
            disabled={reviewing}
            className="w-full py-2.5 rounded-xl text-xs font-semibold bg-[#56D9FF]/20 hover:bg-[#56D9FF]/30 border border-[#56D9FF]/50 text-[#FFF0D5] flex items-center justify-center gap-2 transition-all"
          >
            <Sparkles className="w-4 h-4 text-[#56D9FF]" />
            <span>{reviewing ? 'Executing AST & Gemini Critique...' : 'Run AI Code Review'}</span>
          </button>
        </GlassPanel>
      </div>

      <div className="lg:col-span-6">
        <GlassPanel className="p-5 h-full space-y-4">
          <h3 className="text-sm font-semibold text-[#FFF0D5]">Review Findings & Quality Score</h3>
          {result ? (
            <div className="space-y-4" data-testid="code-review-results">
              <GlassCard interactive={false} accent="gold">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-[#FFF0D5]/65">Engineering Quality Score</div>
                    <div className="text-2xl font-bold font-mono text-[#FFB347]">
                      {result.quality_score} / 100
                    </div>
                  </div>
                  <span className="text-[11px] font-mono px-2.5 py-1 rounded-lg bg-[#56D9FF]/12 text-[#56D9FF]">
                    {result.model_used}
                  </span>
                </div>
                <p className="mt-2.5 text-xs text-[#FFF0D5]/80 leading-relaxed whitespace-pre-wrap">
                  {result.summary}
                </p>
              </GlassCard>

              <div className="space-y-2.5">
                {result.findings.map((f, idx) => (
                  <GlassCard key={idx} interactive={false} accent="cyan">
                    <div className="flex items-center justify-between text-xs font-mono mb-1">
                      <span className="text-[#56D9FF]">
                        {f.category} · Line {f.line}
                      </span>
                      <span className="uppercase text-[10px] px-2 py-0.5 rounded bg-[#FFB347]/15 text-[#FFB347]">
                        {f.severity}
                      </span>
                    </div>
                    <div className="text-xs font-semibold text-[#FFF0D5] flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5 text-[#56D9FF]" />
                      {f.title}
                    </div>
                    <p className="text-xs text-[#FFF0D5]/70 mt-1">{f.suggestion}</p>
                  </GlassCard>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-56 flex items-center justify-center text-xs text-[#FFF0D5]/50 font-mono">
              Select a repository module and click "Run AI Code Review" to inspect findings.
            </div>
          )}
        </GlassPanel>
      </div>
    </div>
  );
}
