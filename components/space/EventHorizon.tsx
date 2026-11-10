import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { cosmicEngine } from '../../src/engine/cosmicEngine';
import { BLACK_HOLE_SHADOW_RADIUS } from '../../src/engine/CosmicSimulationManager';

const vertexShader = /* glsl */ `
  uniform float uSpinAsymmetry;

  void main() {
    // Near-extremal Kerr black-hole shadow silhouette (NASA SVS 14620):
    // Prograde (-X) side of the shadow flattens subtly into a relativistic D-shaped silhouette.
    vec3 pos = position;
    if (pos.x < 0.0) {
      pos.x *= (1.0 - uSpinAsymmetry * smoothstep(0.0, -0.85, pos.x));
    }
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  void main() {
    // Scientific Event-Horizon Shadow:
    // The event horizon is NOT a glowing material surface. It is communicated strictly through
    // an absolute abyssal #000000 shadow silhouette that depth-occludes rear gas and infalling streams.
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
  }
`;

export function EventHorizon() {
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uSpinAsymmetry: { value: 0.048 },
    }),
    []
  );

  useFrame(() => {
    if (!matRef.current) return;
    const rotScale = Math.min(1.5, Math.max(0, cosmicEngine.preferences.black_hole_rotation_intensity));
    matRef.current.uniforms.uSpinAsymmetry.value = 0.036 + 0.022 * rotScale;
  });

  return (
    <group name="event-horizon-core">
      {/* Pure #000000 Kerr Black-Hole Shadow — writes depth first so rear disk & infalling matter vanish behind it */}
      <mesh renderOrder={0}>
        <sphereGeometry args={[BLACK_HOLE_SHADOW_RADIUS, 72, 72]} />
        <shaderMaterial
          ref={matRef}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
          depthWrite
          depthTest
        />
      </mesh>
    </group>
  );
}
