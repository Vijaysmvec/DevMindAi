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
    float outerBillow = sin(az * 2.0 - r * 0.85 + uTime * 0.22) * 0.105 * uThickness;
    vec3 transformed = vec3(position.x, outerBillow, position.y);
    vPos = transformed;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uNoiseTex;
  uniform float uOuterAngle;
  uniform float uTime;
  uniform float uPulse;
  uniform float uDensity;
  uniform float uSurge;
  varying vec3 vPos;

  const float INV_TAU = 0.15915494;

  void main() {
    float r = length(vPos.xz);
    float theta = atan(vPos.z, vPos.x);

    // Layer 3: Broad copper, deep amber & cooler reddish outer gas clouds fading into cosmic void
    float drift = theta + uOuterAngle * (4.35 / max(r, 3.35)) - r * 0.96;

    vec4 tex = texture2D(uNoiseTex, vec2(drift * INV_TAU * 3.0, r * 0.26 - uTime * 0.018));
    float n1 = tex.g;
    float n2 = tex.b;
    float outerFilament = tex.a;

    float clumpyClouds = smoothstep(0.16, 0.86, n1 * 0.65 + n2 * 0.35);
    float outerSpiral = 0.66 + 0.34 * sin((r + (n1 - 0.5) * 0.32) * 8.2 + theta * 2.0);
    float gasCloud = (0.14 + clumpyClouds * 0.62 + outerFilament * 0.24) * outerSpiral;

    float mask = smoothstep(3.35, 4.25, r) * (1.0 - smoothstep(5.55, 7.25, r));

    vec3 warmAmber = vec3(0.88, 0.48, 0.18);
    vec3 burntCopper = vec3(0.74, 0.30, 0.125);
    vec3 coolerReddishGas = vec3(0.48, 0.14, 0.105);
    vec3 deepCosmicDust = vec3(0.20, 0.13, 0.28);

    vec3 col = mix(warmAmber, burntCopper, smoothstep(3.5, 4.85, r));
    col = mix(col, coolerReddishGas, smoothstep(4.65, 6.15, r));
    col = mix(col, deepCosmicDust, smoothstep(5.8, 7.15, r) * 0.62);

    float doppler = 0.72 + 0.38 * cos(theta + 2.68);
    float surgeBoost = 1.0 + uSurge * 0.34;
    float alpha = mask * gasCloud * (0.42 + uPulse * 0.14) * uDensity * doppler * surgeBoost;
    gl_FragColor = vec4(col * doppler * 1.12, clamp(alpha, 0.0, 0.66));
  }
`;

export function OuterAccretionRing() {
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uNoiseTex: { value: getCosmicNoiseTexture() },
      uOuterAngle: { value: 0 },
      uTime: { value: 0 },
      uPulse: { value: 0.5 },
      uDensity: { value: 1.2 },
      uThickness: { value: 1.2 },
      uSurge: { value: 0.0 },
    }),
    []
  );

  useFrame(() => {
    if (!matRef.current) return;
    const sim = cosmicSimulationManager.settings;
    matRef.current.uniforms.uOuterAngle.value = cosmicEngine.outerDiskAngle;
    matRef.current.uniforms.uTime.value = cosmicEngine.elapsedTime;
    matRef.current.uniforms.uPulse.value = cosmicEngine.heartbeatWave;
    matRef.current.uniforms.uDensity.value = 0.78 + sim.accretionDensity * 0.38;
    matRef.current.uniforms.uThickness.value = sim.gasThickness;
    matRef.current.uniforms.uSurge.value = cosmicSimulationManager.accretionSurge;
  });

  return (
    <mesh rotation={[0.24, 0, -0.09]} renderOrder={1}>
      <ringGeometry args={[3.35, 7.25, 96, 10]} />
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
