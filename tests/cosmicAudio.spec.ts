import { expect, Page, test } from '@playwright/test';

interface AudioDebugSnapshot {
  preferences: {
    enabled: boolean;
    muted: boolean;
    masterVolume: number;
    preset:
      | 'DEEP_SPACE'
      | 'SINGULARITY'
      | 'COSMIC_STORM'
      | 'HIGH_INTENSITY'
      | 'CINEMATIC_HORROR';
    cinematicAudioMode: boolean;
    layers: {
      drone: boolean;
      gravitationalPressure: boolean;
      plasma: boolean;
      ingestion: boolean;
      shockwave: boolean;
      starConsumption: boolean;
      planetConsumption: boolean;
      ui: boolean;
    };
  };
  contextState: string;
  isInitialized: boolean;
  isAudible: boolean;
  needsGestureUnlock: boolean;
  isAuthenticated: boolean;
  effectiveMasterGain: number;
  layerGains: {
    drone: number;
    gravitationalPressure: number;
    plasma: number;
    thinking: number;
    approach: number;
  };
  stats: {
    ingestionSoundsPlayed: number;
    shockwaveSoundsPlayed: number;
    starSoundsPlayed: number;
    planetSoundsPlayed: number;
    uiSoundsPlayed: number;
    testSoundsPlayed: number;
  };
}

interface DevourerDebugSnapshot {
  simTime: number;
  shadowRadius: number;
  driftOffset: { x: number; y: number; z: number };
  totalStarsSpawned: number;
  totalStarsConsumed: number;
  totalPlanetsSpawned: number;
  activeStars: Array<{ id: string; state: string; energy: number; spaghettification: number }>;
  activePlanets: Array<{ id: string; state: string; integrity: number }>;
}

async function getAudioSnapshot(page: Page): Promise<AudioDebugSnapshot> {
  return page.evaluate(() => {
    const handle = (
      window as unknown as { __DEVMIND_AUDIO__: { getSnapshot: () => AudioDebugSnapshot } }
    ).__DEVMIND_AUDIO__;
    return handle.getSnapshot();
  });
}

async function getDevourerSnapshot(page: Page): Promise<DevourerDebugSnapshot> {
  return page.evaluate(() => {
    const handle = (
      window as unknown as { __DEVMIND_DEVOURER__: { getSnapshot: () => DevourerDebugSnapshot } }
    ).__DEVMIND_DEVOURER__;
    return handle.getSnapshot();
  });
}

test.describe('DEVMIND AI — SINGULARITY: EXTREME v2.3 (Cosmic Devourer & High-Presence Audio E2E)', () => {
  test('No autoplay on AuthPortal, louder 0.80 default masterVolume, HIGH_INTENSITY preset, star/planet layers, test sound & reload persistence', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // 1. Unauthenticated Login / Sign Up screen: zero autoplay, AudioContext uninitialized
    await page.goto('http://127.0.0.1:5173/');
    await expect(page.getByTestId('unauthenticated-auth-panel')).toBeVisible();
    await expect(page.getByTestId('cosmic-audio-controller')).not.toBeVisible();

    const unauthAudio = await getAudioSnapshot(page);
    expect(unauthAudio.contextState).toBe('uninitialized');
    expect(unauthAudio.isAudible).toBe(false);
    expect(unauthAudio.effectiveMasterGain).toBe(0);

    // 2. Authenticate into workstation: Audio defaults OFF (0.80 volume, SINGULARITY preset, uninitialized)
    await page.goto('http://127.0.0.1:5173/?auto_auth=1');
    await expect(page.getByTestId('cosmic-audio-controller')).toBeVisible();

    const initialSnap = await getAudioSnapshot(page);
    expect(initialSnap.preferences.enabled).toBe(false);
    expect(initialSnap.preferences.masterVolume).toBeCloseTo(0.8, 2);
    expect(initialSnap.preferences.preset).toBe('SINGULARITY');
    expect(initialSnap.preferences.layers.starConsumption).toBe(true);
    expect(initialSnap.preferences.layers.planetConsumption).toBe(true);
    expect(initialSnap.contextState).toBe('uninitialized');
    expect(initialSnap.isAudible).toBe(false);

    // 3. Open top-right glassmorphism Cosmic Audio Settings panel & explicitly enable Cosmic Audio
    await page.getByTestId('topbar-audio-settings-btn').click();
    await expect(page.getByTestId('cosmic-audio-settings-panel')).toBeVisible();
    await expect(page.getByTestId('enable-cosmic-audio-callout')).toBeVisible();

    await page.getByTestId('enable-cosmic-audio-cta').click();
    const enabledSnap = await getAudioSnapshot(page);
    expect(enabledSnap.preferences.enabled).toBe(true);
    expect(enabledSnap.contextState).toBe('running');
    expect(enabledSnap.isAudible).toBe(true);
    expect(enabledSnap.effectiveMasterGain).toBeCloseTo(0.8, 2);

    // 4. Switch live to CINEMATIC_HORROR preset, enable Cinematic Audio Mode & toggle individual layers
    await page.getByTestId('audio-preset-CINEMATIC_HORROR').click();
    await page.getByTestId('audio-cinematic-mode-toggle').click();
    await page.getByTestId('audio-layer-plasma').click();
    await page.getByTestId('audio-volume-slider').fill('85');
    await page.getByTestId('audio-volume-slider').dispatchEvent('change');

    const customizedSnap = await getAudioSnapshot(page);
    expect(customizedSnap.preferences.preset).toBe('CINEMATIC_HORROR');
    expect(customizedSnap.preferences.cinematicAudioMode).toBe(true);
    expect(customizedSnap.preferences.layers.plasma).toBe(false);
    expect(customizedSnap.preferences.layers.gravitationalPressure).toBe(true);
    expect(customizedSnap.layerGains.plasma).toBe(0);
    expect(customizedSnap.layerGains.drone).toBeGreaterThan(0.8);

    // 5. Test Sound button plays procedural check
    await page.getByTestId('audio-test-sound-btn').click();
    const afterTestSnap = await getAudioSnapshot(page);
    expect(afterTestSnap.stats.testSoundsPlayed).toBe(1);

    // 6. Instant Master Mute silences all output immediately
    await page.getByTestId('audio-panel-mute-btn').click();
    const mutedSnap = await getAudioSnapshot(page);
    expect(mutedSnap.preferences.muted).toBe(true);
    expect(mutedSnap.effectiveMasterGain).toBe(0);
    expect(mutedSnap.isAudible).toBe(false);

    // Unmute before testing real particle ingestion synchronization
    await page.getByTestId('audio-panel-mute-btn').click();
    await page.getByTestId('close-audio-settings-btn').click();

    // 7. Delete characters -> actual Event Horizon trajectory ingestion triggers ingestion + shockwave audio!
    const chatInput = page.getByTestId('singularity-chat-input');
    await chatInput.click();
    await page.keyboard.type('HorizonWave', { delay: 15 });
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');

    await page.waitForFunction(() => {
      const h = (
        window as unknown as {
          __DEVMIND_AUDIO__: {
            getSnapshot: () => {
              stats: { ingestionSoundsPlayed: number; shockwaveSoundsPlayed: number };
            };
          };
        }
      ).__DEVMIND_AUDIO__;
      const s = h.getSnapshot().stats;
      return s.ingestionSoundsPlayed >= 1 && s.shockwaveSoundsPlayed >= 1;
    });

    // 8. Reload page -> user preferences persist across reload WITHOUT unprompted AudioContext creation!
    await page.reload();
    await expect(page.getByTestId('cosmic-audio-controller')).toBeVisible();
    const reloadedSnap = await getAudioSnapshot(page);
    expect(reloadedSnap.preferences.enabled).toBe(true);
    expect(reloadedSnap.preferences.preset).toBe('CINEMATIC_HORROR');
    expect(reloadedSnap.preferences.cinematicAudioMode).toBe(true);
    expect(reloadedSnap.preferences.layers.plasma).toBe(false);
    expect(reloadedSnap.contextState).toBe('uninitialized');

    await context.close();
  });

  test('v2.4 The Devourer WebGL simulation exposes 1.15 shadow radius, drifts, spawns TDE stars & planets, and exposes Stable Camera & Timeline controls', async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto('http://127.0.0.1:5173/?auto_auth=1');
    await expect(page.getByTestId('black-hole-scene-container')).toBeVisible();

    // Wait until Cosmic Devourer simulation advances cosmic drift and spawns at least 1 star & 1 planet
    await page.waitForFunction(
      () => {
        const d = (
          window as unknown as {
            __DEVMIND_DEVOURER__?: { getSnapshot: () => DevourerDebugSnapshot };
          }
        ).__DEVMIND_DEVOURER__;
        if (!d) return false;
        const snap = d.getSnapshot();
        return (
          snap.simTime > 1.8 &&
          Math.abs(snap.driftOffset.z) > 0.4 &&
          snap.totalStarsSpawned >= 1 &&
          snap.totalPlanetsSpawned >= 1
        );
      },
      { timeout: 10000 }
    );

    const devourerSnap = await getDevourerSnapshot(page);
    expect(devourerSnap.shadowRadius).toBeCloseTo(1.15, 2);
    expect(devourerSnap.totalStarsSpawned).toBeGreaterThanOrEqual(1);
    expect(devourerSnap.totalPlanetsSpawned).toBeGreaterThanOrEqual(1);
    expect(Math.abs(devourerSnap.driftOffset.z)).toBeGreaterThan(0.4);

    // Open Visual Settings Modal and verify v2.4 The Devourer, Stable Camera, Timeline & Fallback controls
    await page.getByTestId('open-visual-settings').click();
    await expect(page.getByTestId('visual-settings-modal')).toBeVisible();
    await page.getByTestId('quality-preset-balanced').click();
    await expect(page.getByTestId('toggle-cosmic-drift')).toBeChecked();
    await expect(page.getByTestId('toggle-star-generation')).toBeChecked();
    await expect(page.getByTestId('toggle-planet-generation')).toBeChecked();
    await expect(page.getByTestId('devourer-slider-disruptionDurationScale')).toBeVisible();

    // Toggle Stable Camera Viewing Mode & Static Fallback cleanly
    await page.getByTestId('toggle-stable-camera').check();
    await expect(page.getByTestId('toggle-stable-camera')).toBeChecked();
    await page.getByTestId('toggle-static-fallback').check();
    await expect(page.getByTestId('singularity-webgl-fallback')).toBeVisible();
    await page.getByTestId('toggle-static-fallback').uncheck();

    await context.close();
  });
});
