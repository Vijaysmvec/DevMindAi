import { CosmicDevourerEvent } from '../engine/CosmicSimulationManager';
import { smoothAudioParam } from './AudioContextManager';
import { AudioPerformanceManager } from './AudioPerformanceManager';
import { AUDIO_PRESETS, AudioPresetProfile } from './AudioPresets';
import { AudioLayerSettings, AudioPresetId, DEFAULT_AUDIO_LAYERS } from './AudioSettings';

interface DroneGraph {
  layerGain: GainNode;
  reverbSend: GainNode | null;
  subOsc: OscillatorNode;
  fifthOsc: OscillatorNode;
  octaveOsc: OscillatorNode;
  warmTwelfthOsc: OscillatorNode;
  dissonantOsc: OscillatorNode;
  octaveGain: GainNode;
  warmTwelfthGain: GainNode;
  dissonantGain: GainNode;
  lfoOsc: OscillatorNode;
  lfoPitchGain: GainNode;
  lfoFilterGain: GainNode;
  lowpass: BiquadFilterNode;
  noiseSource: AudioBufferSourceNode;
  noiseGain: GainNode;
  metallicFilter: BiquadFilterNode;
  metallicGain: GainNode;
}

interface PressureGraph {
  layerGain: GainNode;
  reverbSend: GainNode | null;
  pulseCarrier: OscillatorNode;
  pulseFilter: BiquadFilterNode;
  pulseLfo: OscillatorNode;
  pulseLfoGain: GainNode;
  choirNoise: AudioBufferSourceNode;
  choirCarrier: OscillatorNode;
  choirCarrierGain: GainNode;
  formantA: BiquadFilterNode;
  formantB: BiquadFilterNode;
  choirGain: GainNode;
  tickSource: AudioBufferSourceNode;
  tickFilter: BiquadFilterNode;
  tickGain: GainNode;
}

interface PlasmaGraph {
  layerGain: GainNode;
  reverbSend: GainNode | null;
  turbulenceSource: AudioBufferSourceNode;
  turbulenceFilter: BiquadFilterNode;
  modLfo: OscillatorNode;
  modLfoGain: GainNode;
  crackleSource: AudioBufferSourceNode;
  crackleFilter: BiquadFilterNode;
  crackleGain: GainNode;
  harmonicOsc: OscillatorNode;
  harmonicGain: GainNode;
  stereoPanner: StereoPannerNode | null;
  panLfo: OscillatorNode;
  panLfoGain: GainNode;
}

interface ApproachGraph {
  gain: GainNode;
  osc: OscillatorNode;
  filter: BiquadFilterNode;
}

interface ThinkingGraph {
  gain: GainNode;
  oscA: OscillatorNode;
  oscB: OscillatorNode;
  filter: BiquadFilterNode;
  lfo: OscillatorNode;
  lfoGain: GainNode;
}

function scheduleEnvelopePoint(
  param: AudioParam,
  value: number,
  atTime: number,
  exponential = false
): void {
  try {
    if (exponential && typeof param.exponentialRampToValueAtTime === 'function') {
      param.exponentialRampToValueAtTime(Math.max(0.0001, value), atTime);
      return;
    }
    if (typeof param.linearRampToValueAtTime === 'function') {
      param.linearRampToValueAtTime(value, atTime);
      return;
    }
  } catch {
    // Fallback for minimal mock implementations
  }
  param.value = value;
}

function setParamAtTime(param: AudioParam, value: number, atTime: number): void {
  try {
    if (typeof param.setValueAtTime === 'function') {
      param.setValueAtTime(value, atTime);
      return;
    }
  } catch {
    // Fallback
  }
  param.value = value;
}

/**
 * Procedural Web Audio synthesizer implementing the Four Cosmic Sound Layers
 * (Event Horizon Drone, Accretion Plasma, Gravitational Ingestion, Singularity Shockwave)
 * plus restrained UI/AI state textures with zero external audio assets.
 */
export class CosmicSoundGenerator {
  private perf: AudioPerformanceManager;
  private droneGraph: DroneGraph | null = null;
  private pressureGraph: PressureGraph | null = null;
  private plasmaGraph: PlasmaGraph | null = null;
  private approachGraph: ApproachGraph | null = null;
  private thinkingGraph: ThinkingGraph | null = null;

  private activePreset: AudioPresetProfile = AUDIO_PRESETS.SINGULARITY;
  private activeLayers: AudioLayerSettings = { ...DEFAULT_AUDIO_LAYERS };
  private isThinkingActive = false;
  private currentApproachTension = 0;
  private currentCelestialPressure = 0;

  // Diagnostic counters for automated unit & E2E verification
  public stats = {
    ingestionSoundsPlayed: 0,
    shockwaveSoundsPlayed: 0,
    starSoundsPlayed: 0,
    planetSoundsPlayed: 0,
    uiSoundsPlayed: 0,
    testSoundsPlayed: 0,
  };

  constructor(perf: AudioPerformanceManager) {
    this.perf = perf;
  }

  public getActivePresetProfile(): AudioPresetProfile {
    return this.activePreset;
  }

  public getLayerEffectiveGains(): {
    drone: number;
    gravitationalPressure: number;
    plasma: number;
    thinking: number;
    approach: number;
  } {
    const pressureMod = 0.58 + this.currentCelestialPressure * 0.62;
    return {
      drone: this.activeLayers.drone ? this.activePreset.droneGain : 0,
      gravitationalPressure: this.activeLayers.gravitationalPressure
        ? Math.min(0.95, this.activePreset.pressureGain * pressureMod)
        : 0,
      plasma: this.activeLayers.plasma ? this.activePreset.plasmaGain : 0,
      thinking:
        this.activeLayers.ui && this.isThinkingActive ? this.activePreset.thinkingPadGain : 0,
      approach: this.activeLayers.ingestion
        ? this.activePreset.approachMaxGain * this.currentApproachTension
        : 0,
    };
  }

  /**
   * Builds the reusable continuous ambient audio graphs once per AudioContext.
   */
  public ensureContinuousLayersStarted(
    ctx: AudioContext,
    destination: AudioNode,
    reverbDestination?: AudioNode | null
  ): void {
    if (!this.droneGraph) {
      this.droneGraph = this.buildDroneGraph(ctx, destination, reverbDestination);
    }
    if (!this.pressureGraph) {
      this.pressureGraph = this.buildPressureGraph(ctx, destination, reverbDestination);
    }
    if (!this.plasmaGraph) {
      this.plasmaGraph = this.buildPlasmaGraph(ctx, destination, reverbDestination);
    }
    if (!this.approachGraph) {
      this.approachGraph = this.buildApproachGraph(ctx, destination);
    }
    if (!this.thinkingGraph) {
      this.thinkingGraph = this.buildThinkingGraph(ctx, destination);
    }
    this.applyPresetAndLayers(ctx, this.activePreset.id, this.activeLayers);
  }

  private buildDroneGraph(
    ctx: AudioContext,
    destination: AudioNode,
    reverbDestination?: AudioNode | null
  ): DroneGraph {
    const p = this.activePreset;
    const layerGain = ctx.createGain();
    layerGain.gain.value = 0;

    const reverbSend = reverbDestination ? ctx.createGain() : null;
    if (reverbSend && reverbDestination) {
      reverbSend.gain.value = p.reverbSendGain * 0.45;
    }

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = p.droneFilterCutoffHz;
    lowpass.Q.value = p.droneFilterQ;

    const subOsc = ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.value = p.droneFundamentalHz;

    const fifthOsc = ctx.createOscillator();
    fifthOsc.type = 'triangle';
    fifthOsc.frequency.value = p.droneFundamentalHz * p.droneHarmonicRatio;

    const octaveOsc = ctx.createOscillator();
    octaveOsc.type = 'sine';
    octaveOsc.frequency.value = p.droneFundamentalHz * 2.003;

    const octaveGain = ctx.createGain();
    octaveGain.gain.value = p.droneSubOctaveMix;

    // Warm upper-bass organ twelfth harmonic (~110-147 Hz) so laptop & desktop speakers project deep gravity
    const warmTwelfthOsc = ctx.createOscillator();
    warmTwelfthOsc.type = 'triangle';
    warmTwelfthOsc.frequency.value = p.droneFundamentalHz * 3.002;

    const warmTwelfthGain = ctx.createGain();
    warmTwelfthGain.gain.value = p.droneSubOctaveMix * 0.64;

    // Original cosmic-horror dark synthetic organ tension harmonic (subtle minor-ninth overtone)
    const dissonantOsc = ctx.createOscillator();
    dissonantOsc.type = 'sawtooth';
    dissonantOsc.frequency.value = p.droneFundamentalHz * p.organDissonantRatio;

    const dissonantGain = ctx.createGain();
    dissonantGain.gain.value = p.organDissonantGain;

    // Slow cosmic breathing LFO modulating oscillator pitch & filter cutoff
    const lfoOsc = ctx.createOscillator();
    lfoOsc.type = 'sine';
    lfoOsc.frequency.value = p.droneLfoRateHz;

    const lfoPitchGain = ctx.createGain();
    lfoPitchGain.gain.value = p.droneFmDepthHz;

    const lfoFilterGain = ctx.createGain();
    lfoFilterGain.gain.value = 38;

    lfoOsc.connect(lfoPitchGain);
    lfoPitchGain.connect(subOsc.frequency);
    lfoPitchGain.connect(fifthOsc.frequency);

    lfoOsc.connect(lfoFilterGain);
    lfoFilterGain.connect(lowpass.frequency);

    // Filtered brownian atmospheric sub-rumble
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = this.perf.getBrownNoiseBuffer(ctx);
    noiseSource.loop = true;

    const noiseGain = ctx.createGain();
    noiseGain.gain.value = p.droneNoiseGain;

    // Subtle metallic horizon resonance
    const metallicFilter = ctx.createBiquadFilter();
    metallicFilter.type = 'bandpass';
    metallicFilter.frequency.value = p.droneMetallicHz;
    metallicFilter.Q.value = 4.6;

    const metallicGain = ctx.createGain();
    metallicGain.gain.value = p.droneMetallicGain;

    subOsc.connect(lowpass);
    fifthOsc.connect(lowpass);
    octaveOsc.connect(octaveGain);
    octaveGain.connect(lowpass);
    warmTwelfthOsc.connect(warmTwelfthGain);
    warmTwelfthGain.connect(lowpass);
    dissonantOsc.connect(dissonantGain);
    dissonantGain.connect(lowpass);

    noiseSource.connect(noiseGain);
    noiseGain.connect(lowpass);

    noiseSource.connect(metallicFilter);
    fifthOsc.connect(metallicFilter);
    metallicFilter.connect(metallicGain);

    lowpass.connect(layerGain);
    metallicGain.connect(layerGain);
    layerGain.connect(destination);
    if (reverbSend && reverbDestination) {
      layerGain.connect(reverbSend);
      reverbSend.connect(reverbDestination);
    }

    subOsc.start();
    fifthOsc.start();
    octaveOsc.start();
    warmTwelfthOsc.start();
    dissonantOsc.start();
    lfoOsc.start();
    noiseSource.start();

    return {
      layerGain,
      reverbSend,
      subOsc,
      fifthOsc,
      octaveOsc,
      warmTwelfthOsc,
      dissonantOsc,
      octaveGain,
      warmTwelfthGain,
      dissonantGain,
      lfoOsc,
      lfoPitchGain,
      lfoFilterGain,
      lowpass,
      noiseSource,
      noiseGain,
      metallicFilter,
      metallicGain,
    };
  }

  /**
   * Layer B — GRAVITATIONAL PRESSURE:
   * Continuous low pulsing tension + distant choir-like dual-formant atmospheric pad + sparse
   * metallic horizon ticking, swelling dynamically as stars or planets enter the tidal field.
   */
  private buildPressureGraph(
    ctx: AudioContext,
    destination: AudioNode,
    reverbDestination?: AudioNode | null
  ): PressureGraph {
    const p = this.activePreset;
    const layerGain = ctx.createGain();
    layerGain.gain.value = 0;

    const reverbSend = reverbDestination ? ctx.createGain() : null;
    if (reverbSend && reverbDestination) {
      reverbSend.gain.value = p.reverbSendGain * 0.72;
    }

    // 1. Low pulsing gravitational tension wave
    const pulseCarrier = ctx.createOscillator();
    pulseCarrier.type = 'triangle';
    pulseCarrier.frequency.value = p.droneFundamentalHz * 2.0;

    const pulseFilter = ctx.createBiquadFilter();
    pulseFilter.type = 'lowpass';
    pulseFilter.frequency.value = 210;
    pulseFilter.Q.value = 2.1;

    const pulseLfo = ctx.createOscillator();
    pulseLfo.type = 'sine';
    pulseLfo.frequency.value = p.pressurePulseRateHz;

    const pulseLfoGain = ctx.createGain();
    pulseLfoGain.gain.value = 95;

    pulseLfo.connect(pulseLfoGain);
    pulseLfoGain.connect(pulseFilter.frequency);
    pulseCarrier.connect(pulseFilter);
    pulseFilter.connect(layerGain);

    // 2. Distant choir-like dual-formant atmospheric texture (original synthesized vowel resonance)
    const choirNoise = ctx.createBufferSource();
    choirNoise.buffer = this.perf.getPinkTurbulenceBuffer(ctx);
    choirNoise.loop = true;

    const choirCarrier = ctx.createOscillator();
    choirCarrier.type = 'sawtooth';
    choirCarrier.frequency.value = p.droneFundamentalHz * 4.0;

    const choirCarrierGain = ctx.createGain();
    choirCarrierGain.gain.value = 0.18;

    const formantA = ctx.createBiquadFilter();
    formantA.type = 'bandpass';
    formantA.frequency.value = 392;
    formantA.Q.value = 4.5;

    const formantB = ctx.createBiquadFilter();
    formantB.type = 'bandpass';
    formantB.frequency.value = 784;
    formantB.Q.value = 3.8;

    const choirGain = ctx.createGain();
    choirGain.gain.value = p.choirFormantGain;

    choirNoise.connect(formantA);
    choirNoise.connect(formantB);
    choirCarrier.connect(choirCarrierGain);
    choirCarrierGain.connect(formantA);
    choirCarrierGain.connect(formantB);
    formantA.connect(choirGain);
    formantB.connect(choirGain);
    choirGain.connect(layerGain);

    // 3. Sparse metallic relativistic horizon ticking
    const tickSource = ctx.createBufferSource();
    tickSource.buffer = this.perf.getHorizonTickBuffer(ctx);
    tickSource.loop = true;

    const tickFilter = ctx.createBiquadFilter();
    tickFilter.type = 'bandpass';
    tickFilter.frequency.value = 1180;
    tickFilter.Q.value = 2.6;

    const tickGain = ctx.createGain();
    tickGain.gain.value = p.horizonTickGain;

    tickSource.connect(tickFilter);
    tickFilter.connect(tickGain);
    tickGain.connect(layerGain);

    layerGain.connect(destination);
    if (reverbSend && reverbDestination) {
      layerGain.connect(reverbSend);
      reverbSend.connect(reverbDestination);
    }

    pulseCarrier.start();
    pulseLfo.start();
    choirNoise.start();
    choirCarrier.start();
    tickSource.start();

    return {
      layerGain,
      reverbSend,
      pulseCarrier,
      pulseFilter,
      pulseLfo,
      pulseLfoGain,
      choirNoise,
      choirCarrier,
      choirCarrierGain,
      formantA,
      formantB,
      choirGain,
      tickSource,
      tickFilter,
      tickGain,
    };
  }

  private buildPlasmaGraph(
    ctx: AudioContext,
    destination: AudioNode,
    reverbDestination?: AudioNode | null
  ): PlasmaGraph {
    const p = this.activePreset;
    const layerGain = ctx.createGain();
    layerGain.gain.value = 0;

    const reverbSend = reverbDestination ? ctx.createGain() : null;
    if (reverbSend && reverbDestination) {
      reverbSend.gain.value = p.reverbSendGain * 0.35;
    }

    // Swirling turbulent noise
    const turbulenceSource = ctx.createBufferSource();
    turbulenceSource.buffer = this.perf.getPinkTurbulenceBuffer(ctx);
    turbulenceSource.loop = true;

    const turbulenceFilter = ctx.createBiquadFilter();
    turbulenceFilter.type = 'bandpass';
    turbulenceFilter.frequency.value = p.plasmaBandpassHz;
    turbulenceFilter.Q.value = p.plasmaBandpassQ;

    const modLfo = ctx.createOscillator();
    modLfo.type = 'sine';
    modLfo.frequency.value = p.plasmaModRateHz;

    const modLfoGain = ctx.createGain();
    modLfoGain.gain.value = p.plasmaModDepthHz;
    modLfo.connect(modLfoGain);
    modLfoGain.connect(turbulenceFilter.frequency);

    // Soft electrical plasma crackling
    const crackleSource = ctx.createBufferSource();
    crackleSource.buffer = this.perf.getCrackleBuffer(ctx);
    crackleSource.loop = true;

    const crackleFilter = ctx.createBiquadFilter();
    crackleFilter.type = 'bandpass';
    crackleFilter.frequency.value = 1820;
    crackleFilter.Q.value = 1.45;

    const crackleGain = ctx.createGain();
    crackleGain.gain.value = p.plasmaCrackleGain;

    // Subtle metallic harmonic overtone
    const harmonicOsc = ctx.createOscillator();
    harmonicOsc.type = 'triangle';
    harmonicOsc.frequency.value = p.plasmaHarmonicHz;

    const harmonicGain = ctx.createGain();
    harmonicGain.gain.value = p.plasmaHarmonicGain;

    // Orbital stereo field movement
    const stereoPanner =
      typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null;
    const panLfo = ctx.createOscillator();
    panLfo.type = 'sine';
    panLfo.frequency.value = p.plasmaStereoRateHz;

    const panLfoGain = ctx.createGain();
    panLfoGain.gain.value = p.plasmaStereoWidth;

    turbulenceSource.connect(turbulenceFilter);
    crackleSource.connect(crackleFilter);
    crackleFilter.connect(crackleGain);
    harmonicOsc.connect(harmonicGain);

    if (stereoPanner) {
      panLfo.connect(panLfoGain);
      panLfoGain.connect(stereoPanner.pan);

      turbulenceFilter.connect(stereoPanner);
      crackleGain.connect(stereoPanner);
      harmonicGain.connect(stereoPanner);
      stereoPanner.connect(layerGain);
    } else {
      turbulenceFilter.connect(layerGain);
      crackleGain.connect(layerGain);
      harmonicGain.connect(layerGain);
    }

    layerGain.connect(destination);
    if (reverbSend && reverbDestination) {
      layerGain.connect(reverbSend);
      reverbSend.connect(reverbDestination);
    }

    turbulenceSource.start();
    modLfo.start();
    crackleSource.start();
    harmonicOsc.start();
    panLfo.start();

    return {
      layerGain,
      reverbSend,
      turbulenceSource,
      turbulenceFilter,
      modLfo,
      modLfoGain,
      crackleSource,
      crackleFilter,
      crackleGain,
      harmonicOsc,
      harmonicGain,
      stereoPanner,
      panLfo,
      panLfoGain,
    };
  }

  private buildApproachGraph(ctx: AudioContext, destination: AudioNode): ApproachGraph {
    const gain = ctx.createGain();
    gain.gain.value = 0;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 280;
    filter.Q.value = 2.4;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 120;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    osc.start();

    return { gain, osc, filter };
  }

  private buildThinkingGraph(ctx: AudioContext, destination: AudioNode): ThinkingGraph {
    const gain = ctx.createGain();
    gain.gain.value = 0;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 460;
    filter.Q.value = 1.2;

    const oscA = ctx.createOscillator();
    oscA.type = 'sine';
    oscA.frequency.value = 220;

    const oscB = ctx.createOscillator();
    oscB.type = 'sine';
    oscB.frequency.value = 329.63;

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.22;

    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 95;

    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    oscA.connect(filter);
    oscB.connect(filter);
    filter.connect(gain);
    gain.connect(destination);

    oscA.start();
    oscB.start();
    lfo.start();

    return { gain, oscA, oscB, filter, lfo, lfoGain };
  }

  /**
   * Live-switches preset and/or layer toggles smoothly without restarting AudioContext.
   */
  public applyPresetAndLayers(
    ctx: AudioContext | null,
    presetId: AudioPresetId,
    layers: AudioLayerSettings
  ): void {
    this.activePreset = AUDIO_PRESETS[presetId] ?? AUDIO_PRESETS.SINGULARITY;
    this.activeLayers = { ...layers };

    if (!ctx || ctx.state === 'closed') return;

    const now = ctx.currentTime;
    const p = this.activePreset;

    if (this.droneGraph) {
      smoothAudioParam(this.droneGraph.subOsc.frequency, p.droneFundamentalHz, now, 0.18);
      smoothAudioParam(
        this.droneGraph.fifthOsc.frequency,
        p.droneFundamentalHz * p.droneHarmonicRatio,
        now,
        0.18
      );
      smoothAudioParam(
        this.droneGraph.octaveOsc.frequency,
        p.droneFundamentalHz * 2.003,
        now,
        0.18
      );
      smoothAudioParam(
        this.droneGraph.warmTwelfthOsc.frequency,
        p.droneFundamentalHz * 3.002,
        now,
        0.18
      );
      smoothAudioParam(
        this.droneGraph.dissonantOsc.frequency,
        p.droneFundamentalHz * p.organDissonantRatio,
        now,
        0.18
      );
      smoothAudioParam(this.droneGraph.octaveGain.gain, p.droneSubOctaveMix, now, 0.14);
      smoothAudioParam(
        this.droneGraph.warmTwelfthGain.gain,
        p.droneSubOctaveMix * 0.64,
        now,
        0.14
      );
      smoothAudioParam(this.droneGraph.dissonantGain.gain, p.organDissonantGain, now, 0.16);
      smoothAudioParam(this.droneGraph.lowpass.frequency, p.droneFilterCutoffHz, now, 0.16);
      smoothAudioParam(this.droneGraph.lowpass.Q, p.droneFilterQ, now, 0.16);
      smoothAudioParam(this.droneGraph.lfoOsc.frequency, p.droneLfoRateHz, now, 0.2);
      smoothAudioParam(this.droneGraph.lfoPitchGain.gain, p.droneFmDepthHz, now, 0.2);
      smoothAudioParam(this.droneGraph.noiseGain.gain, p.droneNoiseGain, now, 0.16);
      smoothAudioParam(this.droneGraph.metallicFilter.frequency, p.droneMetallicHz, now, 0.18);
      smoothAudioParam(this.droneGraph.metallicGain.gain, p.droneMetallicGain, now, 0.16);
      if (this.droneGraph.reverbSend) {
        smoothAudioParam(this.droneGraph.reverbSend.gain, p.reverbSendGain * 0.45, now, 0.16);
      }
      smoothAudioParam(
        this.droneGraph.layerGain.gain,
        layers.drone ? p.droneGain : 0,
        now,
        layers.drone ? 0.12 : 0.035
      );
    }

    if (this.pressureGraph) {
      const pressureMod = 0.58 + this.currentCelestialPressure * 0.62;
      smoothAudioParam(
        this.pressureGraph.pulseCarrier.frequency,
        p.droneFundamentalHz * 2.0,
        now,
        0.18
      );
      smoothAudioParam(
        this.pressureGraph.choirCarrier.frequency,
        p.droneFundamentalHz * 4.0,
        now,
        0.18
      );
      smoothAudioParam(
        this.pressureGraph.pulseLfo.frequency,
        p.pressurePulseRateHz * (1 + this.currentCelestialPressure * 0.65),
        now,
        0.2
      );
      smoothAudioParam(this.pressureGraph.choirGain.gain, p.choirFormantGain, now, 0.18);
      smoothAudioParam(this.pressureGraph.tickGain.gain, p.horizonTickGain, now, 0.18);
      if (this.pressureGraph.reverbSend) {
        smoothAudioParam(this.pressureGraph.reverbSend.gain, p.reverbSendGain * 0.72, now, 0.18);
      }
      smoothAudioParam(
        this.pressureGraph.layerGain.gain,
        layers.gravitationalPressure ? Math.min(0.95, p.pressureGain * pressureMod) : 0,
        now,
        layers.gravitationalPressure ? 0.14 : 0.035
      );
    }

    if (this.plasmaGraph) {
      smoothAudioParam(this.plasmaGraph.turbulenceFilter.frequency, p.plasmaBandpassHz, now, 0.18);
      smoothAudioParam(this.plasmaGraph.turbulenceFilter.Q, p.plasmaBandpassQ, now, 0.18);
      smoothAudioParam(this.plasmaGraph.modLfo.frequency, p.plasmaModRateHz, now, 0.2);
      smoothAudioParam(this.plasmaGraph.modLfoGain.gain, p.plasmaModDepthHz, now, 0.2);
      smoothAudioParam(this.plasmaGraph.crackleGain.gain, p.plasmaCrackleGain, now, 0.16);
      smoothAudioParam(this.plasmaGraph.harmonicOsc.frequency, p.plasmaHarmonicHz, now, 0.2);
      smoothAudioParam(this.plasmaGraph.harmonicGain.gain, p.plasmaHarmonicGain, now, 0.16);
      smoothAudioParam(this.plasmaGraph.panLfo.frequency, p.plasmaStereoRateHz, now, 0.2);
      smoothAudioParam(this.plasmaGraph.panLfoGain.gain, p.plasmaStereoWidth, now, 0.2);
      if (this.plasmaGraph.reverbSend) {
        smoothAudioParam(this.plasmaGraph.reverbSend.gain, p.reverbSendGain * 0.35, now, 0.18);
      }
      smoothAudioParam(
        this.plasmaGraph.layerGain.gain,
        layers.plasma ? p.plasmaGain : 0,
        now,
        layers.plasma ? 0.12 : 0.035
      );
    }

    if (this.approachGraph && !layers.ingestion) {
      smoothAudioParam(this.approachGraph.gain.gain, 0, now, 0.03);
    }

    if (this.thinkingGraph) {
      const targetThinkingGain = layers.ui && this.isThinkingActive ? p.thinkingPadGain : 0;
      smoothAudioParam(this.thinkingGraph.gain.gain, targetThinkingGain, now, 0.12);
    }
  }

  /**
   * Layer B Modulation: Dynamically raises cosmic-horror gravitational pressure, pulsing rate,
   * and formant choir presence as stars or planets spiral toward tidal disruption.
   */
  public setGravitationalPressure(ctx: AudioContext | null, pressure: number): void {
    this.currentCelestialPressure = Math.min(1, Math.max(0, pressure));
    if (!ctx || ctx.state === 'closed' || !this.pressureGraph) return;

    const now = ctx.currentTime;
    if (!this.activeLayers.gravitationalPressure) {
      smoothAudioParam(this.pressureGraph.layerGain.gain, 0, now, 0.05);
      return;
    }

    const p = this.activePreset;
    const pressureMod = 0.58 + this.currentCelestialPressure * 0.62;
    const targetGain = Math.min(0.95, p.pressureGain * pressureMod);
    const targetPulseHz = p.pressurePulseRateHz * (1 + this.currentCelestialPressure * 0.72);
    const targetCutoff = 195 + this.currentCelestialPressure * 240;

    smoothAudioParam(this.pressureGraph.layerGain.gain, targetGain, now, 0.12);
    smoothAudioParam(this.pressureGraph.pulseLfo.frequency, targetPulseHz, now, 0.15);
    smoothAudioParam(this.pressureGraph.pulseFilter.frequency, targetCutoff, now, 0.12);
  }

  /**
   * Layer C (Part 1): Gradually increases gravitational tension as particles approach the Event Horizon.
   */
  public setApproachTension(ctx: AudioContext | null, tension: number): void {
    this.currentApproachTension = Math.min(1, Math.max(0, tension));
    if (!ctx || ctx.state === 'closed' || !this.approachGraph) return;

    const now = ctx.currentTime;
    if (!this.activeLayers.ingestion || this.currentApproachTension <= 0.01) {
      smoothAudioParam(this.approachGraph.gain.gain, 0, now, 0.06);
      return;
    }

    const p = this.activePreset;
    const targetFreq = 112 + this.currentApproachTension * 138;
    const targetCutoff = 260 + this.currentApproachTension * 680;
    const targetGain = p.approachMaxGain * this.currentApproachTension;

    smoothAudioParam(this.approachGraph.osc.frequency, targetFreq, now, 0.05);
    smoothAudioParam(this.approachGraph.filter.frequency, targetCutoff, now, 0.05);
    smoothAudioParam(this.approachGraph.gain.gain, targetGain, now, 0.05);
  }

  /**
   * Layer C (Part 2): Plays the Gravitational Ingestion sound:
   * 1. Short rising gravitational pull
   * 2. Relativistic descending pitch sweep across Event Horizon
   * 3. Subtle crystalline disappearance chime
   * 4. Smooth release & node disposal
   */
  public playParticleIngestion(
    ctx: AudioContext,
    destination: AudioNode,
    intensity: number,
    coalescedCount = 1
  ): void {
    if (!this.activeLayers.ingestion) return;

    const p = this.activePreset;
    const now = ctx.currentTime;
    const energy = Math.min(1, Math.max(0.15, intensity));
    const clusterScale = Math.min(1.28, 1 + Math.log2(Math.max(1, coalescedCount)) * 0.1);
    const peakGain = Math.min(0.9, p.ingestionGain * (0.68 + energy * 0.32) * clusterScale);

    // Primary relativistic pull + horizon crossing sweep
    const pullOsc = ctx.createOscillator();
    pullOsc.type = 'triangle';
    setParamAtTime(pullOsc.frequency, p.ingestionPullStartHz, now);
    scheduleEnvelopePoint(pullOsc.frequency, p.ingestionPullPeakHz, now + 0.075, true);
    scheduleEnvelopePoint(pullOsc.frequency, p.ingestionHorizonFloorHz, now + 0.42, true);

    const pullFilter = ctx.createBiquadFilter();
    pullFilter.type = 'lowpass';
    setParamAtTime(pullFilter.frequency, 520, now);
    scheduleEnvelopePoint(pullFilter.frequency, 1180, now + 0.08, true);
    scheduleEnvelopePoint(pullFilter.frequency, 130, now + 0.44, true);

    const pullGain = ctx.createGain();
    setParamAtTime(pullGain.gain, 0.0001, now);
    scheduleEnvelopePoint(pullGain.gain, peakGain, now + 0.065, false);
    scheduleEnvelopePoint(pullGain.gain, 0.0001, now + 0.46, true);

    // Subtle crystalline disappearance ping
    const crystalOsc = ctx.createOscillator();
    crystalOsc.type = 'sine';
    setParamAtTime(crystalOsc.frequency, p.crystallineChimeHz, now + 0.055);
    scheduleEnvelopePoint(crystalOsc.frequency, p.crystallineChimeHz * 0.96, now + 0.48, true);

    const crystalFilter = ctx.createBiquadFilter();
    crystalFilter.type = 'lowpass';
    crystalFilter.frequency.value = 3200;

    const crystalGain = ctx.createGain();
    setParamAtTime(crystalGain.gain, 0.0001, now);
    setParamAtTime(crystalGain.gain, 0.0001, now + 0.055);
    scheduleEnvelopePoint(crystalGain.gain, peakGain * 0.24, now + 0.09, false);
    scheduleEnvelopePoint(crystalGain.gain, 0.0001, now + 0.5, true);

    pullOsc.connect(pullFilter);
    pullFilter.connect(pullGain);
    pullGain.connect(destination);

    crystalOsc.connect(crystalFilter);
    crystalFilter.connect(crystalGain);
    crystalGain.connect(destination);

    const releaseVoice = this.perf.registerTransientVoice(
      'ingestion',
      [pullOsc, pullFilter, pullGain, crystalOsc, crystalFilter, crystalGain],
      520
    );

    pullOsc.onended = () => {
      releaseVoice();
    };

    pullOsc.start(now);
    pullOsc.stop(now + 0.48);
    crystalOsc.start(now + 0.05);
    crystalOsc.stop(now + 0.52);

    this.stats.ingestionSoundsPlayed += 1;
  }

  /**
   * Layer D: Synchronized Singularity Shockwave cinematic energy pulse:
   * - Deep cinematic sub-impact
   * - Expanding filtered noise wave synchronized to ~1.28s visual shockwave
   * - Short resonant metallic wave
   * - Subtle shimmering tail & smooth decay
   */
  public playCosmicShockwave(
    ctx: AudioContext,
    destination: AudioNode,
    intensity: number,
    reverbDestination?: AudioNode | null
  ): void {
    if (!this.activeLayers.shockwave) return;

    const p = this.activePreset;
    const now = ctx.currentTime;
    const dur = p.shockwaveTailSeconds;
    const clampedIntensity = Math.min(1, Math.max(0.2, intensity));
    const masterPeak = Math.min(0.95, p.shockwaveGain * (0.7 + clampedIntensity * 0.3));

    // 1. Deep cinematic impact
    const impactOsc = ctx.createOscillator();
    impactOsc.type = 'sine';
    setParamAtTime(impactOsc.frequency, p.shockwaveImpactStartHz, now);
    scheduleEnvelopePoint(impactOsc.frequency, p.shockwaveImpactEndHz, now + 0.52, true);

    const impactGain = ctx.createGain();
    setParamAtTime(impactGain.gain, 0.0001, now);
    scheduleEnvelopePoint(impactGain.gain, masterPeak * 0.85, now + 0.028, false);
    scheduleEnvelopePoint(impactGain.gain, 0.0001, now + 0.62, true);

    // 2. Expanding filtered noise wave matching viewport shockwave propagation
    const waveNoise = ctx.createBufferSource();
    waveNoise.buffer = this.perf.getPinkTurbulenceBuffer(ctx);
    waveNoise.loop = true;

    const waveFilter = ctx.createBiquadFilter();
    waveFilter.type = 'bandpass';
    waveFilter.Q.value = 1.9;
    setParamAtTime(waveFilter.frequency, 130, now);
    scheduleEnvelopePoint(waveFilter.frequency, p.shockwaveSweepPeakHz, now + dur * 0.36, true);
    scheduleEnvelopePoint(waveFilter.frequency, 155, now + dur, true);

    const waveGain = ctx.createGain();
    setParamAtTime(waveGain.gain, 0.0001, now);
    scheduleEnvelopePoint(waveGain.gain, masterPeak * 0.52, now + 0.09, false);
    scheduleEnvelopePoint(waveGain.gain, 0.0001, now + dur, true);

    // 3. Short resonant metallic wave + 4. Subtle shimmering tail
    const metalOscA = ctx.createOscillator();
    metalOscA.type = 'triangle';
    setParamAtTime(metalOscA.frequency, p.shockwaveResonanceHz, now);
    scheduleEnvelopePoint(metalOscA.frequency, p.shockwaveResonanceHz * 0.96, now + 0.82, true);

    const shimmerOsc = ctx.createOscillator();
    shimmerOsc.type = 'sine';
    setParamAtTime(shimmerOsc.frequency, p.shockwaveResonanceHz * 3.0, now + 0.04);

    const tailFilter = ctx.createBiquadFilter();
    tailFilter.type = 'lowpass';
    tailFilter.frequency.value = 1950;

    const metalGain = ctx.createGain();
    setParamAtTime(metalGain.gain, 0.0001, now);
    scheduleEnvelopePoint(metalGain.gain, masterPeak * 0.28, now + 0.045, false);
    scheduleEnvelopePoint(metalGain.gain, 0.0001, now + 0.84, true);

    const shimmerGain = ctx.createGain();
    setParamAtTime(shimmerGain.gain, 0.0001, now);
    scheduleEnvelopePoint(shimmerGain.gain, masterPeak * 0.14, now + 0.12, false);
    scheduleEnvelopePoint(shimmerGain.gain, 0.0001, now + dur, true);

    impactOsc.connect(impactGain);
    impactGain.connect(destination);

    waveNoise.connect(waveFilter);
    waveFilter.connect(waveGain);
    waveGain.connect(destination);

    metalOscA.connect(tailFilter);
    tailFilter.connect(metalGain);
    metalGain.connect(destination);

    shimmerOsc.connect(shimmerGain);
    shimmerGain.connect(destination);

    const nodes: Array<{ disconnect?: () => void }> = [
      impactOsc,
      impactGain,
      waveNoise,
      waveFilter,
      waveGain,
      metalOscA,
      shimmerOsc,
      tailFilter,
      metalGain,
      shimmerGain,
    ];

    if (reverbDestination) {
      const reverbSend = ctx.createGain();
      reverbSend.gain.value = p.reverbSendGain * 0.65;
      waveGain.connect(reverbSend);
      metalGain.connect(reverbSend);
      shimmerGain.connect(reverbSend);
      reverbSend.connect(reverbDestination);
      nodes.push(reverbSend);
    }

    const releaseVoice = this.perf.registerTransientVoice('shockwave', nodes, dur * 1000 + 80);

    shimmerOsc.onended = () => {
      releaseVoice();
    };

    impactOsc.start(now);
    impactOsc.stop(now + 0.65);
    waveNoise.start(now);
    waveNoise.stop(now + dur + 0.04);
    metalOscA.start(now);
    metalOscA.stop(now + 0.86);
    shimmerOsc.start(now + 0.04);
    shimmerOsc.stop(now + dur + 0.05);

    this.stats.shockwaveSoundsPlayed += 1;
  }

  /**
   * Controls the subtle evolving atmospheric texture during AI_THINKING.
   */
  public setAiThinkingActive(ctx: AudioContext | null, active: boolean): void {
    this.isThinkingActive = active;
    if (!ctx || ctx.state === 'closed' || !this.thinkingGraph) return;

    const target = active && this.activeLayers.ui ? this.activePreset.thinkingPadGain : 0;
    smoothAudioParam(
      this.thinkingGraph.gain.gain,
      target,
      ctx.currentTime,
      active ? 0.22 : 0.16
    );
  }

  /**
   * Subtle, restrained UI/application state cues (kept strictly quieter than cosmic layers).
   */
  public playUiCue(
    ctx: AudioContext,
    destination: AudioNode,
    cue: 'MESSAGE_SUBMITTED' | 'AI_RESPONSE' | 'ERROR'
  ): void {
    if (!this.activeLayers.ui) return;

    const p = this.activePreset;
    const now = ctx.currentTime;
    const gainLevel = p.uiGain;

    if (cue === 'MESSAGE_SUBMITTED') {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      setParamAtTime(osc.frequency, 329.63, now);
      scheduleEnvelopePoint(osc.frequency, 440, now + 0.14, true);

      const gain = ctx.createGain();
      setParamAtTime(gain.gain, 0.0001, now);
      scheduleEnvelopePoint(gain.gain, gainLevel * 0.72, now + 0.02, false);
      scheduleEnvelopePoint(gain.gain, 0.0001, now + 0.18, true);

      osc.connect(gain);
      gain.connect(destination);

      const release = this.perf.registerTransientVoice('ui', [osc, gain], 220);
      osc.onended = () => release();
      osc.start(now);
      osc.stop(now + 0.19);
    } else if (cue === 'AI_RESPONSE') {
      const oscA = ctx.createOscillator();
      oscA.type = 'sine';
      setParamAtTime(oscA.frequency, 392.0, now);

      const oscB = ctx.createOscillator();
      oscB.type = 'sine';
      setParamAtTime(oscB.frequency, 587.33, now + 0.06);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1800;

      const gain = ctx.createGain();
      setParamAtTime(gain.gain, 0.0001, now);
      scheduleEnvelopePoint(gain.gain, gainLevel * 0.85, now + 0.05, false);
      scheduleEnvelopePoint(gain.gain, 0.0001, now + 0.44, true);

      oscA.connect(filter);
      oscB.connect(filter);
      filter.connect(gain);
      gain.connect(destination);

      const release = this.perf.registerTransientVoice('ui', [oscA, oscB, filter, gain], 480);
      oscB.onended = () => release();
      oscA.start(now);
      oscA.stop(now + 0.36);
      oscB.start(now + 0.06);
      oscB.stop(now + 0.45);
    } else {
      // ERROR: Soft low-impact amber warning sound
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      setParamAtTime(osc.frequency, 174.61, now);
      scheduleEnvelopePoint(osc.frequency, 130.81, now + 0.32, true);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 460;

      const gain = ctx.createGain();
      setParamAtTime(gain.gain, 0.0001, now);
      scheduleEnvelopePoint(gain.gain, gainLevel * 0.82, now + 0.025, false);
      scheduleEnvelopePoint(gain.gain, 0.0001, now + 0.35, true);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(destination);

      const release = this.perf.registerTransientVoice('ui', [osc, filter, gain], 380);
      osc.onended = () => release();
      osc.start(now);
      osc.stop(now + 0.36);
    }

    this.stats.uiSoundsPlayed += 1;
  }

  /**
   * Plays an explicit user-triggered acoustic verification sound previewing the active preset.
   */
  public playTestSound(ctx: AudioContext, destination: AudioNode): void {
    const p = this.activePreset;
    const now = ctx.currentTime;
    const peak = Math.min(0.82, Math.max(0.45, p.shockwaveGain * 0.88));

    const subOsc = ctx.createOscillator();
    subOsc.type = 'sine';
    setParamAtTime(subOsc.frequency, 73.42, now);
    scheduleEnvelopePoint(subOsc.frequency, 43.65, now + 0.72, true);

    const chordOscA = ctx.createOscillator();
    chordOscA.type = 'triangle';
    setParamAtTime(chordOscA.frequency, 220.0, now);
    scheduleEnvelopePoint(chordOscA.frequency, 329.63, now + 0.22, true);

    const shimmerOsc = ctx.createOscillator();
    shimmerOsc.type = 'sine';
    setParamAtTime(shimmerOsc.frequency, 659.25, now + 0.08);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    setParamAtTime(filter.frequency, 540, now);
    scheduleEnvelopePoint(filter.frequency, 2150, now + 0.25, true);
    scheduleEnvelopePoint(filter.frequency, 360, now + 0.85, true);

    const env = ctx.createGain();
    setParamAtTime(env.gain, 0.0001, now);
    scheduleEnvelopePoint(env.gain, peak, now + 0.055, false);
    scheduleEnvelopePoint(env.gain, 0.0001, now + 0.86, true);

    subOsc.connect(filter);
    chordOscA.connect(filter);
    shimmerOsc.connect(filter);
    filter.connect(env);
    env.connect(destination);

    const release = this.perf.registerTransientVoice(
      'shockwave',
      [subOsc, chordOscA, shimmerOsc, filter, env],
      920
    );
    shimmerOsc.onended = () => release();

    subOsc.start(now);
    subOsc.stop(now + 0.86);
    chordOscA.start(now);
    chordOscA.stop(now + 0.78);
    shimmerOsc.start(now + 0.08);
    shimmerOsc.stop(now + 0.88);

    this.stats.testSoundsPlayed += 1;
  }

  /**
   * Phase 8 & 9 — Celestial Devourer & Cosmic Horror Audio Synchronization:
   * Synthesizes bespoke original cosmic-horror procedural audio for star approach, tidal stretch,
   * disruption impact, fallback debris stream, stellar accretion/collapse, planetary fragmentation,
   * planetary core plunge, and accretion surges.
   */
  public playCelestialEvent(
    ctx: AudioContext,
    destination: AudioNode,
    evt: CosmicDevourerEvent,
    reverbDestination?: AudioNode | null
  ): boolean {
    const p = this.activePreset;
    const now = ctx.currentTime;
    const energy = Math.min(1, Math.max(0.25, evt.intensity));
    const connectWithReverb = (envNode: AudioNode, wetAmount = 0.42) => {
      envNode.connect(destination);
      if (reverbDestination && wetAmount > 0.01) {
        const send = ctx.createGain();
        send.gain.value = wetAmount * p.reverbSendGain;
        envNode.connect(send);
        send.connect(reverbDestination);
        return send;
      }
      return null;
    };

    switch (evt.type) {
      case 'STAR_APPROACH': {
        if (!this.activeLayers.starConsumption) return false;
        const peak = Math.min(0.54, p.starDestructionGain * 0.44 * energy);
        const organLow = ctx.createOscillator();
        organLow.type = 'triangle';
        setParamAtTime(organLow.frequency, 73.42, now);
        scheduleEnvelopePoint(organLow.frequency, 92.5, now + 0.72, true);

        const organFifth = ctx.createOscillator();
        organFifth.type = 'sine';
        setParamAtTime(organFifth.frequency, 110.0, now);
        scheduleEnvelopePoint(organFifth.frequency, 138.59, now + 0.72, true);

        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        setParamAtTime(lp.frequency, 280, now);
        scheduleEnvelopePoint(lp.frequency, 620, now + 0.45, true);
        scheduleEnvelopePoint(lp.frequency, 210, now + 0.85, true);

        const env = ctx.createGain();
        setParamAtTime(env.gain, 0.0001, now);
        scheduleEnvelopePoint(env.gain, peak, now + 0.24, false);
        scheduleEnvelopePoint(env.gain, 0.0001, now + 0.88, true);

        organLow.connect(lp);
        organFifth.connect(lp);
        lp.connect(env);
        const send = connectWithReverb(env, 0.55);
        const nodes: Array<{ disconnect?: () => void }> = [organLow, organFifth, lp, env];
        if (send) nodes.push(send);

        const release = this.perf.registerTransientVoice('celestial', nodes, 940);
        organFifth.onended = () => release();
        organLow.start(now);
        organLow.stop(now + 0.9);
        organFifth.start(now);
        organFifth.stop(now + 0.9);
        this.stats.starSoundsPlayed += 1;
        return true;
      }

      case 'STAR_CAPTURED': {
        if (!this.activeLayers.starConsumption) return false;
        const peak = Math.min(0.68, p.starDestructionGain * 0.56 * energy);
        const oscA = ctx.createOscillator();
        oscA.type = 'sine';
        setParamAtTime(oscA.frequency, 87.31, now);
        scheduleEnvelopePoint(oscA.frequency, 155.56, now + 0.52, true);

        const oscB = ctx.createOscillator();
        oscB.type = 'triangle';
        setParamAtTime(oscB.frequency, 130.81, now);
        scheduleEnvelopePoint(oscB.frequency, 233.08, now + 0.52, true);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        setParamAtTime(filter.frequency, 360, now);
        scheduleEnvelopePoint(filter.frequency, 920, now + 0.3, true);
        scheduleEnvelopePoint(filter.frequency, 220, now + 0.65, true);

        const env = ctx.createGain();
        setParamAtTime(env.gain, 0.0001, now);
        scheduleEnvelopePoint(env.gain, peak, now + 0.14, false);
        scheduleEnvelopePoint(env.gain, 0.0001, now + 0.68, true);

        oscA.connect(filter);
        oscB.connect(filter);
        filter.connect(env);
        const send = connectWithReverb(env, 0.48);
        const nodes: Array<{ disconnect?: () => void }> = [oscA, oscB, filter, env];
        if (send) nodes.push(send);

        const release = this.perf.registerTransientVoice('celestial', nodes, 740);
        oscB.onended = () => release();
        oscA.start(now);
        oscA.stop(now + 0.7);
        oscB.start(now);
        oscB.stop(now + 0.7);
        this.stats.starSoundsPlayed += 1;
        return true;
      }

      case 'STAR_TIDAL_STRETCH': {
        if (!this.activeLayers.starConsumption) return false;
        const peak = Math.min(0.76, p.starDestructionGain * 0.68 * energy);

        // Rising dissonant harmonic sweep + deep unstable gravitational rumble
        const sweepA = ctx.createOscillator();
        sweepA.type = 'sawtooth';
        setParamAtTime(sweepA.frequency, 92.5, now);
        scheduleEnvelopePoint(sweepA.frequency, 196.0, now + 0.92, true);

        const sweepDissonant = ctx.createOscillator();
        sweepDissonant.type = 'triangle';
        setParamAtTime(sweepDissonant.frequency, 130.81, now);
        scheduleEnvelopePoint(sweepDissonant.frequency, 277.18, now + 0.92, true);

        const rumble = ctx.createBufferSource();
        rumble.buffer = this.perf.getBrownNoiseBuffer(ctx);
        rumble.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.Q.value = 2.2;
        setParamAtTime(filter.frequency, 260, now);
        scheduleEnvelopePoint(filter.frequency, 1080, now + 0.68, true);
        scheduleEnvelopePoint(filter.frequency, 290, now + 1.05, true);

        const env = ctx.createGain();
        setParamAtTime(env.gain, 0.0001, now);
        scheduleEnvelopePoint(env.gain, peak, now + 0.22, false);
        scheduleEnvelopePoint(env.gain, 0.0001, now + 1.08, true);

        sweepA.connect(filter);
        sweepDissonant.connect(filter);
        rumble.connect(filter);
        filter.connect(env);
        const send = connectWithReverb(env, 0.62);
        const nodes: Array<{ disconnect?: () => void }> = [
          sweepA,
          sweepDissonant,
          rumble,
          filter,
          env,
        ];
        if (send) nodes.push(send);

        const release = this.perf.registerTransientVoice('celestial', nodes, 1140);
        sweepDissonant.onended = () => release();
        sweepA.start(now);
        sweepA.stop(now + 1.1);
        sweepDissonant.start(now);
        sweepDissonant.stop(now + 1.1);
        rumble.start(now);
        rumble.stop(now + 1.1);
        this.stats.starSoundsPlayed += 1;
        return true;
      }

      case 'STAR_TIDAL_DISRUPTION':
      case 'STAR_DISRUPTION': {
        if (!this.activeLayers.starConsumption) return false;
        const peak = Math.min(0.86, p.starDestructionGain * 0.78 * energy);
        const plasmaNoise = ctx.createBufferSource();
        plasmaNoise.buffer = this.perf.getPinkTurbulenceBuffer(ctx);
        plasmaNoise.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.Q.value = 1.65;
        setParamAtTime(filter.frequency, 240, now);
        scheduleEnvelopePoint(filter.frequency, 1240, now + 0.42, true);
        scheduleEnvelopePoint(filter.frequency, 290, now + 1.04, true);

        // Deep organ-like metallic resonance + sub impact
        const tensionOsc = ctx.createOscillator();
        tensionOsc.type = 'sawtooth';
        setParamAtTime(tensionOsc.frequency, 110.0, now);
        scheduleEnvelopePoint(tensionOsc.frequency, 55.0, now + 1.02, true);

        const subImpact = ctx.createOscillator();
        subImpact.type = 'sine';
        setParamAtTime(subImpact.frequency, 69.3, now);
        scheduleEnvelopePoint(subImpact.frequency, 32.7, now + 0.68, true);

        const tensionLp = ctx.createBiquadFilter();
        tensionLp.type = 'lowpass';
        tensionLp.frequency.value = 480;

        const env = ctx.createGain();
        setParamAtTime(env.gain, 0.0001, now);
        scheduleEnvelopePoint(env.gain, peak, now + 0.12, false);
        scheduleEnvelopePoint(env.gain, 0.0001, now + 1.08, true);

        plasmaNoise.connect(filter);
        filter.connect(env);
        tensionOsc.connect(tensionLp);
        subImpact.connect(tensionLp);
        tensionLp.connect(env);
        const send = connectWithReverb(env, 0.65);
        const nodes: Array<{ disconnect?: () => void }> = [
          plasmaNoise,
          filter,
          tensionOsc,
          subImpact,
          tensionLp,
          env,
        ];
        if (send) nodes.push(send);

        const release = this.perf.registerTransientVoice('celestial', nodes, 1140);
        tensionOsc.onended = () => release();
        plasmaNoise.start(now);
        plasmaNoise.stop(now + 1.1);
        tensionOsc.start(now);
        tensionOsc.stop(now + 1.1);
        subImpact.start(now);
        subImpact.stop(now + 0.72);
        this.stats.starSoundsPlayed += 1;
        return true;
      }

      case 'STAR_DEBRIS_STREAM': {
        if (!this.activeLayers.starConsumption) return false;
        const peak = Math.min(0.72, p.starDestructionGain * 0.62 * energy);

        const streamNoise = ctx.createBufferSource();
        streamNoise.buffer = this.perf.getPinkTurbulenceBuffer(ctx);
        streamNoise.loop = true;

        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.Q.value = 2.0;
        setParamAtTime(bp.frequency, 320, now);
        scheduleEnvelopePoint(bp.frequency, 960, now + 0.45, true);
        scheduleEnvelopePoint(bp.frequency, 240, now + 0.96, true);

        const harmonic = ctx.createOscillator();
        harmonic.type = 'triangle';
        setParamAtTime(harmonic.frequency, 164.81, now);
        scheduleEnvelopePoint(harmonic.frequency, 110.0, now + 0.94, true);

        const env = ctx.createGain();
        setParamAtTime(env.gain, 0.0001, now);
        scheduleEnvelopePoint(env.gain, peak, now + 0.16, false);
        scheduleEnvelopePoint(env.gain, 0.0001, now + 0.98, true);

        streamNoise.connect(bp);
        bp.connect(env);
        harmonic.connect(bp);
        const send = connectWithReverb(env, 0.58);
        const nodes: Array<{ disconnect?: () => void }> = [streamNoise, bp, harmonic, env];
        if (send) nodes.push(send);

        const release = this.perf.registerTransientVoice('celestial', nodes, 1040);
        harmonic.onended = () => release();
        streamNoise.start(now);
        streamNoise.stop(now + 1.0);
        harmonic.start(now);
        harmonic.stop(now + 1.0);
        this.stats.starSoundsPlayed += 1;
        return true;
      }

      case 'STAR_ACCRETION':
      case 'STAR_CONSUMED': {
        if (!this.activeLayers.starConsumption) return false;
        const isFinal = evt.type === 'STAR_CONSUMED';
        const peak = Math.min(
          0.95,
          p.starDestructionGain * (isFinal ? 0.78 + energy * 0.22 : 0.68 + energy * 0.2)
        );

        // 1. Seismic stellar collapse sub-bass drop
        const subDrop = ctx.createOscillator();
        subDrop.type = 'sine';
        setParamAtTime(subDrop.frequency, isFinal ? 82.41 : 98.0, now);
        scheduleEnvelopePoint(subDrop.frequency, 27.5, now + 0.84, true);

        const subGain = ctx.createGain();
        setParamAtTime(subGain.gain, 0.0001, now);
        scheduleEnvelopePoint(subGain.gain, peak * 0.9, now + 0.035, false);
        scheduleEnvelopePoint(subGain.gain, 0.0001, now + 1.05, true);

        // 2. Superheated plasma roar implosion
        const roar = ctx.createBufferSource();
        roar.buffer = this.perf.getBrownNoiseBuffer(ctx);
        roar.loop = true;

        const roarFilter = ctx.createBiquadFilter();
        roarFilter.type = 'lowpass';
        setParamAtTime(roarFilter.frequency, 1450, now);
        scheduleEnvelopePoint(roarFilter.frequency, 150, now + 1.22, true);

        const roarGain = ctx.createGain();
        setParamAtTime(roarGain.gain, 0.0001, now);
        scheduleEnvelopePoint(roarGain.gain, peak * 0.62, now + 0.08, false);
        scheduleEnvelopePoint(roarGain.gain, 0.0001, now + 1.28, true);

        // 3. Dark organ/photon-ring descending collapse chord
        const flashOsc = ctx.createOscillator();
        flashOsc.type = 'triangle';
        setParamAtTime(flashOsc.frequency, isFinal ? 523.25 : 392.0, now);
        scheduleEnvelopePoint(flashOsc.frequency, 110.0, now + 0.98, true);

        const flashGain = ctx.createGain();
        setParamAtTime(flashGain.gain, 0.0001, now);
        scheduleEnvelopePoint(flashGain.gain, peak * 0.34, now + 0.045, false);
        scheduleEnvelopePoint(flashGain.gain, 0.0001, now + 1.06, true);

        subDrop.connect(subGain);
        subGain.connect(destination);
        roar.connect(roarFilter);
        roarFilter.connect(roarGain);
        const sendRoar = connectWithReverb(roarGain, 0.68);
        flashOsc.connect(flashGain);
        const sendFlash = connectWithReverb(flashGain, 0.72);

        const nodes: Array<{ disconnect?: () => void }> = [
          subDrop,
          subGain,
          roar,
          roarFilter,
          roarGain,
          flashOsc,
          flashGain,
        ];
        if (sendRoar) nodes.push(sendRoar);
        if (sendFlash) nodes.push(sendFlash);

        const release = this.perf.registerTransientVoice('celestial', nodes, 1340);
        roar.onended = () => release();
        subDrop.start(now);
        subDrop.stop(now + 1.06);
        flashOsc.start(now);
        flashOsc.stop(now + 1.08);
        roar.start(now);
        roar.stop(now + 1.3);
        this.stats.starSoundsPlayed += 1;
        return true;
      }

      case 'PLANET_CAPTURED': {
        if (!this.activeLayers.planetConsumption) return false;
        const peak = Math.min(0.62, p.planetIngestionGain * 0.52 * energy);
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        setParamAtTime(osc.frequency, 123.47, now);
        scheduleEnvelopePoint(osc.frequency, 82.41, now + 0.48, true);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 480;

        const env = ctx.createGain();
        setParamAtTime(env.gain, 0.0001, now);
        scheduleEnvelopePoint(env.gain, peak, now + 0.09, false);
        scheduleEnvelopePoint(env.gain, 0.0001, now + 0.52, true);

        osc.connect(filter);
        filter.connect(env);
        const send = connectWithReverb(env, 0.42);
        const nodes: Array<{ disconnect?: () => void }> = [osc, filter, env];
        if (send) nodes.push(send);

        const release = this.perf.registerTransientVoice('celestial', nodes, 580);
        osc.onended = () => release();
        osc.start(now);
        osc.stop(now + 0.54);
        this.stats.planetSoundsPlayed += 1;
        return true;
      }

      case 'PLANET_FRAGMENTED':
      case 'PLANET_FRAGMENTATION': {
        if (!this.activeLayers.planetConsumption) return false;
        const peak = Math.min(0.84, p.planetIngestionGain * 0.76 * energy);

        // Heavy crustal Roche cracking + deep structural boulder impacts
        const fracture = ctx.createBufferSource();
        fracture.buffer = this.perf.getCrackleBuffer(ctx);
        fracture.loop = true;

        const fractureFilter = ctx.createBiquadFilter();
        fractureFilter.type = 'bandpass';
        fractureFilter.Q.value = 1.35;
        setParamAtTime(fractureFilter.frequency, 920, now);
        scheduleEnvelopePoint(fractureFilter.frequency, 320, now + 0.82, true);

        const rumble = ctx.createOscillator();
        rumble.type = 'sawtooth';
        setParamAtTime(rumble.frequency, 92.5, now);
        scheduleEnvelopePoint(rumble.frequency, 46.25, now + 0.82, true);

        const impactSub = ctx.createOscillator();
        impactSub.type = 'sine';
        setParamAtTime(impactSub.frequency, 65.41, now);
        scheduleEnvelopePoint(impactSub.frequency, 34.65, now + 0.52, true);

        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 580;

        const env = ctx.createGain();
        setParamAtTime(env.gain, 0.0001, now);
        scheduleEnvelopePoint(env.gain, peak, now + 0.045, false);
        scheduleEnvelopePoint(env.gain, 0.0001, now + 0.86, true);

        fracture.connect(fractureFilter);
        fractureFilter.connect(env);
        rumble.connect(lp);
        impactSub.connect(lp);
        lp.connect(env);
        const send = connectWithReverb(env, 0.56);
        const nodes: Array<{ disconnect?: () => void }> = [
          fracture,
          fractureFilter,
          rumble,
          impactSub,
          lp,
          env,
        ];
        if (send) nodes.push(send);

        const release = this.perf.registerTransientVoice('celestial', nodes, 920);
        rumble.onended = () => release();
        fracture.start(now);
        fracture.stop(now + 0.88);
        rumble.start(now);
        rumble.stop(now + 0.88);
        impactSub.start(now);
        impactSub.stop(now + 0.56);
        this.stats.planetSoundsPlayed += 1;
        return true;
      }

      case 'PLANET_ACCRETION':
      case 'PLANET_CONSUMED': {
        if (!this.activeLayers.planetConsumption) return false;
        const peak = Math.min(0.9, p.planetIngestionGain * (0.72 + energy * 0.28));

        const plunge = ctx.createOscillator();
        plunge.type = 'sine';
        setParamAtTime(plunge.frequency, 146.83, now);
        scheduleEnvelopePoint(plunge.frequency, 34.65, now + 0.78, true);

        const debrisWash = ctx.createBufferSource();
        debrisWash.buffer = this.perf.getPinkTurbulenceBuffer(ctx);
        debrisWash.loop = true;

        const washFilter = ctx.createBiquadFilter();
        washFilter.type = 'lowpass';
        setParamAtTime(washFilter.frequency, 880, now);
        scheduleEnvelopePoint(washFilter.frequency, 135, now + 0.84, true);

        const washGain = ctx.createGain();
        washGain.gain.value = 0.5;

        const env = ctx.createGain();
        setParamAtTime(env.gain, 0.0001, now);
        scheduleEnvelopePoint(env.gain, peak, now + 0.045, false);
        scheduleEnvelopePoint(env.gain, 0.0001, now + 0.9, true);

        plunge.connect(env);
        debrisWash.connect(washFilter);
        washFilter.connect(washGain);
        washGain.connect(env);
        const send = connectWithReverb(env, 0.62);
        const nodes: Array<{ disconnect?: () => void }> = [
          plunge,
          debrisWash,
          washFilter,
          washGain,
          env,
        ];
        if (send) nodes.push(send);

        const release = this.perf.registerTransientVoice('celestial', nodes, 960);
        plunge.onended = () => release();
        plunge.start(now);
        plunge.stop(now + 0.92);
        debrisWash.start(now);
        debrisWash.stop(now + 0.92);
        this.stats.planetSoundsPlayed += 1;
        return true;
      }

      case 'ACCRETION_SURGE': {
        if (!this.activeLayers.plasma) return false;
        if (this.plasmaGraph) {
          const boostCutoff = Math.min(1800, p.plasmaBandpassHz * (1.35 + energy * 0.45));
          const boostGain = Math.min(0.92, p.plasmaGain * (1.22 + energy * 0.25));
          setParamAtTime(this.plasmaGraph.turbulenceFilter.frequency, boostCutoff, now);
          scheduleEnvelopePoint(
            this.plasmaGraph.turbulenceFilter.frequency,
            p.plasmaBandpassHz,
            now + 0.85,
            true
          );
          setParamAtTime(this.plasmaGraph.layerGain.gain, boostGain, now + 0.05);
          scheduleEnvelopePoint(this.plasmaGraph.layerGain.gain, p.plasmaGain, now + 0.9, false);
        }
        return true;
      }

      case 'COSMIC_DRIFT': {
        if (!this.activeLayers.drone) return false;
        if (this.droneGraph) {
          const driftCutoff = Math.min(480, p.droneFilterCutoffHz * 1.24);
          smoothAudioParam(this.droneGraph.lowpass.frequency, driftCutoff, now, 0.35);
          scheduleEnvelopePoint(
            this.droneGraph.lowpass.frequency,
            p.droneFilterCutoffHz,
            now + 1.4,
            true
          );
        }
        return true;
      }
    }
  }

  public disposeContinuousLayers(): void {
    const stopSafe = (node: { stop?: () => void; disconnect?: () => void } | null | undefined) => {
      if (!node) return;
      try {
        node.stop?.();
      } catch {
        // Ignore
      }
      try {
        node.disconnect?.();
      } catch {
        // Ignore
      }
    };

    if (this.droneGraph) {
      stopSafe(this.droneGraph.subOsc);
      stopSafe(this.droneGraph.fifthOsc);
      stopSafe(this.droneGraph.octaveOsc);
      stopSafe(this.droneGraph.warmTwelfthOsc);
      stopSafe(this.droneGraph.dissonantOsc);
      stopSafe(this.droneGraph.lfoOsc);
      stopSafe(this.droneGraph.noiseSource);
      this.droneGraph.octaveGain.disconnect();
      this.droneGraph.warmTwelfthGain.disconnect();
      this.droneGraph.dissonantGain.disconnect();
      this.droneGraph.lfoPitchGain.disconnect();
      this.droneGraph.lfoFilterGain.disconnect();
      this.droneGraph.lowpass.disconnect();
      this.droneGraph.noiseGain.disconnect();
      this.droneGraph.metallicFilter.disconnect();
      this.droneGraph.metallicGain.disconnect();
      this.droneGraph.reverbSend?.disconnect();
      this.droneGraph.layerGain.disconnect();
      this.droneGraph = null;
    }

    if (this.pressureGraph) {
      stopSafe(this.pressureGraph.pulseCarrier);
      stopSafe(this.pressureGraph.pulseLfo);
      stopSafe(this.pressureGraph.choirNoise);
      stopSafe(this.pressureGraph.choirCarrier);
      stopSafe(this.pressureGraph.tickSource);
      this.pressureGraph.pulseFilter.disconnect();
      this.pressureGraph.pulseLfoGain.disconnect();
      this.pressureGraph.choirCarrierGain.disconnect();
      this.pressureGraph.formantA.disconnect();
      this.pressureGraph.formantB.disconnect();
      this.pressureGraph.choirGain.disconnect();
      this.pressureGraph.tickFilter.disconnect();
      this.pressureGraph.tickGain.disconnect();
      this.pressureGraph.reverbSend?.disconnect();
      this.pressureGraph.layerGain.disconnect();
      this.pressureGraph = null;
    }

    if (this.plasmaGraph) {
      stopSafe(this.plasmaGraph.turbulenceSource);
      stopSafe(this.plasmaGraph.modLfo);
      stopSafe(this.plasmaGraph.crackleSource);
      stopSafe(this.plasmaGraph.harmonicOsc);
      stopSafe(this.plasmaGraph.panLfo);
      this.plasmaGraph.turbulenceFilter.disconnect();
      this.plasmaGraph.modLfoGain.disconnect();
      this.plasmaGraph.crackleFilter.disconnect();
      this.plasmaGraph.crackleGain.disconnect();
      this.plasmaGraph.harmonicGain.disconnect();
      this.plasmaGraph.panLfoGain.disconnect();
      this.plasmaGraph.stereoPanner?.disconnect();
      this.plasmaGraph.reverbSend?.disconnect();
      this.plasmaGraph.layerGain.disconnect();
      this.plasmaGraph = null;
    }

    if (this.approachGraph) {
      stopSafe(this.approachGraph.osc);
      this.approachGraph.filter.disconnect();
      this.approachGraph.gain.disconnect();
      this.approachGraph = null;
    }

    if (this.thinkingGraph) {
      stopSafe(this.thinkingGraph.oscA);
      stopSafe(this.thinkingGraph.oscB);
      stopSafe(this.thinkingGraph.lfo);
      this.thinkingGraph.lfoGain.disconnect();
      this.thinkingGraph.filter.disconnect();
      this.thinkingGraph.gain.disconnect();
      this.thinkingGraph = null;
    }

    this.isThinkingActive = false;
    this.currentApproachTension = 0;
    this.currentCelestialPressure = 0;
  }
}
