import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { cosmicEngine } from '../../src/engine/cosmicEngine';
import { cosmicSimulationManager } from '../../src/engine/CosmicSimulationManager';
import { getCosmicNoiseTexture } from '../../src/engine/noiseTexture';

const nebulaVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const nebulaFragmentShader = /* glsl */ `
  uniform sampler2D uNoiseTex;
  uniform float uTime;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uSeed;
  uniform float uOpacity;
  varying vec2 vUv;

  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float d2 = dot(p, p);
    if (d2 > 1.0) discard;

    vec2 q = vUv * 1.35 + vec2(uSeed * 0.37 + uTime * 0.003, -uSeed * 0.21 + uTime * 0.002);
    vec4 tex = texture2D(uNoiseTex, q);
    float n = tex.g * 0.70 + tex.b * 0.30;
    float invD = 1.0 - sqrt(d2);
    float radial = invD * invD;
    vec3 col = mix(uColorA, uColorB, smoothstep(0.24, 0.80, n));

    gl_FragColor = vec4(col, radial * smoothstep(0.24, 0.86, n) * uOpacity);
  }
`;

const galaxyFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uArmColor;
  uniform vec3 uCoreColor;
  uniform float uOpacity;
  varying vec2 vUv;

  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r2 = dot(p, p);
    if (r2 > 1.0) discard;

    float r = sqrt(r2);
    float ang = atan(p.y, p.x) - uTime * 0.035;
    float s = max(0.0, cos(ang * 2.0 - r * 7.8));
    float spiral = s * s * s;
    float core = exp(-r * 6.5);
    float disc = exp(-r * 2.8) * (0.28 + 0.72 * spiral);

    vec3 col = mix(uArmColor, uCoreColor, clamp(core * 1.4, 0.0, 1.0));
    float alpha = (core * 0.85 + disc * 0.45) * (1.0 - smoothstep(0.75, 1.0, r)) * uOpacity;
    gl_FragColor = vec4(col, alpha);
  }
`;

function wrapModulo(val: number, span: number): number {
  const half = span * 0.5;
  return ((((val + half) % span) + span) % span) - half;
}

/**
 * Phase 6 — Colossal Deep-Space Environment & Parallax Drift:
 * Layered nebula clouds, subtle atmospheric cosmic haze, background spiral/lenticular galaxies,
 * and distant light clusters creating dramatic depth separation behind the Black Hole.
 */
export function CosmicDriftController() {
  const nebulaRefs = useRef<Array<THREE.Mesh | null>>([]);
  const galaxyRefs = useRef<Array<THREE.Mesh | null>>([]);
  const meteorRef = useRef<THREE.Mesh>(null);

  const nebulae = useMemo(() => {
    const noiseTex = getCosmicNoiseTexture();
    return [
      {
        baseX: -9.8,
        baseY: 3.6,
        baseZ: -18,
        scale: 10.5,
        parallax: 0.32,
        uniforms: {
          uNoiseTex: { value: noiseTex },
          uTime: { value: 0 },
          uColorA: { value: new THREE.Color('#142444') },
          uColorB: { value: new THREE.Color('#3D2258') },
          uSeed: { value: 1.2 },
          uOpacity: { value: 0.14 },
        },
      },
      {
        baseX: 10.6,
        baseY: -3.4,
        baseZ: -22,
        scale: 11.2,
        parallax: 0.25,
        uniforms: {
          uNoiseTex: { value: noiseTex },
          uTime: { value: 0 },
          uColorA: { value: new THREE.Color('#381A12') },
          uColorB: { value: new THREE.Color('#6A361A') },
          uSeed: { value: 3.7 },
          uOpacity: { value: 0.13 },
        },
      },
      {
        baseX: 1.2,
        baseY: 5.4,
        baseZ: -27,
        scale: 12.2,
        parallax: 0.18,
        uniforms: {
          uNoiseTex: { value: noiseTex },
          uTime: { value: 0 },
          uColorA: { value: new THREE.Color('#102338') },
          uColorB: { value: new THREE.Color('#294968') },
          uSeed: { value: 6.4 },
          uOpacity: { value: 0.11 },
        },
      },
      // Subtle wide cosmic atmospheric scattering haze enveloping the central horizon depth plane
      {
        baseX: 0.4,
        baseY: 0.1,
        baseZ: -14.5,
        scale: 16.5,
        parallax: 0.08,
        uniforms: {
          uNoiseTex: { value: noiseTex },
          uTime: { value: 0 },
          uColorA: { value: new THREE.Color('#1C1410') },
          uColorB: { value: new THREE.Color('#2E1E16') },
          uSeed: { value: 8.9 },
          uOpacity: { value: 0.085 },
        },
      },
    ];
  }, []);

  const galaxies = useMemo(
    () => [
      {
        baseX: -12.0,
        baseY: -4.2,
        baseZ: -30,
        rot: [0.65, 0.2, 0.4] as [number, number, number],
        scale: 2.8,
        parallax: 0.14,
        uniforms: {
          uTime: { value: 0 },
          uArmColor: { value: new THREE.Color('#6BA8E5') },
          uCoreColor: { value: new THREE.Color('#FFF0D5') },
          uOpacity: { value: 0.28 },
        },
      },
      {
        baseX: 12.8,
        baseY: 4.8,
        baseZ: -34,
        rot: [-0.55, 0.35, -0.3] as [number, number, number],
        scale: 2.35,
        parallax: 0.11,
        uniforms: {
          uTime: { value: 0 },
          uArmColor: { value: new THREE.Color('#C48CE8') },
          uCoreColor: { value: new THREE.Color('#FFE5BA') },
          uOpacity: { value: 0.24 },
        },
      },
      {
        baseX: -3.6,
        baseY: 6.2,
        baseZ: -37,
        rot: [1.12, -0.25, 0.55] as [number, number, number],
        scale: 1.95,
        parallax: 0.09,
        uniforms: {
          uTime: { value: 0 },
          uArmColor: { value: new THREE.Color('#E8A66B') },
          uCoreColor: { value: new THREE.Color('#FFF6E5') },
          uOpacity: { value: 0.20 },
        },
      },
    ],
    []
  );

  const meteorState = useRef({
    active: false,
    x: 0,
    y: 0,
    z: -14,
    vx: -9,
    vy: -3.5,
    life: 0,
    nextAt: 5.5,
  });

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.05);
    const t = cosmicEngine.elapsedTime;
    const drift = cosmicSimulationManager.driftOffset;
    const isReduced =
      cosmicEngine.preferences.reduced_motion || !cosmicEngine.preferences.background_animation;
    const isLow =
      cosmicEngine.isSoftwareRenderer ||
      cosmicSimulationManager.settings.qualityPreset === 'performance' ||
      cosmicEngine.preferences.graphics_quality === 'low';

    for (let i = 0; i < nebulae.length; i += 1) {
      const m = nebulaRefs.current[i];
      if (!m) continue;
      if (cosmicEngine.isSoftwareRenderer || (isLow && i > 0)) {
        m.visible = false;
        continue;
      }
      m.visible = true;
      const cfg = nebulae[i];
      cfg.uniforms.uTime.value = t;
      m.position.set(
        wrapModulo(cfg.baseX - drift.x * cfg.parallax, 36),
        wrapModulo(cfg.baseY - drift.y * cfg.parallax, 24),
        cfg.baseZ + wrapModulo(-drift.z * cfg.parallax * 0.4, 10)
      );
    }

    for (let i = 0; i < galaxies.length; i += 1) {
      const g = galaxyRefs.current[i];
      if (!g) continue;
      g.visible = !isLow;
      if (!g.visible) continue;
      const cfg = galaxies[i];
      cfg.uniforms.uTime.value = t;
      g.position.set(
        wrapModulo(cfg.baseX - drift.x * cfg.parallax, 38),
        wrapModulo(cfg.baseY - drift.y * cfg.parallax, 26),
        cfg.baseZ
      );
    }

    const meteor = meteorRef.current;
    if (meteor) {
      const ms = meteorState.current;
      if (isReduced || isLow) {
        meteor.visible = false;
      } else if (!ms.active) {
        meteor.visible = false;
        if (t >= ms.nextAt) {
          ms.active = true;
          ms.life = 0;
          const seed = Math.sin(t * 12.9898) * 43758.5453;
          const frac = seed - Math.floor(seed);
          ms.x = 8 + frac * 6;
          ms.y = 3 + ((frac * 7) % 1) * 3.5;
          ms.z = -13 - ((frac * 13) % 1) * 6;
          ms.vx = -11 - frac * 4;
          ms.vy = -3.2 - frac * 2.2;
          ms.nextAt = t + 9.5 + frac * 8.0;
        }
      } else {
        ms.life += dt;
        ms.x += ms.vx * dt;
        ms.y += ms.vy * dt;
        if (ms.life >= 0.72) {
          ms.active = false;
          meteor.visible = false;
        } else {
          meteor.visible = true;
          meteor.position.set(ms.x, ms.y, ms.z);
          meteor.rotation.z = Math.atan2(ms.vy, ms.vx);
          const env = Math.sin((ms.life / 0.72) * Math.PI);
          meteor.scale.set(0.85 + env * 0.75, 0.014, 1);
          const mat = meteor.material as THREE.MeshBasicMaterial;
          mat.opacity = env * 0.65;
        }
      }
    }
  });

  return (
    <group name="cosmic-drift-environment">
      {nebulae.map((n, idx) => (
        <mesh
          key={`nebula-${idx}`}
          ref={(el) => {
            nebulaRefs.current[idx] = el;
          }}
          position={[n.baseX, n.baseY, n.baseZ]}
          scale={[n.scale, n.scale * 0.68, 1]}
          renderOrder={0}
        >
          <planeGeometry args={[1, 1]} />
          <shaderMaterial
            vertexShader={nebulaVertexShader}
            fragmentShader={nebulaFragmentShader}
            uniforms={n.uniforms}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}

      {galaxies.map((g, idx) => (
        <mesh
          key={`galaxy-${idx}`}
          ref={(el) => {
            galaxyRefs.current[idx] = el;
          }}
          position={[g.baseX, g.baseY, g.baseZ]}
          rotation={g.rot}
          scale={[g.scale, g.scale, 1]}
          renderOrder={0}
        >
          <planeGeometry args={[1, 1]} />
          <shaderMaterial
            vertexShader={nebulaVertexShader}
            fragmentShader={galaxyFragmentShader}
            uniforms={g.uniforms}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
      ))}

      <mesh ref={meteorRef} visible={false} renderOrder={0}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          color="#FFF4DA"
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}
