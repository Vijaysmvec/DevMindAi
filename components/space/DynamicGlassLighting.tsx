import { useEffect } from 'react';
import { cosmicAudioEngine } from '../../src/audio/CosmicAudioEngine';
import { cosmicEngine } from '../../src/engine/cosmicEngine';

/**
 * Part B.4 & D.8: Dynamic Glass Lighting, Shockwave & Audio Specular Synchronizer
 * Synchronizes directional black-hole amber illumination, cursor cyan edge lighting,
 * cosmic heartbeat, and shockwave illumination onto CSS custom properties without
 * style-invalidation thrashing (throttled + diff-checked, zero React re-renders).
 */
export function DynamicGlassLighting() {
  useEffect(() => {
    let rafId = 0;
    let lastCssSyncMs = 0;
    const prevVars: Record<string, string> = {};

    const setRootVarIfChanged = (
      rootStyle: CSSStyleDeclaration,
      key: string,
      nextVal: string
    ) => {
      if (prevVars[key] !== nextVal) {
        prevVars[key] = nextVal;
        rootStyle.setProperty(key, nextVal);
      }
    };

    const applyVars = (now: number, force: boolean) => {
      const audioMod = cosmicAudioEngine.syncVisualModulation();
      const hasActiveShockwave = cosmicEngine.shockwaveGlassBoost > 0.012;
      const syncIntervalMs = hasActiveShockwave ? 32 : 85;

      if (!force && now - lastCssSyncMs < syncIntervalMs) {
        return;
      }
      lastCssSyncMs = now;

      const rootStyle = document.documentElement.style;
      setRootVarIfChanged(
        rootStyle,
        '--bh-screen-x',
        `${Math.round(cosmicEngine.blackHoleScreenX)}px`
      );
      setRootVarIfChanged(
        rootStyle,
        '--bh-screen-y',
        `${Math.round(cosmicEngine.blackHoleScreenY)}px`
      );
      setRootVarIfChanged(
        rootStyle,
        '--cursor-x',
        `${Math.round(cosmicEngine.smoothCursorX)}px`
      );
      setRootVarIfChanged(
        rootStyle,
        '--cursor-y',
        `${Math.round(cosmicEngine.smoothCursorY)}px`
      );

      const reflectionsEnabled =
        cosmicEngine.preferences.dynamic_glass_reflections &&
        cosmicEngine.preferences.mode !== 'focus';
      const reflectionScale = reflectionsEnabled ? 1.0 : 0.16;

      const glow =
        (0.48 + cosmicEngine.heartbeatWave * 0.28 + audioMod.bass * 0.1) *
        cosmicEngine.currentPlasmaBrightness *
        reflectionScale;

      // Only drive --shockwave-boost during actual cosmic shockwaves so backdrop-filter glass never thrashes at idle
      const shockBoost = hasActiveShockwave
        ? Math.min(1.0, cosmicEngine.shockwaveGlassBoost * reflectionScale)
        : 0;

      setRootVarIfChanged(rootStyle, '--bh-glow-intensity', glow.toFixed(2));
      setRootVarIfChanged(rootStyle, '--cosmic-pulse', cosmicEngine.heartbeatWave.toFixed(2));
      setRootVarIfChanged(
        rootStyle,
        '--shockwave-boost',
        shockBoost > 0 ? shockBoost.toFixed(3) : '0'
      );
      setRootVarIfChanged(
        rootStyle,
        '--shockwave-radius',
        shockBoost > 0 ? `${Math.round(cosmicEngine.shockwaveFrontRadiusPx)}px` : '0px'
      );
    };

    // Prime initial pixel values synchronously on mount
    applyVars(performance.now(), true);

    const syncLighting = (now: number) => {
      if (!cosmicEngine.isPageHidden) {
        applyVars(now, false);
      }
      rafId = window.requestAnimationFrame(syncLighting);
    };

    rafId = window.requestAnimationFrame(syncLighting);
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  return null;
}
