import {
  CelestialBodyFactory,
  CelestialPlanet,
  CelestialStar,
  PlanetType,
  StarLifecycleState,
} from './CelestialBodyFactory';
import { cosmicEngine } from './cosmicEngine';
import {
  computeGravitationalAcceleration,
  DEFAULT_GRAVITATIONAL_PARAMS,
  evaluateTidalForces,
  TidalEvaluation,
  Vec3Mutable,
} from './GravitationalField';

export type CosmicDevourerEventType =
  | 'STAR_APPROACH'
  | 'STAR_CAPTURED'
  | 'STAR_TIDAL_STRETCH'
  | 'STAR_TIDAL_DISRUPTION'
  | 'STAR_DISRUPTION'
  | 'STAR_DEBRIS_STREAM'
  | 'STAR_ACCRETION'
  | 'STAR_CONSUMED'
  | 'PLANET_CAPTURED'
  | 'PLANET_FRAGMENTED'
  | 'PLANET_FRAGMENTATION'
  | 'PLANET_ACCRETION'
  | 'PLANET_CONSUMED'
  | 'ACCRETION_SURGE'
  | 'COSMIC_DRIFT';

export interface CosmicDevourerEvent {
  eventId: string; // Strictly unique (e.g. "star-1:STAR_DISRUPTION")
  objectId: string;
  type: CosmicDevourerEventType;
  intensity: number;
  position: { x: number; y: number; z: number };
  timestampMs: number;
}

export type SimulationQualityPreset = 'performance' | 'balanced' | 'cinematic';

export interface CosmicDevourerSettings {
  qualityPreset: SimulationQualityPreset;
  cosmicDriftEnabled: boolean;
  starGenerationEnabled: boolean;
  planetGenerationEnabled: boolean;
  starCaptureIntensity: number; // 0.2 .. 2.0
  planetCaptureIntensity: number; // 0.2 .. 2.0
  accretionDensity: number; // 0.3 .. 2.0
  gasThickness: number; // 0.3 .. 2.0
  simulationSpeed: number; // 0.25 .. 2.0
  disruptionDurationScale: number; // 0.5 .. 2.5 configurable TDE event timeline
  stableCameraMode: boolean; // Phase 6 stable viewing mode
  starRespawnDelaySec: number; // 0.4 .. 10.0
  maxCelestialObjects: number; // 1 .. 8 total concurrent stars + planets
}

export const DEFAULT_DEVOURER_SETTINGS: CosmicDevourerSettings = {
  qualityPreset: 'cinematic',
  cosmicDriftEnabled: true,
  starGenerationEnabled: true,
  planetGenerationEnabled: true,
  starCaptureIntensity: 1.0,
  planetCaptureIntensity: 1.0,
  accretionDensity: 1.4,
  gasThickness: 1.4,
  simulationSpeed: 1.0,
  disruptionDurationScale: 1.0,
  stableCameraMode: false,
  starRespawnDelaySec: 1.8,
  maxCelestialObjects: 5,
};

const DEVOURER_STORAGE_PREFIX = 'devmind_cosmic_devourer_v24';
const LEGACY_DEVOURER_STORAGE_PREFIX = 'devmind_cosmic_devourer_v23';

export function loadDevourerSettings(userId?: number | string | null): CosmicDevourerSettings {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { ...DEFAULT_DEVOURER_SETTINGS };
  }
  try {
    const scope =
      userId !== undefined && userId !== null && String(userId).trim() !== ''
        ? String(userId)
        : 'guest';
    const raw =
      window.localStorage.getItem(`${DEVOURER_STORAGE_PREFIX}:${scope}`) ??
      window.localStorage.getItem(`${LEGACY_DEVOURER_STORAGE_PREFIX}:${scope}`);
    if (!raw) return { ...DEFAULT_DEVOURER_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<CosmicDevourerSettings>;
    return sanitizeDevourerSettings(parsed);
  } catch {
    return { ...DEFAULT_DEVOURER_SETTINGS };
  }
}

export function saveDevourerSettings(
  settings: CosmicDevourerSettings,
  userId?: number | string | null
): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const scope =
      userId !== undefined && userId !== null && String(userId).trim() !== ''
        ? String(userId)
        : 'guest';
    window.localStorage.setItem(
      `${DEVOURER_STORAGE_PREFIX}:${scope}`,
      JSON.stringify(sanitizeDevourerSettings(settings))
    );
  } catch {
    // Ignore storage quota errors
  }
}

export function sanitizeDevourerSettings(
  partial: Partial<CosmicDevourerSettings> | null | undefined,
  base: CosmicDevourerSettings = DEFAULT_DEVOURER_SETTINGS
): CosmicDevourerSettings {
  if (!partial || typeof partial !== 'object') return { ...base };
  const clamp = (val: unknown, lo: number, hi: number, fallback: number) => {
    const n = typeof val === 'number' ? val : Number(val);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
  };
  const validPreset = (v: unknown): v is SimulationQualityPreset =>
    v === 'performance' || v === 'balanced' || v === 'cinematic';

  return {
    qualityPreset: validPreset(partial.qualityPreset) ? partial.qualityPreset : base.qualityPreset,
    cosmicDriftEnabled:
      typeof partial.cosmicDriftEnabled === 'boolean'
        ? partial.cosmicDriftEnabled
        : base.cosmicDriftEnabled,
    starGenerationEnabled:
      typeof partial.starGenerationEnabled === 'boolean'
        ? partial.starGenerationEnabled
        : base.starGenerationEnabled,
    planetGenerationEnabled:
      typeof partial.planetGenerationEnabled === 'boolean'
        ? partial.planetGenerationEnabled
        : base.planetGenerationEnabled,
    starCaptureIntensity: clamp(
      partial.starCaptureIntensity,
      0.2,
      2.0,
      base.starCaptureIntensity
    ),
    planetCaptureIntensity: clamp(
      partial.planetCaptureIntensity,
      0.2,
      2.0,
      base.planetCaptureIntensity
    ),
    accretionDensity: clamp(partial.accretionDensity, 0.3, 2.0, base.accretionDensity),
    gasThickness: clamp(partial.gasThickness, 0.3, 2.0, base.gasThickness),
    simulationSpeed: clamp(partial.simulationSpeed, 0.25, 2.0, base.simulationSpeed),
    disruptionDurationScale: clamp(
      partial.disruptionDurationScale,
      0.5,
      2.5,
      base.disruptionDurationScale
    ),
    stableCameraMode:
      typeof partial.stableCameraMode === 'boolean'
        ? partial.stableCameraMode
        : base.stableCameraMode,
    starRespawnDelaySec: clamp(
      partial.starRespawnDelaySec,
      0.4,
      10.0,
      base.starRespawnDelaySec
    ),
    maxCelestialObjects: Math.round(
      clamp(partial.maxCelestialObjects, 1, 8, base.maxCelestialObjects)
    ),
  };
}

export type TidalParticleRole = 'bound' | 'outflow' | 'shock';

export interface PooledTidalParticle {
  active: boolean;
  role: TidalParticleRole;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  r: number;
  g: number;
  b: number;
}

export interface PooledPlanetBoulder {
  active: boolean;
  ejected: boolean;
  planetType: PlanetType;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  spin: number;
  life: number;
  maxLife: number;
  size: number;
  aspectX: number;
  aspectY: number;
  aspectZ: number;
  collisionCooldown: number;
  r: number;
  g: number;
  b: number;
}

export interface PooledPlanetFragment {
  active: boolean;
  ejected: boolean;
  planetType: PlanetType;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  spin: number;
  life: number;
  maxLife: number;
  size: number;
  r: number;
  g: number;
  b: number;
}

export interface PooledCollisionShock {
  active: boolean;
  x: number;
  y: number;
  z: number;
  life: number;
  maxLife: number;
  radius: number;
  intensity: number;
  r: number;
  g: number;
  b: number;
}

const FIXED_PHYSICS_DT = 1 / 120;
const MAX_SUBSTEPS_PER_FRAME = 8;
const MAX_EMITTED_EVENT_MEMORY = 2048;

export const BLACK_HOLE_SHADOW_RADIUS = 1.15;
export const MAX_TIDAL_STREAM_PARTICLES = 480;
export const MAX_PLANET_BOULDERS = 48;
export const MAX_PLANET_DEBRIS_FRAGMENTS = 260;
export const MAX_COLLISION_SHOCKS = 12;

function hexToRgbNormalized(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  if (!Number.isFinite(num)) return [1, 0.75, 0.35];
  return [((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255];
}

const STAR_STATE_ORDER: Record<StarLifecycleState, number> = {
  SPAWNING: 0,
  STABLE: 1,
  GRAVITATIONALLY_ATTRACTED: 2,
  ORBITAL_CAPTURE: 3,
  TIDAL_DISRUPTION: 4,
  ENERGY_DEPLETION: 5,
  FINAL_CONSUMPTION: 6,
  DISAPPEARANCE: 7,
};

/**
 * Orchestrates Black-Hole Cosmic Drift, True 6-Stage Stellar Tidal Disruption (Spaghettification,
 * Fallback Self-Collision Shock & Unbound Outflow), Type-Specific Planetary Fragmentation &
 * Boulder Collisions, Event-Horizon Shadow Ingestion, and 120Hz Fixed-Substep Physics.
 */
export class CosmicSimulationManager {
  public settings: CosmicDevourerSettings = { ...DEFAULT_DEVOURER_SETTINGS };
  public readonly factory: CelestialBodyFactory;

  public stars: CelestialStar[] = [];
  public planets: CelestialPlanet[] = [];
  public readonly tidalPool: PooledTidalParticle[] = [];
  public readonly boulderPool: PooledPlanetBoulder[] = [];
  public readonly fragmentPool: PooledPlanetFragment[] = [];
  public readonly shockPool: PooledCollisionShock[] = [];

  private tidalCursor = 0;
  private boulderCursor = 0;
  private fragmentCursor = 0;
  private shockCursor = 0;

  // Black-Hole Cosmic Drift & Accretion Response state
  public driftOffset = { x: 0, y: 0, z: 0 };
  public driftVelocity = { x: 0.34, y: 0.04, z: -0.62 };
  public bhWorldAnchor = { x: 0.45, y: 0.12, z: 0 };
  public accretionSurge = 0; // 0..1 global disk turbulence & glow response
  public horizonIngestionFlash = 0; // 0..1 brightness flare near Photon Ring as streams vanish behind shadow
  public streamImpactAzimuth = -2.4; // Local disk brightening angle where disrupted stream joins disk
  public gravitationalTension = 0; // 0..1 continuous proximity pressure for Layer B audio

  // Pacing & spawning timers
  public simTime = 0;
  private accumulator = 0;
  private smoothedDt = 1 / 60;
  private nextStarSpawnInSec = 0.45;
  private nextPlanetSpawnInSec = 1.55;
  private lastSurgeEventAtSim = -10;
  private lastDriftEventAtSim = -20;
  private horizonPulseCooldown = 0;

  // Telemetry counters
  public totalStarsSpawned = 0;
  public totalStarsConsumed = 0;
  public totalPlanetsSpawned = 0;
  public totalPlanetsConsumed = 0;
  public totalOutflowParticlesEmitted = 0;
  public totalBoulderCollisions = 0;

  // Deduplicated event bus
  private emittedEventSet = new Set<string>();
  private emittedEventOrder: string[] = [];
  private eventListeners = new Set<(evt: CosmicDevourerEvent) => void>();
  private settingsListeners = new Set<(settings: CosmicDevourerSettings) => void>();

  // Reusable scratch objects (zero per-frame heap allocations)
  private scratchAccel: Vec3Mutable = { x: 0, y: 0, z: 0 };
  private scratchTidal: TidalEvaluation = {
    distance: 10,
    toCenterX: 1,
    toCenterY: 0,
    toCenterZ: 0,
    tidalStretch: 0,
    rocheShear: 0,
  };

  constructor(options?: { customRng?: () => number }) {
    this.factory = new CelestialBodyFactory(options?.customRng);

    for (let i = 0; i < MAX_TIDAL_STREAM_PARTICLES; i += 1) {
      this.tidalPool.push({
        active: false,
        role: 'bound',
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1,
        size: 0.03,
        r: 1,
        g: 0.8,
        b: 0.4,
      });
    }

    for (let i = 0; i < MAX_PLANET_BOULDERS; i += 1) {
      this.boulderPool.push({
        active: false,
        ejected: false,
        planetType: 'rocky',
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        rotX: 0,
        rotY: 0,
        rotZ: 0,
        spin: 1.5,
        life: 0,
        maxLife: 1,
        size: 0.035,
        aspectX: 1.3,
        aspectY: 0.8,
        aspectZ: 1.0,
        collisionCooldown: 0,
        r: 0.8,
        g: 0.5,
        b: 0.3,
      });
    }

    for (let i = 0; i < MAX_PLANET_DEBRIS_FRAGMENTS; i += 1) {
      this.fragmentPool.push({
        active: false,
        ejected: false,
        planetType: 'rocky',
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        rotX: 0,
        rotY: 0,
        rotZ: 0,
        spin: 2,
        life: 0,
        maxLife: 1,
        size: 0.02,
        r: 0.8,
        g: 0.5,
        b: 0.3,
      });
    }

    for (let i = 0; i < MAX_COLLISION_SHOCKS; i += 1) {
      this.shockPool.push({
        active: false,
        x: 0,
        y: 0,
        z: 0,
        life: 0,
        maxLife: 0.55,
        radius: 0.18,
        intensity: 0.8,
        r: 1.0,
        g: 0.78,
        b: 0.42,
      });
    }
  }

  public onEvent(listener: (evt: CosmicDevourerEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  public subscribeSettings(listener: (settings: CosmicDevourerSettings) => void): () => void {
    this.settingsListeners.add(listener);
    return () => {
      this.settingsListeners.delete(listener);
    };
  }

  public updateSettings(
    partial: Partial<CosmicDevourerSettings>,
    userId?: number | string | null
  ): CosmicDevourerSettings {
    this.settings = sanitizeDevourerSettings(partial, this.settings);
    saveDevourerSettings(this.settings, userId);
    for (const listener of this.settingsListeners) {
      listener({ ...this.settings });
    }
    return { ...this.settings };
  }

  public hydrateForUser(userId?: number | string | null): CosmicDevourerSettings {
    this.settings = loadDevourerSettings(userId);
    for (const listener of this.settingsListeners) {
      listener({ ...this.settings });
    }
    return { ...this.settings };
  }

  public getQualityBudgetScale(): number {
    if (cosmicEngine.isSoftwareRenderer) return 0.42;
    if (this.settings.qualityPreset === 'performance') return 0.42;
    if (this.settings.qualityPreset === 'balanced') return 0.72;
    return 1.0;
  }

  private emitUniqueEvent(
    uniqueScopeId: string,
    objectId: string,
    type: CosmicDevourerEventType,
    intensity: number,
    position: { x: number; y: number; z: number }
  ): boolean {
    const eventId = `${uniqueScopeId}:${type}`;
    if (this.emittedEventSet.has(eventId)) {
      return false;
    }

    this.emittedEventSet.add(eventId);
    this.emittedEventOrder.push(eventId);
    if (this.emittedEventOrder.length > MAX_EMITTED_EVENT_MEMORY) {
      const oldest = this.emittedEventOrder.shift();
      if (oldest) this.emittedEventSet.delete(oldest);
    }

    const evt: CosmicDevourerEvent = {
      eventId,
      objectId,
      type,
      intensity: Math.min(1, Math.max(0.05, intensity)),
      position: {
        x: Number(position.x.toFixed(3)),
        y: Number(position.y.toFixed(3)),
        z: Number(position.z.toFixed(3)),
      },
      timestampMs: typeof performance !== 'undefined' ? Math.round(performance.now()) : Date.now(),
    };

    for (const listener of this.eventListeners) {
      listener(evt);
    }
    return true;
  }

  private advanceStarState(star: CelestialStar, next: StarLifecycleState): void {
    if (STAR_STATE_ORDER[next] <= STAR_STATE_ORDER[star.state]) return;

    const allStates: StarLifecycleState[] = [
      'SPAWNING',
      'STABLE',
      'GRAVITATIONALLY_ATTRACTED',
      'ORBITAL_CAPTURE',
      'TIDAL_DISRUPTION',
      'ENERGY_DEPLETION',
      'FINAL_CONSUMPTION',
      'DISAPPEARANCE',
    ];
    const startIdx = STAR_STATE_ORDER[star.state] + 1;
    const targetIdx = STAR_STATE_ORDER[next];
    for (let idx = startIdx; idx <= targetIdx; idx += 1) {
      const st = allStates[idx];
      star.state = st;
      if (!star.visitedStates.includes(st)) {
        star.visitedStates.push(st);
      }

      if (st === 'GRAVITATIONALLY_ATTRACTED') {
        this.emitUniqueEvent(star.id, star.id, 'STAR_APPROACH', 0.58, star);
      } else if (st === 'ORBITAL_CAPTURE') {
        this.emitUniqueEvent(star.id, star.id, 'STAR_CAPTURED', 0.76, star);
      } else if (st === 'TIDAL_DISRUPTION') {
        star.disruptionFlash = Math.max(star.disruptionFlash, 0.85);
        this.emitUniqueEvent(star.id, star.id, 'STAR_TIDAL_DISRUPTION', 0.88, star);
      } else if (st === 'ENERGY_DEPLETION') {
        this.emitUniqueEvent(star.id, star.id, 'STAR_DEBRIS_STREAM', 0.84, star);
      } else if (st === 'FINAL_CONSUMPTION') {
        star.disruptionFlash = 1.0;
        this.horizonIngestionFlash = 1.0;
        this.emitUniqueEvent(star.id, star.id, 'STAR_CONSUMED', 0.96, star);
        // Synchronize with visual shockwave & localized accretion energy pulse
        cosmicEngine.registerParticleIngestion({
          particleId: `celestial-${star.id}`,
          particleType: 'inner_plasma',
          entryPosition: {
            x: cosmicEngine.blackHoleScreenX,
            y: cosmicEngine.blackHoleScreenY,
          },
          energyIntensity: 0.94,
          source: 'ambient_infall',
        });
      }
    }
  }

  /**
   * Advances simulation with exponential delta-smoothing + 120Hz fixed-timestep substeps
   * + linear state interpolation for butter-smooth visual motion across all refresh rates.
   */
  public step(rawDt: number, forceExactDt = false): void {
    if (cosmicEngine.isPageHidden && !forceExactDt) return;
    if (
      (cosmicEngine.preferences.reduced_motion || !cosmicEngine.preferences.background_animation) &&
      !forceExactDt
    ) {
      return;
    }

    const clampedDt = Math.min(Math.max(0, rawDt), 0.1);
    if (clampedDt <= 0) return;

    if (forceExactDt) {
      this.smoothedDt = clampedDt;
    } else {
      this.smoothedDt += (clampedDt - this.smoothedDt) * 0.28;
    }

    const scaledDt = this.smoothedDt * this.settings.simulationSpeed;
    this.accumulator += scaledDt;

    let substeps = 0;
    while (this.accumulator >= FIXED_PHYSICS_DT && substeps < MAX_SUBSTEPS_PER_FRAME) {
      this.stepFixed(FIXED_PHYSICS_DT);
      this.accumulator -= FIXED_PHYSICS_DT;
      substeps += 1;
    }

    if (this.accumulator > FIXED_PHYSICS_DT * 2) {
      this.accumulator = this.accumulator % FIXED_PHYSICS_DT;
    }

    const alpha = Math.min(1, Math.max(0, this.accumulator / FIXED_PHYSICS_DT));
    this.interpolateRenderStates(alpha);
  }

  private stepFixed(dt: number): void {
    this.simTime += dt;
    this.horizonPulseCooldown = Math.max(0, this.horizonPulseCooldown - dt);

    // 1. Continuous Black-Hole Cosmic Drift through deep space
    if (this.settings.cosmicDriftEnabled) {
      const t = this.simTime;
      this.driftVelocity.x = 0.32 + Math.sin(t * 0.11) * 0.22;
      this.driftVelocity.y = Math.cos(t * 0.085) * 0.09;
      this.driftVelocity.z = -0.68 - Math.cos(t * 0.07) * 0.18;

      this.driftOffset.x += this.driftVelocity.x * dt;
      this.driftOffset.y += this.driftVelocity.y * dt;
      this.driftOffset.z += this.driftVelocity.z * dt;

      this.bhWorldAnchor.x = 0.45 + Math.sin(t * 0.14) * 0.22;
      this.bhWorldAnchor.y = 0.12 + Math.cos(t * 0.105) * 0.12;
      this.bhWorldAnchor.z = Math.sin(t * 0.08) * 0.18;

      if (this.simTime - this.lastDriftEventAtSim >= 14.0) {
        this.lastDriftEventAtSim = this.simTime;
        this.emitUniqueEvent(
          `drift-${Math.floor(this.simTime)}`,
          'black-hole',
          'COSMIC_DRIFT',
          0.35,
          this.bhWorldAnchor
        );
      }
    } else {
      this.driftVelocity.x = 0;
      this.driftVelocity.y = 0;
      this.driftVelocity.z = 0;
      this.bhWorldAnchor.x += (0.45 - this.bhWorldAnchor.x) * Math.min(1, dt * 3);
      this.bhWorldAnchor.y += (0.12 - this.bhWorldAnchor.y) * Math.min(1, dt * 3);
      this.bhWorldAnchor.z += (0 - this.bhWorldAnchor.z) * Math.min(1, dt * 3);
    }

    // Smoothly decay transient accretion & photon-ring ingestion flashes
    this.accretionSurge = Math.max(0, this.accretionSurge - dt * 0.28);
    this.horizonIngestionFlash = Math.max(0, this.horizonIngestionFlash - dt * 0.85);

    // 2. Manage Celestial Object Spawning Budgets
    const qualityScale = this.getQualityBudgetScale();
    const maxTotal = Math.max(1, Math.round(this.settings.maxCelestialObjects * qualityScale));
    const maxStarsAllowed = Math.max(1, Math.min(3, Math.ceil(maxTotal * 0.45)));
    const maxPlanetsAllowed = Math.max(1, Math.max(0, maxTotal - maxStarsAllowed));
    const currentTotal = this.stars.length + this.planets.length;

    if (
      this.settings.starGenerationEnabled &&
      this.stars.length < maxStarsAllowed &&
      currentTotal < maxTotal
    ) {
      const canSpawnNext =
        this.stars.length === 0 ||
        this.stars.every(
          (s) => s.state === 'ENERGY_DEPLETION' || s.state === 'FINAL_CONSUMPTION'
        );

      if (canSpawnNext) {
        this.nextStarSpawnInSec -= dt;
        if (this.nextStarSpawnInSec <= 0) {
          this.spawnStar();
          this.nextStarSpawnInSec = this.settings.starRespawnDelaySec;
        }
      }
    }

    if (
      this.settings.planetGenerationEnabled &&
      this.planets.length < maxPlanetsAllowed &&
      this.stars.length + this.planets.length < maxTotal
    ) {
      this.nextPlanetSpawnInSec -= dt;
      if (this.nextPlanetSpawnInSec <= 0) {
        this.spawnPlanet();
        this.nextPlanetSpawnInSec = 3.1 + (this.totalPlanetsSpawned % 3) * 1.1;
      }
    }

    // 3. Step Active Stars through True 6-Stage Tidal Disruption Event
    this.stepStars(dt);

    // 4. Step Active Planets through Type-Specific Roche Breakup & Boulder Detachment
    this.stepPlanets(dt);

    // 5. Step Pooled Streams, Orbiting Boulders, Debris & Collision Shocks
    this.stepTidalStreamPool(dt);
    this.stepPlanetBoulderPool(dt);
    this.stepPlanetFragmentPool(dt);
    this.stepCollisionShockPool(dt);

    // 6. Compute continuous gravitational proximity tension for Layer B Cosmic Horror Audio
    let peakTension = this.accretionSurge * 0.45;
    for (let i = 0; i < this.stars.length; i += 1) {
      const s = this.stars[i];
      peakTension = Math.max(peakTension, s.tidalStretch * 0.85, s.spaghettification * 0.92);
    }
    for (let i = 0; i < this.planets.length; i += 1) {
      const p = this.planets[i];
      peakTension = Math.max(peakTension, p.tidalDeform * 0.65);
    }
    this.gravitationalTension +=
      (Math.min(1, peakTension) - this.gravitationalTension) * Math.min(1, dt * 3.5);
  }

  public spawnStar(): CelestialStar {
    const star = this.factory.createRandomStar(this.bhWorldAnchor, this.driftVelocity);
    this.stars.push(star);
    this.totalStarsSpawned += 1;
    return star;
  }

  public spawnPlanet(): CelestialPlanet {
    const planet = this.factory.createRandomPlanet(this.bhWorldAnchor, this.driftVelocity);
    this.planets.push(planet);
    this.totalPlanetsSpawned += 1;
    return planet;
  }

  private stepStars(dt: number): void {
    const bh = this.bhWorldAnchor;
    const timelineInv = 1.0 / Math.max(0.5, this.settings.disruptionDurationScale);

    for (let i = this.stars.length - 1; i >= 0; i -= 1) {
      const s = this.stars[i];
      s.prevX = s.x;
      s.prevY = s.y;
      s.prevZ = s.z;
      s.ageSec += dt;
      s.disruptionFlash = Math.max(0, s.disruptionFlash - dt * 0.95);
      s.orbitalAzimuth = Math.atan2(s.z - bh.z, s.x - bh.x);

      if (s.state === 'FINAL_CONSUMPTION') {
        s.collapseProgress = Math.min(1, s.collapseProgress + dt * 1.45 * timelineInv);
        // Curve shredded remnant smoothly behind the #000000 Black-Hole Shadow
        const tx = -(s.z - bh.z);
        const tz = s.x - bh.x;
        const horiz = Math.max(0.1, Math.hypot(tx, tz));
        s.x += ((bh.x - s.x) * 3.6 + (tx / horiz) * 2.2) * dt;
        s.y += (bh.y - s.y) * Math.min(1, dt * 4.2);
        s.z += ((bh.z - s.z) * 3.6 + (tz / horiz) * 2.2) * dt;
        s.energy = Math.max(0, s.energy * (1 - dt * 4.2));
        s.spaghettification = Math.min(1, s.spaghettification + dt * 1.8);
        s.streamWrapAngle = Math.min(5.8, s.streamWrapAngle + dt * 3.2);
        s.fallbackShockIntensity = Math.max(0, (1 - s.collapseProgress) * 0.95);
        s.outflowIntensity = Math.max(0, (1 - s.collapseProgress) * 0.78);
        s.luminosity = (1 - s.collapseProgress) * 0.92;
        s.currentRadius = s.baseRadius * Math.max(0.03, 0.24 * (1 - s.collapseProgress));
        this.accretionSurge = Math.min(1, this.accretionSurge + dt * 1.45);
        this.horizonIngestionFlash = Math.min(1, this.horizonIngestionFlash + dt * 1.6);
        this.streamImpactAzimuth = s.orbitalAzimuth + 1.35;

        if (s.collapseProgress >= 1.0) {
          this.advanceStarState(s, 'DISAPPEARANCE');
          this.totalStarsConsumed += 1;
          this.stars.splice(i, 1);
        }
        continue;
      }

      // Compute bounded relativistic gravitational pull + Kerr swirl
      const dist = computeGravitationalAcceleration(
        s,
        { x: s.vx, y: s.vy, z: s.vz },
        bh,
        this.settings.starCaptureIntensity,
        DEFAULT_GRAVITATIONAL_PARAMS,
        this.scratchAccel
      );

      const driftPushX = -this.driftVelocity.x * 0.14;
      const driftPushZ = -this.driftVelocity.z * 0.14;

      // During deep TDE spaghettification, gentle tidal circularization keeps the star orbiting long
      // enough for the full 6-stage ribbon & fallback shock sequence to unfold visibly before plunging
      const tdeHold =
        s.state === 'TIDAL_DISRUPTION' || s.state === 'ENERGY_DEPLETION'
          ? Math.min(1.0, 0.84 + 0.16 * Math.min(1.0, timelineInv))
          : 1.0;

      s.vx += (this.scratchAccel.x * tdeHold + driftPushX) * dt;
      s.vy += this.scratchAccel.y * dt;
      s.vz += (this.scratchAccel.z * tdeHold + driftPushZ) * dt;

      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;

      const tidal = evaluateTidalForces(s, bh, 5.15, 3.4, this.scratchTidal);
      s.dirToBhX = tidal.toCenterX;
      s.dirToBhY = tidal.toCenterY;
      s.dirToBhZ = tidal.toCenterZ;
      s.tidalStretch = tidal.tidalStretch;

      // Smooth spawn fade-in
      if (s.spawnFade < 1.0) {
        s.spawnFade = Math.min(1.0, s.spawnFade + dt * 1.15);
      }

      // Stage 2 Phase 9 Event: Rising tidal stretch tension before full disruption
      if (s.tidalStretch >= 0.26 && s.spawnFade >= 0.85) {
        this.emitUniqueEvent(s.id, s.id, 'STAR_TIDAL_STRETCH', 0.72, s);
      }

      // Monotonic 8-Stage State Progression
      if (s.state === 'SPAWNING' && s.spawnFade >= 0.85) {
        this.advanceStarState(s, 'STABLE');
      }
      if (
        (s.state === 'STABLE' || s.state === 'SPAWNING') &&
        (dist < 7.2 || s.ageSec > 1.05)
      ) {
        this.advanceStarState(s, 'GRAVITATIONALLY_ATTRACTED');
      }
      if (s.state === 'GRAVITATIONALLY_ATTRACTED' && (dist < 5.65 || s.ageSec > 2.15)) {
        this.advanceStarState(s, 'ORBITAL_CAPTURE');
      }
      if (s.state === 'ORBITAL_CAPTURE' && dist < 4.55) {
        this.advanceStarState(s, 'TIDAL_DISRUPTION');
      }

      // Stages 3, 4 & 5: Spaghettification, Returning Fallback Shock, Outbound Ejection & Accretion
      if (
        s.state === 'TIDAL_DISRUPTION' ||
        s.state === 'ENERGY_DEPLETION' ||
        dist < 4.55
      ) {
        if (s.state !== 'ENERGY_DEPLETION' && s.energy < 0.76) {
          this.advanceStarState(s, 'ENERGY_DEPLETION');
        } else if (s.state === 'ORBITAL_CAPTURE') {
          this.advanceStarState(s, 'TIDAL_DISRUPTION');
        }

        const proximityFactor = Math.min(1.85, Math.max(0.24, (4.85 - dist) / 2.6));
        const drainRate =
          (0.135 + proximityFactor * 0.225) *
          this.settings.starCaptureIntensity *
          timelineInv;
        s.energy = Math.max(0, s.energy - drainRate * dt);

        // Grow continuous 3D spaghettification ribbon wrap around the black hole (up to ~325 deg)
        s.spaghettification = Math.min(
          1,
          Math.max(s.spaghettification, (1.0 - s.energy) * 1.18 + tidal.tidalStretch * 0.28)
        );
        const targetWrap = 0.65 + s.spaghettification * 5.05;
        s.streamWrapAngle += (targetWrap - s.streamWrapAngle) * Math.min(1, dt * 2.6);

        // Stream-stream collision shock hotspot (ASASSN-14li) lights up once stream wraps > 180 deg
        const wrapShock = s.streamWrapAngle > 2.4 ? Math.min(1, (s.streamWrapAngle - 2.4) / 2.2) : 0;
        s.fallbackShockIntensity =
          wrapShock * (0.55 + 0.45 * Math.sin(this.simTime * 9.5 + s.turbulenceSeed));

        // Outward hyperbolic debris wind (eso2018b) active throughout tidal stripping
        s.outflowIntensity = Math.min(1, s.spaghettification * 1.15);

        if (s.spaghettification >= 0.28) {
          if (this.emitUniqueEvent(s.id, s.id, 'STAR_DISRUPTION', 0.9, s)) {
            s.disruptionFlash = 1.0;
          }
        }
        if (s.energy <= 0.36) {
          if (this.emitUniqueEvent(s.id, s.id, 'STAR_ACCRETION', 0.92, s)) {
            this.horizonIngestionFlash = Math.max(this.horizonIngestionFlash, 0.85);
          }
        }

        // Emit bound fallback knots, unbound hyperbolic outflow stream, and collision shock sparks
        const budget = this.getQualityBudgetScale();
        const streamProb = Math.min(1, (0.52 + tidal.tidalStretch * 0.95) * budget);
        if ((this.simTime * 120) % 1 < streamProb) {
          this.emitTidalStreamParticle(s, bh, 'bound');
          if (budget > 0.68 && this.tidalCursor % 3 === 0) {
            this.emitTidalStreamParticle(s, bh, 'outflow');
          }
          if (s.fallbackShockIntensity > 0.35 && this.tidalCursor % 5 === 0) {
            this.emitTidalStreamParticle(s, bh, 'shock');
          }
        }

        // Feed localized accretion disk brightening & turbulence
        this.streamImpactAzimuth = s.orbitalAzimuth + Math.min(2.2, s.streamWrapAngle * 0.45);
        this.accretionSurge = Math.min(1, this.accretionSurge + dt * 0.32 * proximityFactor);
        if (this.simTime - this.lastSurgeEventAtSim > 5.2 && this.accretionSurge > 0.55) {
          this.lastSurgeEventAtSim = this.simTime;
          this.emitUniqueEvent(
            `${s.id}-surge`,
            s.id,
            'ACCRETION_SURGE',
            this.accretionSurge,
            bh
          );
        }
      }

      // Progressive core shredding & dimming (never instant deletion!)
      const energyCurve = Math.pow(Math.max(0, s.energy), 0.72);
      s.currentRadius = s.baseRadius * s.spawnFade * (0.24 + 0.76 * energyCurve);
      s.luminosity =
        s.spawnFade *
        (0.20 + 0.80 * energyCurve) *
        (1.0 + tidal.tidalStretch * 0.36 + s.disruptionFlash * 0.45);

      // Transition into Stage 6: FINAL_CONSUMPTION once depleted or reaching shadow edge
      if (s.energy <= 0.055 || dist <= BLACK_HOLE_SHADOW_RADIUS + 0.10) {
        if (s.state !== 'ENERGY_DEPLETION') {
          this.advanceStarState(s, 'ENERGY_DEPLETION');
        }
        this.advanceStarState(s, 'FINAL_CONSUMPTION');
      }
    }
  }

  private stepPlanets(dt: number): void {
    const bh = this.bhWorldAnchor;
    const timelineInv = 1.0 / Math.max(0.5, this.settings.disruptionDurationScale);

    for (let i = this.planets.length - 1; i >= 0; i -= 1) {
      const p = this.planets[i];
      p.prevX = p.x;
      p.prevY = p.y;
      p.prevZ = p.z;
      p.ageSec += dt;
      p.rotationAngle += p.spinSpeed * dt;
      p.collisionShockIntensity = Math.max(0, p.collisionShockIntensity - dt * 1.4);

      const dist = computeGravitationalAcceleration(
        p,
        { x: p.vx, y: p.vy, z: p.vz },
        bh,
        this.settings.planetCaptureIntensity * 1.06,
        DEFAULT_GRAVITATIONAL_PARAMS,
        this.scratchAccel
      );

      p.vx += (this.scratchAccel.x - this.driftVelocity.x * 0.12) * dt;
      p.vy += this.scratchAccel.y * dt;
      p.vz += (this.scratchAccel.z - this.driftVelocity.z * 0.12) * dt;

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      const tidal = evaluateTidalForces(p, bh, 4.35, 3.6, this.scratchTidal);
      p.dirToBhX = tidal.toCenterX;
      p.dirToBhY = tidal.toCenterY;
      p.dirToBhZ = tidal.toCenterZ;
      p.tidalDeform = tidal.rocheShear;

      if (p.spawnFade < 1.0) {
        p.spawnFade = Math.min(1.0, p.spawnFade + dt * 1.35);
      }

      if (p.state === 'SPAWNING' && p.spawnFade >= 0.85) {
        p.state = 'ORBITING';
      }
      if ((p.state === 'ORBITING' || p.state === 'SPAWNING') && dist < 6.4) {
        p.state = 'CAPTURED';
        this.emitUniqueEvent(p.id, p.id, 'PLANET_CAPTURED', 0.62, p);
      }
      if (p.state === 'CAPTURED' && dist < 4.85) {
        p.state = 'SPIRALING';
      }

      // Roche limit crustal breakup: large 3D boulders + type-adapted molten/ice/gas debris streams
      if (dist < 3.70 || p.state === 'FRAGMENTING' || p.state === 'CONSUMING') {
        if (p.state !== 'FRAGMENTING' && p.state !== 'CONSUMING') {
          p.state = 'FRAGMENTING';
          this.emitUniqueEvent(p.id, p.id, 'PLANET_FRAGMENTED', 0.80, p);
        }

        const shearRate =
          (0.20 + tidal.rocheShear * 0.42) *
          this.settings.planetCaptureIntensity *
          timelineInv;
        p.integrity = Math.max(0, p.integrity - shearRate * dt);

        // Detach large orbiting 3D crustal/core boulders first so planet visibly breaks into chunks
        const targetBoulders = Math.floor((1 - p.integrity) * p.maxBouldersToEmit);
        while (p.bouldersEmitted < targetBoulders) {
          p.bouldersEmitted += 1;
          this.emitPlanetBoulder(p);
        }

        if (p.bouldersEmitted >= 3 && p.integrity < 0.72) {
          this.emitUniqueEvent(p.id, p.id, 'PLANET_FRAGMENTATION', 0.84, p);
        }

        // Emit accompanying type-adapted molten/icy/atmospheric stream fragments
        const targetFragments = Math.floor((1 - p.integrity) * p.maxFragmentsToEmit);
        while (p.fragmentsEmitted < targetFragments) {
          p.fragmentsEmitted += 1;
          this.emitPlanetFragment(p);
        }

        if (p.integrity < 0.30 && p.state !== 'CONSUMING') {
          p.state = 'CONSUMING';
          this.emitUniqueEvent(p.id, p.id, 'PLANET_ACCRETION', 0.86, p);
        }
      }

      // Planet breaks apart cleanly rather than shrinking into a tiny pinpoint dot
      p.currentRadius =
        p.baseRadius * p.spawnFade * Math.max(0.22, 0.32 + 0.68 * Math.sqrt(p.integrity));

      if (p.integrity <= 0.035 || dist <= BLACK_HOLE_SHADOW_RADIUS + 0.02) {
        p.state = 'DISAPPEARANCE';
        this.emitUniqueEvent(p.id, p.id, 'PLANET_CONSUMED', 0.88, p);
        this.accretionSurge = Math.min(1, this.accretionSurge + 0.28);
        this.horizonIngestionFlash = Math.min(1, this.horizonIngestionFlash + 0.55);
        this.streamImpactAzimuth = Math.atan2(p.z - bh.z, p.x - bh.x) + 0.8;
        cosmicEngine.registerParticleIngestion({
          particleId: `celestial-${p.id}`,
          particleType: 'orbital',
          entryPosition: {
            x: cosmicEngine.blackHoleScreenX,
            y: cosmicEngine.blackHoleScreenY,
          },
          energyIntensity: 0.70,
          source: 'ambient_infall',
        });
        this.totalPlanetsConsumed += 1;
        this.planets.splice(i, 1);
      }
    }
  }

  private emitTidalStreamParticle(
    star: CelestialStar,
    bh: { x: number; y: number; z: number },
    role: TidalParticleRole
  ): void {
    const slot = this.tidalPool[this.tidalCursor];
    this.tidalCursor = (this.tidalCursor + 1) % MAX_TIDAL_STREAM_PARTICLES;

    const jitterAngle = (this.tidalCursor * 2.39996) % (Math.PI * 2);
    const spread = star.currentRadius * 0.34;
    slot.active = true;
    slot.role = role;
    slot.life = 0;

    if (role === 'outflow') {
      // Unbound L2 outer tidal tail & high-velocity wind blown outward into space (eso2018b)
      const outerNozzle = star.currentRadius * (1.35 + star.tidalStretch * 1.15);
      slot.x = star.x - star.dirToBhX * outerNozzle + Math.cos(jitterAngle) * spread;
      slot.y = star.y - star.dirToBhY * outerNozzle + Math.sin(jitterAngle) * spread * 0.5;
      slot.z = star.z - star.dirToBhZ * outerNozzle + Math.sin(jitterAngle) * spread;

      const outSpeed = 2.15 + (this.tidalCursor % 5) * 0.38;
      slot.vx = star.vx * 0.92 - star.dirToBhX * outSpeed + Math.cos(jitterAngle) * 0.35;
      slot.vy = star.vy * 0.85 - star.dirToBhY * outSpeed * 0.5 + ((this.tidalCursor % 3) - 1) * 0.28;
      slot.vz = star.vz * 0.92 - star.dirToBhZ * outSpeed + Math.sin(jitterAngle) * 0.35;
      slot.maxLife = 1.95 + (this.tidalCursor % 6) * 0.22;
      slot.size = 0.024 + (this.tidalCursor % 5) * 0.008;

      const [cr, cg, cb] = hexToRgbNormalized(star.coronaColorHex);
      slot.r = Math.min(1, cr * 1.15);
      slot.g = Math.min(1, cg * 1.05);
      slot.b = Math.min(1, cb * 0.95);
      this.totalOutflowParticlesEmitted += 1;
      return;
    }

    if (role === 'shock') {
      // Stream-stream self-collision hotspot (ASASSN-14li) on opposite returning arc
      const shockAz = star.orbitalAzimuth + 2.35;
      const shockR = 1.95 + (this.tidalCursor % 4) * 0.22;
      slot.x = bh.x + Math.cos(shockAz) * shockR;
      slot.y = bh.y + ((this.tidalCursor % 5) - 2) * 0.06;
      slot.z = bh.z + Math.sin(shockAz) * shockR;

      slot.vx = -Math.sin(shockAz) * 2.4 + Math.cos(jitterAngle) * 0.75;
      slot.vy = ((this.tidalCursor % 5) - 2) * 0.32;
      slot.vz = Math.cos(shockAz) * 2.4 + Math.sin(jitterAngle) * 0.75;
      slot.maxLife = 0.78 + (this.tidalCursor % 4) * 0.14;
      slot.size = 0.032 + (this.tidalCursor % 4) * 0.009;
      slot.r = 1.0;
      slot.g = 0.96;
      slot.b = 0.88;
      return;
    }

    // Bound fallback stream launched from inner L1 nozzle toward the accretion disk
    const nozzleOffset = star.currentRadius * (1.28 + star.tidalStretch * 0.95);
    slot.x = star.x + star.dirToBhX * nozzleOffset + Math.cos(jitterAngle) * spread;
    slot.y = star.y + star.dirToBhY * nozzleOffset + Math.sin(jitterAngle) * spread * 0.45;
    slot.z = star.z + star.dirToBhZ * nozzleOffset + Math.sin(jitterAngle) * spread;

    slot.vx = star.vx * 0.80 + star.dirToBhX * 1.42;
    slot.vy = star.vy * 0.65 + star.dirToBhY * 1.12;
    slot.vz = star.vz * 0.80 + star.dirToBhZ * 1.42;

    slot.maxLife = 1.55 + (this.tidalCursor % 7) * 0.16;
    slot.size = 0.025 + (this.tidalCursor % 5) * 0.008;

    const [cr, cg, cb] = hexToRgbNormalized(
      this.tidalCursor % 3 === 0 ? star.coreColorHex : star.coronaColorHex
    );
    slot.r = cr;
    slot.g = cg;
    slot.b = cb;
  }

  private emitPlanetBoulder(planet: CelestialPlanet): void {
    const slot = this.boulderPool[this.boulderCursor];
    this.boulderCursor = (this.boulderCursor + 1) % MAX_PLANET_BOULDERS;

    const idx = planet.bouldersEmitted;
    const angle = idx * 2.39996 + planet.seed;
    const spread = planet.currentRadius * 1.18;
    const isEjected = (idx % 10) / 10 < planet.ejectionFraction;

    slot.active = true;
    slot.ejected = isEjected;
    slot.planetType = planet.planetType;
    slot.x = planet.x + Math.cos(angle) * spread;
    slot.y = planet.y + ((idx % 5) - 2) * spread * 0.25;
    slot.z = planet.z + Math.sin(angle) * spread;

    if (isEjected) {
      slot.vx = planet.vx * 1.05 - planet.dirToBhX * 1.75 + Math.cos(angle) * 0.7;
      slot.vy = planet.vy + ((idx % 3) - 1) * 0.35;
      slot.vz = planet.vz * 1.05 - planet.dirToBhZ * 1.75 + Math.sin(angle) * 0.7;
    } else {
      // Enter distorted eccentric Roche debris ring orbit around the black hole
      slot.vx = planet.vx * 0.92 + Math.cos(angle) * 0.45 + planet.dirToBhX * 0.42;
      slot.vy = planet.vy * 0.82 + ((idx % 3) - 1) * 0.22;
      slot.vz = planet.vz * 0.92 + Math.sin(angle) * 0.45 + planet.dirToBhZ * 0.42;
    }

    slot.rotX = angle;
    slot.rotY = angle * 0.7;
    slot.rotZ = angle * 1.3;
    slot.spin = 1.8 + (idx % 5) * 0.85;
    slot.life = 0;
    slot.maxLife = 2.6 + (idx % 5) * 0.35;

    const baseChunk = planet.baseRadius * (0.28 + (idx % 4) * 0.08);
    slot.size = Math.max(0.022, Math.min(0.056, baseChunk));
    slot.aspectX = 1.25 + (idx % 3) * 0.28;
    slot.aspectY = 0.68 + ((idx + 1) % 3) * 0.18;
    slot.aspectZ = 0.88 + ((idx + 2) % 3) * 0.22;
    slot.collisionCooldown = 0.18;

    const hex = idx % 2 === 0 ? planet.primaryColorHex : planet.secondaryColorHex;
    const [r, g, b] = hexToRgbNormalized(hex);
    if (planet.planetType === 'molten') {
      slot.r = 1.0;
      slot.g = 0.45;
      slot.b = 0.14;
    } else if (planet.planetType === 'ice') {
      slot.r = Math.min(1, r * 1.15);
      slot.g = Math.min(1, g * 1.2);
      slot.b = 1.0;
    } else {
      slot.r = Math.min(1, r * 1.18);
      slot.g = Math.min(1, g * 1.12);
      slot.b = Math.min(1, b * 1.08);
    }
  }

  private emitPlanetFragment(planet: CelestialPlanet): void {
    const slot = this.fragmentPool[this.fragmentCursor];
    this.fragmentCursor = (this.fragmentCursor + 1) % MAX_PLANET_DEBRIS_FRAGMENTS;

    const idx = planet.fragmentsEmitted;
    const angle = idx * 2.39996;
    const spread = planet.currentRadius * 1.12;
    const isEjected = (idx % 9) === 0;

    slot.active = true;
    slot.ejected = isEjected;
    slot.planetType = planet.planetType;
    slot.x = planet.x + Math.cos(angle) * spread;
    slot.y = planet.y + ((idx % 5) - 2) * spread * 0.28;
    slot.z = planet.z + Math.sin(angle) * spread;

    if (isEjected) {
      slot.vx = planet.vx * 0.95 - planet.dirToBhX * 1.65 + Math.cos(angle) * 0.65;
      slot.vy = planet.vy + ((idx % 3) - 1) * 0.3;
      slot.vz = planet.vz * 0.95 - planet.dirToBhZ * 1.65 + Math.sin(angle) * 0.65;
    } else {
      slot.vx = planet.vx * 0.86 + Math.cos(angle) * 0.52 + planet.dirToBhX * 0.62;
      slot.vy = planet.vy * 0.8 + ((idx % 3) - 1) * 0.22;
      slot.vz = planet.vz * 0.86 + Math.sin(angle) * 0.52 + planet.dirToBhZ * 0.62;
    }

    slot.rotX = angle;
    slot.rotY = angle * 0.7;
    slot.rotZ = angle * 1.3;
    slot.spin = 2.8 + (idx % 5) * 1.1;

    slot.life = 0;
    slot.maxLife = 1.85 + (idx % 6) * 0.20;
    slot.size =
      planet.planetType === 'gas_giant'
        ? 0.022 + (idx % 4) * 0.008
        : 0.014 + (idx % 4) * 0.006;

    // Adapt debris/stream color to planet type (molten lava vs icy plume vs gas band vs rocky crust)
    if (planet.planetType === 'molten' || (planet.planetType === 'rocky' && idx % 3 === 0)) {
      slot.r = 1.0;
      slot.g = 0.48 + (idx % 3) * 0.14;
      slot.b = 0.12;
    } else if (planet.planetType === 'ice') {
      slot.r = 0.72;
      slot.g = 0.94;
      slot.b = 1.0;
    } else if (planet.planetType === 'gas_giant') {
      const [r, g, b] = hexToRgbNormalized(
        idx % 2 === 0 ? planet.atmosphereColorHex : planet.primaryColorHex
      );
      slot.r = Math.min(1, r * 1.15);
      slot.g = Math.min(1, g * 1.1);
      slot.b = Math.min(1, b * 1.05);
    } else {
      const hex = idx % 2 === 0 ? planet.primaryColorHex : planet.secondaryColorHex;
      const [r, g, b] = hexToRgbNormalized(hex);
      slot.r = Math.min(1, r * 1.2);
      slot.g = Math.min(1, g * 1.12);
      slot.b = Math.min(1, b * 1.08);
    }
  }

  private spawnCollisionShock(
    x: number,
    y: number,
    z: number,
    planetType: PlanetType
  ): void {
    const s = this.shockPool[this.shockCursor];
    this.shockCursor = (this.shockCursor + 1) % MAX_COLLISION_SHOCKS;
    s.active = true;
    s.x = x;
    s.y = y;
    s.z = z;
    s.life = 0;
    s.maxLife = 0.48;
    s.radius = 0.16;
    s.intensity = 0.92;
    if (planetType === 'ice') {
      s.r = 0.72;
      s.g = 0.95;
      s.b = 1.0;
    } else {
      s.r = 1.0;
      s.g = 0.72;
      s.b = 0.32;
    }
  }

  private stepTidalStreamPool(dt: number): void {
    const bh = this.bhWorldAnchor;
    for (let i = 0; i < MAX_TIDAL_STREAM_PARTICLES; i += 1) {
      const p = this.tidalPool[i];
      if (!p.active) continue;

      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        continue;
      }

      const dx = bh.x - p.x;
      const dy = bh.y - p.y;
      const dz = bh.z - p.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      const dist = Math.sqrt(Math.max(0.01, distSq));

      // Disappear cleanly BEHIND the #000000 Black-Hole Shadow (never colliding with a solid glowing shell)
      if (dist <= BLACK_HOLE_SHADOW_RADIUS) {
        p.active = false;
        this.horizonIngestionFlash = Math.min(1, this.horizonIngestionFlash + 0.035);
        this.accretionSurge = Math.min(1, this.accretionSurge + 0.012);
        if (this.horizonPulseCooldown <= 0 && this.horizonIngestionFlash > 0.72) {
          this.horizonPulseCooldown = 1.65;
          cosmicEngine.triggerPulse('ingestion');
        }
        continue;
      }

      if (p.role === 'outflow') {
        // Unbound hyperbolic ejection stream travels outward into deep space (eso2018b)
        if (dist > 16.5) {
          p.active = false;
          continue;
        }
        const weakGravity = 1.15 / (distSq + 1.2);
        p.vx += (dx / dist) * weakGravity * dt;
        p.vy += (dy / dist) * weakGravity * dt;
        p.vz += (dz / dist) * weakGravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        continue;
      }

      const pull = Math.min(22.0, 9.2 / (distSq + 0.26));
      const rx = dx / dist;
      const ry = dy / dist;
      const rz = dz / dist;

      // Strong prograde relativistic frame-dragging swirl into the accretion disk
      p.vx += (rx * pull - rz * 2.35) * dt;
      p.vy += (ry * pull + (bh.y - p.y) * 1.35) * dt;
      p.vz += (rz * pull + rx * 2.35) * dt;

      p.vx *= 1 - dt * 0.24;
      p.vy *= 1 - dt * 0.48;
      p.vz *= 1 - dt * 0.24;

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
    }
  }

  private stepPlanetBoulderPool(dt: number): void {
    const bh = this.bhWorldAnchor;
    for (let i = 0; i < MAX_PLANET_BOULDERS; i += 1) {
      const b = this.boulderPool[i];
      if (!b.active) continue;

      b.life += dt;
      b.collisionCooldown = Math.max(0, b.collisionCooldown - dt);
      if (b.life >= b.maxLife) {
        b.active = false;
        continue;
      }

      const dx = bh.x - b.x;
      const dy = bh.y - b.y;
      const dz = bh.z - b.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      const dist = Math.sqrt(Math.max(0.01, distSq));

      if (dist <= BLACK_HOLE_SHADOW_RADIUS) {
        b.active = false;
        this.horizonIngestionFlash = Math.min(1, this.horizonIngestionFlash + 0.06);
        this.accretionSurge = Math.min(1, this.accretionSurge + 0.02);
        continue;
      }

      if (b.ejected) {
        if (dist > 15.0) {
          b.active = false;
          continue;
        }
        const weakPull = 1.4 / (distSq + 1.0);
        b.vx += (dx / dist) * weakPull * dt;
        b.vy += (dy / dist) * weakPull * dt;
        b.vz += (dz / dist) * weakPull * dt;
      } else {
        const pull = Math.min(19.0, 8.2 / (distSq + 0.30));
        const rx = dx / dist;
        const ry = dy / dist;
        const rz = dz / dist;
        b.vx += (rx * pull - rz * 1.95) * dt;
        b.vy += (ry * pull + (bh.y - b.y) * 1.2) * dt;
        b.vz += (rz * pull + rx * 1.95) * dt;
        b.vx *= 1 - dt * 0.14;
        b.vy *= 1 - dt * 0.32;
        b.vz *= 1 - dt * 0.14;
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
      b.rotX += b.spin * dt;
      b.rotY += b.spin * 0.82 * dt;
      b.rotZ += b.spin * 0.64 * dt;
    }

    // Lightweight boulder-boulder orbital collision detection (< 1,100 ops max) producing glowing shock flashes
    for (let i = 0; i < MAX_PLANET_BOULDERS; i += 1) {
      const a = this.boulderPool[i];
      if (!a.active || a.collisionCooldown > 0) continue;
      for (let j = i + 1; j < MAX_PLANET_BOULDERS; j += 1) {
        const b = this.boulderPool[j];
        if (!b.active || b.collisionCooldown > 0) continue;
        const cx = b.x - a.x;
        const cy = b.y - a.y;
        const cz = b.z - a.z;
        const hitR = (a.size + b.size) * 2.4;
        const d2 = cx * cx + cy * cy + cz * cz;
        if (d2 > 0.00001 && d2 < hitR * hitR) {
          const d = Math.sqrt(d2);
          const nx = cx / d;
          const ny = cy / d;
          const nz = cz / d;
          a.vx -= nx * 0.42;
          a.vy -= ny * 0.25;
          a.vz -= nz * 0.42;
          b.vx += nx * 0.42;
          b.vy += ny * 0.25;
          b.vz += nz * 0.42;
          a.collisionCooldown = 0.45;
          b.collisionCooldown = 0.45;
          this.totalBoulderCollisions += 1;
          this.spawnCollisionShock(
            (a.x + b.x) * 0.5,
            (a.y + b.y) * 0.5,
            (a.z + b.z) * 0.5,
            a.planetType
          );
          break;
        }
      }
    }
  }

  private stepPlanetFragmentPool(dt: number): void {
    const bh = this.bhWorldAnchor;
    for (let i = 0; i < MAX_PLANET_DEBRIS_FRAGMENTS; i += 1) {
      const f = this.fragmentPool[i];
      if (!f.active) continue;

      f.life += dt;
      if (f.life >= f.maxLife) {
        f.active = false;
        continue;
      }

      const dx = bh.x - f.x;
      const dy = bh.y - f.y;
      const dz = bh.z - f.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      const dist = Math.sqrt(Math.max(0.01, distSq));

      if (dist <= BLACK_HOLE_SHADOW_RADIUS) {
        f.active = false;
        this.horizonIngestionFlash = Math.min(1, this.horizonIngestionFlash + 0.02);
        continue;
      }

      if (f.ejected) {
        if (dist > 15.0) {
          f.active = false;
          continue;
        }
        const weakPull = 1.2 / (distSq + 1.0);
        f.vx += (dx / dist) * weakPull * dt;
        f.vy += (dy / dist) * weakPull * dt;
        f.vz += (dz / dist) * weakPull * dt;
      } else {
        const pull = Math.min(19.0, 8.1 / (distSq + 0.30));
        const rx = dx / dist;
        const ry = dy / dist;
        const rz = dz / dist;

        f.vx += (rx * pull - rz * 1.85) * dt;
        f.vy += (ry * pull + (bh.y - f.y) * 1.15) * dt;
        f.vz += (rz * pull + rx * 1.85) * dt;
      }

      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.z += f.vz * dt;

      f.rotX += f.spin * dt;
      f.rotY += f.spin * 0.8 * dt;
      f.rotZ += f.spin * 0.6 * dt;
    }
  }

  private stepCollisionShockPool(dt: number): void {
    for (let i = 0; i < MAX_COLLISION_SHOCKS; i += 1) {
      const s = this.shockPool[i];
      if (!s.active) continue;
      s.life += dt;
      if (s.life >= s.maxLife) {
        s.active = false;
        continue;
      }
      s.radius += dt * 0.65;
    }
  }

  private interpolateRenderStates(alpha: number): void {
    for (let i = 0; i < this.stars.length; i += 1) {
      const s = this.stars[i];
      s.renderX = s.prevX + (s.x - s.prevX) * alpha;
      s.renderY = s.prevY + (s.y - s.prevY) * alpha;
      s.renderZ = s.prevZ + (s.z - s.prevZ) * alpha;
    }

    for (let i = 0; i < this.planets.length; i += 1) {
      const p = this.planets[i];
      p.renderX = p.prevX + (p.x - p.prevX) * alpha;
      p.renderY = p.prevY + (p.y - p.prevY) * alpha;
      p.renderZ = p.prevZ + (p.z - p.prevZ) * alpha;
    }
  }

  public getSnapshot() {
    let activeTidalCount = 0;
    let activeOutflowCount = 0;
    for (let i = 0; i < this.tidalPool.length; i += 1) {
      if (this.tidalPool[i].active) {
        activeTidalCount += 1;
        if (this.tidalPool[i].role === 'outflow') activeOutflowCount += 1;
      }
    }
    let activeBoulderCount = 0;
    for (let i = 0; i < this.boulderPool.length; i += 1) {
      if (this.boulderPool[i].active) activeBoulderCount += 1;
    }
    let activeFragmentCount = 0;
    for (let i = 0; i < this.fragmentPool.length; i += 1) {
      if (this.fragmentPool[i].active) activeFragmentCount += 1;
    }

    return {
      simTime: Number(this.simTime.toFixed(3)),
      settings: { ...this.settings },
      driftOffset: {
        x: Number(this.driftOffset.x.toFixed(3)),
        y: Number(this.driftOffset.y.toFixed(3)),
        z: Number(this.driftOffset.z.toFixed(3)),
      },
      bhWorldAnchor: { ...this.bhWorldAnchor },
      shadowRadius: BLACK_HOLE_SHADOW_RADIUS,
      accretionSurge: Number(this.accretionSurge.toFixed(3)),
      horizonIngestionFlash: Number(this.horizonIngestionFlash.toFixed(3)),
      gravitationalTension: Number(this.gravitationalTension.toFixed(3)),
      totalStarsSpawned: this.totalStarsSpawned,
      totalStarsConsumed: this.totalStarsConsumed,
      totalPlanetsSpawned: this.totalPlanetsSpawned,
      totalPlanetsConsumed: this.totalPlanetsConsumed,
      totalOutflowParticlesEmitted: this.totalOutflowParticlesEmitted,
      totalBoulderCollisions: this.totalBoulderCollisions,
      activeStars: this.stars.map((s) => ({
        id: s.id,
        spectralType: s.spectralType,
        state: s.state,
        energy: Number(s.energy.toFixed(3)),
        tidalStretch: Number(s.tidalStretch.toFixed(3)),
        spaghettification: Number(s.spaghettification.toFixed(3)),
        streamWrapAngle: Number(s.streamWrapAngle.toFixed(3)),
        fallbackShockIntensity: Number(s.fallbackShockIntensity.toFixed(3)),
        outflowIntensity: Number(s.outflowIntensity.toFixed(3)),
        x: Number(s.renderX.toFixed(3)),
        y: Number(s.renderY.toFixed(3)),
        z: Number(s.renderZ.toFixed(3)),
      })),
      activePlanets: this.planets.map((p) => ({
        id: p.id,
        planetType: p.planetType,
        state: p.state,
        integrity: Number(p.integrity.toFixed(3)),
        bouldersEmitted: p.bouldersEmitted,
        fragmentsEmitted: p.fragmentsEmitted,
        x: Number(p.renderX.toFixed(3)),
        y: Number(p.renderY.toFixed(3)),
        z: Number(p.renderZ.toFixed(3)),
      })),
      activeTidalParticles: activeTidalCount,
      activeOutflowParticles: activeOutflowCount,
      activePlanetBoulders: activeBoulderCount,
      activePlanetFragments: activeFragmentCount,
    };
  }

  public reset(): void {
    this.stars = [];
    this.planets = [];
    for (const p of this.tidalPool) p.active = false;
    for (const b of this.boulderPool) b.active = false;
    for (const f of this.fragmentPool) f.active = false;
    for (const s of this.shockPool) s.active = false;
    this.driftOffset = { x: 0, y: 0, z: 0 };
    this.bhWorldAnchor = { x: 0.45, y: 0.12, z: 0 };
    this.accretionSurge = 0;
    this.horizonIngestionFlash = 0;
    this.gravitationalTension = 0;
    this.simTime = 0;
    this.accumulator = 0;
    this.nextStarSpawnInSec = 0.45;
    this.nextPlanetSpawnInSec = 1.55;
    this.totalStarsSpawned = 0;
    this.totalStarsConsumed = 0;
    this.totalPlanetsSpawned = 0;
    this.totalPlanetsConsumed = 0;
    this.totalOutflowParticlesEmitted = 0;
    this.totalBoulderCollisions = 0;
    this.emittedEventSet.clear();
    this.emittedEventOrder = [];
  }
}

export const cosmicSimulationManager = new CosmicSimulationManager();

if (typeof window !== 'undefined' && !import.meta.env.PROD) {
  (window as unknown as Record<string, unknown>).__DEVMIND_DEVOURER__ = {
    getSnapshot: () => cosmicSimulationManager.getSnapshot(),
  };
}
