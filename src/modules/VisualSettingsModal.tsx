import { useEffect, useState } from 'react';
import { Check, Flame, Lock, Orbit, RotateCcw, Save, Volume2 } from 'lucide-react';
import { GlassModal } from '../../components/glass/GlassModal';
import { cosmicAudioEngine, CosmicAudioSnapshot } from '../audio/CosmicAudioEngine';
import { DEFAULT_VISUAL_PREFERENCES, VisualPreferences } from '../engine/cosmicEngine';
import {
  CosmicDevourerSettings,
  cosmicSimulationManager,
  DEFAULT_DEVOURER_SETTINGS,
  SimulationQualityPreset,
} from '../engine/CosmicSimulationManager';
import { api } from '../services/api';
import { useSingularityStore } from '../store/singularityStore';

export function VisualSettingsModal() {
  const open = useSingularityStore((s) => s.settingsModalOpen);
  const setOpen = useSingularityStore((s) => s.setSettingsModalOpen);
  const prefs = useSingularityStore((s) => s.visualPreferences);
  const setPrefs = useSingularityStore((s) => s.setVisualPreferences);
  const user = useSingularityStore((s) => s.user);
  const forceStaticFallback = useSingularityStore((s) => s.forceStaticFallback);
  const setForceStaticFallback = useSingularityStore((s) => s.setForceStaticFallback);

  const [devourer, setDevourer] = useState<CosmicDevourerSettings>(
    () => ({ ...cosmicSimulationManager.settings })
  );
  const [audioSnap, setAudioSnap] = useState<CosmicAudioSnapshot>(() =>
    cosmicAudioEngine.getSnapshot()
  );
  const [savedToast, setSavedToast] = useState(false);

  useEffect(() => {
    const unsubSim = cosmicSimulationManager.subscribeSettings(setDevourer);
    const unsubAudio = cosmicAudioEngine.subscribe(setAudioSnap);
    return () => {
      unsubSim();
      unsubAudio();
    };
  }, []);

  const updateField = <K extends keyof VisualPreferences>(key: K, val: VisualPreferences[K]) => {
    const next = { ...prefs, [key]: val };
    setPrefs({ [key]: val });
    void api.saveVisualSettings(next).catch(() => {});
  };

  const updateDevourer = <K extends keyof CosmicDevourerSettings>(
    key: K,
    val: CosmicDevourerSettings[K]
  ) => {
    cosmicSimulationManager.updateSettings({ [key]: val }, user?.id ?? null);
  };

  const applyQualityMode = (preset: SimulationQualityPreset) => {
    if (preset === 'performance') {
      cosmicSimulationManager.updateSettings(
        {
          qualityPreset: 'performance',
          accretionDensity: 0.9,
          gasThickness: 0.85,
          maxCelestialObjects: 2,
        },
        user?.id ?? null
      );
      updateField('graphics_quality', 'low');
    } else if (preset === 'balanced') {
      cosmicSimulationManager.updateSettings(
        {
          qualityPreset: 'balanced',
          accretionDensity: 1.15,
          gasThickness: 1.1,
          maxCelestialObjects: 4,
        },
        user?.id ?? null
      );
      updateField('graphics_quality', 'high');
    } else {
      cosmicSimulationManager.updateSettings(
        {
          qualityPreset: 'cinematic',
          accretionDensity: 1.4,
          gasThickness: 1.4,
          maxCelestialObjects: 5,
        },
        user?.id ?? null
      );
      updateField('graphics_quality', 'ultra');
    }
  };

  const handleSaveAll = async () => {
    cosmicSimulationManager.updateSettings(devourer, user?.id ?? null);
    await api.saveVisualSettings(prefs).catch(() => {});
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 1800);
  };

  const handleResetDefaults = () => {
    setPrefs(DEFAULT_VISUAL_PREFERENCES);
    setForceStaticFallback(false);
    cosmicSimulationManager.updateSettings(DEFAULT_DEVOURER_SETTINGS, user?.id ?? null);
    void api.saveVisualSettings(DEFAULT_VISUAL_PREFERENCES).catch(() => {});
  };

  const toggleRows: Array<{ key: keyof VisualPreferences; label: string; desc: string }> = [
    {
      key: 'background_animation',
      label: 'Background Animation',
      desc: 'Near-extremal Kerr accretion & starfield motion',
    },
    {
      key: 'dynamic_glass_reflections',
      label: 'Dynamic Glass Reflections',
      desc: 'Directional black-hole amber, cyan & shockwave light',
    },
    {
      key: 'text_deletion_animation',
      label: 'Text Deletion Animation',
      desc: 'Deleted text fragments spiral into Event Horizon',
    },
    {
      key: 'undo_reversal_animation',
      label: 'Undo Reversal Animation (Ctrl+Z)',
      desc: 'Restored fragments escape outward from singularity',
    },
    {
      key: 'energy_pulses',
      label: 'Full-Screen Cosmic Pulses',
      desc: 'Event Horizon ingestion shockwaves & heartbeat waves',
    },
    { key: 'reduced_motion', label: 'Reduced Motion', desc: 'Accessibility motion suppression' },
  ];

  const sliderRows: Array<{
    key:
      | 'black_hole_rotation_intensity'
      | 'background_pulse_intensity'
      | 'gravitational_cursor_strength'
      | 'particle_density'
      | 'glass_transparency';
    label: string;
    min: number;
    max: number;
    step: number;
  }> = [
    {
      key: 'black_hole_rotation_intensity',
      label: 'Black-Hole Rotation Intensity',
      min: 0,
      max: 2.0,
      step: 0.05,
    },
    {
      key: 'background_pulse_intensity',
      label: 'Background Pulse Intensity',
      min: 0,
      max: 2.0,
      step: 0.05,
    },
    {
      key: 'gravitational_cursor_strength',
      label: 'Gravitational Cursor Strength',
      min: 0,
      max: 2.0,
      step: 0.05,
    },
    {
      key: 'particle_density',
      label: 'Cosmic Particle Density',
      min: 0.1,
      max: 2.0,
      step: 0.05,
    },
    { key: 'glass_transparency', label: 'Clear Glass Tint', min: 0.02, max: 0.78, step: 0.02 },
  ];

  const devourerSliders: Array<{
    key:
      | 'accretionDensity'
      | 'gasThickness'
      | 'starCaptureIntensity'
      | 'planetCaptureIntensity'
      | 'disruptionDurationScale'
      | 'simulationSpeed'
      | 'maxCelestialObjects';
    label: string;
    min: number;
    max: number;
    step: number;
  }> = [
    { key: 'accretionDensity', label: 'Accretion Ring Density', min: 0.4, max: 2.0, step: 0.05 },
    { key: 'gasThickness', label: 'Volumetric Gas Thickness', min: 0.4, max: 2.0, step: 0.05 },
    {
      key: 'starCaptureIntensity',
      label: 'Star Capture Gravity',
      min: 0.3,
      max: 2.0,
      step: 0.05,
    },
    {
      key: 'planetCaptureIntensity',
      label: 'Planet Roche Intensity',
      min: 0.3,
      max: 2.0,
      step: 0.05,
    },
    {
      key: 'disruptionDurationScale',
      label: 'TDE Event Timeline Scale',
      min: 0.5,
      max: 2.5,
      step: 0.05,
    },
    { key: 'simulationSpeed', label: 'Cosmic Simulation Speed', min: 0.25, max: 2.0, step: 0.05 },
    { key: 'maxCelestialObjects', label: 'Max Celestial Bodies', min: 1, max: 8, step: 1 },
  ];

  const audioPrefs = audioSnap.preferences;
  const masterVolPct = Math.round(audioPrefs.masterVolume * 100);

  return (
    <GlassModal
      open={open}
      onClose={() => setOpen(false)}
      title="Singularity: Extreme v2.4 — The Devourer Preferences"
      subtitle="Persisted automatically to your authenticated developer profile"
      maxWidthClass="max-w-3xl"
    >
      <div
        className="space-y-5 text-xs max-h-[74vh] overflow-y-auto pr-1"
        data-testid="visual-settings-modal"
      >
        {/* Cinematic vs Focus Mode */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            data-testid="mode-cinematic-btn"
            onClick={() => updateField('mode', 'cinematic')}
            className={`p-3.5 rounded-xl border text-left transition-all ${
              prefs.mode === 'cinematic'
                ? 'bg-[#FFB347]/15 border-[#FFB347]/60 text-[#FFF0D5]'
                : 'bg-white/[0.03] border-white/10 text-[#FFF0D5]/70'
            }`}
          >
            <div className="font-semibold text-sm text-[#FFB347]">Cinematic Extreme Mode</div>
            <div className="text-[11px] text-[#FFF0D5]/65 mt-0.5">
              Volumetric gas rings, star &amp; planet devouring, cosmic drift &amp; shockwaves
            </div>
          </button>

          <button
            type="button"
            data-testid="mode-focus-btn"
            onClick={() => updateField('mode', 'focus')}
            className={`p-3.5 rounded-xl border text-left transition-all ${
              prefs.mode === 'focus'
                ? 'bg-[#56D9FF]/15 border-[#56D9FF]/60 text-[#FFF0D5]'
                : 'bg-white/[0.03] border-white/10 text-[#FFF0D5]/70'
            }`}
          >
            <div className="font-semibold text-sm text-[#56D9FF]">Focus Mode</div>
            <div className="text-[11px] text-[#FFF0D5]/65 mt-0.5">
              Dims ambient particles &amp; increases surface contrast for extended coding sessions
            </div>
          </button>
        </div>

        {/* Phase 11: Quality Mode Presets (PERFORMANCE / BALANCED / CINEMATIC) */}
        <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-[#FFF0D5]">Simulation &amp; Shader Quality Mode</div>
              <div className="text-[11px] text-[#FFF0D5]/55">
                Scales volumetric gas strata, FBM octaves, DPR &amp; celestial particle pools
              </div>
            </div>
            <select
              data-testid="graphics-quality-select"
              value={prefs.graphics_quality}
              onChange={(e) =>
                updateField(
                  'graphics_quality',
                  e.target.value as VisualPreferences['graphics_quality']
                )
              }
              className="rounded-lg bg-[#090D14] border border-white/15 px-3 py-1.5 text-xs font-mono text-[#56D9FF]"
            >
              <option value="auto">Auto (60 FPS Adaptive)</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="ultra">Ultra</option>
            </select>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { id: 'performance', label: 'PERFORMANCE', sub: 'Max FPS / Low GPU' },
                { id: 'balanced', label: 'BALANCED', sub: 'Smooth 60 FPS' },
                { id: 'cinematic', label: 'CINEMATIC', sub: 'Full Volumetric Gas' },
              ] as const
            ).map((q) => (
              <button
                key={q.id}
                type="button"
                data-testid={`quality-preset-${q.id}`}
                onClick={() => applyQualityMode(q.id)}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  devourer.qualityPreset === q.id
                    ? 'bg-[#56D9FF]/18 border-[#56D9FF]/60 text-[#FFF0D5]'
                    : 'bg-white/[0.02] border-white/10 text-[#FFF0D5]/70 hover:border-white/25'
                }`}
              >
                <div className="font-mono font-semibold text-[11px] text-[#56D9FF]">{q.label}</div>
                <div className="text-[10px] text-[#FFF0D5]/60">{q.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Phase 11: Cosmic Devourer Simulation Controls */}
        <div className="p-3.5 rounded-xl bg-gradient-to-br from-[#FFB347]/[0.06] via-white/[0.02] to-[#56D9FF]/[0.05] border border-[#FFB347]/25 space-y-3">
          <div className="flex items-center gap-2 text-[#FFB347] font-semibold">
            <Orbit className="w-4 h-4" />
            <span>Cosmic Devourer Physics &amp; Volumetric Accretion</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <label className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-black/30 border border-white/10 cursor-pointer">
              <div>
                <div className="font-medium text-[#FFF0D5]">Cosmic Drift</div>
                <div className="text-[10px] text-[#FFF0D5]/55">Black hole travels through cosmos</div>
              </div>
              <input
                type="checkbox"
                data-testid="toggle-cosmic-drift"
                checked={devourer.cosmicDriftEnabled}
                onChange={(e) => updateDevourer('cosmicDriftEnabled', e.target.checked)}
                className="w-4 h-4 accent-[#FFB347]"
              />
            </label>

            <label className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-black/30 border border-white/10 cursor-pointer">
              <div>
                <div className="font-medium text-[#FFF0D5]">Stable Camera Viewing Mode</div>
                <div className="text-[10px] text-[#FFF0D5]/55">Suppresses orbital camera sway</div>
              </div>
              <input
                type="checkbox"
                data-testid="toggle-stable-camera"
                checked={devourer.stableCameraMode}
                onChange={(e) => updateDevourer('stableCameraMode', e.target.checked)}
                className="w-4 h-4 accent-[#56D9FF]"
              />
            </label>

            <label className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-black/30 border border-white/10 cursor-pointer">
              <div>
                <div className="font-medium text-[#FFF0D5]">Star Devouring</div>
                <div className="text-[10px] text-[#FFF0D5]/55">6-stage TDE spaghettification</div>
              </div>
              <input
                type="checkbox"
                data-testid="toggle-star-generation"
                checked={devourer.starGenerationEnabled}
                onChange={(e) => updateDevourer('starGenerationEnabled', e.target.checked)}
                className="w-4 h-4 accent-[#FFB347]"
              />
            </label>

            <label className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-black/30 border border-white/10 cursor-pointer">
              <div>
                <div className="font-medium text-[#FFF0D5]">Planet Capture</div>
                <div className="text-[10px] text-[#FFF0D5]/55">Roche boulders &amp; debris infall</div>
              </div>
              <input
                type="checkbox"
                data-testid="toggle-planet-generation"
                checked={devourer.planetGenerationEnabled}
                onChange={(e) => updateDevourer('planetGenerationEnabled', e.target.checked)}
                className="w-4 h-4 accent-[#56D9FF]"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {devourerSliders.map((s) => (
              <div
                key={s.key}
                className="p-2.5 rounded-xl bg-black/25 border border-white/10 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[#FFF0D5]/85 font-medium">{s.label}</span>
                  <span className="font-mono text-[#FFB347]">
                    {s.step === 1 ? devourer[s.key] : Number(devourer[s.key]).toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  aria-label={s.label}
                  data-testid={`devourer-slider-${s.key}`}
                  min={s.min}
                  max={s.max}
                  step={s.step}
                  value={Number(devourer[s.key])}
                  onChange={(e) => updateDevourer(s.key, parseFloat(e.target.value))}
                  className="w-full accent-[#FFB347]"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Phase 1 & 11: Cosmic Audio Quick Loudness & Layer Controls */}
        <div className="p-3.5 rounded-xl bg-white/[0.03] border border-[#56D9FF]/25 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[#56D9FF] font-semibold">
              <Volume2 className="w-4 h-4" />
              <span>Cosmic Horror Loudness &amp; Celestial Soundscape</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-testid="modal-cinematic-horror-audio-btn"
                onClick={() => {
                  cosmicAudioEngine.setPreset('CINEMATIC_HORROR');
                  cosmicAudioEngine.setCinematicAudioMode(true);
                  void cosmicAudioEngine.enableFromUserGesture();
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-mono border flex items-center gap-1 transition-all ${
                  audioPrefs.preset === 'CINEMATIC_HORROR'
                    ? 'bg-[#FFB347]/25 border-[#FFB347]/65 text-[#FFB347]'
                    : 'bg-white/[0.05] border-white/15 text-[#FFF0D5]/80 hover:border-[#FFB347]/50'
                }`}
              >
                <Flame className="w-3.5 h-3.5 text-[#FFB347]" />
                <span>Cinematic Horror</span>
              </button>

              <button
                type="button"
                data-testid="modal-high-intensity-audio-btn"
                onClick={() => {
                  cosmicAudioEngine.setPreset('HIGH_INTENSITY');
                  void cosmicAudioEngine.enableFromUserGesture();
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-mono border flex items-center gap-1 transition-all ${
                  audioPrefs.preset === 'HIGH_INTENSITY'
                    ? 'bg-[#56D9FF]/25 border-[#56D9FF]/65 text-[#56D9FF]'
                    : 'bg-white/[0.05] border-white/15 text-[#FFF0D5]/80 hover:border-[#56D9FF]/50'
                }`}
              >
                <span>High Intensity</span>
              </button>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-black/25 border border-white/10 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[#FFF0D5]/85 font-medium">Master Cosmic Volume</span>
              <span className="font-mono text-[#56D9FF]">{masterVolPct}%</span>
            </div>
            <input
              type="range"
              aria-label="Master Cosmic Volume"
              data-testid="modal-audio-volume-slider"
              min={0}
              max={100}
              step={1}
              value={masterVolPct}
              onChange={(e) => cosmicAudioEngine.setMasterVolume(Number(e.target.value) / 100)}
              className="w-full accent-[#56D9FF]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(
              [
                { key: 'plasma', label: 'Accretion Gas Sound' },
                { key: 'starConsumption', label: 'Star Destruction Sound' },
                { key: 'planetConsumption', label: 'Planet Breakup Sound' },
              ] as const
            ).map((item) => (
              <label
                key={item.key}
                className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-black/25 border border-white/10 cursor-pointer"
              >
                <span className="font-medium text-[#FFF0D5]">{item.label}</span>
                <input
                  type="checkbox"
                  data-testid={`modal-audio-layer-${item.key}`}
                  checked={audioPrefs.layers[item.key]}
                  onChange={(e) => cosmicAudioEngine.setLayerEnabled(item.key, e.target.checked)}
                  className="w-4 h-4 accent-[#56D9FF]"
                />
              </label>
            ))}
          </div>
        </div>

        {/* Core Singularity Sliders */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {sliderRows.map((s) => (
            <div
              key={s.key}
              className="p-3 rounded-xl bg-white/[0.03] border border-white/10 space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <span className="text-[#FFF0D5]/85 font-medium">{s.label}</span>
                <span className="font-mono text-[#56D9FF]">{Number(prefs[s.key]).toFixed(2)}</span>
              </div>
              <input
                type="range"
                aria-label={s.label}
                min={s.min}
                max={s.max}
                step={s.step}
                value={Number(prefs[s.key])}
                onChange={(e) => updateField(s.key, parseFloat(e.target.value))}
                className="w-full accent-[#56D9FF]"
              />
            </div>
          ))}
        </div>

        {/* Core Singularity Toggles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {toggleRows.map((row) => {
            const checked = Boolean(prefs[row.key]);
            return (
              <label
                key={row.key}
                className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/10 cursor-pointer hover:border-[#56D9FF]/35"
              >
                <div>
                  <div className="font-medium text-[#FFF0D5]">{row.label}</div>
                  <div className="text-[11px] text-[#FFF0D5]/55">{row.desc}</div>
                </div>
                <input
                  type="checkbox"
                  data-testid={`toggle-${row.key}`}
                  checked={checked}
                  onChange={(e) => updateField(row.key, e.target.checked as never)}
                  className="w-4 h-4 accent-[#56D9FF]"
                />
              </label>
            );
          })}

          <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/10 cursor-pointer hover:border-[#56D9FF]/35">
            <div>
              <div className="font-medium text-[#FFF0D5]">Static Background Fallback</div>
              <div className="text-[11px] text-[#FFF0D5]/55">
                Use CSS singularity instead of WebGL
              </div>
            </div>
            <input
              type="checkbox"
              data-testid="toggle-static-fallback"
              checked={forceStaticFallback}
              onChange={(e) => setForceStaticFallback(e.target.checked)}
              className="w-4 h-4 accent-[#56D9FF]"
            />
          </label>
        </div>

        {/* Server-Side Secret Vault Notice (Zero client-side API key storage) */}
        <div className="p-3 rounded-xl bg-[#101827]/55 border border-[#56D9FF]/25 flex items-center gap-2.5 text-[11px] text-[#FFF0D5]/75">
          <Lock className="w-4 h-4 text-[#56D9FF] shrink-0" />
          <span>
            <strong className="text-[#FFF0D5]">Server-Side Secret Isolation Active:</strong> Gemini
            AI &amp; Firebase Admin credentials are managed strictly in backend environment
            variables and never stored in browser storage.
          </span>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-white/10">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="px-3.5 py-2 rounded-xl bg-white/[0.05] hover:bg-white/10 text-[#FFF0D5]/80 flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </button>

          <button
            type="button"
            data-testid="save-visual-settings-btn"
            onClick={handleSaveAll}
            className="px-5 py-2 rounded-xl bg-[#56D9FF]/22 hover:bg-[#56D9FF]/32 border border-[#56D9FF]/50 text-[#FFF0D5] font-semibold flex items-center gap-1.5"
          >
            {savedToast ? (
              <Check className="w-4 h-4 text-[#56D9FF]" />
            ) : (
              <Save className="w-4 h-4 text-[#56D9FF]" />
            )}
            <span>{savedToast ? 'Saved to Database' : 'Save Preferences'}</span>
          </button>
        </div>
      </div>
    </GlassModal>
  );
}
