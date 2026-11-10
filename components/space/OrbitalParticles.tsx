import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { cosmicEngine, PARTICLE_SYSTEM_PARAMS } from '../../src/engine/cosmicEngine';

const CFG = PARTICLE_SYSTEM_PARAMS.orbitalParticles;

interface OrbitSeed {
  radius: number;
  angle: number;
  speed: number;
  inclination: number;
  size: number;
  offsetX: number;
  offsetY: number;
}

/**
 * Part A.2 System #3: Orbital Particles
 * Optimized with direct Float32Array 4x4 matrix writes and lightweight octahedron geometry.
 */
export function OrbitalParticles() {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const { seeds, colors } = useMemo(() => {
    const arr: OrbitSeed[] = [];
    const colorAttr = new Float32Array(CFG.maxCount * 3);
    const gold = new THREE.Color('#FFB347');
    const stellar = new THREE.Color('#FFF0D5');
    const amber = new THREE.Color('#E88732');
    const cyan = new THREE.Color('#56D9FF');

    for (let i = 0; i < CFG.maxCount; i++) {
      const radius = 1.38 + Math.pow(Math.random(), 1.35) * 4.9;
      arr.push({
        radius,
        angle: Math.random() * Math.PI * 2,
        speed: (CFG.speedMult * (0.72 + Math.random() * 0.52)) / Math.pow(radius, 1.18),
        inclination: (Math.random() - 0.5) * 0.34,
        size: CFG.minSize + Math.random() * (CFG.maxSize - CFG.minSize),
        offsetX: 0,
        offsetY: 0,
      });

      const pick = Math.random();
      const c = pick < 0.48 ? gold : pick < 0.78 ? stellar : pick < 0.92 ? amber : cyan;
      const lum = 0.76 + Math.random() * 0.28;
      colorAttr[i * 3] = Math.min(1, c.r * lum);
      colorAttr[i * 3 + 1] = Math.min(1, c.g * lum);
      colorAttr[i * 3 + 2] = Math.min(1, c.b * lum);
    }
    return { seeds: arr, colors: colorAttr };
  }, []);

  useFrame((_, rawDelta) => {
    const mesh = meshRef.current;
    if (!mesh || cosmicEngine.isPageHidden) return;

    const dt = Math.min(rawDelta, 0.05);
    const activeCount = Math.max(
      36,
      Math.min(CFG.maxCount, Math.floor(CFG.maxCount * cosmicEngine.getEffectiveParticleScale()))
    );
    mesh.count = activeCount;

    const isMotionActive =
      !cosmicEngine.preferences.reduced_motion && cosmicEngine.preferences.background_animation;
    const speedMult = isMotionActive
      ? cosmicEngine.currentOrbitalBoost * cosmicEngine.preferences.black_hole_rotation_intensity
      : 0;
    const cursorStrength = cosmicEngine.cursorInfluence;
    const cx = cosmicEngine.cursorWorldX;
    const cy = cosmicEngine.cursorWorldY;
    const relax = 1.0 - Math.exp(-6.8 * dt);
    const inwardPull =
      cosmicEngine.state === 'TYPING' || cosmicEngine.state === 'TEXT_DELETION' ? 0.94 : 1.0;
    const matArray = mesh.instanceMatrix.array as Float32Array;

    let maxDeflection = 0;

    for (let i = 0; i < activeCount; i++) {
      const s = seeds[i];
      const omega = s.speed * speedMult;
      s.angle += omega * dt;

      const r = s.radius * inwardPull;
      const cs = Math.cos(s.angle);
      const sn = Math.sin(s.angle);
      const baseX = cs * r;
      const baseZ = sn * r;
      const baseY = 2.0 * sn * cs * s.inclination + baseZ * 0.24;

      if (cursorStrength > 0.005) {
        const dx = cx - baseX;
        const dy = cy - baseY;
        const distSq = dx * dx + dy * dy;
        const influence = cursorStrength * Math.exp(-distSq * 0.22);
        const targetOffX = (dx * 0.36 - dy * 0.18) * influence;
        const targetOffY = (dy * 0.36 + dx * 0.18) * influence;
        s.offsetX += (targetOffX - s.offsetX) * relax;
        s.offsetY += (targetOffY - s.offsetY) * relax;
      } else if (s.offsetX !== 0 || s.offsetY !== 0) {
        s.offsetX *= 1.0 - relax;
        s.offsetY *= 1.0 - relax;
      }

      const magSq = s.offsetX * s.offsetX + s.offsetY * s.offsetY;
      if (magSq > maxDeflection) maxDeflection = magSq;

      const scaleStretch = 1.0 + Math.min(CFG.stretch, Math.abs(omega) * 1.15);
      const sx = s.size * scaleStretch;
      const syz = s.size * 0.8;

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
      matArray[base + 12] = baseX + s.offsetX;
      matArray[base + 13] = baseY + s.offsetY;
      matArray[base + 14] = baseZ * 0.85;
      matArray[base + 15] = 1;
    }

    cosmicEngine.cursorDeflectionMagnitude = Number(Math.sqrt(maxDeflection).toFixed(4));
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, CFG.maxCount]} renderOrder={3}>
      <octahedronGeometry args={[1, 0]}>
        <instancedBufferAttribute attach="attributes-color" args={[colors, 3]} />
      </octahedronGeometry>
      <meshBasicMaterial
        vertexColors
        transparent
        opacity={0.86}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </instancedMesh>
  );
}
