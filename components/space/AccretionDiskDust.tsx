import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { cosmicEngine, PARTICLE_SYSTEM_PARAMS } from '../../src/engine/cosmicEngine';

const CFG = PARTICLE_SYSTEM_PARAMS.accretionDiskDust;

interface DiskGrainSeed {
  radius: number;
  baseRadius: number;
  angle: number;
  speed: number;
  heightOffset: number;
  size: number;
  infallRate: number;
  cycleSeq: number;
}

/**
 * Part A.2 System #1: Accretion Disk Dust
 * Optimized with direct Float32Array 4x4 matrix writes (zero Object3D Quaternion allocations)
 * and lightweight octahedron micro-grain geometry.
 */
export function AccretionDiskDust() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const lastAmbientIngestAtRef = useRef<number>(0);

  const { seeds, colors } = useMemo(() => {
    const arr: DiskGrainSeed[] = [];
    const colorAttr = new Float32Array(CFG.maxCount * 3);
    const gold = new THREE.Color('#FFB347');
    const amber = new THREE.Color('#E88732');
    const stellar = new THREE.Color('#FFF0D5');
    const cyan = new THREE.Color('#56D9FF');

    for (let i = 0; i < CFG.maxCount; i++) {
      const baseRadius = 1.52 + Math.pow(Math.random(), 1.35) * 3.15;
      const isInfalling = i < 10;
      arr.push({
        radius: isInfalling ? 1.25 + i * 0.14 : baseRadius,
        baseRadius,
        angle: Math.random() * Math.PI * 2,
        speed: (CFG.speedMult * (0.88 + Math.random() * 0.34)) / Math.pow(baseRadius, 1.2),
        heightOffset: (Math.random() - 0.5) * 0.09,
        size: CFG.minSize + Math.random() * (CFG.maxSize - CFG.minSize),
        infallRate: isInfalling ? 0.042 + (i % 4) * 0.009 : 0,
        cycleSeq: 1,
      });

      const pick = Math.random();
      const c =
        pick < 0.48
          ? gold
          : pick < 0.78
            ? amber
            : pick < 0.94
              ? stellar
              : cyan;
      const brightness = 0.78 + Math.random() * 0.32;
      colorAttr[i * 3] = Math.min(1, c.r * brightness);
      colorAttr[i * 3 + 1] = Math.min(1, c.g * brightness);
      colorAttr[i * 3 + 2] = Math.min(1, c.b * brightness);
    }
    return { seeds: arr, colors: colorAttr };
  }, []);

  useFrame((_, rawDelta) => {
    const mesh = meshRef.current;
    if (!mesh || cosmicEngine.isPageHidden) return;

    const dt = Math.min(rawDelta, 0.05);
    const activeCount = Math.max(
      48,
      Math.min(CFG.maxCount, Math.floor(CFG.maxCount * cosmicEngine.getEffectiveParticleScale()))
    );
    mesh.count = activeCount;

    const motionActive =
      !cosmicEngine.preferences.reduced_motion && cosmicEngine.preferences.background_animation;
    const rotMult = motionActive ? cosmicEngine.currentRotationSpeed : 0;
    const nowMs = performance.now();
    const matArray = mesh.instanceMatrix.array as Float32Array;

    for (let i = 0; i < activeCount; i++) {
      const s = seeds[i];
      const localAngularVel = s.speed * rotMult * (1.8 / Math.max(s.radius, 1.08));
      s.angle += localAngularVel * dt;

      if (motionActive && s.infallRate > 0) {
        s.radius -= s.infallRate * Math.abs(rotMult) * dt;
        if (s.radius <= 1.05) {
          if (nowMs - lastAmbientIngestAtRef.current > 8500) {
            lastAmbientIngestAtRef.current = nowMs;
            cosmicEngine.registerParticleIngestion({
              particleId: `accretion-dust-${i}-c${s.cycleSeq}`,
              particleType: 'accretion_dust',
              entryPosition: {
                x: cosmicEngine.blackHoleScreenX,
                y: cosmicEngine.blackHoleScreenY,
              },
              energyIntensity: 0.30,
              source: 'ambient_infall',
            });
          }
          s.cycleSeq += 1;
          s.radius = 2.65 + Math.random() * 1.4;
        }
      }

      const cs = Math.cos(s.angle);
      const sn = Math.sin(s.angle);
      const x = cs * s.radius;
      const z = sn * s.radius;
      const y = s.heightOffset * (s.radius * 0.45);

      const trailStretch = 1.0 + Math.min(CFG.stretch, Math.abs(localAngularVel) * 0.95);
      const sx = s.size * trailStretch;
      const syz = s.size * 0.75;

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
    </group>
  );
}
