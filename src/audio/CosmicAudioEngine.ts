import {
  AudioVisualModulation,
  cosmicEngine,
  CosmicInteractionState,
  CosmicShockwaveSignal,
  ParticleIngestionEvent,
} from '../engine/cosmicEngine';
import {
  CosmicDevourerEvent,
  cosmicSimulationManager,
} from '../engine/CosmicSimulationManager';
import { AudioContextFactory, AudioContextManager } from './AudioContextManager';
import { AudioPerformanceManager } from './AudioPerformanceManager';
import { AUDIO_PRESETS, AudioPresetProfile } from './AudioPresets';
import {
  AudioLayerKey,
  CosmicAudioPreferences,
  DEFAULT_AUDIO_PREFERENCES,
  loadUserAudioPreferences,
  sanitizeAudioPreferences,
  saveUserAudioPreferences,
} from './AudioSettings';
import { CosmicSoundGenerator } from './CosmicSoundGenerator';

export interface CosmicAudioSnapshot {
  preferences: CosmicAudioPreferences;
  contextState: AudioContextState | 'uninitialized';
  isInitialized: boolean;
  isAudible: boolean;
  needsGestureUnlock: boolean;
  isAuthenticated: boolean;
  effectiveMasterGain: number;
  layerGains: {
    drone: number;
    gravitationalPressure: number;
    plasma: number;
    thinking: number;
    approach: number;
  };
  activeTransientVoices: number;
  totalDisposedVoices: number;
  totalCoalescedIngestions: number;
  stats: {
    ingestionSoundsPlayed: number;
    shockwaveSoundsPlayed: number;
    starSoundsPlayed: number;
    planetSoundsPlayed: number;
    uiSoundsPlayed: number;
    testSoundsPlayed: number;
  };
}

/**
 * Facade and state coordinator for the DevMind AI — SINGULARITY: EXTREME v2.2 Cosmic Audio Engine.
 */
export class CosmicAudioEngine {
  public readonly contextManager: AudioContextManager;
  public readonly performanceManager: AudioPerformanceManager;
  public readonly soundGenerator: CosmicSoundGenerator;

  private preferences: CosmicAudioPreferences = sanitizeAudioPreferences(DEFAULT_AUDIO_PREFERENCES);
  private currentUserId: number | string | null = null;
  private isAuthenticated = true;
  private listeners = new Set<(snapshot: CosmicAudioSnapshot) => void>();

  constructor(options?: {
    contextFactory?: AudioContextFactory;
    requireAuthentication?: boolean;
  }) {
    this.contextManager = new AudioContextManager(options?.contextFactory);
    this.performanceManager = new AudioPerformanceManager();
    this.soundGenerator = new CosmicSoundGenerator(this.performanceManager);
    if (options?.requireAuthentication) {
      this.isAuthenticated = false;
    }
  }

  public subscribe(listener: (snapshot: CosmicAudioSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emitChange(): void {
    const snap = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snap);
    }
  }

  public getPreferences(): CosmicAudioPreferences {
    return {
      ...this.preferences,
      layers: { ...this.preferences.layers },
    };
  }

  public getActivePreset(): AudioPresetProfile {
    return AUDIO_PRESETS[this.preferences.preset];
  }

  public isAudible(): boolean {
    return (
      this.isAuthenticated &&
      this.preferences.enabled &&
      !this.preferences.muted &&
      this.preferences.masterVolume > 0 &&
      !this.contextManager.isPageHidden() &&
      this.contextManager.getState() === 'running'
    );
  }

  public needsGestureUnlock(): boolean {
    return (
      this.isAuthenticated &&
      this.preferences.enabled &&
      !this.preferences.muted &&
      this.contextManager.getState() !== 'running'
    );
  }

  private computeDesiredMasterGain(): number {
    if (
      !this.isAuthenticated ||
      !this.preferences.enabled ||
      this.preferences.muted ||
      this.contextManager.isPageHidden()
    ) {
      return 0;
    }
    return this.preferences.masterVolume;
  }

  private persistPreferences(): void {
    saveUserAudioPreferences(this.preferences, this.currentUserId);
  }

  /**
   * Synchronizes authenticated user scope. Automatically silences output when unauthenticated
   * so no unexpected audio ever plays on the Login / Sign Up portal.
   */
  public setAuthenticatedUser(userId: number | string | null): void {
    const authenticated = userId !== null && userId !== undefined && String(userId).trim() !== '';
    this.currentUserId = authenticated ? userId : null;
    this.isAuthenticated = authenticated;

    if (!authenticated) {
      this.performanceManager.clearPendingCoalesce();
      this.soundGenerator.setAiThinkingActive(this.contextManager.getContext(), false);
      this.soundGenerator.setApproachTension(this.contextManager.getContext(), 0);
      this.soundGenerator.setGravitationalPressure(this.contextManager.getContext(), 0);
      this.contextManager.applyMasterGain(0, true);
      cosmicEngine.audioVisual = { amplitude: 0, bass: 0, mid: 0, high: 0 };
      this.emitChange();
      return;
    }

    // Hydrate saved preferences for this authenticated user without auto-starting AudioContext
    this.preferences = loadUserAudioPreferences(this.currentUserId);
    const ctx = this.contextManager.getContext();
    this.contextManager.setCinematicAudioBoost(
      this.preferences.cinematicAudioMode,
      this.getActivePreset().reverbSendGain
    );
    this.soundGenerator.applyPresetAndLayers(ctx, this.preferences.preset, this.preferences.layers);

    if (this.contextManager.getState() === 'running') {
      const mixBus = this.contextManager.getMixBus();
      if (ctx && mixBus && this.preferences.enabled && !this.preferences.muted) {
        this.contextManager.attachReverbImpulse(this.performanceManager.getDarkReverbBuffer(ctx));
        this.soundGenerator.ensureContinuousLayersStarted(
          ctx,
          mixBus,
          this.contextManager.getReverbSendBus()
        );
      }
      this.contextManager.applyMasterGain(
        this.computeDesiredMasterGain(),
        !this.preferences.enabled || this.preferences.muted
      );
    }

    this.emitChange();
  }

  /**
   * Explicitly enables Cosmic Audio from a legitimate user interaction (click / key / tap).
   */
  public async enableFromUserGesture(): Promise<boolean> {
    this.preferences = sanitizeAudioPreferences({
      ...this.preferences,
      enabled: true,
      muted: false,
    });
    this.persistPreferences();

    if (!this.isAuthenticated) {
      this.emitChange();
      return false;
    }

    const ok = await this.contextManager.initializeFromUserGesture();
    const ctx = this.contextManager.getContext();
    const mixBus = this.contextManager.getMixBus();

    if (ok && ctx && mixBus) {
      this.contextManager.attachReverbImpulse(this.performanceManager.getDarkReverbBuffer(ctx));
      this.contextManager.setCinematicAudioBoost(
        this.preferences.cinematicAudioMode,
        this.getActivePreset().reverbSendGain
      );
      this.soundGenerator.ensureContinuousLayersStarted(
        ctx,
        mixBus,
        this.contextManager.getReverbSendBus()
      );
      this.soundGenerator.applyPresetAndLayers(ctx, this.preferences.preset, this.preferences.layers);
      this.contextManager.applyMasterGain(this.computeDesiredMasterGain(), false);
    }

    this.emitChange();
    return ok;
  }

  /**
   * Resumes a previously saved enabled session on first legitimate user gesture in the workstation
   * if the user had enabled audio in a prior session and did not mute it.
   */
  public async resumeSavedSessionFromGesture(): Promise<boolean> {
    if (!this.needsGestureUnlock()) {
      return this.isAudible();
    }
    return this.enableFromUserGesture();
  }

  /**
   * Master Audio ON/OFF switch. Turning OFF immediately silences every layer with a smooth
   * anti-click ramp without destroying the audio engine unnecessarily.
   */
  public async setEnabledFromUserGesture(enabled: boolean): Promise<boolean> {
    if (enabled) {
      return this.enableFromUserGesture();
    }

    this.preferences = sanitizeAudioPreferences({
      ...this.preferences,
      enabled: false,
    });
    this.persistPreferences();
    this.performanceManager.clearPendingCoalesce();
    this.soundGenerator.setAiThinkingActive(this.contextManager.getContext(), false);
    this.soundGenerator.setApproachTension(this.contextManager.getContext(), 0);
    this.contextManager.applyMasterGain(0, true);
    cosmicEngine.audioVisual = { amplitude: 0, bass: 0, mid: 0, high: 0 };
    this.emitChange();
    return true;
  }

  /**
   * Immediate Master Mute control. Silences all layers instantly via smooth gain ramp
   * while preserving the engine and user preferences.
   */
  public async setMutedFromUserGesture(muted: boolean): Promise<void> {
    if (!muted && !this.preferences.enabled) {
      await this.enableFromUserGesture();
      return;
    }

    this.preferences = sanitizeAudioPreferences({
      ...this.preferences,
      muted,
    });
    this.persistPreferences();

    if (muted) {
      this.performanceManager.clearPendingCoalesce();
      this.soundGenerator.setApproachTension(this.contextManager.getContext(), 0);
      this.contextManager.applyMasterGain(0, true);
      cosmicEngine.audioVisual = { amplitude: 0, bass: 0, mid: 0, high: 0 };
    } else if (this.isAuthenticated && this.preferences.enabled) {
      const ok = await this.contextManager.initializeFromUserGesture();
      const ctx = this.contextManager.getContext();
      const mixBus = this.contextManager.getMixBus();
      if (ok && ctx && mixBus) {
        this.contextManager.attachReverbImpulse(this.performanceManager.getDarkReverbBuffer(ctx));
        this.contextManager.setCinematicAudioBoost(
          this.preferences.cinematicAudioMode,
          this.getActivePreset().reverbSendGain
        );
        this.soundGenerator.ensureContinuousLayersStarted(
          ctx,
          mixBus,
          this.contextManager.getReverbSendBus()
        );
        this.soundGenerator.applyPresetAndLayers(
          ctx,
          this.preferences.preset,
          this.preferences.layers
        );
        this.contextManager.applyMasterGain(this.computeDesiredMasterGain(), false);
      }
    }

    this.emitChange();
  }

  public async toggleMuteFromUserGesture(): Promise<void> {
    if (!this.preferences.enabled) {
      await this.enableFromUserGesture();
      return;
    }
    await this.setMutedFromUserGesture(!this.preferences.muted);
  }

  public setMasterVolume(volume: number): void {
    this.preferences = sanitizeAudioPreferences({
      ...this.preferences,
      masterVolume: volume,
    });
    this.persistPreferences();
    this.contextManager.applyMasterGain(
      this.computeDesiredMasterGain(),
      this.preferences.masterVolume === 0
    );
    this.emitChange();
  }

  public setPreset(preset: CosmicAudioPreferences['preset']): void {
    this.preferences = sanitizeAudioPreferences({
      ...this.preferences,
      preset,
    });
    this.persistPreferences();
    this.contextManager.setCinematicAudioBoost(
      this.preferences.cinematicAudioMode,
      this.getActivePreset().reverbSendGain
    );
    this.soundGenerator.applyPresetAndLayers(
      this.contextManager.getContext(),
      this.preferences.preset,
      this.preferences.layers
    );
    this.emitChange();
  }

  public setCinematicAudioMode(enabled: boolean): void {
    this.preferences = sanitizeAudioPreferences({
      ...this.preferences,
      cinematicAudioMode: enabled,
    });
    this.persistPreferences();
    this.contextManager.setCinematicAudioBoost(
      this.preferences.cinematicAudioMode,
      this.getActivePreset().reverbSendGain
    );
    this.emitChange();
  }

  public setLayerEnabled(layer: AudioLayerKey, enabled: boolean): void {
    this.preferences = sanitizeAudioPreferences({
      ...this.preferences,
      layers: {
        ...this.preferences.layers,
        [layer]: enabled,
      },
    });
    this.persistPreferences();
    this.soundGenerator.applyPresetAndLayers(
      this.contextManager.getContext(),
      this.preferences.preset,
      this.preferences.layers
    );
    this.emitChange();
  }

  /**
   * Explicit user-initiated Test Sound button handler.
   */
  public async playTestSoundFromGesture(): Promise<boolean> {
    if (!this.isAuthenticated) return false;

    if (!this.preferences.enabled || this.preferences.muted) {
      await this.enableFromUserGesture();
    } else if (this.contextManager.getState() !== 'running') {
      const ok = await this.contextManager.initializeFromUserGesture();
      const ctx = this.contextManager.getContext();
      const mixBus = this.contextManager.getMixBus();
      if (ok && ctx && mixBus) {
        this.contextManager.attachReverbImpulse(this.performanceManager.getDarkReverbBuffer(ctx));
        this.contextManager.setCinematicAudioBoost(
          this.preferences.cinematicAudioMode,
          this.getActivePreset().reverbSendGain
        );
        this.soundGenerator.ensureContinuousLayersStarted(
          ctx,
          mixBus,
          this.contextManager.getReverbSendBus()
        );
        this.soundGenerator.applyPresetAndLayers(
          ctx,
          this.preferences.preset,
          this.preferences.layers
        );
        this.contextManager.applyMasterGain(this.computeDesiredMasterGain(), false);
      }
    }

    const ctx = this.contextManager.getContext();
    const mixBus = this.contextManager.getMixBus();
    if (!ctx || !mixBus || ctx.state !== 'running') {
      this.emitChange();
      return false;
    }

    this.soundGenerator.playTestSound(ctx, mixBus);
    this.emitChange();
    return true;
  }

  /**
   * Event Handlers — strictly silent when audio is disabled, muted, hidden, or unauthenticated.
   */
  public handleParticleApproach(tension: number): void {
    if (!this.isAudible() || !this.preferences.layers.ingestion) {
      this.soundGenerator.setApproachTension(this.contextManager.getContext(), 0);
      return;
    }
    this.soundGenerator.setApproachTension(this.contextManager.getContext(), tension);
  }

  public handleGravitationalTension(tension: number): void {
    if (!this.isAudible() || !this.preferences.layers.gravitationalPressure) {
      this.soundGenerator.setGravitationalPressure(this.contextManager.getContext(), 0);
      return;
    }
    this.soundGenerator.setGravitationalPressure(this.contextManager.getContext(), tension);
  }

  public handleParticleIngested(event: Pick<ParticleIngestionEvent, 'particleId' | 'energyIntensity'>): boolean {
    if (!this.isAudible() || !this.preferences.layers.ingestion) {
      return false;
    }

    const ctx = this.contextManager.getContext();
    const mixBus = this.contextManager.getMixBus();
    if (!ctx || !mixBus) return false;

    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    return this.performanceManager.scheduleOrCoalesceIngestion(
      event.particleId,
      event.energyIntensity,
      nowMs,
      (batch) => {
        if (!this.isAudible() || !this.preferences.layers.ingestion) return;
        const activeCtx = this.contextManager.getContext();
        const activeBus = this.contextManager.getMixBus();
        if (activeCtx && activeBus) {
          this.soundGenerator.playParticleIngestion(
            activeCtx,
            activeBus,
            batch.intensity,
            batch.count
          );
        }
      }
    );
  }

  public handleCosmicShockwave(signal: Pick<CosmicShockwaveSignal, 'intensity' | 'coalesced'>): boolean {
    if (!this.isAudible() || !this.preferences.layers.shockwave) {
      return false;
    }
    // Coalesced follow-up particles within the 115ms window share the primary shockwave pulse
    if (signal.coalesced) {
      return false;
    }

    const ctx = this.contextManager.getContext();
    const mixBus = this.contextManager.getMixBus();
    if (!ctx || !mixBus) return false;

    this.soundGenerator.playCosmicShockwave(
      ctx,
      mixBus,
      signal.intensity,
      this.contextManager.getReverbSendBus()
    );
    return true;
  }

  /**
   * Synchronizes deduplicated Celestial Devourer events (Star/Planet capture, tidal stretch,
   * disruption, debris stream, accretion, Roche fragmentation, surges) with Web Audio synthesis.
   */
  public handleCelestialEvent(evt: CosmicDevourerEvent): boolean {
    if (!this.isAudible()) {
      return false;
    }

    const isStar =
      evt.type === 'STAR_APPROACH' ||
      evt.type === 'STAR_CAPTURED' ||
      evt.type === 'STAR_TIDAL_STRETCH' ||
      evt.type === 'STAR_TIDAL_DISRUPTION' ||
      evt.type === 'STAR_DISRUPTION' ||
      evt.type === 'STAR_DEBRIS_STREAM' ||
      evt.type === 'STAR_ACCRETION' ||
      evt.type === 'STAR_CONSUMED';
    if (isStar && !this.preferences.layers.starConsumption) {
      return false;
    }

    const isPlanet =
      evt.type === 'PLANET_CAPTURED' ||
      evt.type === 'PLANET_FRAGMENTED' ||
      evt.type === 'PLANET_FRAGMENTATION' ||
      evt.type === 'PLANET_ACCRETION' ||
      evt.type === 'PLANET_CONSUMED';
    if (isPlanet && !this.preferences.layers.planetConsumption) {
      return false;
    }

    if (evt.type === 'ACCRETION_SURGE' && !this.preferences.layers.plasma) {
      return false;
    }

    if (evt.type === 'COSMIC_DRIFT' && !this.preferences.layers.drone) {
      return false;
    }

    if (!this.performanceManager.claimCelestialEventId(evt.eventId)) {
      return false;
    }

    const ctx = this.contextManager.getContext();
    const mixBus = this.contextManager.getMixBus();
    if (!ctx || !mixBus) return false;

    return this.soundGenerator.playCelestialEvent(
      ctx,
      mixBus,
      evt,
      this.contextManager.getReverbSendBus()
    );
  }

  public handleInteractionState(
    next: CosmicInteractionState,
    prev?: CosmicInteractionState
  ): void {
    const ctx = this.contextManager.getContext();

    if (next === 'AI_THINKING') {
      if (this.isAudible() && this.preferences.layers.ui) {
        this.soundGenerator.setAiThinkingActive(ctx, true);
      }
      return;
    }

    if (prev === 'AI_THINKING') {
      this.soundGenerator.setAiThinkingActive(ctx, false);
    }

    if (!this.isAudible() || !this.preferences.layers.ui) {
      return;
    }

    const mixBus = this.contextManager.getMixBus();
    if (!ctx || !mixBus) return;

    if (next === 'MESSAGE_SUBMITTED' || next === 'AI_RESPONSE' || next === 'ERROR') {
      this.soundGenerator.playUiCue(ctx, mixBus, next);
    }
  }

  public async handlePageVisibilityChange(hidden: boolean): Promise<void> {
    if (hidden) {
      this.performanceManager.clearPendingCoalesce();
      this.soundGenerator.setApproachTension(this.contextManager.getContext(), 0);
      this.soundGenerator.setGravitationalPressure(this.contextManager.getContext(), 0);
      await this.contextManager.setPageHidden(true, 0);
      cosmicEngine.audioVisual = { amplitude: 0, bass: 0, mid: 0, high: 0 };
    } else {
      const desired =
        this.isAuthenticated && this.preferences.enabled && !this.preferences.muted
          ? this.preferences.masterVolume
          : 0;
      await this.contextManager.setPageHidden(false, desired);
    }
    this.emitChange();
  }

  /**
   * Samples normalized AnalyserNode metrics, updates dynamic Layer B Gravitational Pressure
   * from active celestial proximity, and writes read-only shader modulation onto cosmicEngine.
   */
  public syncVisualModulation(): AudioVisualModulation {
    if (this.isAudible()) {
      this.handleGravitationalTension(cosmicSimulationManager.gravitationalTension);
    }
    const mod = this.contextManager.sampleVisualModulation(this.isAudible());
    cosmicEngine.audioVisual = mod;
    return mod;
  }

  public readVisualizerBars(): [number, number, number, number, number] {
    return this.contextManager.sampleVisualizerBars(this.isAudible());
  }

  public getSnapshot(): CosmicAudioSnapshot {
    return {
      preferences: this.getPreferences(),
      contextState: this.contextManager.getState(),
      isInitialized: this.contextManager.isInitialized(),
      isAudible: this.isAudible(),
      needsGestureUnlock: this.needsGestureUnlock(),
      isAuthenticated: this.isAuthenticated,
      effectiveMasterGain: this.contextManager.getEffectiveMasterGain(),
      layerGains: this.soundGenerator.getLayerEffectiveGains(),
      activeTransientVoices: this.performanceManager.getActiveTransientCount(),
      totalDisposedVoices: this.performanceManager.totalDisposedVoices,
      totalCoalescedIngestions: this.performanceManager.totalCoalescedIngestions,
      stats: { ...this.soundGenerator.stats },
    };
  }

  public async dispose(): Promise<void> {
    this.performanceManager.resetAll();
    this.soundGenerator.disposeContinuousLayers();
    await this.contextManager.dispose();
    cosmicEngine.audioVisual = { amplitude: 0, bass: 0, mid: 0, high: 0 };
    this.listeners.clear();
  }
}

export const cosmicAudioEngine = new CosmicAudioEngine({
  requireAuthentication: true,
});

if (typeof window !== 'undefined' && !import.meta.env.PROD) {
  (window as unknown as Record<string, unknown>).__DEVMIND_AUDIO__ = {
    getSnapshot: () => cosmicAudioEngine.getSnapshot(),
  };
}
