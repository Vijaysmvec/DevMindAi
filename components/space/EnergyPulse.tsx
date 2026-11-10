import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { cosmicEngine } from '../../src/engine/cosmicEngine';

const MAX_WAVE_SLOTS = 6;

export function EnergyPulse() {
  const groupRef = useRef<THREE.Group>(null);
  const ringRefs = useRef<Array<THREE.Mesh | null>>([]);

  const ringMaterial = useMemo(() => {
    return Array.from({ length: MAX_WAVE_SLOTS }, () =>
      new THREE.MeshBasicMaterial({
        color: new THREE.Color('#FFB347'),
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
  }, []);

  useFrame(() => {
    const pulses = cosmicEngine.activePulses;
    for (let i = 0; i < MAX_WAVE_SLOTS; i++) {
      const mesh = ringRefs.current[i];
      const mat = ringMaterial[i];
      const pulse = pulses[i];

      if (!mesh || !mat) continue;

      if (!pulse) {
        mesh.visible = false;
        mat.opacity = 0;
        continue;
      }

      mesh.visible = true;
      const eased = 1.0 - Math.pow(1.0 - pulse.progress, 2.2);
      const radius = 1.15 + eased * pulse.maxRadius;
      mesh.scale.setScalar(radius);

      // Gentle fade-in near event horizon, smooth fade-out into deep space
      const fadeIn = Math.min(1.0, pulse.progress * 5.0);
      const fadeOut = Math.pow(1.0 - pulse.progress, 1.85);
      const audioEnergyBoost = 1.0 + cosmicEngine.audioVisual.bass * 0.16;
      mat.color.set(pulse.colorHex);
      mat.opacity = Math.min(0.85, fadeIn * fadeOut * pulse.intensity * 0.28 * audioEnergyBoost);
    }
  });

  return (
    <group ref={groupRef} rotation={[0.24, 0, -0.09]} renderOrder={2}>
      {ringMaterial.map((mat, idx) => (
        <mesh
          key={idx}
          ref={(el) => {
            ringRefs.current[idx] = el;
          }}
          rotation={[Math.PI / 2, 0, 0]}
          material={mat}
          visible={false}
        >
          <ringGeometry args={[0.95, 1.03, 96]} />
        </mesh>
      ))}
    </group>
  );
}
