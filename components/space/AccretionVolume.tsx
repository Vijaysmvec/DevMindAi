import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { cosmicEngine } from '../../src/engine/cosmicEngine';
import { cosmicSimulationManager } from '../../src/engine/CosmicSimulationManager';
import { getCosmicNoiseTexture } from '../../src/engine/noiseTexture';

const volumeVertexShader = /* glsl */ `
  attribute float aLayerOffset;
  attribute float aLayerScale;
  attribute float aLayerTier;

  uniform float uTime;
  uniform float uThickness;
  uniform float uActiveTierLimit;
  varying vec3 vVolPos;
  varying float vLayerSign;
  varying float vLayerFade;

  void main() {
    if (aLayerTier > uActiveTierLimit) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      vVolPos = vec3(0.0);
      vLayerSign = 0.0;
      vLayerFade = 0.0;
      return;
    }

    float r = length(position.xy);
    float az = atan(position.y, position.x);

    // Thick 3D toroidal accretion flare: inner funnel opens steeply into broad turbulent outer clouds
    float flareHeight = (0.10 + 0.088 * max(r - 1.12, 0.0)) * uThickness;
    float billow = sin(az * 3.0 - uTime * 0.72 + r * 2.05 + aLayerOffset * 3.8) * 0.048 * uThickness;
    float yPos = aLayerOffset * flareHeight + billow;

    vec3 transformed = vec3(position.x * aLayerScale, yPos, position.y * aLayerScale);
    vVolPos = transformed;
    vLayerSign = aLayerOffset;
    vLayerFade = aLayerTier > 0.5 ? 0.62 : 1.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
  }
`;

const volumeFragmentShader = /* glsl */ `
  uniform sampler2D uNoiseTex;
  uniform float uMidAngle;
  uniform float uInnerAngle;
  uniform float uTime;
  uniform float uDensity;
  uniform float uSurge;
  uniform float uBrightness;
  varying vec3 vVolPos;
  varying float vLayerSign;
  varying float vLayerFade;

  const float INV_TAU = 0.15915494;

  void main() {
    if (vLayerFade <= 0.01) discard;

    float r = length(vVolPos.xz);
    float theta = atan(vVolPos.z, vVolPos.x);

    // Keep central #000000 Black-Hole Shadow completely crisp and unobstructed
    float innerClear = smoothstep(1.30, 1.76, r);
    float outerFade = 1.0 - smoothstep(4.05, 5.55, r);

    float kepler = mix(uMidAngle, uInnerAngle * 0.74, 1.0 - smoothstep(1.38, 3.25, r));
    float invR = 1.0 / max(r, 1.26);
    float swirl = theta + kepler * (2.72 * invR * sqrt(invR)) - r * 1.35;

    // Hardware texture lookup for billowing 3D gas clouds + twisting luminous plasma filaments
    vec4 tex = texture2D(
      uNoiseTex,
      vec2(swirl * INV_TAU * 3.0 + vLayerSign * 0.23, r * 0.34 - uTime * 0.046)
    );
    vec4 filTex = texture2D(
      uNoiseTex,
      vec2(swirl * INV_TAU * 6.0 - vLayerSign * 0.19, r * 0.64 + uTime * 0.032)
    );
    float cloud = tex.g * (0.68 + 0.32 * filTex.b);
    float curvedFilament = tex.a * filTex.a * 1.55;
    float nonUniformCloud = smoothstep(0.18, 0.85, cloud);

    vec3 hotCream = vec3(1.0, 0.93, 0.78);
    vec3 goldenGas = vec3(1.0, 0.66, 0.24);
    vec3 copperCloud = vec3(0.80, 0.35, 0.13);
    vec3 outerCrimson = vec3(0.52, 0.17, 0.12);

    float radialCool = smoothstep(1.55, 5.25, r);
    vec3 gasColor = mix(goldenGas, copperCloud, radialCool);
    gasColor = mix(gasColor, outerCrimson, smoothstep(3.6, 5.4, r));
    gasColor = mix(gasColor, hotCream, clamp(curvedFilament * (1.0 - radialCool * 0.58), 0.0, 1.0));

    float doppler = 0.62 + 0.54 * cos(theta + 2.68);
    float surgeMult = 1.0 + uSurge * 0.58;
    float alpha =
      innerClear *
      outerFade *
      vLayerFade *
      0.46 *
      (nonUniformCloud * 0.32 + curvedFilament * 0.28) *
      uDensity *
      doppler *
      surgeMult;

    vec3 hdrCol = gasColor * doppler * uBrightness * surgeMult;
    gl_FragColor = vec4(hdrCol / (1.0 + hdrCol * 0.26), clamp(alpha, 0.0, 0.48));
  }
`;

/**
 * Phase 2 — Multi-Stratum 3D Volumetric Accretion Gas Corona & Twisting Filaments.
 * Merges 4 toroidal gas envelopes (inner & outer upper/lower strata) into 1 GPU draw call,
 * dynamically scaling strata in BALANCED (2 strata) and PERFORMANCE (hidden) for locked 60 FPS.
 */
export function AccretionVolume() {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const { geometry, uniforms } = useMemo(() => {
    const strata = [
      { offset: -0.68, scale: 1.01, tier: 0.0 },
      { offset: 0.68, scale: 1.01, tier: 0.0 },
      { offset: -1.32, scale: 1.05, tier: 1.0 },
      { offset: 1.32, scale: 1.05, tier: 1.0 },
    ];

    const baseRing = new THREE.RingGeometry(1.30, 5.55, 72, 8);
    const basePos = baseRing.getAttribute('position') as THREE.BufferAttribute;
    const baseIndex = baseRing.getIndex();
    const vertCountPerLayer = basePos.count;
    const indexCountPerLayer = baseIndex ? baseIndex.count : 0;

    const totalVerts = vertCountPerLayer * strata.length;
    const positions = new Float32Array(totalVerts * 3);
    const layerOffsets = new Float32Array(totalVerts);
    const layerScales = new Float32Array(totalVerts);
    const layerTiers = new Float32Array(totalVerts);
    const indices = new Uint32Array(indexCountPerLayer * strata.length);

    for (let s = 0; s < strata.length; s += 1) {
      const vBase = s * vertCountPerLayer;
      for (let i = 0; i < vertCountPerLayer; i += 1) {
        positions[(vBase + i) * 3] = basePos.getX(i);
        positions[(vBase + i) * 3 + 1] = basePos.getY(i);
        positions[(vBase + i) * 3 + 2] = basePos.getZ(i);
        layerOffsets[vBase + i] = strata[s].offset;
        layerScales[vBase + i] = strata[s].scale;
        layerTiers[vBase + i] = strata[s].tier;
      }
      if (baseIndex) {
        const iBase = s * indexCountPerLayer;
        for (let j = 0; j < indexCountPerLayer; j += 1) {
          indices[iBase + j] = baseIndex.getX(j) + vBase;
        }
      }
    }

    baseRing.dispose();

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    merged.setAttribute('aLayerOffset', new THREE.BufferAttribute(layerOffsets, 1));
    merged.setAttribute('aLayerScale', new THREE.BufferAttribute(layerScales, 1));
    merged.setAttribute('aLayerTier', new THREE.BufferAttribute(layerTiers, 1));
    merged.setIndex(new THREE.BufferAttribute(indices, 1));

    return {
      geometry: merged,
      uniforms: {
        uNoiseTex: { value: getCosmicNoiseTexture() },
        uMidAngle: { value: 0 },
        uInnerAngle: { value: 0 },
        uTime: { value: 0 },
        uDensity: { value: 1.25 },
        uThickness: { value: 1.3 },
        uSurge: { value: 0.0 },
        uBrightness: { value: 1.0 },
        uActiveTierLimit: { value: 1.5 },
      },
    };
  }, []);

  useFrame(() => {
    const sim = cosmicSimulationManager.settings;
    if (meshRef.current) {
      meshRef.current.visible =
        !cosmicEngine.isSoftwareRenderer &&
        sim.qualityPreset !== 'performance' &&
        cosmicEngine.preferences.graphics_quality !== 'low';
      if (!meshRef.current.visible) return;
    }
    if (!matRef.current) return;
    const isBalanced =
      sim.qualityPreset === 'balanced' || cosmicEngine.preferences.graphics_quality === 'medium';
    const presetScale = isBalanced ? 0.85 : 1.0;

    const u = matRef.current.uniforms;
    u.uMidAngle.value = cosmicEngine.midDiskAngle;
    u.uInnerAngle.value = cosmicEngine.innerPlasmaAngle;
    u.uTime.value = cosmicEngine.elapsedTime;
    u.uDensity.value = sim.accretionDensity * presetScale;
    u.uThickness.value = sim.gasThickness;
    u.uSurge.value = cosmicSimulationManager.accretionSurge;
    u.uBrightness.value =
      cosmicEngine.currentPlasmaBrightness + cosmicEngine.audioVisual.mid * 0.15;
    u.uActiveTierLimit.value = isBalanced ? 0.5 : 1.5;
  });

  return (
    <mesh ref={meshRef} geometry={geometry} rotation={[0.24, 0, -0.09]} renderOrder={2}>
      <shaderMaterial
        ref={matRef}
        vertexShader={volumeVertexShader}
        fragmentShader={volumeFragmentShader}
        uniforms={uniforms}
        transparent
        side={THREE.DoubleSide}
        depthWrite={false}
        depthTest
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}
