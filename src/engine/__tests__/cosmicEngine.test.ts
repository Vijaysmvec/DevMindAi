import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  CosmicSimulationEngine,
  DEFAULT_VISUAL_PREFERENCES,
  PARTICLE_SYSTEM_PARAMS,
} from '../cosmicEngine';

describe('CosmicSimulationEngine — SINGULARITY: EXTREME', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maintains strict 6-tier near-extremal Kerr rotation hierarchy', () => {
    const engine = new CosmicSimulationEngine();
    for (let i = 0; i < 60; i += 1) {
      engine.step(1 / 60);
    }

    expect(engine.innerDiskAngle).toBeGreaterThan(engine.innerPlasmaAngle);
    expect(engine.innerPlasmaAngle).toBeGreaterThan(engine.midDiskAngle);
    expect(engine.midDiskAngle).toBeGreaterThan(engine.outerDiskAngle);
    expect(engine.outerDiskAngle).toBeGreaterThan(engine.backgroundDustAngle);
    expect(engine.backgroundDustAngle).toBeGreaterThan(engine.starfieldAngle);
    expect(engine.starfieldAngle).toBeGreaterThan(0);
  });

  it('defines independent ultra-fine parameters for all 6 particle systems', () => {
    expect(Object.keys(PARTICLE_SYSTEM_PARAMS)).toEqual([
      'accretionDiskDust',
      'innerPlasmaParticles',
      'orbitalParticles',
      'backgroundCosmicDust',
      'gravitationalInteraction',
      'textDeletion',
    ]);
    expect(PARTICLE_SYSTEM_PARAMS.accretionDiskDust.maxSize).toBeLessThanOrEqual(0.012);
    expect(PARTICLE_SYSTEM_PARAMS.innerPlasmaParticles.maxSize).toBeLessThanOrEqual(0.01);
    expect(PARTICLE_SYSTEM_PARAMS.textDeletion.fontSizePx).toBeLessThanOrEqual(12);
  });

  it('deduplicates trajectory ingestion events strictly by particleId', () => {
    const engine = new CosmicSimulationEngine();
    const first = engine.registerParticleIngestion({
      particleId: 'glyph-42-0',
      particleType: 'glyph',
      entryPosition: { x: 760, y: 430 },
      energyIntensity: 0.65,
      source: 'backspace',
    });
    const duplicate = engine.registerParticleIngestion({
      particleId: 'glyph-42-0',
      particleType: 'glyph',
      entryPosition: { x: 760, y: 430 },
      energyIntensity: 0.65,
      source: 'backspace',
    });

    expect(first).not.toBeNull();
    expect(first?.eventSequence).toBe(1);
    expect(duplicate).toBeNull();
    expect(engine.totalIngestionEvents).toBe(1);
    expect(engine.totalShockwavesTriggered).toBe(1);
  });

  it('aggregates simultaneous particle ingestions into a capped shockwave and separates spaced ingestions', () => {
    const engine = new CosmicSimulationEngine();
    let now = 10_000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);

    // Rapid burst of 12 particles within 115ms coalesce window
    for (let i = 0; i < 12; i += 1) {
      now += 6;
      engine.registerParticleIngestion({
        particleId: `burst-${i}`,
        particleType: 'glyph',
        entryPosition: { x: 760, y: 430 },
        energyIntensity: 0.9,
        source: 'selection',
      });
    }

    expect(engine.totalIngestionEvents).toBe(12);
    expect(engine.activeShockwaves.length).toBe(1);
    expect(engine.activeShockwaves[0].particleCount).toBe(12);
    expect(engine.activeShockwaves[0].intensity).toBeLessThanOrEqual(1.0);

    // Advance wave by 5 frames (0.25s) and time past the 115ms window, then ingest another particle
    for (let i = 0; i < 5; i += 1) {
      engine.step(0.05);
    }
    expect(engine.shockwaveGlassBoost).toBeGreaterThan(0);
    expect(engine.shockwaveFrontRadiusPx).toBeGreaterThan(250);

    now += 400;
    engine.registerParticleIngestion({
      particleId: 'later-particle-1',
      particleType: 'accretion_dust',
      entryPosition: { x: 760, y: 430 },
      energyIntensity: 0.4,
      source: 'ambient_infall',
    });

    expect(engine.activeShockwaves.length).toBe(2);
    expect(engine.totalShockwavesTriggered).toBe(2);

    // Step until all shockwaves finish expanding across the viewport and clean up
    for (let i = 0; i < 60; i += 1) {
      engine.step(0.05);
    }
    expect(engine.activeShockwaves.length).toBe(0);
    expect(engine.shockwaveGlassBoost).toBe(0);
  });

  it('adapts shader quality, particle scale, reduced motion, and crystal-clear glass default', () => {
    const engine = new CosmicSimulationEngine();
    expect(DEFAULT_VISUAL_PREFERENCES.glass_transparency).toBe(0.08);
    expect(engine.getShaderQualityLevel()).toBe(1.0);

    engine.fps = 24;
    engine.preferences.graphics_quality = 'auto';
    expect(engine.getShaderQualityLevel()).toBe(0.5);
    expect(engine.getEffectiveParticleScale()).toBeCloseTo(0.48, 2);

    engine.preferences.reduced_motion = true;
    const prevAngle = engine.innerDiskAngle;
    engine.registerParticleIngestion({
      particleId: 'reduced-motion-1',
      particleType: 'glyph',
      entryPosition: { x: 760, y: 430 },
      energyIntensity: 0.7,
      source: 'delete',
    });
    expect(engine.activeShockwaves.length).toBe(0);
    for (let i = 0; i < 30; i += 1) {
      engine.step(1 / 60);
    }
    // Rotation target becomes 0 and decays smoothly toward standstill
    expect(Math.abs(engine.currentRotationSpeed)).toBeLessThan(0.2);
    expect(engine.starfieldAngle).toBe(0);
    expect(engine.innerDiskAngle).toBeGreaterThanOrEqual(prevAngle);
  });

  it('reverses rotational target and raises cyan glow during TEXT_UNDO', () => {
    const engine = new CosmicSimulationEngine();
    engine.state = 'TEXT_UNDO';
    for (let i = 0; i < 50; i += 1) {
      engine.step(1 / 30);
    }
    expect(engine.currentRotationSpeed).toBeLessThan(0);
    expect(engine.cyanStatusGlow).toBeGreaterThan(0.5);
  });
});
