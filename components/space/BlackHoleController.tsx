import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { cosmicEngine } from '../../src/engine/cosmicEngine';
import { cosmicSimulationManager } from '../../src/engine/CosmicSimulationManager';

interface BlackHoleControllerProps {
  blackHoleGroupRef: React.RefObject<THREE.Group>;
}

/**
 * Central 3D Simulation Controller (v2.4 The Devourer — Black Hole Apocalypse):
 * - Exponentially smooths frame deltas for butter-smooth 60-144Hz angular & orbital motion
 * - Steps both cosmicEngine and cosmicSimulationManager (120Hz fixed-timestep celestial physics)
 * - Cinematic slow orbital perspective + controlled zoom breathing + Stable Viewing Mode toggle
 * - Reports continuous celestial gravitational tension to CosmicEngine/CosmicAudioEngine
 * - Projects 3D Event Horizon coordinates into 2D screen pixels for GravityTextEffect
 */
export function BlackHoleController({ blackHoleGroupRef }: BlackHoleControllerProps) {
  const { camera, size } = useThree();
  const projectedVec = useMemo(() => new THREE.Vector3(), []);
  const lookTarget = useRef(new THREE.Vector3(0.45, 0.12, 0));
  const smoothedDeltaRef = useRef(1 / 60);

  useEffect(() => {
    const onVisibility = () => {
      cosmicEngine.isPageHidden = document.visibilityState === 'hidden';
    };
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useFrame((_, rawDelta) => {
    if (cosmicEngine.isPageHidden) return;

    const clampedDelta = Math.min(Math.max(rawDelta, 0.001), 0.05);
    smoothedDeltaRef.current += (clampedDelta - smoothedDeltaRef.current) * 0.24;
    const dt = smoothedDeltaRef.current;

    cosmicEngine.step(dt);
    cosmicSimulationManager.step(dt);

    const isReduced =
      cosmicEngine.preferences.reduced_motion || !cosmicEngine.preferences.background_animation;
    const isStable = isReduced || cosmicSimulationManager.settings.stableCameraMode;

    const bhAnchor = cosmicSimulationManager.bhWorldAnchor;
    const t = cosmicEngine.elapsedTime;
    const camOrbitX = isStable ? 0 : Math.sin(t * 0.062) * 0.24;
    const camOrbitY = isStable ? 0 : Math.cos(t * 0.046) * 0.14;
    const camZoomBreath = isStable
      ? 0
      : Math.sin(t * 0.042) * 0.15 - cosmicSimulationManager.accretionSurge * 0.09;
    const parallaxX = isStable
      ? 0
      : cosmicEngine.cursorNDCX * 0.24 * cosmicEngine.preferences.gravitational_cursor_strength;
    const parallaxY = isStable
      ? 0
      : cosmicEngine.cursorNDCY * 0.16 * cosmicEngine.preferences.gravitational_cursor_strength;

    const camDamp = 1.0 - Math.exp(-3.4 * dt);
    const targetCamX = (bhAnchor.x - 0.45) * (isStable ? 0.18 : 0.52) + camOrbitX + parallaxX;
    const targetCamY =
      1.24 + (bhAnchor.y - 0.12) * (isStable ? 0.18 : 0.52) + camOrbitY + parallaxY;
    const targetCamZ = 7.38 + camZoomBreath;

    camera.position.x += (targetCamX - camera.position.x) * camDamp;
    camera.position.y += (targetCamY - camera.position.y) * camDamp;
    camera.position.z += (targetCamZ - camera.position.z) * camDamp;

    lookTarget.current.x += (bhAnchor.x - lookTarget.current.x) * camDamp;
    lookTarget.current.y += (bhAnchor.y - lookTarget.current.y) * camDamp;
    lookTarget.current.z += (bhAnchor.z - lookTarget.current.z) * camDamp;
    camera.lookAt(lookTarget.current);

    const grp = blackHoleGroupRef.current;
    if (grp) {
      grp.position.set(
        bhAnchor.x + (isStable ? 0 : cosmicEngine.tremorX),
        bhAnchor.y + (isStable ? 0 : cosmicEngine.tremorY),
        bhAnchor.z
      );

      projectedVec.copy(grp.position).project(camera);
      cosmicEngine.blackHoleScreenX = (projectedVec.x * 0.5 + 0.5) * size.width;
      cosmicEngine.blackHoleScreenY = (-projectedVec.y * 0.5 + 0.5) * size.height;
    }
  });

  return null;
}
