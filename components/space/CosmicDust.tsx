import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { cosmicEngine, PARTICLE_SYSTEM_PARAMS } from '../../src/engine/cosmicEngine';
import { cosmicSimulationManager } from '../../src/engine/CosmicSimulationManager';

const CFG = PARTICLE_SYSTEM_PARAMS.backgroundCosmicDust;

const vertexShader = /* glsl */ `
  attribute float aScale;
  attribute float aSeed;
  attribute vec3 aTint;

  uniform float uTime;
  uniform float uDustAngle;
  uniform vec2 uCursorWorld;
  uniform float uCursorStrength;
  uniform float uDensity;
  uniform float uHeartbeat;
  uniform vec3 uDriftOffset;
  uniform vec3 uBhAnchor;

  varying vec3 vTint;
  varying float vOpacity;

  void main() {
    if (fract(aSeed * 19.31) > clamp(uDensity, 0.1, 1.0)) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      vOpacity = 0.0;
      vTint = aTint;
      return;
    }

    vec3 p = position;
    // Rotation hierarchy tier 5: slow background particle rotation
    float cs = cos(uDustAngle * (0.65 + aSeed * 0.55));
    float sn = sin(uDustAngle * (0.65 + aSeed * 0.55));
    p.xz = mat2(cs, -sn, sn, cs) * p.xz;

    // Continuous foreground & midground cosmic drift wrapping smoothly around the camera volume
    float parallax = 0.75 + aSeed * 0.85;
    p.x = mod(p.x - uDriftOffset.x * parallax + 9.5, 19.0) - 9.5;
    p.y = mod(p.y - uDriftOffset.y * parallax + 6.0, 12.0) - 6.0;
    p.z = mod(p.z - uDriftOffset.z * parallax * 0.7 + 4.5, 8.0) - 4.5;

    p.x += sin(uTime * 0.16 + aSeed * 12.0) * 0.28;
    p.y += cos(uTime * 0.12 + aSeed * 9.0) * 0.22;

    // Subtle gravitational pull toward the passing Black Hole as it drifts through the dust cloud
    vec3 toBh = uBhAnchor - p;
    float bhDist = length(toBh);
    if (bhDist > 1.15 && bhDist < 6.5) {
      float bhPull = exp(-bhDist * 0.52) * 0.85;
      p += normalize(toBh) * bhPull;
    }

    // Gravitational Cursor smooth curvature with distance falloff
    vec2 toCursor = uCursorWorld - p.xy;
    float dist = length(toCursor);
    float falloff = exp(-dist * dist * 0.18) * uCursorStrength;
    if (dist > 0.02) {
      vec2 tangent = vec2(-toCursor.y, toCursor.x) / dist;
      p.xy += (normalize(toCursor) * 0.44 + tangent * 0.26) * falloff;
    }

    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = clamp(aScale * (9.5 / max(-mvPosition.z, 2.5)), 0.85, 2.25);

    // Keep central Event Horizon silhouette pure #000000
    float horizonClear = smoothstep(1.06, 1.35, bhDist);
    vTint = aTint;
    vOpacity =
      horizonClear *
      (0.28 + 0.16 * uHeartbeat + 0.28 * falloff) *
      (0.68 + 0.32 * sin(uTime * 0.9 + aSeed * 15.0));
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vTint;
  varying float vOpacity;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    if (d > 1.0) discard;
    float grain = pow(1.0 - d, 2.5);
    gl_FragColor = vec4(vTint, grain * vOpacity);
  }
`;

export function CosmicDust() {
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const { geometry, uniforms } = useMemo(() => {
    const count = CFG.maxCount;
    const positions = new Float32Array(count * 3);
    const scales = new Float32Array(count);
    const seeds = new Float32Array(count);
    const tints = new Float32Array(count * 3);

    const gold = new THREE.Color('#FFB347');
    const amber = new THREE.Color('#E88732');
    const stellar = new THREE.Color('#FFF0D5');
    const cyan = new THREE.Color('#56D9FF');

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 19.0;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 12.0;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 8.0 - 0.8;
      scales[i] = CFG.minPointPx + Math.random() * (CFG.maxPointPx - CFG.minPointPx);
      seeds[i] = Math.random();

      const r = Math.random();
      const c = r < 0.44 ? gold : r < 0.72 ? amber : r < 0.90 ? stellar : cyan;
      tints[i * 3] = c.r;
      tints[i * 3 + 1] = c.g;
      tints[i * 3 + 2] = c.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    geo.setAttribute('aTint', new THREE.BufferAttribute(tints, 3));

    return {
      geometry: geo,
      uniforms: {
        uTime: { value: 0 },
        uDustAngle: { value: 0 },
        uCursorWorld: { value: new THREE.Vector2(0, 0) },
        uCursorStrength: { value: 0 },
        uDensity: { value: 1.0 },
        uHeartbeat: { value: 0.5 },
        uDriftOffset: { value: new THREE.Vector3(0, 0, 0) },
        uBhAnchor: { value: new THREE.Vector3(0.45, 0.12, 0) },
      },
    };
  }, []);

  useFrame(() => {
    if (!matRef.current) return;
    const audioParticleBrightness = cosmicEngine.audioVisual.high * 0.18;
    const drift = cosmicSimulationManager.driftOffset;
    const bh = cosmicSimulationManager.bhWorldAnchor;

    matRef.current.uniforms.uTime.value = cosmicEngine.elapsedTime;
    matRef.current.uniforms.uDustAngle.value = cosmicEngine.backgroundDustAngle;
    matRef.current.uniforms.uCursorWorld.value.set(
      cosmicEngine.cursorWorldX,
      cosmicEngine.cursorWorldY
    );
    matRef.current.uniforms.uCursorStrength.value = cosmicEngine.cursorInfluence;
    matRef.current.uniforms.uDensity.value = Math.min(
      1.0,
      cosmicEngine.getEffectiveParticleScale()
    );
    matRef.current.uniforms.uHeartbeat.value = Math.min(
      1.25,
      cosmicEngine.heartbeatWave + audioParticleBrightness
    );
    matRef.current.uniforms.uDriftOffset.value.set(drift.x, drift.y, drift.z);
    matRef.current.uniforms.uBhAnchor.value.set(bh.x, bh.y, bh.z);
  });

  return (
    <points geometry={geometry} renderOrder={2} frustumCulled={false}>
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
