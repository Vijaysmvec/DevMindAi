import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PlanetType } from '../../src/engine/CelestialBodyFactory';
import {
  BLACK_HOLE_SHADOW_RADIUS,
  cosmicSimulationManager,
} from '../../src/engine/CosmicSimulationManager';
import { getCosmicNoiseTexture } from '../../src/engine/noiseTexture';

const MAX_PLANET_SLOTS = 3;

function getPlanetTypeCode(pt: PlanetType): number {
  if (pt === 'gas_giant') return 1.0;
  if (pt === 'ice') return 2.0;
  if (pt === 'molten') return 3.0;
  if (pt === 'moon') return 4.0;
  return 0.0; // rocky
}

const planetVertexShader = /* glsl */ `
  uniform vec3 uToBhDir;
  uniform float uRocheDeform;
  uniform float uIntegrity;
  uniform float uSpinAngle;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  varying vec2 vSpinUv;
  varying float vLat;

  const float INV_TAU = 0.15915494;

  void main() {
    vSpinUv = vec2(uv.x + uSpinAngle * INV_TAU, uv.y);
    vLat = position.y;

    // Progressive tidal deformation + crustal fracture displacement inside the Roche zone
    float proj = dot(position, uToBhDir);
    vec3 perp = position - uToBhDir * proj;
    float breakup = 1.0 - uIntegrity;
    float crustJagged =
      sin(position.x * 8.0 + uSpinAngle) *
      cos(position.z * 7.0 - uSpinAngle * 0.5) *
      0.16 *
      breakup;

    vec3 deformed =
      uToBhDir * proj * (1.0 + uRocheDeform * 0.72 + breakup * 0.45) +
      perp * (1.0 - uRocheDeform * 0.24 + crustJagged);

    vNormal = normalize(normalMatrix * normalize(deformed));
    vec4 mvPos = modelViewMatrix * vec4(deformed, 1.0);
    vViewPos = -mvPos.xyz;
    gl_Position = projectionMatrix * mvPos;
  }
`;

const planetFragmentShader = /* glsl */ `
  uniform sampler2D uNoiseTex;
  uniform vec3 uPrimaryColor;
  uniform vec3 uSecondaryColor;
  uniform vec3 uAtmosphereColor;
  uniform float uAtmosphereStrength;
  uniform float uBandScale;
  uniform float uSeed;
  uniform float uIntegrity;
  uniform float uOpacity;
  uniform float uPlanetTypeCode;
  uniform vec3 uLightDirView;

  varying vec3 vNormal;
  varying vec3 vViewPos;
  varying vec2 vSpinUv;
  varying float vLat;

  void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(vViewPos);
    vec3 l = normalize(uLightDirView);

    vec4 tex = texture2D(uNoiseTex, vSpinUv * vec2(2.2, 1.6) + vec2(uSeed * 0.73, uSeed * 0.41));
    float nA = tex.g;
    float nB = tex.b;
    float bands = sin(vLat * uBandScale + nA * 3.6 + (1.0 - uIntegrity) * 4.5) * 0.5 + 0.5;
    float terrainMix = mix(nA * 0.65 + nB * 0.35, bands, clamp((uBandScale - 4.0) * 0.1, 0.0, 1.0));

    vec3 baseAlbedo = mix(uSecondaryColor, uPrimaryColor, smoothstep(0.24, 0.78, terrainMix));

    // Warm golden accretion illumination across the Black-Hole-facing dayside
    float ndotl = max(dot(n, l), 0.0);
    vec3 accretionSunlight = vec3(1.0, 0.84, 0.60) * (0.14 + 1.40 * ndotl);
    vec3 surfaceCol = baseAlbedo * accretionSunlight;

    // Type-adapted surface fracture glow:
    // - Rocky (0) & Molten (3): glowing magma & mantle fissures
    // - Ice (2): bright cyan-white cryovolcanic fractures
    // - Gas Giant (1): superheated amber atmospheric core rifts
    // - Moon (4): warm impact-heated regolith cracks
    float isMolten = step(2.5, uPlanetTypeCode) * (1.0 - step(3.5, uPlanetTypeCode));
    float isIce = step(1.5, uPlanetTypeCode) * (1.0 - step(2.5, uPlanetTypeCode));
    float isGas = step(0.5, uPlanetTypeCode) * (1.0 - step(1.5, uPlanetTypeCode));

    float fractureStress = clamp((1.0 - uIntegrity) * 1.45 + isMolten * 0.68, 0.0, 1.0);
    float crackMask = smoothstep(0.50, 0.88, tex.a) * fractureStress;

    vec3 fissureCol = vec3(1.0, 0.44, 0.10);
    fissureCol = mix(fissureCol, vec3(0.68, 0.94, 1.0), isIce);
    fissureCol = mix(fissureCol, vec3(1.0, 0.76, 0.38), isGas);
    surfaceCol += fissureCol * crackMask * 1.55;

    // Erode silhouette into breaking chunks when integrity drops low (never merely shrinks into a smooth dot)
    float chunkMask = mix(1.0, smoothstep(0.18, 0.58, nA * 0.6 + tex.a * 0.5), clamp((0.45 - uIntegrity) * 2.0, 0.0, 0.85));

    float invV = 1.0 - max(dot(n, v), 0.0);
    float fresnel = invV * invV * invV;
    surfaceCol += uAtmosphereColor * fresnel * uAtmosphereStrength * (0.35 + 0.65 * ndotl);

    gl_FragColor = vec4(surfaceCol, clamp(uOpacity * chunkMask, 0.0, 1.0));
  }
`;

const shockVertexShader = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aAlpha;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    if (aAlpha <= 0.005) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      vColor = aColor;
      vAlpha = 0.0;
      return;
    }
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPos;
    gl_PointSize = clamp(aSize * (340.0 / max(-mvPos.z, 2.0)), 4.0, 42.0);
    vColor = aColor;
    vAlpha = aAlpha;
  }
`;

const shockFragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec2 c = (gl_PointCoord - 0.5) * 2.0;
    float d2 = dot(c, c);
    if (d2 > 1.0) discard;
    float r = sqrt(d2);
    float shock = exp(-r * 3.8) + exp(-(r - 0.52) * (r - 0.52) * 24.0) * 0.45;
    gl_FragColor = vec4(vColor * 1.35, clamp(shock * vAlpha, 0.0, 0.92));
  }
`;

type PlanetSlotUniforms = {
  uNoiseTex: { value: THREE.DataTexture };
  uPrimaryColor: { value: THREE.Color };
  uSecondaryColor: { value: THREE.Color };
  uAtmosphereColor: { value: THREE.Color };
  uAtmosphereStrength: { value: number };
  uBandScale: { value: number };
  uSeed: { value: number };
  uIntegrity: { value: number };
  uOpacity: { value: number };
  uPlanetTypeCode: { value: number };
  uToBhDir: { value: THREE.Vector3 };
  uRocheDeform: { value: number };
  uSpinAngle: { value: number };
  uLightDirView: { value: THREE.Vector3 };
};

/**
 * Phase 4 — Separate Type-Specific Planetary Tidal Disruption System:
 * - Rocky, Molten, Gas Giant, Ice Planet, and Moon archetypes
 * - Progressive orbital distortion, surface cracking & non-uniform chunk breakup
 * - 48 Large Irregular 3D Crustal/Core Boulders orbiting & colliding in the Roche debris arc
 * - Glowing Fragment-Fragment Collision Shock Regions
 * - 260 Type-Adapted Debris & Gas Plumes progressively captured or ejected
 */
export function PlanetCaptureSystem() {
  const meshRefs = useRef<Array<THREE.Mesh | null>>([]);
  const boulderMeshRef = useRef<THREE.InstancedMesh>(null);
  const debrisMeshRef = useRef<THREE.InstancedMesh>(null);

  const planetGeo = useMemo(() => new THREE.SphereGeometry(1, 20, 20), []);
  const boulderGeo = useMemo(() => new THREE.DodecahedronGeometry(1, 0), []);
  const shardGeo = useMemo(() => new THREE.OctahedronGeometry(1, 0), []);

  const prevActiveBouldersRef = useRef(0);
  const prevActiveShardsRef = useRef(0);
  const prevActiveShocksRef = useRef(0);

  const boulderMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0.96,
      }),
    []
  );

  const shardMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0.90,
      }),
    []
  );

  const slots = useMemo<PlanetSlotUniforms[]>(() => {
    const noiseTex = getCosmicNoiseTexture();
    return Array.from({ length: MAX_PLANET_SLOTS }, () => ({
      uNoiseTex: { value: noiseTex },
      uPrimaryColor: { value: new THREE.Color('#B87B52') },
      uSecondaryColor: { value: new THREE.Color('#5C3D2E') },
      uAtmosphereColor: { value: new THREE.Color('#7CC8FF') },
      uAtmosphereStrength: { value: 0.5 },
      uBandScale: { value: 6.0 },
      uSeed: { value: 0.5 },
      uIntegrity: { value: 1.0 },
      uOpacity: { value: 0 },
      uPlanetTypeCode: { value: 0 },
      uToBhDir: { value: new THREE.Vector3(1, 0, 0) },
      uRocheDeform: { value: 0 },
      uSpinAngle: { value: 0 },
      uLightDirView: { value: new THREE.Vector3(1, 0.2, 0.3) },
    }));
  }, []);

  const shockBuffers = useMemo(() => {
    const maxCount = cosmicSimulationManager.shockPool.length;
    const positions = new Float32Array(maxCount * 3);
    const colors = new Float32Array(maxCount * 3);
    const sizes = new Float32Array(maxCount);
    const alphas = new Float32Array(maxCount);

    const geo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(positions, 3);
    const colAttr = new THREE.BufferAttribute(colors, 3);
    const sizeAttr = new THREE.BufferAttribute(sizes, 1);
    const alphaAttr = new THREE.BufferAttribute(alphas, 1);

    posAttr.setUsage(THREE.DynamicDrawUsage);
    colAttr.setUsage(THREE.DynamicDrawUsage);
    sizeAttr.setUsage(THREE.DynamicDrawUsage);
    alphaAttr.setUsage(THREE.DynamicDrawUsage);

    geo.setAttribute('position', posAttr);
    geo.setAttribute('aColor', colAttr);
    geo.setAttribute('aSize', sizeAttr);
    geo.setAttribute('aAlpha', alphaAttr);

    return { geo, positions, colors, sizes, alphas, posAttr, colAttr, sizeAttr, alphaAttr };
  }, []);

  const dummyObj = useMemo(() => new THREE.Object3D(), []);
  const dummyColor = useMemo(() => new THREE.Color(), []);
  const scratchLightView = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ camera }) => {
    const planets = cosmicSimulationManager.planets;
    const bh = cosmicSimulationManager.bhWorldAnchor;

    for (let i = 0; i < MAX_PLANET_SLOTS; i += 1) {
      const mesh = meshRefs.current[i];
      if (!mesh) continue;

      const p = planets[i];
      const opacity = p ? p.spawnFade * Math.min(1, p.integrity * 3.8 + 0.06) : 0;
      if (!p || opacity <= 0.01 || p.currentRadius <= 0.01) {
        mesh.visible = false;
        continue;
      }

      mesh.visible = true;
      mesh.position.set(p.renderX, p.renderY, p.renderZ);
      mesh.scale.setScalar(Math.max(0.02, p.currentRadius));

      scratchLightView
        .set(bh.x - p.renderX, bh.y - p.renderY, bh.z - p.renderZ)
        .normalize()
        .transformDirection(camera.matrixWorldInverse);

      const u = slots[i];
      u.uPrimaryColor.value.set(p.primaryColorHex);
      u.uSecondaryColor.value.set(p.secondaryColorHex);
      u.uAtmosphereColor.value.set(p.atmosphereColorHex);
      u.uAtmosphereStrength.value = p.atmosphereStrength;
      u.uBandScale.value = p.bandScale;
      u.uSeed.value = p.seed;
      u.uIntegrity.value = p.integrity;
      u.uOpacity.value = opacity;
      u.uPlanetTypeCode.value = getPlanetTypeCode(p.planetType);
      u.uToBhDir.value.set(p.dirToBhX, p.dirToBhY, p.dirToBhZ);
      u.uRocheDeform.value = p.tidalDeform;
      u.uSpinAngle.value = p.rotationAngle;
      u.uLightDirView.value.copy(scratchLightView);
    }

    // 1. Update Large Irregular 3D Crustal/Core Boulders orbiting & disappearing behind shadow
    const boulderInst = boulderMeshRef.current;
    if (boulderInst) {
      const bPool = cosmicSimulationManager.boulderPool;
      let activeBoulders = 0;
      for (let i = 0; i < bPool.length; i += 1) {
        const b = bPool[i];
        if (!b.active) continue;

        const lifeNorm = Math.min(1, Math.max(0, b.life / Math.max(0.05, b.maxLife)));
        const shrink = 1.0 - lifeNorm * lifeNorm * 0.78;
        const rDist = Math.hypot(b.x - bh.x, b.y - bh.y, b.z - bh.z);
        const shadowFade = THREE.MathUtils.smoothstep(
          rDist,
          BLACK_HOLE_SHADOW_RADIUS,
          BLACK_HOLE_SHADOW_RADIUS + 0.16
        );
        const heat = b.ejected ? 0.12 : 1.0 - THREE.MathUtils.smoothstep(rDist, 1.3, 3.4);

        dummyObj.position.set(b.x, b.y, b.z);
        dummyObj.rotation.set(b.rotX, b.rotY, b.rotZ);
        const s = Math.max(0.005, b.size * shrink * shadowFade);
        dummyObj.scale.set(s * b.aspectX, s * b.aspectY, s * b.aspectZ);
        dummyObj.updateMatrix();

        const idx = activeBoulders++;
        boulderInst.setMatrixAt(idx, dummyObj.matrix);

        dummyColor.setRGB(
          THREE.MathUtils.lerp(b.r, 1.0, heat * 0.65),
          THREE.MathUtils.lerp(b.g, b.planetType === 'ice' ? 0.92 : 0.62, heat * 0.58),
          THREE.MathUtils.lerp(b.b, b.planetType === 'ice' ? 1.0 : 0.25, heat * 0.55)
        );
        boulderInst.setColorAt(idx, dummyColor);
      }

      boulderInst.count = activeBoulders;
      boulderInst.visible = activeBoulders > 0;
      if (activeBoulders > 0 || prevActiveBouldersRef.current > 0) {
        boulderInst.instanceMatrix.needsUpdate = true;
        if (boulderInst.instanceColor) boulderInst.instanceColor.needsUpdate = true;
        prevActiveBouldersRef.current = activeBoulders;
      }
    }

    // 2. Update Type-Adapted Molten / Icy / Gas-Giant / Regolith Debris Streams
    const inst = debrisMeshRef.current;
    if (inst) {
      const pool = cosmicSimulationManager.fragmentPool;
      let activeShards = 0;
      for (let i = 0; i < pool.length; i += 1) {
        const f = pool[i];
        if (!f.active) continue;

        const lifeNorm = Math.min(1, Math.max(0, f.life / Math.max(0.05, f.maxLife)));
        const shrink = 1.0 - lifeNorm * Math.sqrt(lifeNorm);
        const rDist = Math.hypot(f.x - bh.x, f.y - bh.y, f.z - bh.z);
        const shadowFade = THREE.MathUtils.smoothstep(
          rDist,
          BLACK_HOLE_SHADOW_RADIUS,
          BLACK_HOLE_SHADOW_RADIUS + 0.14
        );
        const heat = f.ejected ? 0.1 : 1.0 - THREE.MathUtils.smoothstep(rDist, 1.25, 3.2);

        dummyObj.position.set(f.x, f.y, f.z);
        dummyObj.rotation.set(f.rotX, f.rotY, f.rotZ);
        const s = Math.max(0.004, f.size * shrink * shadowFade);
        // Gas giant stripped atmospheric ribbons elongate dramatically; rocky/icy shards stay angular
        if (f.planetType === 'gas_giant') {
          dummyObj.scale.set(s * 2.8, s * 0.45, s * 1.1);
        } else {
          dummyObj.scale.set(s * 1.4, s * 0.78, s * 1.05);
        }
        dummyObj.updateMatrix();

        const idx = activeShards++;
        inst.setMatrixAt(idx, dummyObj.matrix);

        dummyColor.setRGB(
          THREE.MathUtils.lerp(f.r, 1.0, heat * 0.68),
          THREE.MathUtils.lerp(f.g, f.planetType === 'ice' ? 0.94 : 0.60, heat * 0.58),
          THREE.MathUtils.lerp(f.b, f.planetType === 'ice' ? 1.0 : 0.24, heat * 0.58)
        );
        inst.setColorAt(idx, dummyColor);
      }

      inst.count = activeShards;
      inst.visible = activeShards > 0;
      if (activeShards > 0 || prevActiveShardsRef.current > 0) {
        inst.instanceMatrix.needsUpdate = true;
        if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
        prevActiveShardsRef.current = activeShards;
      }
    }

    // 3. Update Glowing Fragment-Fragment Collision Shock Regions
    const shocks = cosmicSimulationManager.shockPool;
    const { geo, positions, colors, sizes, alphas, posAttr, colAttr, sizeAttr, alphaAttr } =
      shockBuffers;
    let activeShocks = 0;
    for (let i = 0; i < shocks.length; i += 1) {
      const s = shocks[i];
      if (!s.active) continue;
      const env = Math.sin((s.life / s.maxLife) * Math.PI);
      const idx = activeShocks++;
      positions[idx * 3] = s.x;
      positions[idx * 3 + 1] = s.y;
      positions[idx * 3 + 2] = s.z;
      colors[idx * 3] = s.r;
      colors[idx * 3 + 1] = s.g;
      colors[idx * 3 + 2] = s.b;
      sizes[idx] = s.radius;
      alphas[idx] = env * s.intensity;
    }
    geo.setDrawRange(0, activeShocks);
    if (activeShocks > 0 || prevActiveShocksRef.current > 0) {
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
      sizeAttr.needsUpdate = true;
      alphaAttr.needsUpdate = true;
      prevActiveShocksRef.current = activeShocks;
    }
  });

  return (
    <group name="planet-capture-system">
      {slots.map((slot, idx) => (
        <mesh
          key={idx}
          ref={(el) => {
            meshRefs.current[idx] = el;
          }}
          geometry={planetGeo}
          visible={false}
          renderOrder={3}
        >
          <shaderMaterial
            vertexShader={planetVertexShader}
            fragmentShader={planetFragmentShader}
            uniforms={slot}
            transparent
            depthWrite
            depthTest
          />
        </mesh>
      ))}

      {/* Large Irregular 3D Crustal & Core Boulders */}
      <instancedMesh
        ref={boulderMeshRef}
        args={[boulderGeo, boulderMat, cosmicSimulationManager.boulderPool.length]}
        frustumCulled={false}
        renderOrder={3}
      />

      {/* Type-Adapted Molten / Icy / Atmospheric Debris Streams */}
      <instancedMesh
        ref={debrisMeshRef}
        args={[shardGeo, shardMat, cosmicSimulationManager.fragmentPool.length]}
        frustumCulled={false}
        renderOrder={3}
      />

      {/* Glowing Fragment-Fragment Collision Shock Flashes */}
      <points geometry={shockBuffers.geo} renderOrder={4} frustumCulled={false}>
        <shaderMaterial
          vertexShader={shockVertexShader}
          fragmentShader={shockFragmentShader}
          transparent
          depthWrite={false}
          depthTest
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}
