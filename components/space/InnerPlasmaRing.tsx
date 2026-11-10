import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { cosmicEngine } from '../../src/engine/cosmicEngine';
import { cosmicSimulationManager } from '../../src/engine/CosmicSimulationManager';
import { getCosmicNoiseTexture } from '../../src/engine/noiseTexture';

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uThickness;
  varying vec3 vPos;

  void main() {
    float r = length(position.xy);
    float az = atan(position.y, position.x);
    float microWave = sin(az * 3.0 - uTime * 3.1 + r * 4.2) * 0.024 * uThickness;
    vec3 transformed = vec3(position.x, microWave, position.y);
    vPos = transformed;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uNoiseTex;
  uniform float uInnerDiskAngle;
  uniform float uInnerPlasmaAngle;
  uniform float uTime;
  uniform float uBoost;
  uniform float uCyanBoost;
  uniform float uDensity;
  uniform float uSurge;
  uniform float uIngestionFlash;
  uniform float uImpactAngle;
  varying vec3 vPos;

  const float INV_TAU = 0.15915494;

  void main() {
    float r = length(vPos.xz);
    float angle = atan(vPos.z, vPos.x);

    // Layer 1A: Blazing white-hot & golden ISCO inner edge (non-uniform sheared plasma streams)
    float invR = 1.0 / max(r, 1.17);
    float iscoSwirl = angle + uInnerDiskAngle * (2.65 * invR * sqrt(invR)) - r * 4.1;
    vec4 iscoTex = texture2D(uNoiseTex, vec2(iscoSwirl * INV_TAU * 5.0, r * 1.55 - uTime * 0.24));
    float fIsco = iscoTex.g;
    float iscoStream = iscoTex.a;
    // Irregular non-uniform azimuthal density & dark plasma lanes
    float nonUniform = 0.68 + 0.32 * sin(angle * 2.0 - uInnerPlasmaAngle * 0.35 + fIsco * 4.2);
    float hotRinglets = 0.66 + 0.34 * sin((r + (fIsco - 0.5) * 0.09) * 42.0 + uTime * 2.0);
    float iscoBand = smoothstep(1.16, 1.27, r) * (1.0 - smoothstep(1.62, 1.96, r));

    // Layer 1B: Secondary turbulent orange-gold plasma transition
    float plasmaSwirl = angle + uInnerPlasmaAngle * (2.05 / max(r, 1.25)) - r * 2.45;
    vec4 plasmaTex = texture2D(uNoiseTex, vec2(plasmaSwirl * INV_TAU * 7.0 + 0.37, r * 1.38 - uTime * 0.16));
    float plasmaGas = plasmaTex.g * 0.56 + plasmaTex.b * 0.44;
    float fineFilaments = plasmaTex.a;
    float plasmaBand = smoothstep(1.34, 1.54, r) * (1.0 - smoothstep(2.04, 2.44, r));

    vec3 blazingWhite = vec3(1.0, 0.975, 0.915);
    vec3 goldenHighlight = vec3(1.0, 0.83, 0.52);
    vec3 accretionGold = vec3(1.0, 0.67, 0.25);
    vec3 hotOrange = vec3(0.98, 0.46, 0.16);
    vec3 cosmicCyan = vec3(0.337, 0.851, 1.0);

    vec3 iscoCol = mix(
      accretionGold,
      blazingWhite,
      clamp(0.38 + fIsco * 0.36 + iscoStream * 0.55, 0.0, 1.0)
    );
    vec3 ringCol = mix(hotOrange, goldenHighlight, smoothstep(0.18, 0.85, plasmaGas * 0.75 + fineFilaments * 0.45));
    vec3 col = mix(ringCol, iscoCol, clamp(iscoBand * 1.25, 0.0, 1.0));
    col = mix(col, cosmicCyan, uCyanBoost * 0.24);

    // Localized brightening where disrupted stellar/planetary stream feeds the inner disk
    float streamHotspot = pow(0.5 + 0.5 * cos(angle - uImpactAngle), 3.0) * (uSurge * 0.55 + uIngestionFlash * 0.65);

    // Relativistic Kerr Doppler beaming asymmetry
    float doppler = 0.60 + 0.64 * cos(angle + 2.68);
    float surgeBoost = 1.0 + uSurge * 0.58 + streamHotspot;
    float combinedAlpha =
      (
        iscoBand * (0.64 + 0.36 * (fIsco * 0.5 + iscoStream * 0.5)) * hotRinglets * nonUniform +
        plasmaBand * (0.48 + 0.52 * (plasmaGas * 0.65 + fineFilaments * 0.35)) * nonUniform
      ) *
      uDensity;

    vec3 hdrCol = col * doppler * uBoost * surgeBoost * 1.46;
    vec3 toneMapped = hdrCol / (1.0 + hdrCol * 0.24);
    float alpha = combinedAlpha * uBoost * surgeBoost;

    gl_FragColor = vec4(toneMapped, clamp(alpha, 0.0, 0.98));
  }
`;

export function InnerPlasmaRing() {
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uNoiseTex: { value: getCosmicNoiseTexture() },
      uInnerDiskAngle: { value: 0 },
      uInnerPlasmaAngle: { value: 0 },
      uTime: { value: 0 },
      uBoost: { value: 1.0 },
      uCyanBoost: { value: 0.0 },
      uDensity: { value: 1.2 },
      uThickness: { value: 1.2 },
      uSurge: { value: 0.0 },
      uIngestionFlash: { value: 0.0 },
      uImpactAngle: { value: -2.4 },
    }),
    []
  );

  useFrame(() => {
    if (!matRef.current) return;
    const audioPlasma = cosmicEngine.audioVisual.mid * 0.18;
    const sim = cosmicSimulationManager.settings;
    const u = matRef.current.uniforms;
    u.uInnerDiskAngle.value = cosmicEngine.innerDiskAngle;
    u.uInnerPlasmaAngle.value = cosmicEngine.innerPlasmaAngle;
    u.uTime.value = cosmicEngine.elapsedTime;
    u.uBoost.value = cosmicEngine.currentInnerRingBoost + audioPlasma;
    u.uCyanBoost.value = cosmicEngine.cyanStatusGlow;
    u.uDensity.value = 0.80 + sim.accretionDensity * 0.36;
    u.uThickness.value = sim.gasThickness;
    u.uSurge.value = cosmicSimulationManager.accretionSurge;
    u.uIngestionFlash.value = cosmicSimulationManager.horizonIngestionFlash;
    u.uImpactAngle.value = cosmicSimulationManager.streamImpactAzimuth;
  });

  return (
    <mesh rotation={[0.24, 0, -0.09]} renderOrder={3}>
      <ringGeometry args={[1.16, 2.46, 112, 10]} />
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
