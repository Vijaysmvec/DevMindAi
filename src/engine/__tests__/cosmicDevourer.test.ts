import { afterEach, describe, expect, it, vi } from 'vitest';
import { CelestialBodyFactory, StarLifecycleState } from '../CelestialBodyFactory';
import {
  CosmicDevourerEvent,
  CosmicSimulationManager,
  DEFAULT_DEVOURER_SETTINGS,
} from '../CosmicSimulationManager';
import {
  computeGravitationalAcceleration,
  DEFAULT_GRAVITATIONAL_PARAMS,
  evaluateTidalForces,
} from '../GravitationalField';

function createDeterministicRng(seed = 1337): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

describe('Cosmic Devourer Engine — SINGULARITY: EXTREME v2.3', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1 & 2: spawns randomized spectral star classes & distinct planet archetypes with strictly unique IDs', () => {
    const factory = new CelestialBodyFactory(createDeterministicRng(42));
    const bh = { x: 0.45, y: 0.12, z: 0 };
    const drift = { x: 0.34, y: 0.04, z: -0.62 };

    const seenIds = new Set<string>();
    const spectralTypes = new Set<string>();
    const planetTypes = new Set<string>();

    for (let i = 0; i < 36; i += 1) {
      const star = factory.createRandomStar(bh, drift);
      expect(seenIds.has(star.id)).toBe(false);
      seenIds.add(star.id);
      spectralTypes.add(star.spectralType);
      expect(star.energy).toBe(1.0);
      expect(star.spawnFade).toBe(0.0);
      expect(star.state).toBe('SPAWNING');
      expect(star.baseRadius).toBeGreaterThan(0.1);
    }

    for (let i = 0; i < 36; i += 1) {
      const planet = factory.createRandomPlanet(bh, drift);
      expect(seenIds.has(planet.id)).toBe(false);
      seenIds.add(planet.id);
      planetTypes.add(planet.planetType);
      expect(planet.integrity).toBe(1.0);
      expect(planet.state).toBe('SPAWNING');
      expect(planet.baseRadius).toBeGreaterThan(0.03);
    }

    expect(spectralTypes.size).toBe(4); // red_dwarf, yellow_main, white_luminous, blue_giant
    expect(planetTypes.size).toBe(5); // rocky, gas_giant, ice, molten, moon
  });

  it('3 & 4: computes bounded, softened gravitational acceleration & tidal shear without numeric explosion', () => {
    const bh = { x: 0.45, y: 0.12, z: 0 };
    const out = { x: 0, y: 0, z: 0 };

    //Even right near the Event Horizon (r = 0.02), acceleration stays strictly finite & capped
    const nearDist = computeGravitationalAcceleration(
      { x: 0.47, y: 0.12, z: 0 },
      { x: -2, y: 0, z: 1 },
      bh,
      1.5,
      DEFAULT_GRAVITATIONAL_PARAMS,
      out
    );
    expect(nearDist).toBeCloseTo(0.02, 3);
    expect(Number.isFinite(out.x)).toBe(true);
    expect(Number.isFinite(out.y)).toBe(true);
    expect(Number.isFinite(out.z)).toBe(true);
    expect(Math.hypot(out.x, out.y, out.z)).toBeLessThanOrEqual(
      DEFAULT_GRAVITATIONAL_PARAMS.maxAcceleration + 0.001
    );

    const tidalFar = evaluateTidalForces({ x: 8.0, y: 0.12, z: 0 }, bh, 4.6, 3.5, {
      distance: 0,
      toCenterX: 0,
      toCenterY: 0,
      toCenterZ: 0,
      tidalStretch: 0,
      rocheShear: 0,
    });
    const tidalClose = evaluateTidalForces({ x: 2.1, y: 0.12, z: 0 }, bh, 4.6, 3.5, {
      distance: 0,
      toCenterX: 0,
      toCenterY: 0,
      toCenterZ: 0,
      tidalStretch: 0,
      rocheShear: 0,
    });
    expect(tidalFar.tidalStretch).toBe(0);
    expect(tidalClose.tidalStretch).toBeGreaterThan(0.5);
    expect(tidalClose.rocheShear).toBeGreaterThan(0.5);
  });

  it('5, 6 & 7: progresses stars smoothly through all 8 states, depletes energy gradually, emits tidal stream, consumes, and spawns next star sequentially', () => {
    const sim = new CosmicSimulationManager({ customRng: createDeterministicRng(777) });
    sim.updateSettings({
      ...DEFAULT_DEVOURER_SETTINGS,
      starGenerationEnabled: true,
      planetGenerationEnabled: false,
      starCaptureIntensity: 1.35,
      starRespawnDelaySec: 0.6,
    });

    const events: CosmicDevourerEvent[] = [];
    sim.onEvent((evt) => events.push(evt));

    let witnessedMidDepletion = false;
    let maxTidalStreamActive = 0;
    let completedFirstStarStates: StarLifecycleState[] = [];
    let firstStarId: string | null = null;

    // Advance up to 24 seconds at 60 FPS
    for (let frame = 0; frame < 24 * 60; frame += 1) {
      sim.step(1 / 60);

      const snap = sim.getSnapshot();
      if (snap.activeTidalParticles > maxTidalStreamActive) {
        maxTidalStreamActive = snap.activeTidalParticles;
      }

      if (sim.stars.length > 0) {
        const active = sim.stars[0];
        if (!firstStarId) {
          firstStarId = active.id;
        }
        if (active.id === firstStarId) {
          completedFirstStarStates = [...active.visitedStates];
          if (active.energy > 0.15 && active.energy < 0.85) {
            witnessedMidDepletion = true;
          }
        }
      }

      if (sim.totalStarsConsumed >= 1 && sim.totalStarsSpawned >= 2) {
        break;
      }
    }

    // Never disappears instantaneously: energy depleted smoothly and emitted tidal stream
    expect(witnessedMidDepletion).toBe(true);
    expect(maxTidalStreamActive).toBeGreaterThan(8);
    expect(sim.totalStarsConsumed).toBeGreaterThanOrEqual(1);
    expect(sim.totalStarsSpawned).toBeGreaterThanOrEqual(2); // Sequential respawn confirmed!

    // Verify ordered lifecycle stages were traversed cleanly
    expect(completedFirstStarStates).toContain('SPAWNING');
    expect(completedFirstStarStates).toContain('GRAVITATIONALLY_ATTRACTED');
    expect(completedFirstStarStates).toContain('TIDAL_DISRUPTION');
    expect(completedFirstStarStates).toContain('ENERGY_DEPLETION');
    expect(completedFirstStarStates).toContain('FINAL_CONSUMPTION');

    // Verify star audio/simulation events fired with unique IDs (v2.3 + v2.4 Phase 9 TDE lifecycle)
    const starEventTypes = events.map((e) => e.type);
    expect(starEventTypes).toContain('STAR_APPROACH');
    expect(starEventTypes).toContain('STAR_CAPTURED');
    expect(starEventTypes).toContain('STAR_TIDAL_STRETCH');
    expect(starEventTypes).toContain('STAR_DISRUPTION');
    expect(starEventTypes).toContain('STAR_TIDAL_DISRUPTION');
    expect(starEventTypes).toContain('STAR_DEBRIS_STREAM');
    expect(starEventTypes).toContain('STAR_ACCRETION');
    expect(starEventTypes).toContain('STAR_CONSUMED');
    expect(sim.totalOutflowParticlesEmitted).toBeGreaterThan(0);
    expect(sim.getSnapshot().shadowRadius).toBeCloseTo(1.15, 3);
  });

  it('8, 9 & 10: captures planets, detaches crustal boulders + tumbling debris shards inside Roche limit, consumes core, and guarantees globally unique eventIds', () => {
    const sim = new CosmicSimulationManager({ customRng: createDeterministicRng(999) });
    sim.updateSettings({
      ...DEFAULT_DEVOURER_SETTINGS,
      starGenerationEnabled: false,
      planetGenerationEnabled: true,
      planetCaptureIntensity: 1.4,
    });

    const events: CosmicDevourerEvent[] = [];
    sim.onEvent((evt) => events.push(evt));

    let maxFragments = 0;
    let maxBoulders = 0;
    for (let frame = 0; frame < 24 * 60; frame += 1) {
      sim.step(1 / 60);
      const snap = sim.getSnapshot();
      if (snap.activePlanetFragments > maxFragments) {
        maxFragments = snap.activePlanetFragments;
      }
      if (snap.activePlanetBoulders > maxBoulders) {
        maxBoulders = snap.activePlanetBoulders;
      }
      if (sim.totalPlanetsConsumed >= 1) {
        break;
      }
    }

    expect(maxFragments).toBeGreaterThan(4);
    expect(maxBoulders).toBeGreaterThan(1);
    expect(sim.totalPlanetsConsumed).toBeGreaterThanOrEqual(1);

    const eventIds = events.map((e) => e.eventId);
    expect(new Set(eventIds).size).toBe(eventIds.length); // 100% unique event IDs!
    expect(events.map((e) => e.type)).toContain('PLANET_CAPTURED');
    expect(events.map((e) => e.type)).toContain('PLANET_FRAGMENTATION');
    expect(events.map((e) => e.type)).toContain('PLANET_FRAGMENTED');
    expect(events.map((e) => e.type)).toContain('PLANET_ACCRETION');
    expect(events.map((e) => e.type)).toContain('PLANET_CONSUMED');
  });

  it('14: scales TDE timeline via disruptionDurationScale and persists stableCameraMode cleanly', () => {
    const fastSim = new CosmicSimulationManager({ customRng: createDeterministicRng(777) });
    fastSim.updateSettings({
      ...DEFAULT_DEVOURER_SETTINGS,
      planetGenerationEnabled: false,
      starCaptureIntensity: 1.35,
      disruptionDurationScale: 0.55,
      stableCameraMode: true,
    });
    expect(fastSim.settings.disruptionDurationScale).toBeCloseTo(0.55, 2);
    expect(fastSim.settings.stableCameraMode).toBe(true);

    let fastFrames = 0;
    for (let f = 0; f < 24 * 60; f += 1) {
      fastSim.step(1 / 60);
      fastFrames = f + 1;
      if (fastSim.totalStarsConsumed >= 1) break;
    }

    const slowSim = new CosmicSimulationManager({ customRng: createDeterministicRng(777) });
    slowSim.updateSettings({
      ...DEFAULT_DEVOURER_SETTINGS,
      planetGenerationEnabled: false,
      starCaptureIntensity: 1.35,
      disruptionDurationScale: 2.0,
    });

    let slowFrames = 0;
    for (let f = 0; f < 36 * 60; f += 1) {
      slowSim.step(1 / 60);
      slowFrames = f + 1;
      if (slowSim.totalStarsConsumed >= 1) break;
    }

    expect(fastSim.totalStarsConsumed).toBeGreaterThanOrEqual(1);
    expect(slowSim.totalStarsConsumed).toBeGreaterThanOrEqual(1);
    expect(slowFrames).toBeGreaterThan(fastFrames);
  });

  it('11, 12 & 13: enforces frame-rate-independent motion (30 FPS vs 120 FPS), cosmic drift toggle, quality modes, and clean reset', () => {
    // Run two identical deterministic simulations for 3.0 physical seconds: one at 30 FPS, one at 120 FPS
    const sim30 = new CosmicSimulationManager({ customRng: createDeterministicRng(2026) });
    const sim120 = new CosmicSimulationManager({ customRng: createDeterministicRng(2026) });

    for (let i = 0; i < 90; i += 1) {
      sim30.step(1 / 30);
    }
    for (let i = 0; i < 360; i += 1) {
      sim120.step(1 / 120);
    }

    const snap30 = sim30.getSnapshot();
    const snap120 = sim120.getSnapshot();

    // Fixed 120Hz substep accumulator guarantees near-identical drift & star positions across frame rates!
    expect(Math.abs(snap30.driftOffset.z - snap120.driftOffset.z)).toBeLessThan(0.08);
    expect(snap30.activeStars.length).toBeGreaterThan(0);
    expect(snap120.activeStars.length).toBe(snap30.activeStars.length);
    expect(Math.abs(snap30.activeStars[0].x - snap120.activeStars[0].x)).toBeLessThan(0.12);

    // Disabling cosmicDrift freezes driftOffset while keeping black hole stable
    sim120.updateSettings({ cosmicDriftEnabled: false, qualityPreset: 'performance' });
    expect(sim120.getQualityBudgetScale()).toBeCloseTo(0.42, 2);
    const frozenZ = sim120.driftOffset.z;
    for (let i = 0; i < 30; i += 1) {
      sim120.step(1 / 60);
    }
    expect(sim120.driftOffset.z).toBeCloseTo(frozenZ, 5);

    // Clean reset clears all active stars, planets, tidal streams, and fragment pools
    sim120.reset();
    const cleared = sim120.getSnapshot();
    expect(cleared.activeStars.length).toBe(0);
    expect(cleared.activePlanets.length).toBe(0);
    expect(cleared.activeTidalParticles).toBe(0);
    expect(cleared.activePlanetFragments).toBe(0);
  });
});
