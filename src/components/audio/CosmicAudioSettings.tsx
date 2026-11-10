import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  Play,
  Radio,
  Sparkles,
  Volume2,
  VolumeX,
  Waves,
  X,
  Zap,
} from 'lucide-react';
import { AUDIO_PRESET_LIST } from '../../audio/AudioPresets';
import { AudioLayerKey, AudioPresetId } from '../../audio/AudioSettings';
import {
  CosmicAudioEngine,
  cosmicAudioEngine,
  CosmicAudioSnapshot,
} from '../../audio/CosmicAudioEngine';

interface CosmicAudioSettingsProps {
  open: boolean;
  onClose: () => void;
  snapshot: CosmicAudioSnapshot;
  engine?: CosmicAudioEngine;
}

const LAYER_DESCRIPTORS: Array<{
  key: AudioLayerKey;
  label: string;
  subtitle: string;
  accent: 'cyan' | 'amber';
}> = [
  {
    key: 'drone',
    label: 'The Void — Organ & Horizon Drone',
    subtitle: 'Deep evolving sub-cosmic organ harmonics & void rumble',
    accent: 'amber',
  },
  {
    key: 'gravitationalPressure',
    label: 'Gravitational Pressure',
    subtitle: 'Pulsing dread, distant formant choir & horizon ticks',
    accent: 'amber',
  },
  {
    key: 'plasma',
    label: 'Accretion Storm Plasma',
    subtitle: 'Swirling gas rings, turbulence & plasma crackle',
    accent: 'amber',
  },
  {
    key: 'starConsumption',
    label: 'Stellar Tidal Destruction',
    subtitle: 'Dissonant spaghettification stretch & TDE collapse',
    accent: 'amber',
  },
  {
    key: 'planetConsumption',
    label: 'Planetary Roche Destruction',
    subtitle: 'Heavy crustal cracking, boulder impacts & core plunge',
    accent: 'cyan',
  },
  {
    key: 'ingestion',
    label: 'Particle Ingestion Pull',
    subtitle: 'Horizon approach tension, pitch sweep & crystal fade',
    accent: 'cyan',
  },
  {
    key: 'shockwave',
    label: 'Cosmic Shockwave Pulse',
    subtitle: 'Synchronized full-viewport energy wave resonance',
    accent: 'amber',
  },
  {
    key: 'ui',
    label: 'UI & AI Interaction Cues',
    subtitle: 'Restrained transmit, AI thinking & response tones',
    accent: 'cyan',
  },
];

export function CosmicAudioSettings({
  open,
  onClose,
  snapshot,
  engine = cosmicAudioEngine,
}: CosmicAudioSettingsProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };

    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      const triggerEl = document.querySelector('[data-testid="topbar-audio-settings-btn"]');
      if (triggerEl?.contains(target)) return;
      onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') {
    return null;
  }

  const { preferences, isAudible, needsGestureUnlock } = snapshot;
  const volumePercent = Math.round(preferences.masterVolume * 100);

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-label="Cosmic Audio Engine Settings"
      data-testid="cosmic-audio-settings-panel"
      className="fixed top-16 right-4 z-50 w-[min(380px,calc(100vw-2rem))] max-h-[calc(100vh-5rem)] overflow-y-auto rounded-2xl border border-white/20 bg-[#060A13]/88 backdrop-blur-2xl p-4 text-[#FFF0D5] shadow-[0_24px_64px_rgba(0,0,0,0.82),inset_0_1px_0_rgba(86,217,255,0.28),inset_0_-1px_0_rgba(255,179,71,0.18)] animate-fade-in"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 pb-3 border-b border-white/12">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#56D9FF]/20 to-[#FFB347]/20 border border-[#56D9FF]/35 flex items-center justify-center">
            <Waves className="w-4 h-4 text-[#56D9FF]" />
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-wide text-[#FFF0D5] flex items-center gap-1.5">
              <span>Cosmic Audio Engine</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#56D9FF]/15 border border-[#56D9FF]/35 text-[#56D9FF]">
                v2.4
              </span>
            </h2>
            <p className="text-[11px] text-[#FFF0D5]/60">
              Original Cosmic Horror &amp; Singularity Web Audio
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close Cosmic Audio Settings"
          data-testid="close-audio-settings-btn"
          className="p-1.5 rounded-lg text-[#FFF0D5]/65 hover:text-[#FFF0D5] hover:bg-white/10 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* First-Use / Browser Gesture Enablement Callout */}
      {(!preferences.enabled || needsGestureUnlock) && (
        <div
          data-testid="enable-cosmic-audio-callout"
          className="mt-3 p-3 rounded-xl bg-gradient-to-r from-[#56D9FF]/12 via-[#0B1324]/60 to-[#FFB347]/12 border border-[#56D9FF]/35"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-[#FFF0D5]">
                {needsGestureUnlock ? 'Resume Cosmic Audio' : 'Enable Cosmic Audio'}
              </p>
              <p className="text-[11px] text-[#FFF0D5]/68 mt-0.5 leading-relaxed">
                Audio starts muted by default to respect browser autoplay rules. Activate to awaken
                the Event Horizon soundscape.
              </p>
            </div>
            <button
              type="button"
              data-testid="enable-cosmic-audio-cta"
              onClick={() => {
                void engine.enableFromUserGesture();
              }}
              className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#56D9FF]/22 hover:bg-[#56D9FF]/32 border border-[#56D9FF]/55 text-[#56D9FF] shadow-[0_0_16px_rgba(86,217,255,0.2)] transition-all flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{needsGestureUnlock ? 'Resume' : 'Enable'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Master Power, Instant Mute & Volume */}
      <div className="mt-3.5 space-y-3 p-3 rounded-xl bg-white/[0.03] border border-white/10">
        <div className="flex items-center justify-between gap-2">
          <div>
            <span className="text-xs font-medium text-[#FFF0D5] block">Master Cosmic Audio</span>
            <span className="text-[11px] text-[#FFF0D5]/55">
              {isAudible
                ? 'Active — real-time synthesis online'
                : preferences.muted
                  ? 'Muted — all layers silenced'
                  : 'Standby — zero audio output'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-testid="audio-panel-mute-btn"
              onClick={() => {
                void engine.toggleMuteFromUserGesture();
              }}
              title={preferences.muted ? 'Unmute all layers' : 'Immediately mute all layers'}
              aria-label={preferences.muted ? 'Unmute Cosmic Audio' : 'Mute Cosmic Audio'}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-mono border flex items-center gap-1 transition-all ${
                preferences.muted
                  ? 'bg-[#FFB347]/20 border-[#FFB347]/55 text-[#FFB347]'
                  : 'bg-white/[0.05] border-white/15 text-[#FFF0D5]/80 hover:border-[#56D9FF]/45'
              }`}
            >
              {preferences.muted ? (
                <>
                  <VolumeX className="w-3.5 h-3.5" />
                  <span>Muted</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-3.5 h-3.5 text-[#56D9FF]" />
                  <span>Mute</span>
                </>
              )}
            </button>

            <button
              type="button"
              role="switch"
              aria-checked={preferences.enabled}
              aria-label="Master Cosmic Audio ON or OFF"
              data-testid="audio-master-enable-toggle"
              onClick={() => {
                void engine.setEnabledFromUserGesture(!preferences.enabled);
              }}
              className={`relative w-11 h-6 rounded-full border transition-colors ${
                preferences.enabled
                  ? 'bg-[#56D9FF]/30 border-[#56D9FF]/65'
                  : 'bg-white/10 border-white/20'
              }`}
            >
              <span
                className={`block w-4 h-4 rounded-full transition-transform duration-200 ${
                  preferences.enabled
                    ? 'translate-x-5 bg-[#56D9FF] shadow-[0_0_8px_#56D9FF]'
                    : 'translate-x-1 bg-[#FFF0D5]/60'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Master Volume Slider */}
        <div>
          <div className="flex items-center justify-between text-[11px] mb-1">
            <label htmlFor="cosmic-master-volume" className="text-[#FFF0D5]/80 font-medium">
              Master Volume
            </label>
            <span
              data-testid="audio-volume-value"
              className="font-mono text-[#56D9FF]"
            >
              {volumePercent}%
            </span>
          </div>
          <input
            id="cosmic-master-volume"
            data-testid="audio-volume-slider"
            type="range"
            min={0}
            max={100}
            step={1}
            value={volumePercent}
            aria-label="Master cosmic audio volume"
            onChange={(e) => {
              engine.setMasterVolume(Number(e.target.value) / 100);
            }}
            className="w-full accent-[#56D9FF] cursor-pointer h-1.5 rounded-lg bg-white/15"
          />
        </div>

        {/* v2.4 Optional Cinematic Audio Mode (Deep Organ/Choir + Wide Void Reverb Boost) */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/10">
          <div className="min-w-0">
            <span className="text-xs font-medium text-[#FFB347] block">Cinematic Audio Mode</span>
            <span className="text-[10px] text-[#FFF0D5]/55 block truncate">
              Boosts deep void organ, reverb scale &amp; TDE presence (limiter safe)
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={preferences.cinematicAudioMode}
            aria-label="Toggle Cinematic Audio Mode"
            data-testid="audio-cinematic-mode-toggle"
            onClick={() => {
              engine.setCinematicAudioMode(!preferences.cinematicAudioMode);
            }}
            className={`shrink-0 relative w-10 h-5 rounded-full border transition-colors ${
              preferences.cinematicAudioMode
                ? 'bg-[#FFB347]/30 border-[#FFB347]/70'
                : 'bg-white/10 border-white/20'
            }`}
          >
            <span
              className={`block w-3.5 h-3.5 rounded-full transition-transform duration-200 ${
                preferences.cinematicAudioMode
                  ? 'translate-x-5 bg-[#FFB347] shadow-[0_0_8px_#FFB347]'
                  : 'translate-x-0.5 bg-[#FFF0D5]/60'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Three Audio Presets */}
      <div className="mt-3.5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-mono uppercase tracking-wider text-[#FFF0D5]/65 flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-[#FFB347]" />
            <span>Acoustic Presets</span>
          </span>
        </div>

        <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Cosmic Audio Presets">
          {AUDIO_PRESET_LIST.map((preset) => {
            const selected = preferences.preset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                role="radio"
                aria-checked={selected}
                data-testid={`audio-preset-${preset.id}`}
                title={preset.description}
                onClick={() => engine.setPreset(preset.id as AudioPresetId)}
                className={`p-2 rounded-xl border text-left transition-all ${
                  selected
                    ? 'bg-gradient-to-b from-[#56D9FF]/20 to-[#FFB347]/10 border-[#56D9FF]/60 shadow-[0_0_14px_rgba(86,217,255,0.18)]'
                    : 'bg-white/[0.03] border-white/12 hover:border-white/30'
                }`}
              >
                <div className="text-xs font-semibold text-[#FFF0D5] truncate">
                  {preset.label}
                </div>
                <div className="text-[10px] text-[#56D9FF]/90 font-mono mt-0.5 truncate">
                  {preset.badge ?? (preset.id === 'DEEP_SPACE' ? 'Ambient' : 'Dynamic')}
                </div>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-[#FFF0D5]/60 mt-1.5 leading-snug">
          {engine.getActivePreset().description}
        </p>
      </div>

      {/* Individual Sound Layer Toggles */}
      <div className="mt-3.5">
        <span className="text-[11px] font-mono uppercase tracking-wider text-[#FFF0D5]/65 flex items-center gap-1.5 mb-2">
          <Activity className="w-3.5 h-3.5 text-[#56D9FF]" />
          <span>Cosmic Sound Layers</span>
        </span>

        <div className="space-y-1.5">
          {LAYER_DESCRIPTORS.map((layer) => {
            const active = preferences.layers[layer.key];
            return (
              <div
                key={layer.key}
                className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl bg-white/[0.025] border border-white/10 hover:border-white/20 transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-xs font-medium text-[#FFF0D5] truncate">{layer.label}</div>
                  <div className="text-[10px] text-[#FFF0D5]/55 truncate">{layer.subtitle}</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={active}
                  aria-label={`Toggle ${layer.label}`}
                  data-testid={`audio-layer-${layer.key}`}
                  onClick={() => engine.setLayerEnabled(layer.key, !active)}
                  className={`shrink-0 relative w-9 h-5 rounded-full border transition-colors ${
                    active
                      ? layer.accent === 'amber'
                        ? 'bg-[#FFB347]/28 border-[#FFB347]/65'
                        : 'bg-[#56D9FF]/28 border-[#56D9FF]/65'
                      : 'bg-white/10 border-white/20'
                  }`}
                >
                  <span
                    className={`block w-3.5 h-3.5 rounded-full transition-transform duration-200 ${
                      active
                        ? layer.accent === 'amber'
                          ? 'translate-x-4 bg-[#FFB347]'
                          : 'translate-x-4 bg-[#56D9FF]'
                        : 'translate-x-0.5 bg-[#FFF0D5]/55'
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer Actions: Test Sound */}
      <div className="mt-3.5 pt-3 border-t border-white/12 flex items-center justify-between gap-2">
        <span className="text-[10px] font-mono text-[#FFF0D5]/55 flex items-center gap-1">
          <Zap className="w-3 h-3 text-[#FFB347]" />
          <span>Safe studio limiter (-4 dB)</span>
        </span>

        <button
          type="button"
          data-testid="audio-test-sound-btn"
          onClick={() => {
            void engine.playTestSoundFromGesture();
          }}
          title="Play a brief procedural Singularity test resonance"
          className="px-3 py-1.5 rounded-xl text-xs font-medium bg-gradient-to-r from-[#56D9FF]/18 to-[#FFB347]/18 hover:from-[#56D9FF]/28 hover:to-[#FFB347]/28 border border-[#56D9FF]/45 text-[#FFF0D5] flex items-center gap-1.5 transition-all"
        >
          <Play className="w-3.5 h-3.5 text-[#56D9FF]" />
          <span>Test Sound</span>
        </button>
      </div>
    </div>,
    document.body
  );
}
