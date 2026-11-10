import { AudioVisualModulation } from '../engine/cosmicEngine';

export type AudioContextFactory = () => AudioContext;

function resolveDefaultAudioContextConstructor(): (new () => AudioContext) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    AudioContext?: new () => AudioContext;
    webkitAudioContext?: new () => AudioContext;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export function smoothAudioParam(
  param: AudioParam,
  target: number,
  now: number,
  timeConstant = 0.045
): void {
  const safeTarget = Number.isFinite(target) ? target : 0;
  try {
    if (typeof param.cancelScheduledValues === 'function') {
      param.cancelScheduledValues(now);
    }
    if (typeof param.setTargetAtTime === 'function') {
      param.setTargetAtTime(safeTarget, now, Math.max(0.008, timeConstant));
      return;
    }
  } catch {
    // Fallback to direct value assignment if automation API is partially mocked
  }
  param.value = safeTarget;
}

/**
 * Owns the single Web Audio API AudioContext, safety highpass/lowpass filters,
 * brickwall DynamicsCompressor limiter, anti-click Master GainNode, and zero-allocation
 * AnalyserNode readout. Never initializes AudioContext without an explicit user gesture.
 */
export class AudioContextManager {
  private contextFactory: AudioContextFactory | null;
  private ctx: AudioContext | null = null;
  private mixBus: GainNode | null = null;
  private reverbSendBus: GainNode | null = null;
  private reverbConvolver: ConvolverNode | null = null;
  private reverbReturnGain: GainNode | null = null;
  private subsonicFilter: BiquadFilterNode | null = null;
  private harshnessFilter: BiquadFilterNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;

  private freqData: Uint8Array | null = null;
  private waveData: Uint8Array | null = null;

  private smoothedModulation: AudioVisualModulation = {
    amplitude: 0,
    bass: 0,
    mid: 0,
    high: 0,
  };

  private targetMasterGain = 0;
  private cinematicBoostActive = false;
  private pageHidden = false;

  constructor(customFactory?: AudioContextFactory) {
    if (customFactory) {
      this.contextFactory = customFactory;
    } else {
      const Ctor = resolveDefaultAudioContextConstructor();
      this.contextFactory = Ctor ? () => new Ctor() : null;
    }
  }

  public isSupported(): boolean {
    if (this.contextFactory) return true;
    const Ctor = resolveDefaultAudioContextConstructor();
    if (Ctor) {
      this.contextFactory = () => new Ctor();
      return true;
    }
    return false;
  }

  public isInitialized(): boolean {
    return this.ctx !== null && this.ctx.state !== 'closed';
  }

  public getState(): AudioContextState | 'uninitialized' {
    if (!this.ctx) return 'uninitialized';
    return this.ctx.state;
  }

  public getContext(): AudioContext | null {
    return this.ctx;
  }

  public getMixBus(): GainNode | null {
    return this.mixBus;
  }

  public getReverbSendBus(): GainNode | null {
    return this.reverbSendBus ?? this.mixBus;
  }

  public setCinematicAudioBoost(active: boolean, reverbWetLevel = 0.42): void {
    this.cinematicBoostActive = active;
    if (!this.ctx || this.ctx.state === 'closed') return;
    const now = this.ctx.currentTime;
    if (this.mixBus) {
      smoothAudioParam(this.mixBus.gain, active ? 1.84 : 1.58, now, 0.14);
    }
    if (this.reverbReturnGain) {
      const targetWet = Math.min(0.75, reverbWetLevel * (active ? 1.24 : 1.0));
      smoothAudioParam(this.reverbReturnGain.gain, targetWet, now, 0.18);
    }
  }

  public attachReverbImpulse(impulseBuffer: AudioBuffer): void {
    if (this.reverbConvolver && !this.reverbConvolver.buffer) {
      try {
        this.reverbConvolver.buffer = impulseBuffer;
      } catch {
        // Ignore mock buffer assignment edge cases
      }
    }
  }

  public getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  public getEffectiveMasterGain(): number {
    return this.targetMasterGain;
  }

  public isPageHidden(): boolean {
    return this.pageHidden;
  }

  /**
   * Must ONLY be called inside a legitimate user interaction handler (click, keydown, pointerup).
   * Initializes the AudioContext graph once and resumes it if suspended.
   */
  public async initializeFromUserGesture(): Promise<boolean> {
    if (!this.isSupported() || !this.contextFactory) {
      return false;
    }

    if (!this.ctx || this.ctx.state === 'closed') {
      const ctx = this.contextFactory();
      const mixBus = ctx.createGain();
      // v2.4 calibrated pre-limiter presence gain so Void organ drones, Gravitational Pressure & TDE collapses
      // project clearly on both laptop speakers and headphones while strictly protected by the -4dB limiter
      mixBus.gain.value = this.cinematicBoostActive ? 1.84 : 1.58;

      const reverbSendBus = ctx.createGain();
      reverbSendBus.gain.value = 0.72;

      const reverbReturnGain = ctx.createGain();
      reverbReturnGain.gain.value = this.cinematicBoostActive ? 0.52 : 0.42;

      const reverbConvolver =
        typeof ctx.createConvolver === 'function' ? ctx.createConvolver() : null;

      // 28 Hz subsonic highpass prevents speaker-damaging DC / excessive sub-bass rumble
      const subsonicFilter = ctx.createBiquadFilter();
      subsonicFilter.type = 'highpass';
      subsonicFilter.frequency.value = 28;
      subsonicFilter.Q.value = 0.707;

      // 6500 Hz gentle lowpass ceiling prevents harsh high-frequency transients
      const harshnessFilter = ctx.createBiquadFilter();
      harshnessFilter.type = 'lowpass';
      harshnessFilter.frequency.value = 6500;
      harshnessFilter.Q.value = 0.5;

      // Studio soft-knee master compressor/limiter prevents clipping across all presets & star collapses
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -4.0;
      limiter.knee.value = 6;
      limiter.ratio.value = 10;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.16;

      const masterGain = ctx.createGain();
      masterGain.gain.value = 0;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.82;

      mixBus.connect(subsonicFilter);
      if (reverbConvolver) {
        reverbSendBus.connect(reverbConvolver);
        reverbConvolver.connect(reverbReturnGain);
        reverbReturnGain.connect(subsonicFilter);
      } else {
        reverbSendBus.connect(reverbReturnGain);
        reverbReturnGain.connect(subsonicFilter);
      }
      subsonicFilter.connect(harshnessFilter);
      harshnessFilter.connect(limiter);
      limiter.connect(masterGain);
      masterGain.connect(analyser);
      analyser.connect(ctx.destination);

      this.ctx = ctx;
      this.mixBus = mixBus;
      this.reverbSendBus = reverbSendBus;
      this.reverbConvolver = reverbConvolver;
      this.reverbReturnGain = reverbReturnGain;
      this.subsonicFilter = subsonicFilter;
      this.harshnessFilter = harshnessFilter;
      this.limiter = limiter;
      this.masterGain = masterGain;
      this.analyser = analyser;

      this.freqData = new Uint8Array(analyser.frequencyBinCount);
      this.waveData = new Uint8Array(analyser.fftSize);
    }

    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        return false;
      }
    }

    return this.ctx.state === 'running';
  }

  /**
   * Smoothly transitions master output gain without clicks or pops.
   */
  public applyMasterGain(desiredGain: number, immediateMute = false): void {
    const effective = this.pageHidden ? 0 : Math.min(1, Math.max(0, desiredGain));
    this.targetMasterGain = effective;

    if (!this.ctx || !this.masterGain || this.ctx.state === 'closed') {
      return;
    }

    const rampConstant = immediateMute || effective === 0 ? 0.022 : 0.055;
    smoothAudioParam(this.masterGain.gain, effective, this.ctx.currentTime, rampConstant);
  }

  /**
   * Pauses/attenuates audio when the browser tab becomes hidden and safely resumes on return
   * strictly if shouldBeAudible is true.
   */
  public async setPageHidden(hidden: boolean, desiredGainWhenVisible: number): Promise<void> {
    this.pageHidden = hidden;
    if (!this.ctx || this.ctx.state === 'closed') {
      this.targetMasterGain = hidden ? 0 : Math.min(1, Math.max(0, desiredGainWhenVisible));
      return;
    }

    if (hidden) {
      this.applyMasterGain(0, true);
      if (this.ctx.state === 'running') {
        try {
          await this.ctx.suspend();
        } catch {
          // Ignore suspend race conditions
        }
      }
    } else if (desiredGainWhenVisible > 0) {
      if (this.ctx.state === 'suspended') {
        try {
          await this.ctx.resume();
        } catch {
          // Browser policy may keep context suspended until next click
        }
      }
      this.applyMasterGain(desiredGainWhenVisible, false);
    } else {
      this.applyMasterGain(0, true);
    }
  }

  /**
   * Zero-allocation normalized [0..1] spectral & amplitude metrics for subtle 3D visual sync.
   * Immediately decays/zeros when audio is off, muted, or suspended.
   */
  public sampleVisualModulation(isAudible: boolean): AudioVisualModulation {
    if (
      !isAudible ||
      this.pageHidden ||
      !this.ctx ||
      this.ctx.state !== 'running' ||
      !this.analyser ||
      !this.freqData ||
      !this.waveData
    ) {
      this.smoothedModulation.amplitude *= 0.82;
      this.smoothedModulation.bass *= 0.82;
      this.smoothedModulation.mid *= 0.82;
      this.smoothedModulation.high *= 0.82;
      if (this.smoothedModulation.amplitude < 0.002) this.smoothedModulation.amplitude = 0;
      if (this.smoothedModulation.bass < 0.002) this.smoothedModulation.bass = 0;
      if (this.smoothedModulation.mid < 0.002) this.smoothedModulation.mid = 0;
      if (this.smoothedModulation.high < 0.002) this.smoothedModulation.high = 0;
      return { ...this.smoothedModulation };
    }

    this.analyser.getByteFrequencyData(this.freqData);
    this.analyser.getByteTimeDomainData(this.waveData);

    // RMS amplitude from time-domain waveform
    let sumSq = 0;
    for (let i = 0; i < this.waveData.length; i += 1) {
      const centered = (this.waveData[i] - 128) / 128;
      sumSq += centered * centered;
    }
    const rms = Math.min(1, Math.sqrt(sumSq / this.waveData.length) * 2.6);

    const avgRange = (startBin: number, endBin: number): number => {
      const hi = Math.min(this.freqData!.length, endBin);
      const lo = Math.max(0, Math.min(startBin, hi));
      if (hi <= lo) return 0;
      let sum = 0;
      for (let i = lo; i < hi; i += 1) {
        sum += this.freqData![i];
      }
      return Math.min(1, sum / ((hi - lo) * 255));
    };

    const rawBass = avgRange(1, 6);
    const rawMid = avgRange(6, 22);
    const rawHigh = avgRange(22, 64);

    // Gentle exponential smoothing so visual modulation is fluid and never jittery
    this.smoothedModulation.amplitude += (rms - this.smoothedModulation.amplitude) * 0.22;
    this.smoothedModulation.bass += (rawBass - this.smoothedModulation.bass) * 0.2;
    this.smoothedModulation.mid += (rawMid - this.smoothedModulation.mid) * 0.22;
    this.smoothedModulation.high += (rawHigh - this.smoothedModulation.high) * 0.24;

    return { ...this.smoothedModulation };
  }

  /**
   * Compact 5-band normalized spectrum for the top-right glass AudioVisualizer indicator.
   */
  public sampleVisualizerBars(isAudible: boolean): [number, number, number, number, number] {
    if (
      !isAudible ||
      this.pageHidden ||
      !this.ctx ||
      this.ctx.state !== 'running' ||
      !this.analyser ||
      !this.freqData
    ) {
      return [0, 0, 0, 0, 0];
    }

    this.analyser.getByteFrequencyData(this.freqData);
    const bandAvg = (lo: number, hi: number): number => {
      const end = Math.min(this.freqData!.length, hi);
      if (end <= lo) return 0;
      let total = 0;
      for (let i = lo; i < end; i += 1) {
        total += this.freqData![i];
      }
      return Math.min(1, total / ((end - lo) * 230));
    };

    return [
      bandAvg(1, 4),
      bandAvg(4, 9),
      bandAvg(9, 18),
      bandAvg(18, 34),
      bandAvg(34, 60),
    ];
  }

  public async dispose(): Promise<void> {
    this.targetMasterGain = 0;
    const nodes = [
      this.mixBus,
      this.reverbSendBus,
      this.reverbConvolver,
      this.reverbReturnGain,
      this.subsonicFilter,
      this.harshnessFilter,
      this.limiter,
      this.masterGain,
      this.analyser,
    ];
    for (const node of nodes) {
      try {
        node?.disconnect();
      } catch {
        // Ignore already disconnected
      }
    }
    this.mixBus = null;
    this.reverbSendBus = null;
    this.reverbConvolver = null;
    this.reverbReturnGain = null;
    this.subsonicFilter = null;
    this.harshnessFilter = null;
    this.limiter = null;
    this.masterGain = null;
    this.analyser = null;

    if (this.ctx && this.ctx.state !== 'closed') {
      try {
        await this.ctx.close();
      } catch {
        // Ignore close errors
      }
    }
    this.ctx = null;
    this.smoothedModulation = { amplitude: 0, bass: 0, mid: 0, high: 0 };
  }
}
