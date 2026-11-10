import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CornerDownLeft,
  FileCode2,
  Loader2,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { GlassPanel } from '../../components/glass/GlassPanel';
import { GlassCard } from '../../components/glass/GlassCard';
import { GlassTextarea } from '../../components/glass/GlassInput';
import { api } from '../services/api';
import { useSingularityStore } from '../store/singularityStore';

interface Citation {
  file_path: string;
  start_line: number;
  end_line: number;
  symbol: string;
  score: number;
}

interface ChatItem {
  id: number | string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  shield_status?: string;
  latency_ms?: number;
  model_used?: string;
}

const QUICK_PROMPTS = [
  'How does SingularityEngine step angular velocity simulation?',
  'Explain how HybridVectorRetriever ranks cosine similarity chunks.',
  'How does evaluatePromptSafety protect LLM inputs?',
];

function renderInlineSpans(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code
          key={match.index}
          className="px-1.5 py-0.5 rounded bg-white/[0.08] text-[#56D9FF] font-mono text-[11px] border border-white/10"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={match.index} className="font-semibold text-[#FFF0D5]">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(
        <em key={match.index} className="italic text-[#FFF0D5]/80">
          {token.slice(1, -1)}
        </em>
      );
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

function FormattedChatMessage({ content }: { content: string }) {
  const lines = content.split('\n');

  return (
    <div className="text-xs sm:text-sm text-[#FFF0D5]/92 leading-relaxed font-sans space-y-1.5">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={idx} className="h-1" />;
        }

        if (trimmed === '***' || trimmed === '---' || trimmed === '___') {
          return <hr key={idx} className="border-t border-white/15 my-2" />;
        }

        if (trimmed.startsWith('### ')) {
          return (
            <h4 key={idx} className="font-semibold text-[#FFB347] text-sm mt-2 mb-1">
              {renderInlineSpans(trimmed.slice(4))}
            </h4>
          );
        }
        if (trimmed.startsWith('## ')) {
          return (
            <h3 key={idx} className="font-bold text-[#FFF0D5] text-base mt-2.5 mb-1">
              {renderInlineSpans(trimmed.slice(3))}
            </h3>
          );
        }
        if (trimmed.startsWith('# ')) {
          return (
            <h2 key={idx} className="font-bold text-[#56D9FF] text-lg mt-3 mb-1.5">
              {renderInlineSpans(trimmed.slice(2))}
            </h2>
          );
        }

        if (/^[*•-]\s+/.test(trimmed)) {
          const bulletText = trimmed.replace(/^[*•-]\s+/, '');
          return (
            <div key={idx} className="flex items-start gap-2 pl-2">
              <span className="text-[#56D9FF] mt-1 text-[9px] select-none">✦</span>
              <span className="flex-1">{renderInlineSpans(bulletText)}</span>
            </div>
          );
        }

        const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
        if (numMatch) {
          return (
            <div key={idx} className="flex items-start gap-2 pl-1">
              <span className="font-mono text-[11px] text-[#FFB347] font-semibold mt-0.5 select-none shrink-0">
                {numMatch[1]}.
              </span>
              <span className="flex-1">{renderInlineSpans(numMatch[2])}</span>
            </div>
          );
        }

        return <p key={idx}>{renderInlineSpans(line)}</p>;
      })}
    </div>
  );
}

/**
 * Isolated status badge so Cosmic Heartbeat state transitions never re-render the chat <textarea>.
 */
function HorizonStateReadout() {
  const interactionState = useSingularityStore((s) => s.interactionState);
  return (
    <span>
      State: <strong className="text-[#FFB347]">{interactionState}</strong>
    </span>
  );
}

export function CodebaseChatModule() {
  const userId = useSingularityStore((s) => s.user?.id ?? null);
  const selectedRepoId = useSingularityStore((s) => s.selectedRepoId);
  const setSelectedRepoId = useSingularityStore((s) => s.setSelectedRepoId);
  const repos = useSingularityStore((s) => s.repos);
  const setRepos = useSingularityStore((s) => s.setRepos);
  const setInteractionState = useSingularityStore((s) => s.setInteractionState);

  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [hasText, setHasText] = useState(false);
  const [sending, setSending] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollEndRef = useRef<HTMLDivElement>(null);

  const activeRepo = repos.find((r) => r.id === selectedRepoId) || repos[0];

  useEffect(() => {
    if (!userId) {
      setMessages([]);
      return;
    }
    let mounted = true;
    api
      .getChatHistory(selectedRepoId)
      .then((history) => {
        if (mounted) setMessages(history);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [selectedRepoId, userId]);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const setNativeInputText = (text: string) => {
    const el = textareaRef.current;
    if (!el) return;
    el.value = text;
    window.dispatchEvent(new CustomEvent('singularity:sync-input-mirror', { detail: { element: el, text } }));
    setHasText(text.trim().length > 0);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const el = textareaRef.current;
    const rawValue = el ? el.value : '';
    const trimmed = rawValue.trim();
    if (!trimmed || sending) return;

    setErrorBanner(null);
    setSending(true);

    // Section 9: MESSAGE_SUBMITTED -> golden energy ripple -> AI_THINKING
    setInteractionState('MESSAGE_SUBMITTED');
    const submittedBackup = rawValue;
    setNativeInputText('');

    const optimisticUserMsg: ChatItem = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: trimmed,
      shield_status: 'SCANNING',
    };
    setMessages((prev) => [...prev, optimisticUserMsg]);

    const thinkingTimer = setTimeout(() => {
      setInteractionState('AI_THINKING');
    }, 180);

    try {
      const [res] = await Promise.all([
        api.sendChatMessage(trimmed, activeRepo?.id ?? null),
        new Promise((r) => setTimeout(r, 320)),
      ]);
      clearTimeout(thinkingTimer);

      setMessages((prev) => [
        ...prev.filter((m) => m.id !== optimisticUserMsg.id),
        res.user_message,
        res.assistant_message,
      ]);

      setInteractionState('AI_RESPONSE', 1400);
    } catch (err) {
      clearTimeout(thinkingTimer);
      // Section 9 ERROR state: stop thinking effects, preserve ALL input, show subtle amber warning, return to IDLE
      setMessages((prev) => prev.filter((m) => m.id !== optimisticUserMsg.id));
      if (textareaRef.current && !textareaRef.current.value) {
        setNativeInputText(submittedBackup);
      }
      setErrorBanner(err instanceof Error ? err.message : 'Unable to complete request');
      setInteractionState('ERROR', 2200);
    } finally {
      setSending(false);
    }
  };

  const handleClear = async () => {
    await api.clearChat(activeRepo?.id ?? null);
    setMessages([]);
  };

  return (
    <div className="h-full flex flex-col gap-3">
      {/* Header Strip */}
      <GlassPanel className="px-5 py-3 shrink-0" edgeParticles>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#56D9FF]/12 border border-[#56D9FF]/30 text-[#56D9FF]">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-[#FFF0D5] flex items-center gap-2">
                <span>Singularity Codebase Intelligence</span>
                {activeRepo && (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-[#FFB347]/14 text-[#FFB347] border border-[#FFB347]/30">
                    {activeRepo.name}
                  </span>
                )}
              </h1>
              <p className="text-xs text-[#FFF0D5]/60">
                Vector RAG + AST Symbol Grounding + PromptShield + Event Horizon Input Physics
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {repos.length === 0 && (
              <button
                type="button"
                onClick={async () => {
                  try {
                    await api.provisionStarterRepo();
                    const list = await api.listRepos();
                    setRepos(list);
                    if (list.length > 0) setSelectedRepoId(list[0].id);
                  } catch {
                    // Ignore provision conflict
                  }
                }}
                className="px-2.5 py-1 rounded-lg bg-[#FFB347]/15 hover:bg-[#FFB347]/25 border border-[#FFB347]/40 text-[#FFB347] text-[11px] font-mono flex items-center gap-1.5 transition-all"
              >
                <Sparkles className="w-3 h-3" />
                <span>Index Starter Repo</span>
              </button>
            )}
            <span className="text-[11px] font-mono text-[#56D9FF]/85 px-2.5 py-1 rounded-lg bg-[#56D9FF]/10 border border-[#56D9FF]/25">
              PromptShield Active
            </span>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleClear}
                title="Clear conversation"
                className="p-2 rounded-lg text-[#FFF0D5]/60 hover:text-[#FFB347] hover:bg-white/5 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </GlassPanel>

      {/* Main Floating Glass Chat Stream */}
      <GlassPanel
        className="flex-1 min-h-0 flex flex-col overflow-hidden"
        contentClassName="flex-1 min-h-0 flex flex-col overflow-hidden"
        tone="default"
      >
        <div
          data-testid="chat-messages-list"
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 space-y-4 select-text"
          tabIndex={0}
          aria-label="Chat messages stream"
        >
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-xl mx-auto py-8 space-y-5">
              <div className="w-14 h-14 rounded-full bg-black/80 border border-[#FFB347]/60 shadow-[0_0_40px_rgba(255,179,71,0.35)] flex items-center justify-center">
                <div className="w-6 h-6 rounded-full bg-black ring-2 ring-[#FFF0D5]" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-lg font-semibold text-[#FFF0D5]">
                  Where Intelligence Meets Gravity
                </h2>
                <p className="text-xs text-[#FFF0D5]/65 leading-relaxed">
                  Query your indexed repository architecture, trace AST symbols, or test gravitational text deletion — deleted characters detach into the event horizon, and{' '}
                  <kbd className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[11px] text-[#56D9FF]">
                    Ctrl + Z
                  </kbd>{' '}
                  reconstructs them from the singularity.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2 w-full">
                {QUICK_PROMPTS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => {
                      setNativeInputText(q);
                      textareaRef.current?.focus();
                    }}
                    className="text-left text-xs px-4 py-2.5 rounded-xl bg-white/[0.04] hover:bg-[#56D9FF]/12 border border-white/10 hover:border-[#56D9FF]/40 text-[#FFF0D5]/85 transition-all"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                data-testid={`chat-bubble-${msg.role}`}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <GlassCard
                  interactive={false}
                  accent={msg.role === 'user' ? 'cyan' : 'gold'}
                  className={`max-w-3xl ${
                    msg.role === 'user'
                      ? 'border-[#56D9FF]/40 bg-[#56D9FF]/[0.05]'
                      : 'border-white/25 bg-white/[0.02]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4 mb-1.5 text-[10px] font-mono text-[#FFF0D5]/55">
                    <span className={msg.role === 'user' ? 'text-[#56D9FF]' : 'text-[#FFB347]'}>
                      {msg.role === 'user' ? 'ARCHITECT' : 'DEVMIND SINGULARITY'}
                    </span>
                    <div className="flex items-center gap-2">
                      {msg.shield_status && (
                        <span className="inline-flex items-center gap-1 text-[#56D9FF]/85">
                          <ShieldCheck className="w-3 h-3" />
                          {msg.shield_status}
                        </span>
                      )}
                      {msg.latency_ms ? <span>{Math.round(msg.latency_ms)} ms</span> : null}
                    </div>
                  </div>

                  <FormattedChatMessage content={msg.content} />

                  {msg.citations && msg.citations.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-white/10 flex flex-wrap gap-1.5">
                      {msg.citations.map((c, idx) => (
                        <span
                          key={`${c.file_path}-${idx}`}
                          className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-md bg-[#56D9FF]/10 text-[#56D9FF] border border-[#56D9FF]/25"
                        >
                          <FileCode2 className="w-3 h-3" />
                          {c.file_path}:{c.start_line}-{c.end_line}
                        </span>
                      ))}
                    </div>
                  )}
                </GlassCard>
              </div>
            ))
          )}

          {sending && (
            <div className="flex justify-start" data-testid="ai-thinking-indicator">
              <GlassCard interactive={false} accent="cyan" className="border-[#56D9FF]/40">
                <div className="flex items-center gap-2.5 text-xs text-[#56D9FF] font-mono">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Accretion core accelerating — synthesizing repository intelligence...</span>
                </div>
              </GlassCard>
            </div>
          )}
          <div ref={scrollEndRef} />
        </div>

        {/* Subtle Amber Error Warning (Section 9 ERROR state) */}
        {errorBanner && (
          <div
            data-testid="chat-error-banner"
            role="alert"
            className="mx-5 mb-2 px-4 py-2.5 rounded-xl bg-[#E88732]/15 border border-[#E88732]/45 text-[#FFB347] text-xs flex items-center justify-between gap-3"
          >
            <span className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-[#FFB347]" />
              <span>{errorBanner}</span>
            </span>
            <button
              type="button"
              onClick={() => setErrorBanner(null)}
              className="text-[11px] font-mono underline hover:text-[#FFF0D5]"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Uncontrolled Native Accessible <textarea> — Browser is 100% Source of Truth for Text & Undo History */}
        <form onSubmit={handleSubmit} className="p-4 pt-2 border-t border-white/10">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <GlassTextarea
                ref={textareaRef}
                id="singularity-chat-input"
                data-testid="singularity-chat-input"
                aria-label="Ask DevMind AI about your repository"
                enableGravityDeletion={true}
                rows={2}
                defaultValue=""
                onInput={(e) => {
                  const nextHas = e.currentTarget.value.trim().length > 0;
                  setHasText((prev) => (prev === nextHas ? prev : nextHas));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleSubmit();
                  }
                }}
                placeholder="Ask DevMind AI anything about your codebase... (Delete text to feed the Event Horizon, Ctrl+Z to reverse time)"
              />
            </div>

            <button
              type="submit"
              data-testid="singularity-chat-submit"
              disabled={sending || !hasText}
              className="h-[66px] px-5 rounded-xl font-medium text-xs flex items-center gap-2 bg-[#56D9FF]/18 hover:bg-[#56D9FF]/28 disabled:opacity-40 disabled:pointer-events-none text-[#FFF0D5] border border-[#56D9FF]/50 shadow-[0_0_24px_rgba(86,217,255,0.2)] transition-all shrink-0"
            >
              <span>Transmit</span>
              <CornerDownLeft className="w-4 h-4 text-[#56D9FF]" />
            </button>
          </div>

          <div className="mt-1.5 px-1 flex items-center justify-between text-[10px] text-[#FFF0D5]/45 font-mono">
            <HorizonStateReadout />
            <span>Enter to send · Shift+Enter newline · Native Undo/Redo active</span>
          </div>
        </form>
      </GlassPanel>
    </div>
  );
}
