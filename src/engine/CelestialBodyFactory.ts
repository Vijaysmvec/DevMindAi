export type StarLifecycleState =
  | 'SPAWNING'
  | 'STABLE'
  | 'GRAVITATIONALLY_ATTRACTED'
  | 'ORBITAL_CAPTURE'
  | 'TIDAL_DISRUPTION'
  | 'ENERGY_DEPLETION'
  | 'FINAL_CONSUMPTION'
  | 'DISAPPEARANCE';

export type StarSpectralType = 'red_dwarf' | 'yellow_main' | 'white_luminous' | 'blue_giant';

export interface CelestialStar {
  id: string;
  spectralType: StarSpectralType;
  label: string;
  state: StarLifecycleState;
  visitedStates: StarLifecycleState[];

  // Physics state (current & previous fixed step + interpolated render position)
  x: number;
  y: number;
  z: number;
  prevX: number;
  prevY: number;
  prevZ: number;
  renderX: number;
  renderY: number;
  renderZ: number;
  vx: number;
  vy: number;
  vz: number;

  // Visual & physical properties (v2.4 6-Stage TDE Spaghettification)
  baseRadius: number;
  currentRadius: number;
  mass: number;
  energy: number; // 1.0 -> 0.0 as outer plasma is stripped and accreted
  luminosity: number; // Smoothly animated brightness
  spawnFade: number; // 0.0 -> 1.0 smooth entrance
  collapseProgress: number; // 0.0 -> 1.0 progressive disappearance behind #000000 shadow
  tidalStretch: number; // 0.0 -> 1.0 differential radial stretch + perpendicular compression
  spaghettification: number; // 0.0 -> 1.0 continuous 3D tidal stream & core shredding progress
  streamWrapAngle: number; // Radians of tidal gas ribbon coiled around the black hole (up to ~5.6 rad)
  fallbackShockIntensity: number; // 0.0 -> 1.0 returning fallback stream self-collision hotspot (ASASSN-14li)
  outflowIntensity: number; // 0.0 -> 1.0 unbound hyperbolic outward debris wind (eso2018b)
  disruptionFlash: number; // 0.0 -> 1.0 energetic TDE / accretion flare
  orbitalAzimuth: number; // Instantaneous XZ azimuth around black hole
  dirToBhX: number;
  dirToBhY: number;
  dirToBhZ: number;

  coreColorHex: string;
  coronaColorHex: string;
  flareIntensity: number;
  turbulenceSeed: number;
  ageSec: number;
}

export type PlanetLifecycleState =
  | 'SPAWNING'
  | 'ORBITING'
  | 'CAPTURED'
  | 'SPIRALING'
  | 'FRAGMENTING'
  | 'CONSUMING'
  | 'DISAPPEARANCE';

export type PlanetType = 'rocky' | 'gas_giant' | 'ice' | 'molten' | 'moon';

export interface CelestialPlanet {
  id: string;
  planetType: PlanetType;
  state: PlanetLifecycleState;

  x: number;
  y: number;
  z: number;
  prevX: number;
  prevY: number;
  prevZ: number;
  renderX: number;
  renderY: number;
  renderZ: number;
  vx: number;
  vy: number;
  vz: number;

  baseRadius: number;
  currentRadius: number;
  integrity: number; // 1.0 -> 0.0 as crustal boulders & streams detach inside Roche limit
  spawnFade: number;
  tidalDeform: number;
  rotationAngle: number;
  spinSpeed: number;
  dirToBhX: number;
  dirToBhY: number;
  dirToBhZ: number;

  primaryColorHex: string;
  secondaryColorHex: string;
  atmosphereColorHex: string;
  atmosphereStrength: number;
  bandScale: number;
  seed: number;
  fragmentsEmitted: number;
  maxFragmentsToEmit: number;
  bouldersEmitted: number;
  maxBouldersToEmit: number;
  collisionShockIntensity: number;
  ejectionFraction: number;
  ageSec: number;
}

const STAR_ARCHETYPES: Record<
  StarSpectralType,
  {
    label: string;
    coreColorHex: string;
    coronaColorHex: string;
    minRadius: number;
    maxRadius: number;
    mass: number;
    flareIntensity: number;
  }
> = {
  red_dwarf: {
    label: 'M-Type Crimson Star',
    coreColorHex: '#FF834F',
    coronaColorHex: '#FF4B1F',
    minRadius: 0.16,
    maxRadius: 0.21,
    mass: 0.75,
    flareIntensity: 0.9,
  },
  yellow_main: {
    label: 'G-Type Golden Star',
    coreColorHex: '#FFF4CA',
    coronaColorHex: '#FFB347',
    minRadius: 0.20,
    maxRadius: 0.27,
    mass: 1.0,
    flareIntensity: 1.05,
  },
  white_luminous: {
    label: 'A-Type Stellar White',
    coreColorHex: '#FFFFFF',
    coronaColorHex: '#BFEFFF',
    minRadius: 0.22,
    maxRadius: 0.29,
    mass: 1.25,
    flareIntensity: 1.2,
  },
  blue_giant: {
    label: 'O-Type Blue Supergiant',
    coreColorHex: '#E8FBFF',
    coronaColorHex: '#56D9FF',
    minRadius: 0.25,
    maxRadius: 0.33,
    mass: 1.55,
    flareIntensity: 1.4,
  },
};

const PLANET_ARCHETYPES: Record<
  PlanetType,
  {
    primaryColorHex: string;
    secondaryColorHex: string;
    atmosphereColorHex: string;
    atmosphereStrength: number;
    minRadius: number;
    maxRadius: number;
    bandScale: number;
    maxFragments: number;
    maxBoulders: number;
    ejectionFraction: number;
  }
> = {
  rocky: {
    primaryColorHex: '#C88050',
    secondaryColorHex: '#593624',
    atmosphereColorHex: '#E8A87C',
    atmosphereStrength: 0.30,
    minRadius: 0.088,
    maxRadius: 0.122,
    bandScale: 3.2,
    maxFragments: 32,
    maxBoulders: 12,
    ejectionFraction: 0.22,
  },
  gas_giant: {
    primaryColorHex: '#E59E56',
    secondaryColorHex: '#8E4A25',
    atmosphereColorHex: '#FFD5A0',
    atmosphereStrength: 0.70,
    minRadius: 0.135,
    maxRadius: 0.182,
    bandScale: 9.8,
    maxFragments: 44,
    maxBoulders: 8,
    ejectionFraction: 0.28,
  },
  ice: {
    primaryColorHex: '#ACEBFF',
    secondaryColorHex: '#387B9E',
    atmosphereColorHex: '#E2F8FF',
    atmosphereStrength: 0.56,
    minRadius: 0.095,
    maxRadius: 0.132,
    bandScale: 4.5,
    maxFragments: 34,
    maxBoulders: 11,
    ejectionFraction: 0.26,
  },
  molten: {
    primaryColorHex: '#3A1610',
    secondaryColorHex: '#FF5D1A',
    atmosphereColorHex: '#FF8A38',
    atmosphereStrength: 0.62,
    minRadius: 0.092,
    maxRadius: 0.126,
    bandScale: 5.2,
    maxFragments: 38,
    maxBoulders: 13,
    ejectionFraction: 0.20,
  },
  moon: {
    primaryColorHex: '#A2AAB6',
    secondaryColorHex: '#4B525D',
    atmosphereColorHex: '#CBD5E1',
    atmosphereStrength: 0.09,
    minRadius: 0.062,
    maxRadius: 0.084,
    bandScale: 2.4,
    maxFragments: 22,
    maxBoulders: 9,
    ejectionFraction: 0.25,
  },
};

export class CelestialBodyFactory {
  private starSeq = 1;
  private planetSeq = 1;
  private rng: () => number;

  constructor(customRng?: () => number) {
    this.rng = customRng ?? Math.random;
  }

  public createRandomStar(
    bhCenter: { x: number; y: number; z: number },
    driftDir: { x: number; y: number; z: number }
  ): CelestialStar {
    const rPick = this.rng();
    const spectralType: StarSpectralType =
      rPick < 0.24
        ? 'red_dwarf'
        : rPick < 0.62
          ? 'yellow_main'
          : rPick < 0.84
            ? 'white_luminous'
            : 'blue_giant';

    const arch = STAR_ARCHETYPES[spectralType];
    const id = `star-${this.starSeq++}`;

    // Spawn at a visible perimeter distance biased slightly ahead of the black hole's cosmic drift
    const spawnDist = 6.3 + this.rng() * 2.3;
    const baseAzimuth = Math.atan2(driftDir.z, driftDir.x || 0.6);
    const angleSpread = (this.rng() - 0.5) * Math.PI * 1.45;
    const azimuth = baseAzimuth + angleSpread;

    const x = bhCenter.x + Math.cos(azimuth) * spawnDist;
    const z = bhCenter.z + Math.sin(azimuth) * spawnDist * 0.62 - 0.55;
    const y = bhCenter.y + (this.rng() - 0.5) * 2.0 + 0.32;

    // Prograde tangential orbital velocity so the star curves into a dramatic tidal death spiral
    const dx = bhCenter.x - x;
    const dz = bhCenter.z - z;
    const horiz = Math.max(0.1, Math.hypot(dx, dz));
    const tx = -dz / horiz;
    const tz = dx / horiz;

    const orbitalSpeed = 1.22 + this.rng() * 0.40;
    const vx = tx * orbitalSpeed + (dx / horiz) * 0.26;
    const vy = (bhCenter.y - y) * 0.14;
    const vz = tz * orbitalSpeed + (dz / horiz) * 0.26;

    const radius = arch.minRadius + this.rng() * (arch.maxRadius - arch.minRadius);
    const fullDist = Math.max(0.1, Math.hypot(dx, bhCenter.y - y, dz));

    return {
      id,
      spectralType,
      label: arch.label,
      state: 'SPAWNING',
      visitedStates: ['SPAWNING'],
      x,
      y,
      z,
      prevX: x,
      prevY: y,
      prevZ: z,
      renderX: x,
      renderY: y,
      renderZ: z,
      vx,
      vy,
      vz,
      baseRadius: radius,
      currentRadius: radius * 0.38,
      mass: arch.mass,
      energy: 1.0,
      luminosity: 0.0,
      spawnFade: 0.0,
      collapseProgress: 0.0,
      tidalStretch: 0.0,
      spaghettification: 0.0,
      streamWrapAngle: 0.0,
      fallbackShockIntensity: 0.0,
      outflowIntensity: 0.0,
      disruptionFlash: 0.0,
      orbitalAzimuth: Math.atan2(z - bhCenter.z, x - bhCenter.x),
      dirToBhX: dx / fullDist,
      dirToBhY: (bhCenter.y - y) / fullDist,
      dirToBhZ: dz / fullDist,
      coreColorHex: arch.coreColorHex,
      coronaColorHex: arch.coronaColorHex,
      flareIntensity: arch.flareIntensity,
      turbulenceSeed: this.rng() * 100,
      ageSec: 0,
    };
  }

  public createRandomPlanet(
    bhCenter: { x: number; y: number; z: number },
    driftDir: { x: number; y: number; z: number }
  ): CelestialPlanet {
    const pPick = this.rng();
    const planetType: PlanetType =
      pPick < 0.26
        ? 'rocky'
        : pPick < 0.52
          ? 'gas_giant'
          : pPick < 0.72
            ? 'ice'
            : pPick < 0.88
              ? 'molten'
              : 'moon';

    const arch = PLANET_ARCHETYPES[planetType];
    const id = `planet-${this.planetSeq++}`;

    const spawnDist = 5.5 + this.rng() * 2.7;
    const baseAzimuth = Math.atan2(driftDir.z, driftDir.x || -0.5) + Math.PI * 0.35;
    const azimuth = baseAzimuth + (this.rng() - 0.5) * Math.PI * 1.65;

    const x = bhCenter.x + Math.cos(azimuth) * spawnDist;
    const z = bhCenter.z + Math.sin(azimuth) * spawnDist * 0.68 - 0.4;
    const y = bhCenter.y + (this.rng() - 0.5) * 1.8;

    const dx = bhCenter.x - x;
    const dz = bhCenter.z - z;
    const horiz = Math.max(0.1, Math.hypot(dx, dz));
    const tx = -dz / horiz;
    const tz = dx / horiz;

    const orbitalSpeed = 1.30 + this.rng() * 0.46;
    const vx = tx * orbitalSpeed + (dx / horiz) * 0.22;
    const vy = (bhCenter.y - y) * 0.12;
    const vz = tz * orbitalSpeed + (dz / horiz) * 0.22;

    const radius = arch.minRadius + this.rng() * (arch.maxRadius - arch.minRadius);

    return {
      id,
      planetType,
      state: 'SPAWNING',
      x,
      y,
      z,
      prevX: x,
      prevY: y,
      prevZ: z,
      renderX: x,
      renderY: y,
      renderZ: z,
      vx,
      vy,
      vz,
      baseRadius: radius,
      currentRadius: radius * 0.42,
      integrity: 1.0,
      spawnFade: 0.0,
      tidalDeform: 0.0,
      rotationAngle: this.rng() * Math.PI * 2,
      spinSpeed: 1.4 + this.rng() * 2.2,
      dirToBhX: dx / horiz,
      dirToBhY: 0,
      dirToBhZ: dz / horiz,
      primaryColorHex: arch.primaryColorHex,
      secondaryColorHex: arch.secondaryColorHex,
      atmosphereColorHex: arch.atmosphereColorHex,
      atmosphereStrength: arch.atmosphereStrength,
      bandScale: arch.bandScale,
      seed: this.rng() * 100,
      fragmentsEmitted: 0,
      maxFragmentsToEmit: arch.maxFragments,
      bouldersEmitted: 0,
      maxBouldersToEmit: arch.maxBoulders,
      collisionShockIntensity: 0,
      ejectionFraction: arch.ejectionFraction,
      ageSec: 0,
    };
  }
}
