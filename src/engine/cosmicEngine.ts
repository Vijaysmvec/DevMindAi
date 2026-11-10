export type CosmicInteractionState =
  | 'IDLE'
  | 'CURSOR_ACTIVE'
  | 'TYPING'
  | 'TEXT_DELETION'
  | 'TEXT_UNDO'
  | 'MESSAGE_SUBMITTED'
  | 'AI_THINKING'
  | 'AI_RESPONSE'
  | 'ERROR';

export interface EnergyPulseWave {
  id: number;
  kind: 'heartbeat' | 'submission' | 'ai_response' | 'error' | 'ingestion';
  progress: number; // 0..1
  speed: number;
  maxRadius: number;
  intensity: number;
  colorHex: string;
}

export interface ParticleIngestionEvent {
  particleId: string;
  particleType: 'glyph' | 'accretion_dust' | 'inner_plasma' | 'orbital' | 'cosmic_dust';
  entryPosition: { x: number; y: number };
  entryTime: number;
  energyIntensity: number;
  source: 'backspace' | 'delete' | 'selection' | 'cut' | 'replace' | 'ambient_infall';
  eventSequence: number;
}

export interface FullScreenShockwave {
  id: number;
  originX: number;
  originY: number;
  progress: number; // 0..1 expanding across 100% of viewport diagonal
  speed: number;
  maxViewportRadius: number;
  intensity: number; // Capped <= 1.0 to prevent blinding flashes
  particleCount: number;
  createdAtMs: number;
  source: ParticleIngestionEvent['source'];
}

export interface CosmicShockwaveSignal {
  id: number;
  intensity: number;
  particleCount: number;
  source: ParticleIngestionEvent['source'];
  coalesced: boolean;
  createdAtMs: number;
}

export interface AudioVisualModulation {
  amplitude: number;
  bass: number;
  mid: number;
  high: number;
}

export interface RotationHierarchyConfig {
  innerDisk: number;          // Extremely fast
  innerPlasmaRing: number;    // Very fast
  middleDisk: number;         // Fast
  outerDisk: number;          // Moderately fast
  backgroundParticles: number;// Slow
  distantStarfield: number;   // Extremely slow
}

export interface VisualPreferences {
  mode: 'cinematic' | 'focus';
  background_animation: boolean;
  black_hole_rotation_intensity: number;
  background_pulse_intensity: number;
  gravitational_cursor_strength: number;
  particle_density: number;
  glass_transparency: number;
  dynamic_glass_reflections: boolean;
  text_deletion_animation: boolean;
  undo_reversal_animation: boolean;
  energy_pulses: boolean;
  graphics_quality: 'low' | 'medium' | 'high' | 'ultra' | 'auto';
  reduced_motion: boolean;
}

export const DEFAULT_VISUAL_PREFERENCES: VisualPreferences = {
  mode: 'cinematic',
  background_animation: true,
  black_hole_rotation_intensity: 1.0,
  background_pulse_intensity: 1.0,
  gravitational_cursor_strength: 1.0,
  particle_density: 1.0,
  glass_transparency: 0.08, // Part D.8 optical clear-glass default
  dynamic_glass_reflections: true,
  text_deletion_animation: true,
  undo_reversal_animation: true,
  energy_pulses: true,
  graphics_quality: 'auto',
  reduced_motion: false,
};

export const PARTICLE_SYSTEM_PARAMS = {
  accretionDiskDust: { maxCount: 900, minSize: 0.004, maxSize: 0.010, speedMult: 2.35, stretch: 3.6 },
  innerPlasmaParticles: { maxCount: 420, minSize: 0.0035, maxSize: 0.0085, speedMult: 4.5, stretch: 4.8 },
  orbitalParticles: { maxCount: 520, minSize: 0.0045, maxSize: 0.011, speedMult: 1.75, stretch: 2.8 },
  backgroundCosmicDust: { maxCount: 780, minPointPx: 0.9, maxPointPx: 2.1, driftSpeed: 0.16 },
  gravitationalInteraction: { maxCount: 84, radiusPx: 260, falloff: 0.016, maxPointPx: 1.9 },
  textDeletion: { maxActive: 120, fontSizePx: 11, eventHorizonRadiusPx: 40 },
} as const;

const MAX_INGESTED_ID_MEMORY = 2048;
const SHOCKWAVE_COALESCE_WINDOW_MS = 115;
const MAX_SHOCKWAVE_INTENSITY = 1.0;

/**
 * High-frequency mutable cosmic simulation & ingestion physics engine.
 * Steps inside requestAnimationFrame / useFrame with zero React re-renders.
 */
export class CosmicSimulationEngine {
  public elapsedTime = 0;
  public frameCount = 0;
  public fps = 60;
  private fpsAccum = 0;
  private fpsFrames = 0;
  public isPageHidden = false;
  public isSoftwareRenderer = false;

  public state: CosmicInteractionState = 'IDLE';
  public preferences: VisualPreferences = { ...DEFAULT_VISUAL_PREFERENCES };

  // Part A.1: Near-Extremal Kerr 6-Tier Rotation Hierarchy
  public rotationHierarchy: RotationHierarchyConfig = {
    innerDisk: 5.2,
    innerPlasmaRing: 3.75,
    middleDisk: 2.15,
    outerDisk: 0.95,
    backgroundParticles: 0.18,
    distantStarfield: 0.014,
  };

  // Independent Accumulated Layer Angles
  public innerDiskAngle = 0;
  public innerPlasmaAngle = 0;
  public midDiskAngle = 0;
  public outerDiskAngle = 0;
  public backgroundDustAngle = 0;
  public starfieldAngle = 0;

  // Smoothed Dynamic Multipliers
  public currentRotationSpeed = 1.15;
  public currentPlasmaBrightness = 1.12;
  public currentInnerRingBoost = 1.18;
  public currentOrbitalBoost = 1.15;
  public cyanStatusGlow = 0.0;
  public amberErrorGlow = 0.0;

  // Cosmic Heartbeat & 3D Energy Pulses
  public heartbeatWave = 0.5;
  private nextNaturalPulseAt = 3.2;
  private pulseCounter = 1;
  public activePulses: EnergyPulseWave[] = [];

  // Part B.3 & B.4: Event Horizon Ingestion Registry & Full-Screen Shockwaves
  private ingestionSequence = 0;
  private ingestedIdsSet = new Set<string>();
  private ingestedIdsOrder: string[] = [];
  public recentIngestionEvents: ParticleIngestionEvent[] = [];
  public totalIngestionEvents = 0;

  private shockwaveIdSeq = 1;
  public activeShockwaves: FullScreenShockwave[] = [];
  public totalShockwavesTriggered = 0;
  public shockwaveGlassBoost = 0; // 0..1 reactive highlight for crystal-clear glass
  public shockwaveFrontRadiusPx = 0;

  // v2.2 Cosmic Audio Engine: Read-only subtle visual modulation (0 when audio is off/muted) & event subscribers
  public audioVisual: AudioVisualModulation = {
    amplitude: 0,
    bass: 0,
    mid: 0,
    high: 0,
  };
  public approachingParticleTension = 0;
  private audioShockwaveSeq = 1;
  private lastAudioShockwaveAtMs = -Infinity;
  private lastAudioShockwaveIntensity = 0;
  private lastAudioShockwaveCount = 0;

  private ingestionListeners = new Set<(evt: ParticleIngestionEvent) => void>();
  private shockwaveListeners = new Set<(signal: CosmicShockwaveSignal) => void>();
  private approachListeners = new Set<(tension: number, activeCount: number) => void>();
  private stateListeners = new Set<
    (next: CosmicInteractionState, prev: CosmicInteractionState) => void
  >();

  public onParticleIngested(listener: (evt: ParticleIngestionEvent) => void): () => void {
    this.ingestionListeners.add(listener);
    return () => {
      this.ingestionListeners.delete(listener);
    };
  }

  public onShockwave(listener: (signal: CosmicShockwaveSignal) => void): () => void {
    this.shockwaveListeners.add(listener);
    return () => {
      this.shockwaveListeners.delete(listener);
    };
  }

  public onParticleApproach(
    listener: (tension: number, activeCount: number) => void
  ): () => void {
    this.approachListeners.add(listener);
    return () => {
      this.approachListeners.delete(listener);
    };
  }

  public onStateChange(
    listener: (next: CosmicInteractionState, prev: CosmicInteractionState) => void
  ): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  public notifyStateChange(next: CosmicInteractionState): void {
    const prev = this.state;
    this.state = next;
    for (const listener of this.stateListeners) {
      listener(next, prev);
    }
  }

  public reportParticleApproach(tension: number, activeCount: number): void {
    const clamped = Math.min(1, Math.max(0, tension));
    const delta = Math.abs(clamped - this.approachingParticleTension);
    if (delta < 0.015 && !(clamped === 0 && this.approachingParticleTension > 0)) {
      return;
    }
    this.approachingParticleTension = clamped;
    for (const listener of this.approachListeners) {
      listener(clamped, activeCount);
    }
  }

  // Projected 3D Black-Hole Screen Coordinates (viewport px)
  public blackHoleScreenX = typeof window !== 'undefined' ? window.innerWidth * 0.54 : 760;
  public blackHoleScreenY = typeof window !== 'undefined' ? window.innerHeight * 0.48 : 430;

  // Localized Gravitational Tremor (black hole mesh only)
  public tremorX = 0;
  public tremorY = 0;
  private tremorPhase = 0;

  // Part D.7: Gravitational Cursor State
  public rawCursorX = typeof window !== 'undefined' ? window.innerWidth * 0.5 : 720;
  public rawCursorY = typeof window !== 'undefined' ? window.innerHeight * 0.5 : 450;
  public smoothCursorX = typeof window !== 'undefined' ? window.innerWidth * 0.5 : 720;
  public smoothCursorY = typeof window !== 'undefined' ? window.innerHeight * 0.5 : 450;
  public cursorNDCX = 0;
  public cursorNDCY = 0;
  public cursorWorldX = 0;
  public cursorWorldY = 0;
  public cursorVelocity = 0;
  public cursorInfluence = 0;
  public cursorRadiusPx: number = PARTICLE_SYSTEM_PARAMS.gravitationalInteraction.radiusPx;
  public lastPointerMoveAt = 0;

  // Privacy-safe telemetry (coordinates & counts ONLY — never stores user text)
  public activeIngoingGlyphs = 0;
  public activeUndoGlyphs = 0;
  public totalDeletedGlyphsAnimated = 0;
  public totalUndoGlyphsAnimated = 0;
  public sampleParticlePositions: Array<{
    x: number;
    y: number;
    progress: number;
    layer: 'foreground' | 'subglass';
    direction: 'infall' | 'undo';
  }> = [];
  public cursorDeflectionMagnitude = 0;

  /**
   * Registers an actual trajectory-verified Event Horizon crossing.
   * Deduplicates strictly by particleId and triggers/coalesces a Full-Screen Cosmic Shockwave.
   */
  public registerParticleIngestion(params: {
    particleId: string;
    particleType: ParticleIngestionEvent['particleType'];
    entryPosition: { x: number; y: number };
    energyIntensity: number;
    source: ParticleIngestionEvent['source'];
  }): ParticleIngestionEvent | null {
    if (this.ingestedIdsSet.has(params.particleId)) {
      return null; // Prevent duplicate ingestion events for the same particle
    }

    this.ingestedIdsSet.add(params.particleId);
    this.ingestedIdsOrder.push(params.particleId);
    if (this.ingestedIdsOrder.length > MAX_INGESTED_ID_MEMORY) {
      const oldest = this.ingestedIdsOrder.shift();
      if (oldest) this.ingestedIdsSet.delete(oldest);
    }

    const now = performance.now();
    const evt: ParticleIngestionEvent = {
      particleId: params.particleId,
      particleType: params.particleType,
      entryPosition: {
        x: Math.round(params.entryPosition.x),
        y: Math.round(params.entryPosition.y),
      },
      entryTime: Math.round(now),
      energyIntensity: Math.min(1.0, Math.max(0.08, params.energyIntensity)),
      source: params.source,
      eventSequence: ++this.ingestionSequence,
    };

    this.totalIngestionEvents += 1;
    this.recentIngestionEvents.push(evt);
    if (this.recentIngestionEvents.length > 32) {
      this.recentIngestionEvents.shift();
    }

    for (const listener of this.ingestionListeners) {
      listener(evt);
    }

    this.emitAudioShockwaveSignal(evt, now);
    this.spawnOrAggregateShockwave(evt, now);
    return evt;
  }

  private emitAudioShockwaveSignal(evt: ParticleIngestionEvent, nowMs: number) {
    if (nowMs - this.lastAudioShockwaveAtMs <= SHOCKWAVE_COALESCE_WINDOW_MS) {
      this.lastAudioShockwaveCount += 1;
      this.lastAudioShockwaveIntensity = Math.min(
        MAX_SHOCKWAVE_INTENSITY,
        this.lastAudioShockwaveIntensity + evt.energyIntensity * 0.16
      );
      const coalescedSignal: CosmicShockwaveSignal = {
        id: this.audioShockwaveSeq,
        intensity: this.lastAudioShockwaveIntensity,
        particleCount: this.lastAudioShockwaveCount,
        source: evt.source,
        coalesced: true,
        createdAtMs: nowMs,
      };
      for (const listener of this.shockwaveListeners) {
        listener(coalescedSignal);
      }
      return;
    }

    this.lastAudioShockwaveAtMs = nowMs;
    this.lastAudioShockwaveCount = 1;
    this.lastAudioShockwaveIntensity = Math.min(
      MAX_SHOCKWAVE_INTENSITY,
      0.48 + evt.energyIntensity * 0.34
    );
    const signal: CosmicShockwaveSignal = {
      id: ++this.audioShockwaveSeq,
      intensity: this.lastAudioShockwaveIntensity,
      particleCount: 1,
      source: evt.source,
      coalesced: false,
      createdAtMs: nowMs,
    };
    for (const listener of this.shockwaveListeners) {
      listener(signal);
    }
  }

  private spawnOrAggregateShockwave(evt: ParticleIngestionEvent, nowMs: number) {
    if (this.preferences.reduced_motion || !this.preferences.energy_pulses) return;

    const lastWave = this.activeShockwaves[this.activeShockwaves.length - 1];
    if (
      lastWave &&
      nowMs - lastWave.createdAtMs <= SHOCKWAVE_COALESCE_WINDOW_MS &&
      lastWave.progress < 0.14
    ) {
      // Aggregate simultaneous/rapidly-grouped particles into a controlled shockwave
      lastWave.particleCount += 1;
      lastWave.intensity = Math.min(
        MAX_SHOCKWAVE_INTENSITY,
        lastWave.intensity + evt.energyIntensity * 0.16
      );
      return;
    }

    const vw = typeof window !== 'undefined' ? window.innerWidth : 1440;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 900;
    const maxDiag = Math.hypot(vw, vh) * 0.92;
    const focusDamp = this.preferences.mode === 'focus' ? 0.45 : 1.0;

    this.activeShockwaves.push({
      id: this.shockwaveIdSeq++,
      originX: this.blackHoleScreenX,
      originY: this.blackHoleScreenY,
      progress: 0,
      speed: 0.78, // Crosses entire viewport in ~1.28s
      maxViewportRadius: maxDiag,
      intensity: Math.min(MAX_SHOCKWAVE_INTENSITY, (0.48 + evt.energyIntensity * 0.34) * focusDamp),
      particleCount: 1,
      createdAtMs: nowMs,
      source: evt.source,
    });
    this.totalShockwavesTriggered += 1;

    if (this.activeShockwaves.length > 6) {
      this.activeShockwaves.shift();
    }

    // Companion 3D accretion ring disturbance
    this.triggerPulse('ingestion');
  }

  public triggerPulse(kind: EnergyPulseWave['kind']) {
    if (this.preferences.reduced_motion) return;
    if (!this.preferences.energy_pulses && kind !== 'error') return;
    if (this.preferences.mode === 'focus' && kind === 'heartbeat') return;

    const configs: Record<
      EnergyPulseWave['kind'],
      { speed: number; maxRadius: number; intensity: number; colorHex: string }
    > = {
      heartbeat: {
        speed: 0.24,
        maxRadius: 9.0,
        intensity: 0.34 * this.preferences.background_pulse_intensity,
        colorHex: '#FFB347',
      },
      submission: { speed: 0.68, maxRadius: 13.0, intensity: 0.94, colorHex: '#FFB347' },
      ai_response: { speed: 0.52, maxRadius: 11.5, intensity: 0.72, colorHex: '#56D9FF' },
      error: { speed: 0.56, maxRadius: 9.5, intensity: 0.85, colorHex: '#E88732' },
      ingestion: { speed: 0.82, maxRadius: 11.0, intensity: 0.76, colorHex: '#FFF0D5' },
    };

    const cfg = configs[kind];
    if (cfg.intensity <= 0.01) return;

    this.activePulses.push({
      id: this.pulseCounter++,
      kind,
      progress: 0,
      speed: cfg.speed,
      maxRadius: cfg.maxRadius,
      intensity: cfg.intensity,
      colorHex: cfg.colorHex,
    });

    if (this.activePulses.length > 8) {
      this.activePulses.shift();
    }
  }

  public updatePointer(clientX: number, clientY: number) {
    const dx = clientX - this.rawCursorX;
    const dy = clientY - this.rawCursorY;
    this.cursorVelocity = Math.min(90, Math.hypot(dx, dy));
    this.rawCursorX = clientX;
    this.rawCursorY = clientY;
    this.lastPointerMoveAt = performance.now();
  }

  public step(rawDt: number) {
    if (this.isPageHidden) return;
    const dt = Math.min(rawDt, 0.05);
    this.frameCount += 1;
    this.fpsAccum += dt;
    this.fpsFrames += 1;
    if (this.fpsAccum >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsAccum);
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }

    const prefs = this.preferences;
    const isReduced = prefs.reduced_motion || !prefs.background_animation;
    const focusFactor = prefs.mode === 'focus' ? 0.45 : 1.0;
    const motionScale = isReduced ? 0.0 : 1.0;

    this.elapsedTime += dt * motionScale;

    // Aggressive near-extremal Kerr base velocity & interaction boosts
    let targetRot = 1.15;
    let targetPlasma = 1.14;
    let targetInner = 1.22;
    let targetOrbital = 1.18;
    let targetCyan = 0.0;
    let targetError = 0.0;

    switch (this.state) {
      case 'CURSOR_ACTIVE':
        targetRot = 1.26;
        targetPlasma = 1.20;
        targetOrbital = 1.30;
        break;
      case 'TYPING':
        targetRot = 1.42;
        targetPlasma = 1.34;
        targetInner = 1.48;
        targetOrbital = 1.45;
        break;
      case 'TEXT_DELETION':
        targetRot = 1.68;
        targetPlasma = 1.48;
        targetInner = 1.65;
        targetOrbital = 1.78;
        break;
      case 'TEXT_UNDO':
        targetRot = -0.75;
        targetPlasma = 1.38;
        targetInner = 1.52;
        targetCyan = 0.62;
        break;
      case 'MESSAGE_SUBMITTED':
        targetRot = 2.15;
        targetPlasma = 1.68;
        targetInner = 1.95;
        targetOrbital = 2.15;
        break;
      case 'AI_THINKING':
        targetRot = 2.35;
        targetPlasma = 1.62;
        targetInner = 2.08;
        targetOrbital = 2.35;
        targetCyan = 0.95;
        break;
      case 'AI_RESPONSE':
        targetRot = 1.38;
        targetPlasma = 1.28;
        targetInner = 1.40;
        targetCyan = 0.48;
        break;
      case 'ERROR':
        targetRot = 0.92;
        targetPlasma = 1.22;
        targetInner = 1.05;
        targetError = 0.88;
        break;
      case 'IDLE':
      default:
        targetRot = 1.15;
        targetPlasma = 1.14;
        targetInner = 1.22;
        targetOrbital = 1.18;
        break;
    }

    // Subtle organic non-chaotic rotational breath
    const organicBreath = 1.0 + 0.045 * Math.sin(this.elapsedTime * 0.85);
    targetRot *=
      prefs.black_hole_rotation_intensity *
      organicBreath *
      motionScale *
      (prefs.mode === 'focus' ? 0.68 : 1.0);

    const smooth = 1.0 - Math.exp(-4.2 * dt);
    this.currentRotationSpeed += (targetRot - this.currentRotationSpeed) * smooth;
    this.currentPlasmaBrightness += (targetPlasma - this.currentPlasmaBrightness) * smooth;
    this.currentInnerRingBoost += (targetInner - this.currentInnerRingBoost) * smooth;
    this.currentOrbitalBoost += (targetOrbital - this.currentOrbitalBoost) * smooth;
    this.cyanStatusGlow += (targetCyan - this.cyanStatusGlow) * smooth;
    this.amberErrorGlow += (targetError - this.amberErrorGlow) * smooth;

    // Advance all 6 independent rotational hierarchy layers
    const h = this.rotationHierarchy;
    this.innerDiskAngle += this.currentRotationSpeed * h.innerDisk * dt;
    this.innerPlasmaAngle += this.currentRotationSpeed * h.innerPlasmaRing * dt;
    this.midDiskAngle += this.currentRotationSpeed * h.middleDisk * dt;
    this.outerDiskAngle += this.currentRotationSpeed * h.outerDisk * dt;
    this.backgroundDustAngle += this.currentRotationSpeed * h.backgroundParticles * dt;
    this.starfieldAngle += (isReduced ? 0 : 1) * h.distantStarfield * dt;

    // Cosmic Heartbeat
    if (!isReduced) {
      const w1 = Math.sin((this.elapsedTime * Math.PI * 2) / 7.3) * 0.5 + 0.5;
      const w2 = Math.sin((this.elapsedTime * Math.PI * 2) / 12.1 + 1.3) * 0.5 + 0.5;
      const w3 = Math.sin((this.elapsedTime * Math.PI * 2) / 18.7 + 2.7) * 0.5 + 0.5;
      const rawBeat = w1 * 0.45 + w2 * 0.35 + w3 * 0.2;
      this.heartbeatWave =
        0.5 + (rawBeat - 0.5) * Math.min(1.8, prefs.background_pulse_intensity) * focusFactor;

      if (this.elapsedTime >= this.nextNaturalPulseAt) {
        this.triggerPulse('heartbeat');
        this.nextNaturalPulseAt = this.elapsedTime + 5.6 + Math.sin(this.elapsedTime) * 1.4;
      }
    } else {
      this.heartbeatWave = 0.5;
    }

    // Advance 3D pulses
    for (let i = this.activePulses.length - 1; i >= 0; i--) {
      const p = this.activePulses[i];
      p.progress += dt * p.speed;
      if (p.progress >= 1.0) {
        this.activePulses.splice(i, 1);
      }
    }

    // Advance Full-Screen Shockwaves & compute glass reflection illumination
    let maxGlassWave = 0;
    let leadRadius = 0;
    for (let i = this.activeShockwaves.length - 1; i >= 0; i--) {
      const sw = this.activeShockwaves[i];
      sw.originX = this.blackHoleScreenX;
      sw.originY = this.blackHoleScreenY;
      sw.progress += dt * sw.speed;
      if (sw.progress >= 1.0) {
        this.activeShockwaves.splice(i, 1);
        continue;
      }
      const env = Math.sin(sw.progress * Math.PI) * (1.0 - sw.progress * 0.45) * sw.intensity;
      if (env > maxGlassWave) {
        maxGlassWave = env;
        leadRadius = sw.progress * sw.maxViewportRadius;
      }
    }
    this.shockwaveGlassBoost = Number(maxGlassWave.toFixed(4));
    this.shockwaveFrontRadiusPx = Math.round(leadRadius);

    // Gravitational Cursor interpolation
    const cursorSmooth = 1.0 - Math.exp(-11.5 * dt);
    this.smoothCursorX += (this.rawCursorX - this.smoothCursorX) * cursorSmooth;
    this.smoothCursorY += (this.rawCursorY - this.smoothCursorY) * cursorSmooth;

    const vw = typeof window !== 'undefined' ? Math.max(1, window.innerWidth) : 1440;
    const vh = typeof window !== 'undefined' ? Math.max(1, window.innerHeight) : 900;
    this.cursorNDCX = (this.smoothCursorX / vw) * 2 - 1;
    this.cursorNDCY = -(this.smoothCursorY / vh) * 2 + 1;
    this.cursorWorldX = this.cursorNDCX * 5.6;
    this.cursorWorldY = this.cursorNDCY * 3.4;

    const ageMs = performance.now() - this.lastPointerMoveAt;
    const activeTarget =
      !isReduced && prefs.gravitational_cursor_strength > 0 && ageMs < 2500
        ? Math.min(1.6, prefs.gravitational_cursor_strength) * (prefs.mode === 'focus' ? 0.55 : 1.0)
        : 0.0;
    this.cursorInfluence += (activeTarget - this.cursorInfluence) * (1.0 - Math.exp(-5.5 * dt));
    this.cursorVelocity *= Math.exp(-6.0 * dt);

    // Subtle secondary black-hole reaction to cursor proximity
    const distToBhPx = Math.hypot(
      this.smoothCursorX - this.blackHoleScreenX,
      this.smoothCursorY - this.blackHoleScreenY
    );
    if (distToBhPx < 280 && this.cursorInfluence > 0.1) {
      this.currentInnerRingBoost += 0.08 * (1 - distToBhPx / 280) * this.cursorInfluence * dt * 8;
    }

    if (!isReduced && prefs.mode === 'cinematic') {
      this.tremorPhase += dt;
      const envelope = Math.pow(Math.max(0, Math.sin(this.tremorPhase * 0.42)), 14);
      this.tremorX = Math.sin(this.tremorPhase * 29.0) * 0.011 * envelope;
      this.tremorY = Math.cos(this.tremorPhase * 23.0) * 0.008 * envelope;
    } else {
      this.tremorX = 0;
      this.tremorY = 0;
    }
  }

  public getEffectiveParticleScale(): number {
    if (this.preferences.reduced_motion || !this.preferences.background_animation) return 0.14;
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const qualityMap: Record<VisualPreferences['graphics_quality'], number> = {
      low: 0.30,
      medium: 0.60,
      high: 1.0,
      ultra: 1.35,
      auto: this.isSoftwareRenderer || this.fps < 36 ? 0.48 : isMobile ? 0.45 : 1.0,
    };
    const focusMult = this.preferences.mode === 'focus' ? 0.35 : 1.0;
    return Math.max(
      0.1,
      this.preferences.particle_density * qualityMap[this.preferences.graphics_quality] * focusMult
    );
  }

  public getShaderQualityLevel(): number {
    if (this.preferences.reduced_motion) return 0.35;
    const q = this.preferences.graphics_quality;
    if (q === 'low') return 0.35;
    if (q === 'medium') return 0.65;
    if (q === 'auto' && (this.isSoftwareRenderer || this.fps < 36)) return 0.5;
    return 1.0;
  }
}

export const cosmicEngine = new CosmicSimulationEngine();

// Privacy-safe read-only telemetry accessor for automated verification (disabled in production unless explicitly enabled)
if (typeof window !== 'undefined' && !import.meta.env.PROD) {
  (window as unknown as Record<string, unknown>).__DEVMIND_COSMIC__ = {
    getSnapshot: () => ({
      elapsedTime: cosmicEngine.elapsedTime,
      frameCount: cosmicEngine.frameCount,
      fps: cosmicEngine.fps,
      isPageHidden: cosmicEngine.isPageHidden,
      state: cosmicEngine.state,
      rotationHierarchy: { ...cosmicEngine.rotationHierarchy },
      particleSystems: PARTICLE_SYSTEM_PARAMS,
      shaderQualityLevel: cosmicEngine.getShaderQualityLevel(),
      innerDiskAngle: cosmicEngine.innerDiskAngle,
      innerPlasmaAngle: cosmicEngine.innerPlasmaAngle,
      midDiskAngle: cosmicEngine.midDiskAngle,
      outerDiskAngle: cosmicEngine.outerDiskAngle,
      backgroundDustAngle: cosmicEngine.backgroundDustAngle,
      starfieldAngle: cosmicEngine.starfieldAngle,
      currentRotationSpeed: cosmicEngine.currentRotationSpeed,
      heartbeatWave: cosmicEngine.heartbeatWave,
      activePulseCount: cosmicEngine.activePulses.length,
      activePulses: cosmicEngine.activePulses.map((p) => ({ kind: p.kind, progress: p.progress })),
      totalIngestionEvents: cosmicEngine.totalIngestionEvents,
      recentIngestionEvents: cosmicEngine.recentIngestionEvents.slice(-8),
      activeShockwaveCount: cosmicEngine.activeShockwaves.length,
      activeShockwaves: cosmicEngine.activeShockwaves.map((sw) => ({
        id: sw.id,
        progress: Number(sw.progress.toFixed(3)),
        radiusPx: Math.round(sw.progress * sw.maxViewportRadius),
        maxViewportRadius: Math.round(sw.maxViewportRadius),
        intensity: Number(sw.intensity.toFixed(3)),
        particleCount: sw.particleCount,
        source: sw.source,
      })),
      totalShockwavesTriggered: cosmicEngine.totalShockwavesTriggered,
      shockwaveGlassBoost: cosmicEngine.shockwaveGlassBoost,
      shockwaveFrontRadiusPx: cosmicEngine.shockwaveFrontRadiusPx,
      cursorInfluence: cosmicEngine.cursorInfluence,
      cursorDeflectionMagnitude: cosmicEngine.cursorDeflectionMagnitude,
      smoothCursorX: cosmicEngine.smoothCursorX,
      smoothCursorY: cosmicEngine.smoothCursorY,
      blackHoleScreenX: cosmicEngine.blackHoleScreenX,
      blackHoleScreenY: cosmicEngine.blackHoleScreenY,
      activeIngoingGlyphs: cosmicEngine.activeIngoingGlyphs,
      activeUndoGlyphs: cosmicEngine.activeUndoGlyphs,
      totalDeletedGlyphsAnimated: cosmicEngine.totalDeletedGlyphsAnimated,
      totalUndoGlyphsAnimated: cosmicEngine.totalUndoGlyphsAnimated,
      sampleParticlePositions: cosmicEngine.sampleParticlePositions,
    }),
  };
}
