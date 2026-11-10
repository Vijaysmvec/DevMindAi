import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { cosmicEngine, PARTICLE_SYSTEM_PARAMS } from '../../src/engine/cosmicEngine';

const CFG = PARTICLE_SYSTEM_PARAMS.innerPlasmaParticles;

interface PlasmaGrainSeed {
  radius: number;
  angle: number;
  speed: number;
  verticalJitter: number;
  size: number;
}

/**
 * Part A.2 System #2: Inner Plasma Particles
 * Optimized with direct Float32Array 4x4 matrix writes and lightweight octahedron geometry.
 */
export function InnerPlasmaParticles() {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const { seeds, colors } = useMemo(() => {
    const arr: PlasmaGrainSeed[] = [];
    const colorAttr = new Float32Array(CFG.maxCount * 3);
    const stellar = new THREE.Color('#FFF0D5');
    const gold = new THREE.Color('#FFB347');
    const cyan = new THREE.Color('#56D9FF');

    for (let i = 0; i < CFG.maxCount; i++) {
      const radius = 1.19 + Math.pow(Math.random(), 1.5) * 0.85;
      arr.push({
        radius,
        angle: Math.random() * Math.PI * 2,
        speed: (CFG.speedMult * (0.85 + Math.random() * 0.4)) / Math.pow(radius, 1.3),
        verticalJitter: (Math.random() - 0.5) * 0.05,
        size: CFG.minSize + Math.random() * (CFG.maxSize - CFG.minSize),
      });

      const pick = Math.random();
      const c = pick < 0.56 ? stellar : pick < 0.88 ? gold : cyan;
      colorAttr[i * 3] = c.r;
      colorAttr[i * 3 + 1] = c.g;
      colorAttr[i * 3 + 2] = c.b;
    }

    return { seeds: arr, colors: colorAttr };
  }, []);

  useFrame((_, rawDelta) => {
    const mesh = meshRef.current;
    if (!mesh || cosmicEngine.isPageHidden) return;

    const dt = Math.min(rawDelta, 0.05);
    const activeCount = Math.max(
      32,
      Math.min(CFG.maxCount, Math.floor(CFG.maxCount * cosmicEngine.getEffectiveParticleScale()))
    );
    mesh.count = activeCount;

    const motionActive =
      !cosmicEngine.preferences.reduced_motion && cosmicEngine.preferences.background_animation;
    const rotMult = motionActive
      ? cosmicEngine.currentRotationSpeed * cosmicEngine.currentInnerRingBoost * 0.85
      : 0;
    const matArray = mesh.instanceMatrix.array as Float32Array;

    for (let i = 0; i < activeCount; i++) {
      const s = seeds[i];
      const omega = s.speed * rotMult;
      s.angle += omega * dt;

      const cs = Math.cos(s.angle);
      const sn = Math.sin(s.angle);
      const x = cs * s.radius;
      const z = sn * s.radius;
      const y = Math.sin(s.angle * 3.0 + i) * s.verticalJitter;

      const streak = 1.0 + Math.min(CFG.stretch, Math.abs(omega) * 0.9);
      const sx = s.size * streak;
      const syz = s.size * 0.7;

      const base = i * 16;
      matArray[base] = sx * cs;
      matArray[base + 1] = 0;
      matArray[base + 2] = sx * sn;
      matArray[base + 3] = 0;
      matArray[base + 4] = 0;
      matArray[base + 5] = syz;
      matArray[base + 6] = 0;
      matArray[base + 7] = 0;
      matArray[base + 8] = -syz * sn;
      matArray[base + 9] = 0;
      matArray[base + 10] = syz * cs;
      matArray[base + 11] = 0;
      matArray[base + 12] = x;
      matArray[base + 13] = y;
      matArray[base + 14] = z;
      matArray[base + 15] = 1;
    }

    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <group rotation={[0.24, 0, -0.09]}>
      <instancedMesh ref={meshRef} args={[undefined, undefined, CFG.maxCount]} renderOrder={4}>
        <octahedronGeometry args={[1, 0]}>
          <instancedBufferAttribute attach="attributes-color" args={[colors, 3]} />
        </octahedronGeometry>
        <meshBasicMaterial
          vertexColors
          transparent
          opacity={0.92}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </instancedMesh>
    </group>
  );
}
