export type TransientCategory = 'ingestion' | 'shockwave' | 'celestial' | 'ui';

interface ActiveVoiceHandle {
  id: number;
  category: TransientCategory;
  dispose: () => void;
  timer: ReturnType<typeof setTimeout> | null;
}

export interface CoalescedIngestionBatch {
  intensity: number;
  count: number;
  immediate: boolean;
}

const MAX_PARTICLE_ID_HISTORY = 2048;
const INGESTION_COALESCE_WINDOW_MS = 85;

const VOICE_LIMITS: Record<TransientCategory, number> = {
  ingestion: 5,
  shockwave: 3,
  celestial: 4,
  ui: 3,
};

/**
 * Manages procedural noise buffer caching, exact-once particleId deduplication,
 * rapid ingestion event coalescing, active transient polyphony caps, and deterministic
 * AudioNode disconnection/disposal so audio never leaks memory or degrades FPS.
 */
export class AudioPerformanceManager {
  private brownNoiseBuffer: AudioBuffer | null = null;
  private pinkNoiseBuffer: AudioBuffer | null = null;
  private crackleBuffer: AudioBuffer | null = null;
  private horizonTickBuffer: AudioBuffer | null = null;
  private darkReverbBuffer: AudioBuffer | null = null;
  private cachedSampleRate = 0;

  private playedParticleSet = new Set<string>();
  private playedParticleQueue: string[] = [];

  private playedCelestialEventSet = new Set<string>();
  private playedCelestialEventQueue: string[] = [];

  private lastIngestionPlayAtMs = -Infinity;
  private coalescedCount = 0;
  private coalescedEnergy = 0;
  private coalesceFlushTimer: ReturnType<typeof setTimeout> | null = null;

  private voiceSeq = 1;
  private activeVoices = new Map<number, ActiveVoiceHandle>();
  public totalDisposedVoices = 0;
  public totalCoalescedIngestions = 0;

  /**
   * Returns true if particleId has NOT yet triggered audio, recording it in the bounded FIFO set.
   * Returns false if this particleId was already processed.
   */
  public claimParticleId(particleId: string): boolean {
    if (!particleId || this.playedParticleSet.has(particleId)) {
      return false;
    }
    this.playedParticleSet.add(particleId);
    this.playedParticleQueue.push(particleId);
    if (this.playedParticleQueue.length > MAX_PARTICLE_ID_HISTORY) {
      const oldest = this.playedParticleQueue.shift();
      if (oldest) {
        this.playedParticleSet.delete(oldest);
      }
    }
    return true;
  }

  /**
   * Deduplicates celestial devourer audio events strictly by unique eventId (e.g. "star-1:STAR_CONSUMED").
   */
  public claimCelestialEventId(eventId: string): boolean {
    if (!eventId || this.playedCelestialEventSet.has(eventId)) {
      return false;
    }
    this.playedCelestialEventSet.add(eventId);
    this.playedCelestialEventQueue.push(eventId);
    if (this.playedCelestialEventQueue.length > MAX_PARTICLE_ID_HISTORY) {
      const oldest = this.playedCelestialEventQueue.shift();
      if (oldest) {
        this.playedCelestialEventSet.delete(oldest);
      }
    }
    return true;
  }

  /**
   * Coalesces rapid bursts of distinct particle ingestions within an 85ms window.
   * Plays the leading particle immediately and aggregates trailing burst particles into
   * a single controlled follow-up pulse so rapid multi-character deletions stay musical.
   */
  public scheduleOrCoalesceIngestion(
    particleId: string,
    energyIntensity: number,
    nowMs: number,
    onTriggerBatch: (batch: CoalescedIngestionBatch) => void
  ): boolean {
    if (!this.claimParticleId(particleId)) {
      return false;
    }

    const clampedEnergy = Math.min(1, Math.max(0.1, energyIntensity));
    const elapsed = nowMs - this.lastIngestionPlayAtMs;

    if (elapsed > INGESTION_COALESCE_WINDOW_MS) {
      this.lastIngestionPlayAtMs = nowMs;
      onTriggerBatch({
        intensity: clampedEnergy,
        count: 1,
        immediate: true,
      });
      return true;
    }

    // Within rapid burst window: aggregate rather than spawning unbounded overlapping sweeps
    this.totalCoalescedIngestions += 1;
    this.coalescedCount += 1;
    this.coalescedEnergy = Math.min(1.0, Math.max(this.coalescedEnergy, clampedEnergy) + 0.08);

    if (!this.coalesceFlushTimer) {
      const remainingMs = Math.max(18, INGESTION_COALESCE_WINDOW_MS - Math.max(0, elapsed));
      this.coalesceFlushTimer = setTimeout(() => {
        this.coalesceFlushTimer = null;
        const count = this.coalescedCount;
        const intensity = this.coalescedEnergy;
        this.coalescedCount = 0;
        this.coalescedEnergy = 0;
        if (count > 0) {
          this.lastIngestionPlayAtMs =
            typeof performance !== 'undefined' ? performance.now() : Date.now();
          onTriggerBatch({
            intensity,
            count,
            immediate: false,
          });
        }
      }, remainingMs);
    }

    return true;
  }

  /**
   * Registers a transient Web Audio voice, enforcing per-category polyphony caps and
   * guaranteeing node disconnection when the sound completes.
   */
  public registerTransientVoice(
    category: TransientCategory,
    nodesToDisconnect: Array<{ disconnect?: () => void }>,
    durationMs: number,
    extraCleanup?: () => void
  ): () => void {
    // Enforce polyphony budget by releasing the oldest voice in this category if at limit
    const limit = VOICE_LIMITS[category];
    let categoryCount = 0;
    let oldestId: number | null = null;
    for (const [id, handle] of this.activeVoices.entries()) {
      if (handle.category === category) {
        categoryCount += 1;
        if (oldestId === null || id < oldestId) {
          oldestId = id;
        }
      }
    }
    if (categoryCount >= limit && oldestId !== null) {
      this.releaseVoice(oldestId);
    }

    const id = this.voiceSeq++;
    let disposed = false;

    const dispose = () => {
      if (disposed) return;
      disposed = true;
      const existing = this.activeVoices.get(id);
      if (existing?.timer) {
        clearTimeout(existing.timer);
      }
      this.activeVoices.delete(id);
      this.totalDisposedVoices += 1;

      for (const node of nodesToDisconnect) {
        try {
          node.disconnect?.();
        } catch {
          // Ignore already-disconnected nodes
        }
      }
      try {
        extraCleanup?.();
      } catch {
        // Ignore cleanup errors
      }
    };

    const timer = setTimeout(dispose, Math.max(40, Math.ceil(durationMs) + 60));
    this.activeVoices.set(id, { id, category, dispose, timer });
    return dispose;
  }

  private releaseVoice(id: number): void {
    const handle = this.activeVoices.get(id);
    if (handle) {
      handle.dispose();
    }
  }

  public getActiveTransientCount(category?: TransientCategory): number {
    if (!category) return this.activeVoices.size;
    let count = 0;
    for (const v of this.activeVoices.values()) {
      if (v.category === category) count += 1;
    }
    return count;
  }

  public getBrownNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
    if (this.brownNoiseBuffer && this.cachedSampleRate === ctx.sampleRate) {
      return this.brownNoiseBuffer;
    }
    this.cachedSampleRate = ctx.sampleRate;
    const length = Math.floor(ctx.sampleRate * 3.0);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // Deterministic seeded PRNG so procedural buffers are consistent and smooth
    let seed = 0x51a971;
    const nextRand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };

    let lastOut = 0;
    for (let i = 0; i < length; i += 1) {
      const white = nextRand() * 2 - 1;
      lastOut = (lastOut + 0.022 * white) / 1.022;
      // Seamless loop envelope crossfade near boundaries
      const edgeFade =
        i < 1024 ? i / 1024 : i > length - 1024 ? (length - i) / 1024 : 1.0;
      data[i] = lastOut * 2.8 * edgeFade;
    }
    this.brownNoiseBuffer = buffer;
    return buffer;
  }

  public getPinkTurbulenceBuffer(ctx: BaseAudioContext): AudioBuffer {
    if (this.pinkNoiseBuffer && this.cachedSampleRate === ctx.sampleRate) {
      return this.pinkNoiseBuffer;
    }
    this.cachedSampleRate = ctx.sampleRate;
    const length = Math.floor(ctx.sampleRate * 3.5);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    let seed = 0x9e3779b9;
    const nextRand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };

    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < length; i += 1) {
      const white = nextRand() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      const pink = (b0 + b1 + b2 + white * 0.1848) * 0.16;
      const edgeFade =
        i < 1024 ? i / 1024 : i > length - 1024 ? (length - i) / 1024 : 1.0;
      data[i] = Math.max(-0.95, Math.min(0.95, pink * edgeFade));
    }
    this.pinkNoiseBuffer = buffer;
    return buffer;
  }

  public getCrackleBuffer(ctx: BaseAudioContext): AudioBuffer {
    if (this.crackleBuffer && this.cachedSampleRate === ctx.sampleRate) {
      return this.crackleBuffer;
    }
    this.cachedSampleRate = ctx.sampleRate;
    const length = Math.floor(ctx.sampleRate * 4.0);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    let seed = 0x27d4eb2d;
    const nextRand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };

    let env = 0;
    for (let i = 0; i < length; i += 1) {
      // Sparse soft plasma micro-impulses with gentle exponential tail (never harsh clicks)
      if (nextRand() < 0.0016) {
        env = 0.25 + nextRand() * 0.55;
      }
      env *= 0.965;
      const carrier = (nextRand() * 2 - 1) * env;
      data[i] = carrier * 0.55;
    }
    this.crackleBuffer = buffer;
    return buffer;
  }

  /**
   * Sparse metallic relativistic horizon ticking loop (original rhythmic tension pulse —
   * placed every ~1.25s with subtle damped metallic ring, zero clicks).
   */
  public getHorizonTickBuffer(ctx: BaseAudioContext): AudioBuffer {
    if (this.horizonTickBuffer && this.cachedSampleRate === ctx.sampleRate) {
      return this.horizonTickBuffer;
    }
    this.cachedSampleRate = ctx.sampleRate;
    const durationSec = 5.0;
    const length = Math.floor(ctx.sampleRate * durationSec);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // 4 evenly spaced subtle metallic ticks across 5.0s (every 1.25s)
    const tickSpacing = Math.floor(ctx.sampleRate * 1.25);
    for (let t = 0; t < 4; t += 1) {
      const startIdx = t * tickSpacing + Math.floor(ctx.sampleRate * 0.12);
      const tickSamples = Math.min(length - startIdx, Math.floor(ctx.sampleRate * 0.18));
      const baseFreq = t % 2 === 0 ? 1318.5 : 987.77;
      for (let j = 0; j < tickSamples; j += 1) {
        const sec = j / ctx.sampleRate;
        const attack = Math.min(1, j / 48);
        const decay = Math.exp(-sec * 26.0);
        const metallic =
          Math.sin(2 * Math.PI * baseFreq * sec) * 0.65 +
          Math.sin(2 * Math.PI * (baseFreq * 1.414) * sec) * 0.35;
        data[startIdx + j] = metallic * attack * decay * 0.42;
      }
    }

    this.horizonTickBuffer = buffer;
    return buffer;
  }

  /**
   * Procedural 2.2s dark cosmic void reverberation impulse response (cached once per AudioContext).
   */
  public getDarkReverbBuffer(ctx: BaseAudioContext): AudioBuffer {
    if (this.darkReverbBuffer && this.cachedSampleRate === ctx.sampleRate) {
      return this.darkReverbBuffer;
    }
    this.cachedSampleRate = ctx.sampleRate;
    const durationSec = 2.2;
    const length = Math.floor(ctx.sampleRate * durationSec);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    let seed = 0x7f4a7c15;
    const nextRand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };

    let lp = 0;
    for (let i = 0; i < length; i += 1) {
      const t = i / length;
      const preDelayEnv = Math.min(1, i / Math.max(1, ctx.sampleRate * 0.025));
      const decay = Math.pow(1 - t, 2.85);
      const white = nextRand() * 2 - 1;
      // Dark low-passed tail so reverberation feels vast and cavernous without high-frequency hiss
      lp = lp * 0.86 + white * 0.14;
      data[i] = lp * preDelayEnv * decay * 0.55;
    }

    this.darkReverbBuffer = buffer;
    return buffer;
  }

  public clearPendingCoalesce(): void {
    if (this.coalesceFlushTimer) {
      clearTimeout(this.coalesceFlushTimer);
      this.coalesceFlushTimer = null;
    }
    this.coalescedCount = 0;
    this.coalescedEnergy = 0;
  }

  public disposeAllTransients(): void {
    this.clearPendingCoalesce();
    for (const handle of Array.from(this.activeVoices.values())) {
      handle.dispose();
    }
    this.activeVoices.clear();
  }

  public resetAll(): void {
    this.disposeAllTransients();
    this.playedParticleSet.clear();
    this.playedParticleQueue = [];
    this.playedCelestialEventSet.clear();
    this.playedCelestialEventQueue = [];
    this.brownNoiseBuffer = null;
    this.pinkNoiseBuffer = null;
    this.crackleBuffer = null;
    this.horizonTickBuffer = null;
    this.darkReverbBuffer = null;
    this.lastIngestionPlayAtMs = -Infinity;
  }
}
