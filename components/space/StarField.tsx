import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { cosmicEngine } from '../../src/engine/cosmicEngine';
import { cosmicSimulationManager } from '../../src/engine/CosmicSimulationManager';

const STAR_COUNT = 3000;

const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aPhase;

  uniform float uTime;
  uniform float uStarAngle;
  uniform float uDensityScale;
  uniform vec3 uDriftOffset;
  uniform vec3 uBhAnchor;
  varying vec3 vColor;
  varying float vAlpha;
  varying vec2 vTangent;
  varying float vLensArc;

  void main() {
    float idxNorm = fract(aPhase * 13.731);
    if (idxNorm > clamp(uDensityScale, 0.14, 1.0)) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      vAlpha = 0.0;
      vColor = aColor;
      vTangent = vec2(1.0, 0.0);
      vLensArc = 0.0;
      return;
    }

    vec3 worldPos = position;
    float cs = cos(uStarAngle);
    float sn = sin(uStarAngle);
    worldPos.xz = mat2(cs, -sn, sn, cs) * worldPos.xz;

    // Multi-depth cosmic drift parallax across 38 units of deep space
    float parallax = 0.18 + fract(aPhase * 7.13) * 0.62;
    worldPos.x = mod(worldPos.x - uDriftOffset.x * parallax + 28.0, 56.0) - 28.0;
    worldPos.y = mod(worldPos.y - uDriftOffset.y * parallax + 17.0, 34.0) - 17.0;
    worldPos.z = -4.8 - mod(-worldPos.z - 4.8 - uDriftOffset.z * parallax * 0.85, 38.0);

    vec4 mvPos = modelViewMatrix * vec4(worldPos, 1.0);
    vec4 bhCenter = modelViewMatrix * vec4(uBhAnchor, 1.0);

    // Relativistic Einstein deflection + Kerr frame-dragging + tangential Einstein arc stretching (NASA SVS 14620)
    vec2 delta = mvPos.xy - bhCenter.xy;
    float dist = length(delta);
    float einsteinR2 = 2.85;
    float arcStretch = 0.0;
    vec2 tang = vec2(1.0, 0.0);

    if (dist > 0.25 && dist < 12.0) {
      vec2 dir = delta / dist;
      tang = vec2(-dir.y, dir.x);
      float deflection = einsteinR2 / max(dist, 0.72);
      float envelope = smoothstep(12.0, 1.25, dist);
      mvPos.xy += (dir * deflection + tang * deflection * 0.28) * envelope;
      arcStretch = clamp(1.45 / max(dist * dist, 0.85), 0.0, 1.0) * smoothstep(5.5, 1.4, dist);
    }

    float shiftedDist = length(mvPos.xy - bhCenter.xy);
    float twinkle = 0.76 + 0.24 * sin(uTime * 1.45 + aPhase * 20.0);
    float depthFade = smoothstep(-42.5, -31.0, worldPos.z) * smoothstep(-4.6, -7.4, worldPos.z);

    vColor = aColor;
    vTangent = tang;
    vLensArc = arcStretch;
    // Clean occlusion behind the pure #000000 Black-Hole Shadow + relativistic magnification near Einstein ring
    vAlpha =
      twinkle *
      depthFade *
      smoothstep(1.16, 1.56, shiftedDist) *
      (1.0 + arcStretch * 0.65);

    gl_Position = projectionMatrix * mvPos;
    float basePt = aSize * (13.8 / max(-mvPos.z, 4.0));
    gl_PointSize = clamp(basePt * (1.0 + arcStretch * 1.65), 0.75, 5.2);
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying vec2 vTangent;
  varying float vLensArc;

  void main() {
    vec2 c = (gl_PointCoord - 0.5) * 2.0;
    // Tangentially elongate stars near the Einstein ring into relativistic arcs
    vec2 t = normalize(vec2(vTangent.x, -vTangent.y));
    vec2 n = vec2(-t.y, t.x);
    float along = dot(c, t) / (1.0 + vLensArc * 1.5);
    float across = dot(c, n) * (1.0 + vLensArc * 0.55);
    float d = length(vec2(along, across));
    if (d > 1.0) discard;
    float glow = pow(1.0 - d, 2.7);
    gl_FragColor = vec4(vColor, glow * vAlpha);
  }
`;

export function StarField() {
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const { geometry, uniforms } = useMemo(() => {
    const positions = new Float32Array(STAR_COUNT * 3);
    const colors = new Float32Array(STAR_COUNT * 3);
    const sizes = new Float32Array(STAR_COUNT);
    const phases = new Float32Array(STAR_COUNT);

    const palette = [
      new THREE.Color('#FFF0D5'), // Stellar White
      new THREE.Color('#FFB347'), // Accretion Gold
      new THREE.Color('#56D9FF'), // Cosmic Cyan
      new THREE.Color('#9C7CE8'), // Deep Nebula Violet
    ];

    for (let i = 0; i < STAR_COUNT; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 56.0;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 34.0;
      positions[i * 3 + 2] = -5.0 - Math.random() * 37.0;

      const pick = Math.random();
      const c =
        pick < 0.62
          ? palette[0]
          : pick < 0.83
            ? palette[1]
            : pick < 0.94
              ? palette[2]
              : palette[3];

      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
      sizes[i] = 0.82 + Math.random() * 1.75;
      phases[i] = Math.random();
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));

    return {
      geometry: geo,
      uniforms: {
        uTime: { value: 0 },
        uStarAngle: { value: 0 },
        uDensityScale: { value: 1.0 },
        uDriftOffset: { value: new THREE.Vector3(0, 0, 0) },
        uBhAnchor: { value: new THREE.Vector3(0.45, 0.12, 0) },
      },
    };
  }, []);

  useFrame(() => {
    if (!matRef.current) return;
    const drift = cosmicSimulationManager.driftOffset;
    const bh = cosmicSimulationManager.bhWorldAnchor;
    matRef.current.uniforms.uTime.value = cosmicEngine.elapsedTime;
    matRef.current.uniforms.uStarAngle.value = cosmicEngine.starfieldAngle;
    matRef.current.uniforms.uDensityScale.value = Math.min(
      1.0,
      cosmicEngine.getEffectiveParticleScale()
    );
    matRef.current.uniforms.uDriftOffset.value.set(drift.x, drift.y, drift.z);
    matRef.current.uniforms.uBhAnchor.value.set(bh.x, bh.y, bh.z);
  });

  return (
    <points geometry={geometry} renderOrder={0} frustumCulled={false}>
      <shaderMaterial
        ref={matRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
