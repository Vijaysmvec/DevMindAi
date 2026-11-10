export type AudioPresetId =
  | 'DEEP_SPACE'
  | 'SINGULARITY'
  | 'COSMIC_STORM'
  | 'HIGH_INTENSITY'
  | 'CINEMATIC_HORROR';

export type AudioLayerKey =
  | 'drone'
  | 'gravitationalPressure'
  | 'plasma'
  | 'ingestion'
  | 'shockwave'
  | 'starConsumption'
  | 'planetConsumption'
  | 'ui';

export interface AudioLayerSettings {
  drone: boolean;
  gravitationalPressure: boolean;
  plasma: boolean;
  ingestion: boolean;
  shockwave: boolean;
  starConsumption: boolean;
  planetConsumption: boolean;
  ui: boolean;
}

export interface CosmicAudioPreferences {
  /** Audio stays OFF until explicitly enabled by the user. */
  enabled: boolean;
  /** Preserves user's immediate master mute state without destroying the engine. */
  muted: boolean;
  /** Master volume scalar in [0, 1]. Default: 0.80. */
  masterVolume: number;
  /** Active cosmic soundscape preset. Default: 'SINGULARITY'. */
  preset: AudioPresetId;
  /** Optional v2.4 Cinematic Audio Mode boost (deep organ/choir presence + wide dark reverb behind -4dB limiter). */
  cinematicAudioMode: boolean;
  /** Independent per-layer enablement toggles. */
  layers: AudioLayerSettings;
}

export const DEFAULT_AUDIO_LAYERS: AudioLayerSettings = {
  drone: true,
  gravitationalPressure: true,
  plasma: true,
  ingestion: true,
  shockwave: true,
  starConsumption: true,
  planetConsumption: true,
  ui: true,
};

export const DEFAULT_AUDIO_PREFERENCES: CosmicAudioPreferences = {
  enabled: false,
  muted: false,
  masterVolume: 0.8,
  preset: 'SINGULARITY',
  cinematicAudioMode: false,
  layers: { ...DEFAULT_AUDIO_LAYERS },
};

const STORAGE_PREFIX = 'devmind_cosmic_audio_v24';
const LEGACY_STORAGE_PREFIX = 'devmind_cosmic_audio_v23';

export function getAudioStorageKey(userId?: number | string | null): string {
  const scope =
    userId !== undefined && userId !== null && String(userId).trim() !== ''
      ? String(userId)
      : 'guest';
  return `${STORAGE_PREFIX}:${scope}`;
}

function getLegacyAudioStorageKey(userId?: number | string | null): string {
  const scope =
    userId !== undefined && userId !== null && String(userId).trim() !== ''
      ? String(userId)
      : 'guest';
  return `${LEGACY_STORAGE_PREFIX}:${scope}`;
}

export function isValidPresetId(value: unknown): value is AudioPresetId {
  return (
    value === 'DEEP_SPACE' ||
    value === 'SINGULARITY' ||
    value === 'COSMIC_STORM' ||
    value === 'HIGH_INTENSITY' ||
    value === 'CINEMATIC_HORROR'
  );
}

export function clampVolume(
  value: unknown,
  fallback = DEFAULT_AUDIO_PREFERENCES.masterVolume
): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(1, Math.max(0, Number(num.toFixed(3))));
}

export function sanitizeAudioPreferences(
  raw: Partial<CosmicAudioPreferences> | null | undefined,
  base: CosmicAudioPreferences = DEFAULT_AUDIO_PREFERENCES
): CosmicAudioPreferences {
  if (!raw || typeof raw !== 'object') {
    return {
      ...base,
      layers: { ...base.layers },
    };
  }

  const rawLayers: Partial<AudioLayerSettings> =
    raw.layers && typeof raw.layers === 'object' ? raw.layers : {};

  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : base.enabled,
    muted: typeof raw.muted === 'boolean' ? raw.muted : base.muted,
    masterVolume:
      raw.masterVolume !== undefined
        ? clampVolume(raw.masterVolume, base.masterVolume)
        : base.masterVolume,
    preset: isValidPresetId(raw.preset) ? raw.preset : base.preset,
    cinematicAudioMode:
      typeof raw.cinematicAudioMode === 'boolean'
        ? raw.cinematicAudioMode
        : base.cinematicAudioMode,
    layers: {
      drone: typeof rawLayers.drone === 'boolean' ? rawLayers.drone : base.layers.drone,
      gravitationalPressure:
        typeof rawLayers.gravitationalPressure === 'boolean'
          ? rawLayers.gravitationalPressure
          : base.layers.gravitationalPressure,
      plasma: typeof rawLayers.plasma === 'boolean' ? rawLayers.plasma : base.layers.plasma,
      ingestion:
        typeof rawLayers.ingestion === 'boolean' ? rawLayers.ingestion : base.layers.ingestion,
      shockwave:
        typeof rawLayers.shockwave === 'boolean' ? rawLayers.shockwave : base.layers.shockwave,
      starConsumption:
        typeof rawLayers.starConsumption === 'boolean'
          ? rawLayers.starConsumption
          : base.layers.starConsumption,
      planetConsumption:
        typeof rawLayers.planetConsumption === 'boolean'
          ? rawLayers.planetConsumption
          : base.layers.planetConsumption,
      ui: typeof rawLayers.ui === 'boolean' ? rawLayers.ui : base.layers.ui,
    },
  };
}

export function loadUserAudioPreferences(
  userId?: number | string | null
): CosmicAudioPreferences {
  if (typeof window === 'undefined' || !window.localStorage) {
    return sanitizeAudioPreferences(null);
  }

  try {
    const stored =
      window.localStorage.getItem(getAudioStorageKey(userId)) ??
      window.localStorage.getItem(getLegacyAudioStorageKey(userId));
    if (!stored) {
      return sanitizeAudioPreferences(null);
    }
    const parsed = JSON.parse(stored) as Partial<CosmicAudioPreferences>;
    return sanitizeAudioPreferences(parsed);
  } catch {
    return sanitizeAudioPreferences(null);
  }
}

export function saveUserAudioPreferences(
  prefs: CosmicAudioPreferences,
  userId?: number | string | null
): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const clean = sanitizeAudioPreferences(prefs);
    window.localStorage.setItem(getAudioStorageKey(userId), JSON.stringify(clean));
  } catch {
    // Ignore storage quota or private-mode exceptions gracefully
  }
}
