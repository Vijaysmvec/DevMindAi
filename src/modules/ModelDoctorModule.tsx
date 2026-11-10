import { useEffect, useState } from 'react';
import { Activity, Gauge, Stethoscope } from 'lucide-react';
import { GlassPanel } from '../../components/glass/GlassPanel';
import { GlassCard } from '../../components/glass/GlassCard';
import { GlassTextarea } from '../../components/glass/GlassInput';
import { api } from '../services/api';
import { useSingularityStore } from '../store/singularityStore';

export function ModelDoctorModule() {
  const userId = useSingularityStore((s) => s.user?.id ?? null);
  const setInteractionState = useSingularityStore((s) => s.setInteractionState);
  const [status, setStatus] = useState<{
    active_model: string;
    gemini_live_key_detected: boolean;
    vector_backend: string;
    average_latency_ms: number;
    total_tokens_processed: number;
    system_health_score: number;
    telemetry: Array<{
      id: number;
      operation: string;
      model_name: string;
      latency_ms: number;
      prompt_tokens: number;
      completion_tokens: number;
      health_score: number;
      notes: string;
    }>;
  } | null>(null);

  const [probePrompt, setProbePrompt] = useState(
    'Diagnose latency and grounding accuracy for SingularityEngine angular velocity telemetry.'
  );
  const [temperature, setTemperature] = useState(0.3);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [diagnosis, setDiagnosis] = useState<{
    clarity_score: number;
    hallucination_risk: string;
    measured_latency_ms: number;
    recommendations: string[];
  } | null>(null);

  const refreshStatus = () => {
    api.getModelDoctorStatus().then(setStatus).catch(() => {});
  };

  useEffect(() => {
    if (!userId) {
      setStatus(null);
      return;
    }
    refreshStatus();
  }, [userId]);

  const handleDiagnose = async () => {
    setErrorMsg(null);
    setInteractionState('AI_THINKING');
    try {
      const res = await api.runModelDoctorDiagnosis(probePrompt, temperature);
      setDiagnosis(res);
      refreshStatus();
      setInteractionState('AI_RESPONSE', 1200);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to execute ModelDoctor probe');
      setInteractionState('ERROR', 1600);
    }
  };

  return (
    <div className="h-full overflow-y-auto space-y-4 pr-1" data-testid="model-doctor-module">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <GlassCard accent="cyan">
          <div className="text-[11px] text-[#FFF0D5]/60">Active Engine</div>
          <div className="text-sm font-mono font-bold text-[#56D9FF] mt-1">
            {status?.active_model || 'gemini-3.5-flash'}
          </div>
        </GlassCard>
        <GlassCard accent="gold">
          <div className="text-[11px] text-[#FFF0D5]/60">System Health</div>
          <div className="text-xl font-mono font-bold text-[#FFB347] mt-1">
            {status?.system_health_score ?? 99}%
          </div>
        </GlassCard>
        <GlassCard accent="cyan">
          <div className="text-[11px] text-[#FFF0D5]/60">Avg Inference Latency</div>
          <div className="text-xl font-mono font-bold text-[#FFF0D5] mt-1">
            {status ? `${Math.round(status.average_latency_ms)} ms` : '—'}
          </div>
        </GlassCard>
        <GlassCard accent="violet">
          <div className="text-[11px] text-[#FFF0D5]/60">Tokens Processed</div>
          <div className="text-xl font-mono font-bold text-[#FFF0D5] mt-1">
            {status?.total_tokens_processed ?? 0}
          </div>
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5">
          <GlassPanel className="p-5 space-y-4" edgeParticles>
            <h2 className="text-sm font-semibold text-[#FFF0D5] flex items-center gap-2">
              <Stethoscope className="w-4 h-4 text-[#56D9FF]" />
              <span>ModelDoctor Calibration Probe</span>
            </h2>

            <GlassTextarea
              rows={4}
              value={probePrompt}
              onChange={(e) => setProbePrompt(e.target.value)}
              aria-label="ModelDoctor diagnostic prompt"
            />

            <div>
              <div className="flex justify-between text-xs text-[#FFF0D5]/70 mb-1">
                <span>Sampling Temperature</span>
                <span className="font-mono text-[#56D9FF]">{temperature.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={1.2}
                step={0.05}
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full accent-[#56D9FF]"
              />
            </div>

            {errorMsg && (
              <div className="p-2.5 rounded-lg bg-[#FF7838]/15 border border-[#FF7838]/40 text-xs text-[#FFB347]">
                {errorMsg}
              </div>
            )}

            <button
              type="button"
              data-testid="run-model-doctor-btn"
              onClick={handleDiagnose}
              className="w-full py-2.5 rounded-xl text-xs font-semibold bg-[#56D9FF]/20 hover:bg-[#56D9FF]/30 border border-[#56D9FF]/50 text-[#FFF0D5]"
            >
              Run Diagnostic Probe
            </button>

            {diagnosis && (
              <GlassCard interactive={false} accent="gold" data-testid="model-doctor-diagnosis">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-[#56D9FF]">Clarity: {diagnosis.clarity_score}/100</span>
                  <span className="text-[#FFB347]">Drift Risk: {diagnosis.hallucination_risk}</span>
                </div>
                <ul className="mt-2.5 space-y-1 text-xs text-[#FFF0D5]/75 list-disc list-inside">
                  {diagnosis.recommendations.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </GlassCard>
            )}
          </GlassPanel>
        </div>

        <div className="lg:col-span-7">
          <GlassPanel className="p-5 space-y-3 h-full">
            <h3 className="text-sm font-semibold text-[#FFF0D5] flex items-center gap-2">
              <Activity className="w-4 h-4 text-[#FFB347]" />
              <span>Live Model Telemetry Ledger</span>
            </h3>
            <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
              {status?.telemetry.map((t) => (
                <div
                  key={t.id}
                  className="px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-mono text-[#FFF0D5] flex items-center gap-2">
                      <Gauge className="w-3.5 h-3.5 text-[#56D9FF]" />
                      <span>{t.operation}</span>
                    </div>
                    <div className="text-[11px] text-[#FFF0D5]/55 mt-0.5">{t.notes}</div>
                  </div>
                  <div className="text-right font-mono text-[11px]">
                    <div className="text-[#FFB347]">{Math.round(t.latency_ms)} ms</div>
                    <div className="text-[#56D9FF]">{t.prompt_tokens + t.completion_tokens} tok</div>
                  </div>
                </div>
              ))}
            </div>
          </GlassPanel>
        </div>
      </div>
    </div>
  );
}
