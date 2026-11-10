import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { cosmicEngine } from '../../src/engine/cosmicEngine';
import { cosmicSimulationManager } from '../../src/engine/CosmicSimulationManager';
import { getCosmicNoiseTexture } from '../../src/engine/noiseTexture';

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uThickness;
  varying vec3 vDiskPos;

  void main() {
    float r = length(position.xy);
    float az = atan(position.y, position.x);
    // Relativistic Bardeen-Petterson frame warp + turbulent vertical gas billow
    float frameWarp = sin(az * 2.0 + r * 1.48 - uTime * 0.34) * (0.068 / max(r * 0.40, 0.72));
    float gasWave = cos(az * 4.0 - r * 2.8 + uTime * 0.78) * 0.032 * smoothstep(1.5, 4.2, r);
    vec3 transformed = vec3(position.x, (frameWarp + gasWave) * uThickness, position.y);
    vDiskPos = transformed;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uNoiseTex;
  uniform float uMidAngle;
  uniform float uInnerAngle;
  uniform float uTime;
  uniform float uBrightness;
  uniform float uHeartbeat;
  uniform float uErrorGlow;
  uniform float uDensity;
  uniform float uSurge;
  uniform float uImpactAngle;
  varying vec3 vDiskPos;

  const float INV_TAU = 0.15915494;

  void main() {
    float r = length(vDiskPos.xz);
    float theta = atan(vDiskPos.z, vDiskPos.x);

    // Differential Keplerian orbital shear
    float innerWeight = 1.0 - smoothstep(1.45, 2.95, r);
    float effectiveAngle = mix(uMidAngle, uInnerAngle * 0.84, innerWeight);
    float invR = 1.0 / max(r, 1.24);
    float keplerFactor = 3.25 * invR * sqrt(invR);
    float shearAngle = theta + effectiveAngle * keplerFactor - r * 1.56;

    // 1. Hardware-filtered multi-scale turbulent gas & twisting luminous plasma filaments (2 texture lookups)
    vec4 texA = texture2D(uNoiseTex, vec2(shearAngle * INV_TAU * 3.0, r * 0.36 - uTime * 0.052));
    vec4 texB = texture2D(uNoiseTex, vec2(shearAngle * INV_TAU * 7.0 - 0.31, r * 0.78 + uTime * 0.038));
    float gasCloudA = texA.g;
    float gasCloudB = texB.b;
    float twistingFilaments = texA.a * (0.42 + texB.a * 1.08);

    // 2. Non-uniform spiral density arms & dark optical-depth absorption gaps (zero flat neon rings)
    float spiralArm = 0.72 + 0.28 * sin(theta * 2.0 - r * 2.35 + uMidAngle * 0.55 + gasCloudA * 3.0);
    float radialPerturb = r + (gasCloudA - 0.5) * 0.18 + (gasCloudB - 0.5) * 0.08;
    float majorBands = sin(radialPerturb * 12.8) * 0.5 + 0.5;
    float darkGapMask = smoothstep(0.10, 0.46, majorBands * (0.65 + 0.35 * gasCloudB));
    float irregularStructure = mix(0.46, 1.24, majorBands * 0.58 + texB.g * 0.42) * (0.54 + 0.46 * darkGapMask) * spiralArm;

    float baseGas = 0.22 + gasCloudA * 0.46 + gasCloudB * 0.26 + twistingFilaments * 0.30;
    float opticalDepth = clamp(baseGas * irregularStructure * uDensity, 0.0, 1.42);

    float innerMask = smoothstep(1.44, 1.84, r);
    float outerMask = 1.0 - smoothstep(3.85, 5.22, r);
    float envelope = innerMask * outerMask;

    // Astrophysical blackbody palette: white-hot inner filaments -> orange-gold main disk -> copper/reddish outer lanes
    vec3 blazingCore = vec3(1.0, 0.96, 0.87);
    vec3 accretionGold = vec3(1.0, 0.70, 0.27);
    vec3 denseOrange = vec3(0.93, 0.49, 0.175);
    vec3 deepCopper = vec3(0.64, 0.23, 0.095);
    vec3 darkDustLane = vec3(0.24, 0.08, 0.04);

    float tempRadial = 1.0 - smoothstep(1.52, 4.95, r);
    vec3 col = mix(darkDustLane, deepCopper, smoothstep(0.05, 0.28, opticalDepth));
    col = mix(col, denseOrange, smoothstep(0.22, 0.58, opticalDepth));
    col = mix(col, accretionGold, smoothstep(0.46, 0.88, opticalDepth * (0.72 + tempRadial * 0.45)));
    col = mix(
      col,
      blazingCore,
      clamp(smoothstep(0.80, 1.24, opticalDepth) * (0.42 + tempRadial * 0.75) + twistingFilaments * 0.28, 0.0, 1.0)
    );
    col = mix(col, vec3(1.0, 0.42, 0.18) * 1.2, uErrorGlow * 0.32);

    // Localized accretion disk shock brightening where disrupted stellar/planetary stream circularizes
    float impactSpot = pow(0.5 + 0.5 * cos(theta - uImpactAngle), 4.0) * (1.0 - smoothstep(1.6, 3.6, r)) * uSurge;

    // Relativistic Kerr Doppler beaming
    float doppler = 0.60 + 0.60 * cos(theta + 2.68);
    float pulseBoost = (0.94 + uHeartbeat * 0.18) * (1.0 + uSurge * 0.48 + impactSpot * 0.65);

    vec3 hdrCol = col * doppler * uBrightness * pulseBoost * 1.22;
    vec3 toneMapped = hdrCol / (1.0 + hdrCol * 0.24);
    float alpha = envelope * smoothstep(0.05, 0.68, opticalDepth) * 0.96;

    gl_FragColor = vec4(toneMapped, clamp(alpha, 0.0, 0.97));
  }
`;

export function AccretionDisk() {
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uNoiseTex: { value: getCosmicNoiseTexture() },
      uMidAngle: { value: 0 },
      uInnerAngle: { value: 0 },
      uTime: { value: 0 },
      uBrightness: { value: 1.0 },
      uHeartbeat: { value: 0.5 },
      uErrorGlow: { value: 0.0 },
      uDensity: { value: 1.25 },
      uThickness: { value: 1.25 },
      uSurge: { value: 0.0 },
      uImpactAngle: { value: -2.4 },
    }),
    []
  );

  useFrame(() => {
    if (!matRef.current) return;
    const audioGlow = cosmicEngine.audioVisual.bass * 0.18;
    const sim = cosmicSimulationManager.settings;
    const u = matRef.current.uniforms;
    u.uMidAngle.value = cosmicEngine.midDiskAngle;
    u.uInnerAngle.value = cosmicEngine.innerDiskAngle;
    u.uTime.value = cosmicEngine.elapsedTime;
    u.uBrightness.value = cosmicEngine.currentPlasmaBrightness + audioGlow;
    u.uHeartbeat.value = cosmicEngine.heartbeatWave;
    u.uErrorGlow.value = cosmicEngine.amberErrorGlow;
    u.uDensity.value = 0.82 + sim.accretionDensity * 0.42;
    u.uThickness.value = sim.gasThickness;
    u.uSurge.value = cosmicSimulationManager.accretionSurge;
    u.uImpactAngle.value = cosmicSimulationManager.streamImpactAzimuth;
  });

  return (
    <mesh rotation={[0.24, 0, -0.09]} renderOrder={2}>
      <ringGeometry args={[1.44, 5.25, 128, 16]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        side={THREE.DoubleSide}
        depthWrite={false}
        depthTest
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}
