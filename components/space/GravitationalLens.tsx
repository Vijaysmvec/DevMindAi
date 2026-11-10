import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { cosmicEngine } from '../../src/engine/cosmicEngine';
import { cosmicSimulationManager } from '../../src/engine/CosmicSimulationManager';
import { getCosmicNoiseTexture } from '../../src/engine/noiseTexture';

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // Camera-aligned relativistic lensing plane around the pure #000000 Black-Hole Shadow
    vec4 mvCenter = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mvCenter.xy += position.xy;
    gl_Position = projectionMatrix * mvCenter;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uNoiseTex;
  uniform float uTime;
  uniform float uAngle;
  uniform float uFastAngle;
  uniform float uIntensity;
  uniform float uCyanGlow;
  uniform float uDensityBoost;
  uniform float uSurge;
  uniform float uIngestionFlash;
  uniform float uImpactAngle;
  varying vec2 vUv;

  const float INV_TAU = 0.15915494;

  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float rawR = length(p);

    // Plane = 6.8 -> r_world 1.15 shadow boundary corresponds to rawR ~= 0.338.
    // Discard strictly inside the #000000 shadow so the interior stays 100% pure abyssal black!
    if (rawR > 0.99 || rawR < 0.326) discard;

    // Relativistic Kerr D-shaped spin asymmetry matching EventHorizon shadow compression on -X limb
    float progradeFlatten = p.x < 0.0 ? 0.022 * smoothstep(0.0, -0.45, p.x) : 0.0;
    vec2 kerrP = vec2(p.x + 0.024 * (1.0 - smoothstep(0.32, 0.88, rawR)) - progradeFlatten, p.y);
    float r = length(kerrP);
    float theta = atan(kerrP.y, kerrP.x);

    // Crisp shadow boundary separation (zero glow bleeding onto the solid shadow interior)
    float shadowCut = smoothstep(0.334, 0.349, r);

    // 1. Razor-sharp Blazing Primary (n=1) Photon Ring + Demagnified (n=2) Sub-Ring + Inner (n=3) Shimmer
    float dN1 = (r - 0.362) * 38.0;
    float dN2 = (r - 0.347) * 66.0;
    float dN3 = (r - 0.339) * 92.0;
    float photonN1 = exp(-dN1 * dN1);
    float photonN2 = exp(-dN2 * dN2) * 0.86;
    float photonN3 = exp(-dN3 * dN3) * 0.52;

    // 2. Relativistic Einstein-Ring Distortion Halo around the shadow
    float dEinstein = (r - 0.448) * 16.5;
    float einsteinRing = exp(-dEinstein * dEinstein) * 0.34;

    // 3. Gravitationally Bent Upper & Lower Volumetric Accretion Disk Arches (NASA SVS 14620 / Interstellar optics)
    float frameDragTheta = theta + 0.16 * cos(theta);
    float poleFactor = sqrt(abs(sin(frameDragTheta)));
    float archCenter = 0.382 + poleFactor * 0.198;
    float dArch = (r - archCenter) * 6.0;
    float lensedArch = exp(-dArch * dArch) * (0.28 + 0.88 * poleFactor) * uDensityBoost;

    // Multi-scale frame-dragged plasma filaments & dark optical-depth gaps (hardware texture lookup)
    vec4 lensTex = texture2D(
      uNoiseTex,
      vec2(theta * INV_TAU * 5.0 - uFastAngle * 0.095, r * 1.9 - uTime * 0.072)
    );
    float gasBillow = lensTex.g * 0.58 + lensTex.b * 0.42;
    float filamentStreak = lensTex.a;
    float lensedRinglets = 0.62 + 0.38 * sin((r - archCenter) * 74.0 - gasBillow * 2.5 - uFastAngle * 0.38);

    // Soft outer atmospheric scattering halo
    float dHaze = (r - 0.51) * 2.6;
    float outerHaze = exp(-dHaze * dHaze) * 0.20 * uDensityBoost;

    // Relativistic Doppler beaming (approaching prograde left limb substantially hotter & brighter)
    float doppler = 0.58 + 0.66 * cos(theta + 2.78);
    float photonShimmer = 0.90 + 0.10 * sin(theta * 7.0 - uFastAngle * 1.65 + lensTex.r * 3.14);

    // Localized photon-ring flare where infalling tidal streams cross behind the shadow
    float impactAlign = 0.5 + 0.5 * cos(theta - uImpactAngle);
    float localIngestion = uIngestionFlash * (0.45 + 0.85 * impactAlign * impactAlign);

    vec3 blazingWhiteGold = vec3(1.0, 0.972, 0.90);
    vec3 paleAmber = vec3(1.0, 0.82, 0.52);
    vec3 accretionGold = vec3(1.0, 0.69, 0.26);
    vec3 warmAmber = vec3(0.90, 0.47, 0.17);
    vec3 deepCopper = vec3(0.70, 0.27, 0.11);
    vec3 cyanTint = vec3(0.337, 0.851, 1.0);

    vec3 archCol = mix(deepCopper, warmAmber, smoothstep(0.18, 0.60, gasBillow));
    archCol = mix(archCol, accretionGold, smoothstep(0.42, 0.88, gasBillow * lensedRinglets + filamentStreak * 0.3));

    float totalPhoton = clamp(photonN1 * 1.18 + photonN2 + photonN3, 0.0, 1.35) * photonShimmer;
    vec3 col = mix(archCol, paleAmber, clamp(einsteinRing * 1.4 + photonN3, 0.0, 1.0));
    col = mix(col, blazingWhiteGold, clamp(totalPhoton * (0.85 + localIngestion * 0.45), 0.0, 1.0));
    col += cyanTint * einsteinRing * (0.08 + uCyanGlow * 0.32);

    float surgeMult = 1.0 + uSurge * 0.46 + localIngestion * 0.38;
    vec3 hdrCol = col * doppler * uIntensity * surgeMult * 1.24;
    // Controlled filmic HDR highlight compression prevents washed-out neon clipping
    vec3 toneMapped = hdrCol / (1.0 + hdrCol * 0.22);

    float alpha =
      (
        totalPhoton * (1.12 + localIngestion * 0.42) +
        einsteinRing * (0.55 + 0.45 * filamentStreak) +
        lensedArch * (0.48 + 0.52 * gasBillow) * lensedRinglets +
        outerHaze * gasBillow
      ) *
      shadowCut *
      doppler *
      uIntensity *
      surgeMult;
    alpha *= 1.0 - smoothstep(0.78, 0.99, rawR);

    gl_FragColor = vec4(toneMapped, clamp(alpha, 0.0, 0.98));
  }
`;

export function GravitationalLens() {
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uNoiseTex: { value: getCosmicNoiseTexture() },
      uTime: { value: 0 },
      uAngle: { value: 0 },
      uFastAngle: { value: 0 },
      uIntensity: { value: 1.0 },
      uCyanGlow: { value: 0.0 },
      uDensityBoost: { value: 1.25 },
      uSurge: { value: 0.0 },
      uIngestionFlash: { value: 0.0 },
      uImpactAngle: { value: -2.4 },
    }),
    []
  );

  useFrame(() => {
    if (!matRef.current) return;
    const simSettings = cosmicSimulationManager.settings;
    const u = matRef.current.uniforms;
    u.uTime.value = cosmicEngine.elapsedTime;
    u.uAngle.value = cosmicEngine.midDiskAngle;
    u.uFastAngle.value = cosmicEngine.innerPlasmaAngle;
    u.uIntensity.value =
      cosmicEngine.currentPlasmaBrightness * (0.94 + cosmicEngine.heartbeatWave * 0.20) +
      cosmicEngine.audioVisual.bass * 0.14;
    u.uCyanGlow.value = cosmicEngine.cyanStatusGlow;
    u.uDensityBoost.value =
      0.88 + simSettings.accretionDensity * 0.30 + simSettings.gasThickness * 0.20;
    u.uSurge.value = cosmicSimulationManager.accretionSurge;
    u.uIngestionFlash.value = cosmicSimulationManager.horizonIngestionFlash;
    u.uImpactAngle.value = cosmicSimulationManager.streamImpactAzimuth;
  });

  return (
    <mesh renderOrder={1}>
      <planeGeometry args={[6.8, 6.8]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        depthTest={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}
