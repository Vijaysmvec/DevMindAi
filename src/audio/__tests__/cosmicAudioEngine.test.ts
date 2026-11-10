import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CosmicSimulationEngine } from '../../engine/cosmicEngine';
import { CosmicSimulationManager } from '../../engine/CosmicSimulationManager';
import { AUDIO_PRESETS } from '../AudioPresets';
import { getAudioStorageKey } from '../AudioSettings';
import { CosmicAudioEngine } from '../CosmicAudioEngine';
import { CosmicAudioEventBridge } from '../CosmicAudioEvents';

interface MockAudioParam {
  value: number;
  setValueAtTime: ReturnType<typeof vi.fn>;
  linearRampToValueAtTime: ReturnType<typeof vi.fn>;
  exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
  setTargetAtTime: ReturnType<typeof vi.fn>;
  cancelScheduledValues: ReturnType<typeof vi.fn>;
}

function createMockParam(initial = 0): MockAudioParam {
  const param: MockAudioParam = {
    value: initial,
    setValueAtTime: vi.fn((val: number) => {
      param.value = val;
    }),
    linearRampToValueAtTime: vi.fn((val: number) => {
      param.value = val;
    }),
    exponentialRampToValueAtTime: vi.fn((val: number) => {
      param.value = val;
    }),
    setTargetAtTime: vi.fn((val: number) => {
      param.value = val;
    }),
    cancelScheduledValues: vi.fn(),
  };
  return param;
}

class MockWebAudioHarness {
  public contextCreatedCount = 0;
  public state: AudioContextState = 'suspended';
  public currentTime = 0;
  public sampleRate = 44100;
  public disconnectCalls = 0;

  public createdGains: Array<{ gain: MockAudioParam; disconnect: ReturnType<typeof vi.fn> }> = [];
  public createdOscillators: Array<{
    type: OscillatorType;
    frequency: MockAudioParam;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    onended: (() => void) | null;
  }> = [];
  public createdFilters: Array<{
    type: BiquadFilterType;
    frequency: MockAudioParam;
    Q: MockAudioParam;
    disconnect: ReturnType<typeof vi.fn>;
  }> = [];

  public resume = vi.fn(async () => {
    this.state = 'running';
  });

  public suspend = vi.fn(async () => {
    this.state = 'suspended';
  });

  public close = vi.fn(async () => {
    this.state = 'closed';
  });

  public createContext = (): AudioContext => {
    this.contextCreatedCount += 1;
    this.state = 'running';

    const makeDisconnect = () =>
      vi.fn(() => {
        this.disconnectCalls += 1;
      });

    const getState = () => this.state;
    const getCurrentTime = () => this.currentTime;

    const ctx = {
      get state() {
        return getState();
      },
      get currentTime() {
        return getCurrentTime();
      },
      sampleRate: this.sampleRate,
      destination: { connect: vi.fn(), disconnect: makeDisconnect() },
      resume: this.resume,
      suspend: this.suspend,
      close: this.close,
      createGain: vi.fn(() => {
        const node = {
          gain: createMockParam(1),
          connect: vi.fn(),
          disconnect: makeDisconnect(),
        };
        this.createdGains.push(node);
        return node;
      }),
      createOscillator: vi.fn(() => {
        const osc = {
          type: 'sine' as OscillatorType,
          frequency: createMockParam(440),
          detune: createMockParam(0),
          connect: vi.fn(),
          disconnect: makeDisconnect(),
          start: vi.fn(),
          stop: vi.fn(),
          onended: null as (() => void) | null,
        };
        this.createdOscillators.push(osc);
        return osc;
      }),
      createBiquadFilter: vi.fn(() => {
        const filter = {
          type: 'lowpass' as BiquadFilterType,
          frequency: createMockParam(350),
          Q: createMockParam(1),
          gain: createMockParam(0),
          connect: vi.fn(),
          disconnect: makeDisconnect(),
        };
        this.createdFilters.push(filter);
        return filter;
      }),
      createDynamicsCompressor: vi.fn(() => ({
        threshold: createMockParam(-24),
        knee: createMockParam(30),
        ratio: createMockParam(12),
        attack: createMockParam(0.003),
        release: createMockParam(0.25),
        connect: vi.fn(),
        disconnect: makeDisconnect(),
      })),
      createStereoPanner: vi.fn(() => ({
        pan: createMockParam(0),
        connect: vi.fn(),
        disconnect: makeDisconnect(),
      })),
      createAnalyser: vi.fn(() => ({
        fftSize: 256,
        frequencyBinCount: 128,
        smoothingTimeConstant: 0.8,
        getByteFrequencyData: vi.fn((arr: Uint8Array) => {
          arr.fill(96);
        }),
        getByteTimeDomainData: vi.fn((arr: Uint8Array) => {
          for (let i = 0; i < arr.length; i += 1) {
            arr[i] = i % 2 === 0 ? 156 : 100;
          }
        }),
        connect: vi.fn(),
        disconnect: makeDisconnect(),
      })),
      createBuffer: vi.fn((_channels: number, length: number, sampleRate: number) => {
        const channel = new Float32Array(length);
        return {
          length,
          sampleRate,
          numberOfChannels: 1,
          duration: length / sampleRate,
          getChannelData: () => channel,
        };
      }),
      createBufferSource: vi.fn(() => ({
        buffer: null,
        loop: false,
        playbackRate: createMockParam(1),
        connect: vi.fn(),
        disconnect: makeDisconnect(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null as (() => void) | null,
      })),
      createConvolver: vi.fn(() => ({
        buffer: null,
        normalize: true,
        connect: vi.fn(),
        disconnect: makeDisconnect(),
      })),
    };

    return ctx as unknown as AudioContext;
  };
}

function createMemoryLocalStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, String(value));
    },
  };
}

describe('CosmicAudioEngine — SINGULARITY: EXTREME v2.2', () => {
  let harness: MockWebAudioHarness;

  beforeEach(() => {
    vi.useFakeTimers();
    harness = new MockWebAudioHarness();
    vi.stubGlobal('window', {
      localStorage: createMemoryLocalStorage(),
      innerWidth: 1440,
      innerHeight: 900,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('1 & 8 & 11: initializes AudioContext ONLY after explicit user gesture and stays completely silent when disabled', async () => {
    const sim = new CosmicSimulationEngine();
    const engine = new CosmicAudioEngine({ contextFactory: harness.createContext });
    const bridge = new CosmicAudioEventBridge(engine, sim);
    bridge.attach();

    // Before user gesture: AudioContext is NOT created and audio is disabled by default
    expect(harness.contextCreatedCount).toBe(0);
    expect(engine.getSnapshot().contextState).toBe('uninitialized');
    expect(engine.getSnapshot().preferences.enabled).toBe(false);
    expect(engine.getSnapshot().effectiveMasterGain).toBe(0);

    // Particle ingestion & UI events while disabled produce zero AudioContext & zero sounds
    sim.registerParticleIngestion({
      particleId: 'disabled-glyph-1',
      particleType: 'glyph',
      entryPosition: { x: 700, y: 420 },
      energyIntensity: 0.7,
      source: 'backspace',
    });
    sim.notifyStateChange('MESSAGE_SUBMITTED');

    expect(harness.contextCreatedCount).toBe(0);
    expect(engine.getSnapshot().stats.ingestionSoundsPlayed).toBe(0);
    expect(engine.getSnapshot().stats.shockwaveSoundsPlayed).toBe(0);
    expect(engine.getSnapshot().stats.uiSoundsPlayed).toBe(0);

    // Explicit user gesture initializes AudioContext exactly once with louder v2.3 0.80 default masterVolume
    await engine.enableFromUserGesture();
    expect(harness.contextCreatedCount).toBe(1);
    expect(engine.getSnapshot().isAudible).toBe(true);
    expect(engine.getSnapshot().effectiveMasterGain).toBeCloseTo(0.8, 2);

    bridge.detach();
    await engine.dispose();
  });

  it('2 & 3: master mute immediately silences all layers without destroying engine, and volume updates master gain', async () => {
    const engine = new CosmicAudioEngine({ contextFactory: harness.createContext });
    await engine.enableFromUserGesture();

    // Default v2.3 master volume is 0.80
    expect(engine.getSnapshot().effectiveMasterGain).toBeCloseTo(0.8, 3);

    // Volume slider updates master gain smoothly
    engine.setMasterVolume(0.42);
    expect(engine.getSnapshot().effectiveMasterGain).toBeCloseTo(0.42, 3);
    expect(engine.getSnapshot().preferences.masterVolume).toBeCloseTo(0.42, 3);

    // Master mute immediately drops master gain to 0 while keeping AudioContext alive
    await engine.setMutedFromUserGesture(true);
    expect(engine.getSnapshot().effectiveMasterGain).toBe(0);
    expect(engine.getSnapshot().isAudible).toBe(false);
    expect(engine.getSnapshot().isInitialized).toBe(true);
    expect(harness.close).not.toHaveBeenCalled();

    // Events triggered while muted produce zero transient sounds
    const playedWhileMuted = engine.handleParticleIngested({
      particleId: 'muted-p-1',
      energyIntensity: 0.8,
    });
    expect(playedWhileMuted).toBe(false);
    expect(engine.getSnapshot().stats.ingestionSoundsPlayed).toBe(0);

    // Unmuting restores exact user volume without recreating AudioContext
    await engine.setMutedFromUserGesture(false);
    expect(harness.contextCreatedCount).toBe(1);
    expect(engine.getSnapshot().effectiveMasterGain).toBeCloseTo(0.42, 3);
    expect(engine.getSnapshot().isAudible).toBe(true);

    await engine.dispose();
  });

  it('4 & 5: individual layer toggles and live preset switching update audio parameters independently', async () => {
    const engine = new CosmicAudioEngine({ contextFactory: harness.createContext });
    await engine.enableFromUserGesture();

    // Default preset is SINGULARITY
    expect(engine.getSnapshot().preferences.preset).toBe('SINGULARITY');
    expect(engine.getSnapshot().layerGains.drone).toBeCloseTo(
      AUDIO_PRESETS.SINGULARITY.droneGain,
      3
    );
    expect(engine.getSnapshot().layerGains.plasma).toBeCloseTo(
      AUDIO_PRESETS.SINGULARITY.plasmaGain,
      3
    );

    // Switch live to DEEP_SPACE -> drone becomes more prominent, plasma subtler
    engine.setPreset('DEEP_SPACE');
    expect(engine.getSnapshot().layerGains.drone).toBeCloseTo(
      AUDIO_PRESETS.DEEP_SPACE.droneGain,
      3
    );
    expect(engine.getSnapshot().layerGains.plasma).toBeCloseTo(
      AUDIO_PRESETS.DEEP_SPACE.plasmaGain,
      3
    );

    // Switch live to COSMIC_STORM -> energetic plasma & stronger event profiles
    engine.setPreset('COSMIC_STORM');
    expect(engine.getSnapshot().layerGains.plasma).toBeCloseTo(
      AUDIO_PRESETS.COSMIC_STORM.plasmaGain,
      3
    );

    // Switch live to HIGH_INTENSITY -> maximum safe theater presence
    engine.setPreset('HIGH_INTENSITY');
    expect(engine.getSnapshot().layerGains.drone).toBeCloseTo(
      AUDIO_PRESETS.HIGH_INTENSITY.droneGain,
      3
    );
    expect(engine.getSnapshot().layerGains.plasma).toBeCloseTo(
      AUDIO_PRESETS.HIGH_INTENSITY.plasmaGain,
      3
    );
    expect(harness.contextCreatedCount).toBe(1); // Switched live without restarting AudioContext

    // Toggle individual layers independently
    engine.setLayerEnabled('drone', false);
    expect(engine.getSnapshot().layerGains.drone).toBe(0);
    expect(engine.getSnapshot().layerGains.plasma).toBeGreaterThan(0);

    engine.setLayerEnabled('ingestion', false);
    expect(
      engine.handleParticleIngested({ particleId: 'ing-off-1', energyIntensity: 0.7 })
    ).toBe(false);
    expect(engine.handleCosmicShockwave({ intensity: 0.75, coalesced: false })).toBe(true);
    expect(engine.getSnapshot().stats.ingestionSoundsPlayed).toBe(0);
    expect(engine.getSnapshot().stats.shockwaveSoundsPlayed).toBe(1);

    engine.setLayerEnabled('shockwave', false);
    expect(engine.handleCosmicShockwave({ intensity: 0.75, coalesced: false })).toBe(false);
    expect(engine.getSnapshot().stats.shockwaveSoundsPlayed).toBe(1);

    engine.setLayerEnabled('ui', false);
    engine.handleInteractionState('MESSAGE_SUBMITTED', 'IDLE');
    expect(engine.getSnapshot().stats.uiSoundsPlayed).toBe(0);

    await engine.dispose();
  });

  it('6, 7 & 8: particleIds trigger ingestion audio at most once, rapid bursts coalesce, and shockwave audio never fires on prompt submit', async () => {
    const sim = new CosmicSimulationEngine();
    const engine = new CosmicAudioEngine({ contextFactory: harness.createContext });
    const bridge = new CosmicAudioEventBridge(engine, sim);
    bridge.attach();
    await engine.enableFromUserGesture();

    let now = 5_000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);

    // Exact-once particleId deduplication
    sim.registerParticleIngestion({
      particleId: 'glyph-exact-1',
      particleType: 'glyph',
      entryPosition: { x: 760, y: 430 },
      energyIntensity: 0.6,
      source: 'backspace',
    });
    sim.registerParticleIngestion({
      particleId: 'glyph-exact-1',
      particleType: 'glyph',
      entryPosition: { x: 760, y: 430 },
      energyIntensity: 0.6,
      source: 'backspace',
    });
    // Also test direct engine deduplication guard
    engine.handleParticleIngested({ particleId: 'glyph-exact-1', energyIntensity: 0.6 });

    expect(engine.getSnapshot().stats.ingestionSoundsPlayed).toBe(1);
    expect(engine.getSnapshot().stats.shockwaveSoundsPlayed).toBe(1);

    // Advance past coalesce window, then fire a rapid burst of 10 distinct particles within 40ms
    now += 300;
    for (let i = 0; i < 10; i += 1) {
      now += 4;
      sim.registerParticleIngestion({
        particleId: `rapid-burst-${i}`,
        particleType: 'glyph',
        entryPosition: { x: 760, y: 430 },
        energyIntensity: 0.75,
        source: 'selection',
      });
    }

    // Leading particle plays immediately; remaining 9 coalesce into 1 follow-up batch (2 total instead of 10!)
    vi.advanceTimersByTime(120);
    expect(engine.getSnapshot().totalCoalescedIngestions).toBe(9);
    expect(engine.getSnapshot().stats.ingestionSoundsPlayed).toBe(3); // 1 initial + 1 burst lead + 1 coalesced batch
    expect(engine.getSnapshot().stats.shockwaveSoundsPlayed).toBe(2); // 1 initial + 1 coalesced shockwave

    // Prompt submission plays subtle UI cue ONLY — NEVER ingestion or shockwave audio!
    const preSubmitIngestions = engine.getSnapshot().stats.ingestionSoundsPlayed;
    const preSubmitShockwaves = engine.getSnapshot().stats.shockwaveSoundsPlayed;
    sim.notifyStateChange('MESSAGE_SUBMITTED');
    sim.triggerPulse('submission');

    expect(engine.getSnapshot().stats.uiSoundsPlayed).toBe(1);
    expect(engine.getSnapshot().stats.ingestionSoundsPlayed).toBe(preSubmitIngestions);
    expect(engine.getSnapshot().stats.shockwaveSoundsPlayed).toBe(preSubmitShockwaves);

    bridge.detach();
    await engine.dispose();
  });

  it('9: transient audio nodes disconnect and dispose deterministically after completion', async () => {
    const engine = new CosmicAudioEngine({ contextFactory: harness.createContext });
    await engine.enableFromUserGesture();

    const disconnectsBefore = harness.disconnectCalls;
    engine.handleParticleIngested({ particleId: 'dispose-check-1', energyIntensity: 0.7 });
    engine.handleCosmicShockwave({ intensity: 0.8, coalesced: false });

    expect(engine.getSnapshot().activeTransientVoices).toBe(2);

    // Advance timers past shockwave tail so transient voices complete and disconnect
    vi.advanceTimersByTime(1600);

    expect(engine.getSnapshot().activeTransientVoices).toBe(0);
    expect(engine.getSnapshot().totalDisposedVoices).toBe(2);
    expect(harness.disconnectCalls).toBeGreaterThan(disconnectsBefore + 8);

    await engine.dispose();
  });

  it('10: user audio preferences persist across reloads per user and silence on unauthenticated screens', async () => {
    const engineSession1 = new CosmicAudioEngine({
      contextFactory: harness.createContext,
      requireAuthentication: true,
    });

    // Unauthenticated Login/Sign-Up screen stays strictly silent
    expect(engineSession1.getSnapshot().isAuthenticated).toBe(false);
    expect(engineSession1.getSnapshot().effectiveMasterGain).toBe(0);

    // Authenticate as User #101 and customize preferences
    engineSession1.setAuthenticatedUser(101);
    await engineSession1.enableFromUserGesture();
    engineSession1.setMasterVolume(0.78);
    engineSession1.setPreset('COSMIC_STORM');
    engineSession1.setLayerEnabled('plasma', false);
    await engineSession1.setMutedFromUserGesture(true);

    expect(window.localStorage.getItem(getAudioStorageKey(101))).toBeTruthy();
    await engineSession1.dispose();

    // Simulate browser reload with a brand-new engine instance
    const reloadHarness = new MockWebAudioHarness();
    const engineReloaded = new CosmicAudioEngine({
      contextFactory: reloadHarness.createContext,
      requireAuthentication: true,
    });

    // Reload does NOT autoplay or instantiate AudioContext before gesture
    engineReloaded.setAuthenticatedUser(101);
    expect(reloadHarness.contextCreatedCount).toBe(0);

    const restored = engineReloaded.getPreferences();
    expect(restored.enabled).toBe(true);
    expect(restored.muted).toBe(true);
    expect(restored.masterVolume).toBeCloseTo(0.78, 3);
    expect(restored.preset).toBe('COSMIC_STORM');
    expect(restored.layers.plasma).toBe(false);
    expect(restored.layers.drone).toBe(true);

    // Switching to another user (#202) loads clean defaults isolated from User #101
    engineReloaded.setAuthenticatedUser(202);
    expect(engineReloaded.getPreferences().enabled).toBe(false);
    expect(engineReloaded.getPreferences().preset).toBe('SINGULARITY');
    expect(engineReloaded.getPreferences().masterVolume).toBeCloseTo(0.8, 3);

    await engineReloaded.dispose();
  });

  it('12 & 13: page visibility suspends/resumes audio safely, AnalyserNode syncs subtly, and unmount cleans up listeners', async () => {
    const sim = new CosmicSimulationEngine();
    const devourer = new CosmicSimulationManager();
    const engine = new CosmicAudioEngine({ contextFactory: harness.createContext });
    const bridge = new CosmicAudioEventBridge(engine, sim, devourer);

    // Attaching twice never registers duplicate listeners
    bridge.attach();
    bridge.attach();
    const activeCount = bridge.getActiveListenerCount();
    expect(activeCount).toBeGreaterThanOrEqual(5);

    await engine.enableFromUserGesture();
    const modActive = engine.syncVisualModulation();
    expect(modActive.bass).toBeGreaterThan(0);

    // Deduplicated celestial audio synchronization for star & planet consumption
    const starPlayed = engine.handleCelestialEvent({
      eventId: 'star-1:STAR_CONSUMED',
      objectId: 'star-1',
      type: 'STAR_CONSUMED',
      intensity: 0.9,
      position: { x: 0.5, y: 0.1, z: 0 },
      timestampMs: 1000,
    });
    const starDuplicate = engine.handleCelestialEvent({
      eventId: 'star-1:STAR_CONSUMED',
      objectId: 'star-1',
      type: 'STAR_CONSUMED',
      intensity: 0.9,
      position: { x: 0.5, y: 0.1, z: 0 },
      timestampMs: 1005,
    });
    expect(starPlayed).toBe(true);
    expect(starDuplicate).toBe(false);
    expect(engine.getSnapshot().stats.starSoundsPlayed).toBe(1);

    engine.setLayerEnabled('planetConsumption', false);
    expect(
      engine.handleCelestialEvent({
        eventId: 'planet-1:PLANET_FRAGMENTED',
        objectId: 'planet-1',
        type: 'PLANET_FRAGMENTED',
        intensity: 0.8,
        position: { x: 1, y: 0, z: 0 },
        timestampMs: 1010,
      })
    ).toBe(false);
    engine.setLayerEnabled('planetConsumption', true);
    expect(
      engine.handleCelestialEvent({
        eventId: 'planet-1:PLANET_FRAGMENTED',
        objectId: 'planet-1',
        type: 'PLANET_FRAGMENTED',
        intensity: 0.8,
        position: { x: 1, y: 0, z: 0 },
        timestampMs: 1020,
      })
    ).toBe(true);
    expect(engine.getSnapshot().stats.planetSoundsPlayed).toBe(1);

    // Tab becomes hidden -> master gain drops to 0 and AudioContext suspends
    await engine.handlePageVisibilityChange(true);
    expect(harness.suspend).toHaveBeenCalledTimes(1);
    expect(engine.getSnapshot().effectiveMasterGain).toBe(0);
    expect(engine.getSnapshot().isAudible).toBe(false);

    // Tab becomes visible again -> resumes because user had audio enabled & unmuted
    await engine.handlePageVisibilityChange(false);
    expect(harness.resume).toHaveBeenCalled();
    expect(engine.getSnapshot().effectiveMasterGain).toBeCloseTo(0.8, 3);
    expect(engine.getSnapshot().isAudible).toBe(true);

    // Unmount cleanup removes all listeners cleanly
    bridge.detach();
    expect(bridge.isAttached()).toBe(false);
    expect(bridge.getActiveListenerCount()).toBe(0);

    const preDetachCount = engine.getSnapshot().stats.ingestionSoundsPlayed;
    sim.registerParticleIngestion({
      particleId: 'after-unmount-1',
      particleType: 'glyph',
      entryPosition: { x: 760, y: 430 },
      energyIntensity: 0.8,
      source: 'backspace',
    });
    expect(engine.getSnapshot().stats.ingestionSoundsPlayed).toBe(preDetachCount);

    await engine.dispose();
  });

  it('14: v2.4 CINEMATIC_HORROR preset, Cinematic Audio Mode, Gravitational Pressure layer & full Phase 9 TDE/Planetary events work without leaks', async () => {
    const engine = new CosmicAudioEngine({ contextFactory: harness.createContext });
    await engine.enableFromUserGesture();

    engine.setPreset('CINEMATIC_HORROR');
    engine.setCinematicAudioMode(true);
    engine.handleGravitationalTension(0.85);

    const horrorSnap = engine.getSnapshot();
    expect(horrorSnap.preferences.preset).toBe('CINEMATIC_HORROR');
    expect(horrorSnap.preferences.cinematicAudioMode).toBe(true);
    expect(horrorSnap.layerGains.drone).toBeCloseTo(AUDIO_PRESETS.CINEMATIC_HORROR.droneGain, 2);
    expect(horrorSnap.layerGains.gravitationalPressure).toBeGreaterThan(0.35);

    // Toggle Gravitational Pressure off -> layer gain drops to 0
    engine.setLayerEnabled('gravitationalPressure', false);
    expect(engine.getSnapshot().layerGains.gravitationalPressure).toBe(0);
    engine.setLayerEnabled('gravitationalPressure', true);

    // Fire all v2.4 Phase 9 TDE & Planetary Destruction events
    const v24StarEvents = [
      'STAR_APPROACH',
      'STAR_TIDAL_STRETCH',
      'STAR_DISRUPTION',
      'STAR_DEBRIS_STREAM',
      'STAR_ACCRETION',
    ] as const;
    for (const type of v24StarEvents) {
      const ok = engine.handleCelestialEvent({
        eventId: `star-v24:${type}`,
        objectId: 'star-v24',
        type,
        intensity: 0.88,
        position: { x: 1.5, y: 0.2, z: 0 },
        timestampMs: 2000,
      });
      expect(ok).toBe(true);
    }
    expect(engine.getSnapshot().stats.starSoundsPlayed).toBe(5);

    const v24PlanetEvents = ['PLANET_FRAGMENTATION', 'PLANET_ACCRETION'] as const;
    for (const type of v24PlanetEvents) {
      const ok = engine.handleCelestialEvent({
        eventId: `planet-v24:${type}`,
        objectId: 'planet-v24',
        type,
        intensity: 0.85,
        position: { x: 1.4, y: 0.1, z: 0 },
        timestampMs: 2100,
      });
      expect(ok).toBe(true);
    }
    expect(engine.getSnapshot().stats.planetSoundsPlayed).toBe(2);

    // Advance timers so all transient horror voices dispose cleanly
    vi.advanceTimersByTime(1800);
    expect(engine.getSnapshot().activeTransientVoices).toBe(0);
    expect(engine.getSnapshot().totalDisposedVoices).toBeGreaterThanOrEqual(7);

    await engine.dispose();
  });
});
