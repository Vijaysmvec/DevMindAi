import { AudioPresetId } from './AudioSettings';

export interface AudioPresetProfile {
  id: AudioPresetId;
  label: string;
  badge?: string;
  description: string;

  // Layer A — The Void (Deep Cosmic Organ & Sub-Gravitational Drone)
  droneGain: number;
  droneFundamentalHz: number;
  droneHarmonicRatio: number;
  droneSubOctaveMix: number;
  droneFilterCutoffHz: number;
  droneFilterQ: number;
  droneLfoRateHz: number;
  droneFmDepthHz: number;
  droneNoiseGain: number;
  droneMetallicHz: number;
  droneMetallicGain: number;
  organDissonantRatio: number;
  organDissonantGain: number;

  // Layer B — Gravitational Pressure (Pulsing Tension, Distant Choir Formants & Horizon Ticks)
  pressureGain: number;
  pressurePulseRateHz: number;
  choirFormantGain: number;
  horizonTickGain: number;
  reverbSendGain: number;

  // Layer C — Accretion Storm (Swirling Plasma Ambience)
  plasmaGain: number;
  plasmaBandpassHz: number;
  plasmaBandpassQ: number;
  plasmaModRateHz: number;
  plasmaModDepthHz: number;
  plasmaCrackleGain: number;
  plasmaHarmonicHz: number;
  plasmaHarmonicGain: number;
  plasmaStereoRateHz: number;
  plasmaStereoWidth: number;

  // Layer C — Gravitational Ingestion (Particle Pull)
  ingestionGain: number;
  approachMaxGain: number;
  ingestionPullStartHz: number;
  ingestionPullPeakHz: number;
  ingestionHorizonFloorHz: number;
  crystallineChimeHz: number;

  // Layer D — Singularity Shockwave (Cinematic Energy Pulse)
  shockwaveGain: number;
  shockwaveImpactStartHz: number;
  shockwaveImpactEndHz: number;
  shockwaveResonanceHz: number;
  shockwaveSweepPeakHz: number;
  shockwaveTailSeconds: number;

  // Celestial Devourer Layers (v2.3 Star & Planet Capture/Destruction)
  starDestructionGain: number;
  planetIngestionGain: number;

  // Application / UI Interaction Reactivity (kept subtler than cosmic layers)
  uiGain: number;
  thinkingPadGain: number;
}

export const AUDIO_PRESETS: Record<AudioPresetId, AudioPresetProfile> = {
  DEEP_SPACE: {
    id: 'DEEP_SPACE',
    label: 'Deep Space',
    description: 'Rich atmospheric horizon drone, warm gas flow, calm celestial capture.',

    droneGain: 0.68,
    droneFundamentalHz: 41.2,
    droneHarmonicRatio: 1.498,
    droneSubOctaveMix: 0.52,
    droneFilterCutoffHz: 215,
    droneFilterQ: 1.25,
    droneLfoRateHz: 0.052,
    droneFmDepthHz: 1.05,
    droneNoiseGain: 0.34,
    droneMetallicHz: 233.08,
    droneMetallicGain: 0.055,
    organDissonantRatio: 2.12,
    organDissonantGain: 0.035,

    pressureGain: 0.22,
    pressurePulseRateHz: 0.28,
    choirFormantGain: 0.14,
    horizonTickGain: 0.05,
    reverbSendGain: 0.34,

    plasmaGain: 0.36,
    plasmaBandpassHz: 460,
    plasmaBandpassQ: 1.3,
    plasmaModRateHz: 0.065,
    plasmaModDepthHz: 130,
    plasmaCrackleGain: 0.08,
    plasmaHarmonicHz: 466.16,
    plasmaHarmonicGain: 0.04,
    plasmaStereoRateHz: 0.055,
    plasmaStereoWidth: 0.5,

    ingestionGain: 0.65,
    approachMaxGain: 0.18,
    ingestionPullStartHz: 145,
    ingestionPullPeakHz: 260,
    ingestionHorizonFloorHz: 42,
    crystallineChimeHz: 1046.5,

    shockwaveGain: 0.72,
    shockwaveImpactStartHz: 54,
    shockwaveImpactEndHz: 29,
    shockwaveResonanceHz: 174.61,
    shockwaveSweepPeakHz: 780,
    shockwaveTailSeconds: 1.26,

    starDestructionGain: 0.74,
    planetIngestionGain: 0.68,

    uiGain: 0.18,
    thinkingPadGain: 0.085,
  },

  SINGULARITY: {
    id: 'SINGULARITY',
    label: 'Singularity',
    badge: 'Recommended',
    description: 'Audible gravitational drone, swirling gas rings, powerful star & shockwave impacts.',

    droneGain: 0.75,
    droneFundamentalHz: 43.65,
    droneHarmonicRatio: 1.498,
    droneSubOctaveMix: 0.62,
    droneFilterCutoffHz: 265,
    droneFilterQ: 1.45,
    droneLfoRateHz: 0.088,
    droneFmDepthHz: 1.65,
    droneNoiseGain: 0.42,
    droneMetallicHz: 246.94,
    droneMetallicGain: 0.078,
    organDissonantRatio: 2.118,
    organDissonantGain: 0.065,

    pressureGain: 0.34,
    pressurePulseRateHz: 0.38,
    choirFormantGain: 0.22,
    horizonTickGain: 0.09,
    reverbSendGain: 0.42,

    plasmaGain: 0.55,
    plasmaBandpassHz: 620,
    plasmaBandpassQ: 1.5,
    plasmaModRateHz: 0.12,
    plasmaModDepthHz: 210,
    plasmaCrackleGain: 0.15,
    plasmaHarmonicHz: 523.25,
    plasmaHarmonicGain: 0.062,
    plasmaStereoRateHz: 0.095,
    plasmaStereoWidth: 0.7,

    ingestionGain: 0.85,
    approachMaxGain: 0.28,
    ingestionPullStartHz: 160,
    ingestionPullPeakHz: 320,
    ingestionHorizonFloorHz: 44,
    crystallineChimeHz: 1244.5,

    shockwaveGain: 0.9,
    shockwaveImpactStartHz: 62,
    shockwaveImpactEndHz: 28,
    shockwaveResonanceHz: 196.0,
    shockwaveSweepPeakHz: 980,
    shockwaveTailSeconds: 1.3,

    starDestructionGain: 0.9,
    planetIngestionGain: 0.85,

    uiGain: 0.24,
    thinkingPadGain: 0.11,
  },

  COSMIC_STORM: {
    id: 'COSMIC_STORM',
    label: 'Cosmic Storm',
    description: 'Turbulent accretion gas, rapid relativistic modulation, intense horizon capture.',

    droneGain: 0.82,
    droneFundamentalHz: 46.25,
    droneHarmonicRatio: 1.5,
    droneSubOctaveMix: 0.68,
    droneFilterCutoffHz: 310,
    droneFilterQ: 1.75,
    droneLfoRateHz: 0.165,
    droneFmDepthHz: 2.6,
    droneNoiseGain: 0.48,
    droneMetallicHz: 261.63,
    droneMetallicGain: 0.095,
    organDissonantRatio: 2.13,
    organDissonantGain: 0.085,

    pressureGain: 0.4,
    pressurePulseRateHz: 0.52,
    choirFormantGain: 0.24,
    horizonTickGain: 0.12,
    reverbSendGain: 0.44,

    plasmaGain: 0.65,
    plasmaBandpassHz: 820,
    plasmaBandpassQ: 1.75,
    plasmaModRateHz: 0.21,
    plasmaModDepthHz: 320,
    plasmaCrackleGain: 0.22,
    plasmaHarmonicHz: 587.33,
    plasmaHarmonicGain: 0.08,
    plasmaStereoRateHz: 0.16,
    plasmaStereoWidth: 0.85,

    ingestionGain: 0.9,
    approachMaxGain: 0.34,
    ingestionPullStartHz: 175,
    ingestionPullPeakHz: 370,
    ingestionHorizonFloorHz: 41,
    crystallineChimeHz: 1396.9,

    shockwaveGain: 0.94,
    shockwaveImpactStartHz: 68,
    shockwaveImpactEndHz: 27,
    shockwaveResonanceHz: 220.0,
    shockwaveSweepPeakHz: 1280,
    shockwaveTailSeconds: 1.36,

    starDestructionGain: 0.94,
    planetIngestionGain: 0.9,

    uiGain: 0.27,
    thinkingPadGain: 0.13,
  },

  HIGH_INTENSITY: {
    id: 'HIGH_INTENSITY',
    label: 'High Intensity',
    badge: 'Max Presence',
    description: 'Theater-grade gravitational bass, roaring plasma rings & seismic stellar collapse.',

    droneGain: 0.88,
    droneFundamentalHz: 48.99, // G1 strong speaker-audible sub-bass anchor
    droneHarmonicRatio: 1.5,
    droneSubOctaveMix: 0.78,
    droneFilterCutoffHz: 360,
    droneFilterQ: 1.85,
    droneLfoRateHz: 0.14,
    droneFmDepthHz: 2.9,
    droneNoiseGain: 0.56,
    droneMetallicHz: 293.66,
    droneMetallicGain: 0.115,
    organDissonantRatio: 2.125,
    organDissonantGain: 0.1,

    pressureGain: 0.46,
    pressurePulseRateHz: 0.58,
    choirFormantGain: 0.28,
    horizonTickGain: 0.14,
    reverbSendGain: 0.48,

    plasmaGain: 0.72,
    plasmaBandpassHz: 760,
    plasmaBandpassQ: 1.45,
    plasmaModRateHz: 0.18,
    plasmaModDepthHz: 340,
    plasmaCrackleGain: 0.26,
    plasmaHarmonicHz: 659.25,
    plasmaHarmonicGain: 0.095,
    plasmaStereoRateHz: 0.14,
    plasmaStereoWidth: 0.9,

    ingestionGain: 0.96,
    approachMaxGain: 0.4,
    ingestionPullStartHz: 185,
    ingestionPullPeakHz: 410,
    ingestionHorizonFloorHz: 39,
    crystallineChimeHz: 1479.98,

    shockwaveGain: 0.98,
    shockwaveImpactStartHz: 74,
    shockwaveImpactEndHz: 26,
    shockwaveResonanceHz: 246.94,
    shockwaveSweepPeakHz: 1420,
    shockwaveTailSeconds: 1.42,

    starDestructionGain: 0.98,
    planetIngestionGain: 0.94,

    uiGain: 0.3,
    thinkingPadGain: 0.15,
  },

  CINEMATIC_HORROR: {
    id: 'CINEMATIC_HORROR',
    label: 'Cinematic Horror',
    badge: 'Apocalypse',
    description:
      'Original cosmic horror dread: massive synthetic organ tones, distant formant choir, horizon ticks & colossal TDE collapse.',

    // Balanced mix: Void dominant, Pressure & Accretion moderate, Destruction powerful, UI restrained
    droneGain: 0.86,
    droneFundamentalHz: 36.71, // Deep D1 void anchor
    droneHarmonicRatio: 1.498,
    droneSubOctaveMix: 0.74,
    droneFilterCutoffHz: 285,
    droneFilterQ: 1.65,
    droneLfoRateHz: 0.068,
    droneFmDepthHz: 1.9,
    droneNoiseGain: 0.46,
    droneMetallicHz: 220.0,
    droneMetallicGain: 0.11,
    organDissonantRatio: 2.118, // Subtle minor-ninth dark organ tension harmonic
    organDissonantGain: 0.145,

    pressureGain: 0.44,
    pressurePulseRateHz: 0.44,
    choirFormantGain: 0.34,
    horizonTickGain: 0.16,
    reverbSendGain: 0.56,

    plasmaGain: 0.48,
    plasmaBandpassHz: 560,
    plasmaBandpassQ: 1.6,
    plasmaModRateHz: 0.095,
    plasmaModDepthHz: 215,
    plasmaCrackleGain: 0.14,
    plasmaHarmonicHz: 440.0,
    plasmaHarmonicGain: 0.065,
    plasmaStereoRateHz: 0.08,
    plasmaStereoWidth: 0.82,

    ingestionGain: 0.88,
    approachMaxGain: 0.32,
    ingestionPullStartHz: 152,
    ingestionPullPeakHz: 310,
    ingestionHorizonFloorHz: 37,
    crystallineChimeHz: 1174.66,

    shockwaveGain: 0.94,
    shockwaveImpactStartHz: 65,
    shockwaveImpactEndHz: 26,
    shockwaveResonanceHz: 185.0,
    shockwaveSweepPeakHz: 1080,
    shockwaveTailSeconds: 1.45,

    starDestructionGain: 0.96,
    planetIngestionGain: 0.91,

    uiGain: 0.16,
    thinkingPadGain: 0.09,
  },
};

export const AUDIO_PRESET_LIST: AudioPresetProfile[] = [
  AUDIO_PRESETS.DEEP_SPACE,
  AUDIO_PRESETS.SINGULARITY,
  AUDIO_PRESETS.COSMIC_STORM,
  AUDIO_PRESETS.HIGH_INTENSITY,
  AUDIO_PRESETS.CINEMATIC_HORROR,
];
