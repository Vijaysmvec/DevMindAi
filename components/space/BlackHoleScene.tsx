import { useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { cosmicEngine } from '../../src/engine/cosmicEngine';
import {
  cosmicSimulationManager,
  SimulationQualityPreset,
} from '../../src/engine/CosmicSimulationManager';
import { useSingularityStore } from '../../src/store/singularityStore';
import { BlackHoleController } from './BlackHoleController';
import { StarField } from './StarField';
import { CosmicDriftController } from './CosmicDriftController';
import { GravitationalLens } from './GravitationalLens';
import { OuterAccretionRing } from './OuterAccretionRing';
import { AccretionDisk } from './AccretionDisk';
import { AccretionVolume } from './AccretionVolume';
import { InnerPlasmaRing } from './InnerPlasmaRing';
import { EventHorizon } from './EventHorizon';
import { AccretionDiskDust } from './AccretionDiskDust';
import { InnerPlasmaParticles } from './InnerPlasmaParticles';
import { OrbitalParticles } from './OrbitalParticles';
import { CosmicDust } from './CosmicDust';
import { EnergyPulse } from './EnergyPulse';
import { StarCaptureSystem } from './StarCaptureSystem';
import { PlanetCaptureSystem } from './PlanetCaptureSystem';
import { CosmicShockwaveOverlay } from './CosmicShockwaveOverlay';

function checkWebGLCapabilities(): { supported: boolean; isSoftware: boolean } {
  if (typeof window === 'undefined') return { supported: false, isSoftware: false };
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return { supported: false, isSoftware: false };

    let isSoftware = false;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (dbg) {
      const renderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '');
      if (
        /swiftshader|llvmpipe|software|basic render|warp|subzero|google inc\. \(google/i.test(
          renderer
        )
      ) {
        isSoftware = true;
      }
    }
    return { supported: true, isSoftware };
  } catch {
    return { supported: false, isSoftware: false };
  }
}

export function BlackHoleScene() {
  const blackHoleGroupRef = useRef<THREE.Group>(null);
  const visualPreferences = useSingularityStore((s) => s.visualPreferences);
  const forceStaticFallback = useSingularityStore((s) => s.forceStaticFallback);
  const setWebglSupported = useSingularityStore((s) => s.setWebglSupported);
  const [webglReady, setWebglReady] = useState<boolean>(true);
  const [softwareGL, setSoftwareGL] = useState<boolean>(false);
  const [adaptiveScaleDown, setAdaptiveScaleDown] = useState<boolean>(false);
  const [qualityPreset, setQualityPreset] = useState<SimulationQualityPreset>(
    () => cosmicSimulationManager.settings.qualityPreset
  );

  useEffect(() => {
    const caps = checkWebGLCapabilities();
    cosmicEngine.isSoftwareRenderer = caps.isSoftware;
    setWebglReady(caps.supported);
    setSoftwareGL(caps.isSoftware);
    setWebglSupported(caps.supported);
  }, [setWebglSupported]);

  useEffect(() => {
    return cosmicSimulationManager.subscribeSettings((next) => {
      setQualityPreset(next.qualityPreset);
    });
  }, []);

  // Automatic resolution guard: smoothly lowers DPR if an integrated GPU ever dips below 42 FPS
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (cosmicEngine.isPageHidden || cosmicEngine.frameCount < 30) return;
      if (cosmicEngine.fps < 42 && !adaptiveScaleDown) {
        setAdaptiveScaleDown(true);
      } else if (cosmicEngine.fps >= 56 && adaptiveScaleDown) {
        setAdaptiveScaleDown(false);
      }
    }, 1500);
    return () => window.clearInterval(timer);
  }, [adaptiveScaleDown]);

  const useFallback = !webglReady || forceStaticFallback;

  // Keep cosmicEngine & cosmicSimulationManager stepping smoothly even when WebGL fallback is active
  useEffect(() => {
    if (!useFallback) return;
    let rafId = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      cosmicEngine.blackHoleScreenX = window.innerWidth * 0.54;
      cosmicEngine.blackHoleScreenY = window.innerHeight * 0.48;
      cosmicEngine.step(dt);
      cosmicSimulationManager.step(dt);
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [useFallback]);

  const dprRange: [number, number] = softwareGL
    ? [0.5, 0.65]
    : adaptiveScaleDown
      ? [0.8, 0.95]
      : qualityPreset === 'performance' || visualPreferences.graphics_quality === 'low'
        ? [0.85, 1.0]
        : qualityPreset === 'balanced' || visualPreferences.graphics_quality === 'medium'
          ? [1.0, 1.15]
          : visualPreferences.graphics_quality === 'ultra'
            ? [1.0, 1.35]
            : [1.0, 1.2];

  const isFocus = visualPreferences.mode === 'focus';

  return (
    <>
      <div
        data-testid="black-hole-scene-container"
        data-render-mode={useFallback ? 'fallback' : 'webgl'}
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none select-none overflow-hidden"
        style={{ zIndex: 1 }}
      >
        {/* Layer 1: Deep cosmic void base */}
        <div
          className="absolute inset-0 transition-opacity duration-700"
          style={{
            background:
              'radial-gradient(circle at 54% 48%, #101827 0%, #090D14 34%, #030407 68%, #000000 100%)',
            opacity: isFocus ? 0.65 : 1,
          }}
        />

        {useFallback ? (
          <div
            data-testid="singularity-webgl-fallback"
            className="absolute inset-0 singularity-static-fallback flex items-center justify-center"
          >
            <div
              className="w-40 h-40 rounded-full bg-black border border-[#FFB347]/40 shadow-[0_0_90px_rgba(255,179,71,0.45)]"
              style={{ transform: 'translate(4vw, -2vh)' }}
            />
          </div>
        ) : (
          <div
            className="absolute inset-0 transition-opacity duration-500"
            style={{ opacity: isFocus ? 0.62 : 1 }}
          >
            <Canvas
              dpr={dprRange}
              camera={{ position: [0, 1.22, 7.45], fov: 46, near: 0.1, far: 120 }}
              gl={{
                antialias: false,
                alpha: true,
                depth: true,
                stencil: false,
                powerPreference: 'high-performance',
              }}
              style={{ pointerEvents: 'none' }}
            >
              <BlackHoleController blackHoleGroupRef={blackHoleGroupRef} />
              <CosmicDriftController />
              <StarField />
              <CosmicDust />

              {/* World-space celestial capture systems orbiting & spiraling into bhWorldAnchor */}
              <StarCaptureSystem />
              <PlanetCaptureSystem />

              {/* Drifting Black Hole & Multi-Layer Volumetric Accretion Structure */}
              <group ref={blackHoleGroupRef} position={[0.45, 0.12, 0]}>
                <EventHorizon />
                <GravitationalLens />
                <OuterAccretionRing />
                <AccretionDisk />
                <AccretionVolume />
                <InnerPlasmaRing />
                <AccretionDiskDust />
                <InnerPlasmaParticles />
                <OrbitalParticles />
                <EnergyPulse />
              </group>
            </Canvas>
          </div>
        )}
      </div>

      {/* Full-viewport Cosmic Shockwave expanding outward from Event Horizon behind glass */}
      <CosmicShockwaveOverlay />
    </>
  );
}
