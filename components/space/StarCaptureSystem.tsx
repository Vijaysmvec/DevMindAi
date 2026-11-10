import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { cosmicEngine } from '../../src/engine/cosmicEngine';
import {
  BLACK_HOLE_SHADOW_RADIUS,
  cosmicSimulationManager,
} from '../../src/engine/CosmicSimulationManager';
import { getCosmicNoiseTexture } from '../../src/engine/noiseTexture';

const MAX_STAR_SLOTS = 3;
const BOUND_RIBBON_SEGMENTS = 44;
const OUTFLOW_RIBBON_SEGMENTS = 20;

const starSurfaceVertexShader = /* glsl */ `
  uniform vec3 uToBhDir;
  uniform float uTidalStretch;
  uniform float uSpaghettification;
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  varying vec2 vUv;
  varying float vStretchTip;
  varying float vTearMask;

  void main() {
    vUv = uv;
    // Genuine differential tidal stretching: near L1 side accelerates far stronger than L2 side,
    // accompanied by perpendicular waist pancaking compression & outer envelope tearing (Hubble TDE / SVS 14000)
    vec3 unitPos = normalize(position);
    float proj = dot(unitPos, uToBhDir);
    float posProj = max(0.0, proj);
    float negProj = max(0.0, -proj);

    float nearNozzle = posProj * sqrt(posProj) * (uTidalStretch * 1.65 + uSpaghettification * 1.15);
    float farTail = negProj * negProj * (uTidalStretch * 0.62 + uSpaghettification * 0.55);
    float waistCompress = max(
      0.26,
      1.0 - (uTidalStretch * 0.38 + uSpaghettification * 0.36) * (1.0 - abs(proj))
    );

    float surfaceRip =
      sin(unitPos.x * 9.0 + uTime * 3.4) *
      cos(unitPos.z * 8.0 - uTime * 2.8) *
      0.14 *
      uSpaghettification;

    vec3 radialPerp = position - uToBhDir * dot(position, uToBhDir);
    vec3 deformed =
      uToBhDir * (dot(position, uToBhDir) * (1.0 + uTidalStretch * 0.78) + nearNozzle - farTail) +
      radialPerp * (waistCompress + surfaceRip);

    vStretchTip = clamp(nearNozzle + farTail * 0.5, 0.0, 1.8);
    vTearMask = clamp(uSpaghettification * (0.45 + 0.55 * abs(proj)), 0.0, 1.0);
    vNormal = normalize(normalMatrix * normalize(deformed));
    vec4 mvPos = modelViewMatrix * vec4(deformed, 1.0);
    vViewPos = -mvPos.xyz;
    gl_Position = projectionMatrix * mvPos;
  }
`;

const starSurfaceFragmentShader = /* glsl */ `
  uniform sampler2D uNoiseTex;
  uniform float uTime;
  uniform vec3 uCoreColor;
  uniform vec3 uCoronaColor;
  uniform float uEnergy;
  uniform float uLuminosity;
  uniform float uOpacity;
  uniform float uFlareSeed;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  varying vec2 vUv;
  varying float vStretchTip;
  varying float vTearMask;

  void main() {
    vec3 n = normalize(vNormal);
    vec3 v = normalize(vViewPos);
    float ndotv = max(dot(n, v), 0.0);

    // Convective stellar granulation + boiling photospheric plasma filaments
    vec4 granTex = texture2D(
      uNoiseTex,
      vUv * vec2(3.4, 2.2) + vec2(uTime * 0.052 + uFlareSeed, -uTime * 0.036)
    );
    float granulation = granTex.g * 0.60 + granTex.b * 0.40;
    float tearFilaments = granTex.a;

    // Progressive core cooling & shredding during late spaghettification
    vec3 superheatedTear = vec3(1.0, 0.97, 0.90);
    vec3 depletedEmber = vec3(0.96, 0.34, 0.10);
    vec3 activeCore = mix(depletedEmber, uCoreColor, smoothstep(0.06, 0.68, uEnergy));
    vec3 activeCorona = mix(depletedEmber * 0.85, uCoronaColor, smoothstep(0.0, 0.55, uEnergy));

    float invN = 1.0 - ndotv;
    float limb = invN * invN;
    vec3 col = mix(activeCore, activeCorona, limb * 0.72 + (1.0 - granulation) * 0.38);
    col = mix(col, superheatedTear, clamp(vStretchTip * 0.55 + tearFilaments * vTearMask * 0.65, 0.0, 0.92));

    // Erode outer silhouette into torn filaments during advanced spaghettification
    float shredAlpha = mix(1.0, smoothstep(0.16, 0.68, granulation * 0.65 + tearFilaments * 0.55), vTearMask * 0.72);
    float brightness = (0.84 + granulation * 0.52) * (0.48 + uLuminosity * 0.88);
    vec3 hdrCol = col * brightness;
    gl_FragColor = vec4(hdrCol / (1.0 + hdrCol * 0.22), clamp(uOpacity * shredAlpha, 0.0, 1.0));
  }
`;

const coronaVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 mvCenter = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mvCenter.xy += position.xy;
    gl_Position = projectionMatrix * mvCenter;
  }
`;

const coronaFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uCoronaColor;
  uniform float uIntensity;
  uniform float uFlareSeed;
  uniform float uDisruptionFlash;
  varying vec2 vUv;

  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r2 = dot(p, p);
    if (r2 > 1.0) discard;

    float r = sqrt(r2);
    float ang = atan(p.y, p.x);
    // Solar prominence loops & coronal flare rays
    float prominence =
      0.78 +
      0.22 * sin(ang * 6.0 + uTime * 2.2 + uFlareSeed * 6.28) *
      cos(ang * 3.0 - uTime * 1.45);
    float flareArc = pow(max(0.0, sin(ang * 2.0 - uTime * 0.9 + uFlareSeed)), 4.0) * exp(-(r - 0.36) * (r - 0.36) * 22.0);
    float glow = (exp(-r * 3.4) * prominence + flareArc * 0.45) * (1.0 - smoothstep(0.72, 1.0, r));

    vec3 col = mix(uCoronaColor * 1.28, vec3(1.0, 0.96, 0.88), clamp(uDisruptionFlash * 0.65 + exp(-r * 7.0) * 0.4, 0.0, 1.0));
    gl_FragColor = vec4(col, clamp(glow * uIntensity, 0.0, 0.94));
  }
`;

const ribbonVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldPos;

  void main() {
    vUv = uv;
    vWorldPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ribbonFragmentShader = /* glsl */ `
  uniform sampler2D uNoiseTex;
  uniform float uTime;
  uniform vec3 uCoreColor;
  uniform vec3 uCoronaColor;
  uniform vec3 uBhCenter;
  uniform float uStreamAlpha;
  uniform float uShadowRadius;
  uniform float uFlowSpeed;
  varying vec2 vUv;
  varying vec3 vWorldPos;

  void main() {
    if (uStreamAlpha <= 0.005) discard;

    // Multi-strand glowing spaghettification gas filaments + bright plasma knots (ESO eso1644b / NASA SVS 14000)
    vec4 flowA = texture2D(uNoiseTex, vec2(vUv.x * 2.8 - uTime * uFlowSpeed, vUv.y * 1.6 + 0.17));
    vec4 flowB = texture2D(uNoiseTex, vec2(vUv.x * 6.2 - uTime * (uFlowSpeed * 1.45), vUv.y * 3.2 - 0.29));

    float crossProfile = sin(vUv.y * 3.14159265);
    float multiStrand = 0.52 + 0.48 * sin(vUv.y * 15.7 + (flowA.g - 0.5) * 4.2);
    float plasmaKnots = smoothstep(0.56, 0.92, flowA.a * 0.55 + flowB.a * 0.65);
    float density = crossProfile * (0.38 + flowA.g * 0.44 + multiStrand * 0.36 + plasmaKnots * 0.68);

    // Progressive heating as stellar gas spirals down toward the Photon Ring, then vanishes behind #000000 shadow
    float distToBh = length(vWorldPos - uBhCenter);
    float shadowMask = smoothstep(uShadowRadius * 0.99, uShadowRadius * 1.18, distToBh);
    float headTailFade = smoothstep(0.0, 0.08, vUv.x) * (1.0 - smoothstep(0.84, 1.0, vUv.x));

    float innerHeat = smoothstep(3.8, 1.35, distToBh);
    vec3 baseCol = mix(uCoronaColor, uCoreColor, clamp(crossProfile * 0.65 + plasmaKnots * 0.55, 0.0, 1.0));
    vec3 heatedCol = mix(baseCol, vec3(1.0, 0.95, 0.84), innerHeat * 0.78);

    vec3 hdrCol = heatedCol * (1.15 + plasmaKnots * 0.85 + innerHeat * 0.45);
    float alpha = density * headTailFade * shadowMask * uStreamAlpha;
    gl_FragColor = vec4(hdrCol / (1.0 + hdrCol * 0.24), clamp(alpha, 0.0, 0.92));
  }
`;

const shockHotspotFragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  varying vec2 vUv;

  void main() {
    if (uIntensity <= 0.01) discard;
    vec2 p = (vUv - 0.5) * 2.0;
    float r2 = dot(p, p);
    if (r2 > 1.0) discard;
    float r = sqrt(r2);
    float ang = atan(p.y, p.x);

    // Stream-stream self-collision shock flare (NASA Swift ASASSN-14li)
    float shockSpikes = 0.74 + 0.26 * sin(ang * 8.0 - uTime * 6.5);
    float core = exp(-r * 5.2);
    float ring = exp(-(r - 0.34) * (r - 0.34) * 32.0) * 0.55;

    vec3 uvCyan = vec3(0.68, 0.93, 1.0);
    vec3 whiteGold = vec3(1.0, 0.96, 0.86);
    vec3 col = mix(uvCyan, whiteGold, clamp(core * 1.4, 0.0, 1.0));
    float alpha = (core + ring) * shockSpikes * (1.0 - smoothstep(0.7, 1.0, r)) * uIntensity;
    gl_FragColor = vec4(col * 1.35, clamp(alpha, 0.0, 0.95));
  }
`;

const streamVertexShader = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aAlpha;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    if (aAlpha <= 0.002) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      vAlpha = 0.0;
      vColor = aColor;
      return;
    }
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPos;
    gl_PointSize = clamp(aSize * (290.0 / max(-mvPos.z, 2.2)), 1.5, 14.0);
    vColor = aColor;
    vAlpha = aAlpha;
  }
`;

const streamFragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d2 = dot(c, c) * 4.0;
    if (d2 > 1.0) discard;
    float plasma = exp(-d2 * 2.7) * (1.0 - sqrt(d2) * 0.60);
    gl_FragColor = vec4(vColor * 1.26, plasma * vAlpha);
  }
`;

interface DynamicRibbonBuffer {
  geo: THREE.BufferGeometry;
  positions: Float32Array;
  posAttr: THREE.BufferAttribute;
  segments: number;
}

function createRibbonBuffer(segments: number): DynamicRibbonBuffer {
  const vertCount = (segments + 1) * 2;
  const positions = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const indices = new Uint16Array(segments * 6);

  for (let i = 0; i <= segments; i += 1) {
    const u = i / segments;
    uvs[i * 4] = u;
    uvs[i * 4 + 1] = 0;
    uvs[i * 4 + 2] = u;
    uvs[i * 4 + 3] = 1;
  }

  for (let i = 0; i < segments; i += 1) {
    const v0 = i * 2;
    const idx = i * 6;
    indices[idx] = v0;
    indices[idx + 1] = v0 + 1;
    indices[idx + 2] = v0 + 2;
    indices[idx + 3] = v0 + 1;
    indices[idx + 4] = v0 + 3;
    indices[idx + 5] = v0 + 2;
  }

  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', posAttr);
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  return { geo, positions, posAttr, segments };
}

/**
 * Phase 3 — True 6-Stage Stellar Tidal Disruption System:
 * 1. Recognizable convective star with solar prominences
 * 2. Differential radial tidal stretching + perpendicular compression + tearing
 * 3. Continuous 3D curving Spaghettification Tidal Stream Ribbon coiling around the black hole
 * 4. Returning Fallback Stream-Stream Collision Shock Hotspot (ASASSN-14li) + Unbound Outflow Tail (eso2018b)
 * 5. Local disk circularization & energetic disruption flash
 * 6. Progressive disappearance behind the pure #000000 Black-Hole Shadow
 */
export function StarCaptureSystem() {
  const groupRefs = useRef<Array<THREE.Group | null>>([]);
  const coreMeshRefs = useRef<Array<THREE.Mesh | null>>([]);
  const coronaMeshRefs = useRef<Array<THREE.Mesh | null>>([]);
  const boundRibbonMeshRefs = useRef<Array<THREE.Mesh | null>>([]);
  const outflowRibbonMeshRefs = useRef<Array<THREE.Mesh | null>>([]);
  const shockMeshRefs = useRef<Array<THREE.Mesh | null>>([]);

  const sphereGeo = useMemo(() => new THREE.SphereGeometry(1, 22, 22), []);
  const quadGeo = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
  const prevActiveStreamRef = useRef(0);

  const slots = useMemo(() => {
    const noiseTex = getCosmicNoiseTexture();
    return Array.from({ length: MAX_STAR_SLOTS }, () => ({
      boundRibbon: createRibbonBuffer(BOUND_RIBBON_SEGMENTS),
      outflowRibbon: createRibbonBuffer(OUTFLOW_RIBBON_SEGMENTS),
      surface: {
        uNoiseTex: { value: noiseTex },
        uTime: { value: 0 },
        uCoreColor: { value: new THREE.Color('#FFF4D8') },
        uCoronaColor: { value: new THREE.Color('#FFB84D') },
        uEnergy: { value: 1 },
        uLuminosity: { value: 1.2 },
        uOpacity: { value: 0 },
        uFlareSeed: { value: 0.5 },
        uToBhDir: { value: new THREE.Vector3(1, 0, 0) },
        uTidalStretch: { value: 0 },
        uSpaghettification: { value: 0 },
      },
      corona: {
        uTime: { value: 0 },
        uCoronaColor: { value: new THREE.Color('#FFB84D') },
        uIntensity: { value: 0 },
        uFlareSeed: { value: 0.5 },
        uDisruptionFlash: { value: 0 },
      },
      boundStreamUniforms: {
        uNoiseTex: { value: noiseTex },
        uTime: { value: 0 },
        uCoreColor: { value: new THREE.Color('#FFF4D8') },
        uCoronaColor: { value: new THREE.Color('#FFB84D') },
        uBhCenter: { value: new THREE.Vector3(0.45, 0.12, 0) },
        uStreamAlpha: { value: 0 },
        uShadowRadius: { value: BLACK_HOLE_SHADOW_RADIUS },
        uFlowSpeed: { value: 0.92 },
      },
      outflowStreamUniforms: {
        uNoiseTex: { value: noiseTex },
        uTime: { value: 0 },
        uCoreColor: { value: new THREE.Color('#FFF4D8') },
        uCoronaColor: { value: new THREE.Color('#FFB84D') },
        uBhCenter: { value: new THREE.Vector3(0.45, 0.12, 0) },
        uStreamAlpha: { value: 0 },
        uShadowRadius: { value: BLACK_HOLE_SHADOW_RADIUS },
        uFlowSpeed: { value: -0.68 },
      },
      shockUniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0 },
      },
    }));
  }, []);

  const streamBuffers = useMemo(() => {
    const maxCount = cosmicSimulationManager.tidalPool.length;
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

  useFrame(({ camera }) => {
    const stars = cosmicSimulationManager.stars;
    const bh = cosmicSimulationManager.bhWorldAnchor;
    const t = cosmicEngine.elapsedTime;
    const camX = camera.position.x;
    const camY = camera.position.y;
    const camZ = camera.position.z;

    for (let i = 0; i < MAX_STAR_SLOTS; i += 1) {
      const grp = groupRefs.current[i];
      const coreMesh = coreMeshRefs.current[i];
      const coronaMesh = coronaMeshRefs.current[i];
      const boundMesh = boundRibbonMeshRefs.current[i];
      const outflowMesh = outflowRibbonMeshRefs.current[i];
      const shockMesh = shockMeshRefs.current[i];
      if (!grp || !coreMesh || !coronaMesh || !boundMesh || !outflowMesh || !shockMesh) continue;

      const star = stars[i];
      const opacity = star
        ? star.spawnFade * (1.0 - Math.min(1, Math.max(0, star.collapseProgress)))
        : 0;
      if (!star || opacity <= 0.005) {
        grp.visible = false;
        boundMesh.visible = false;
        outflowMesh.visible = false;
        shockMesh.visible = false;
        continue;
      }

      grp.visible = true;
      grp.position.set(star.renderX, star.renderY, star.renderZ);

      const finalCollapsePulse =
        star.state === 'FINAL_CONSUMPTION'
          ? 1.0 + 0.38 * Math.sin(star.collapseProgress * Math.PI)
          : 1.0;

      const radius = Math.max(0.022, star.currentRadius);
      coreMesh.scale.setScalar(radius);
      const coronaDiameter =
        Math.max(0.24, radius * (4.5 + star.tidalStretch * 2.2 + star.disruptionFlash * 1.4)) *
        finalCollapsePulse;
      coronaMesh.scale.set(coronaDiameter, coronaDiameter, 1);

      const slot = slots[i];
      slot.surface.uTime.value = t;
      slot.surface.uCoreColor.value.set(star.coreColorHex);
      slot.surface.uCoronaColor.value.set(star.coronaColorHex);
      slot.surface.uEnergy.value = star.energy;
      slot.surface.uLuminosity.value = star.luminosity * finalCollapsePulse;
      slot.surface.uOpacity.value = opacity;
      slot.surface.uFlareSeed.value = star.turbulenceSeed;
      slot.surface.uToBhDir.value.set(star.dirToBhX, star.dirToBhY, star.dirToBhZ);
      slot.surface.uTidalStretch.value = star.tidalStretch;
      slot.surface.uSpaghettification.value = star.spaghettification;

      slot.corona.uTime.value = t;
      slot.corona.uCoronaColor.value.set(star.coronaColorHex);
      slot.corona.uFlareSeed.value = star.turbulenceSeed;
      slot.corona.uDisruptionFlash.value = star.disruptionFlash;
      slot.corona.uIntensity.value =
        opacity *
        (0.42 + star.energy * 0.52 + star.tidalStretch * 0.36 + star.disruptionFlash * 0.45) *
        finalCollapsePulse;

      // Update Continuous 3D Bound Spaghettification Ribbon curving around Black Hole into Shadow
      const ribbonStrength = Math.min(
        1,
        Math.max(0, (star.tidalStretch - 0.12) * 1.35 + star.spaghettification * 1.1)
      );
      if (ribbonStrength > 0.02) {
        boundMesh.visible = true;
        const rb = slot.boundRibbon;
        const pos = rb.positions;
        const segs = rb.segments;

        const startX = star.renderX + star.dirToBhX * radius * 0.82;
        const startY = star.renderY + star.dirToBhY * radius * 0.82;
        const startZ = star.renderZ + star.dirToBhZ * radius * 0.82;
        const startDx = startX - bh.x;
        const startDz = startZ - bh.z;
        const startR = Math.max(BLACK_HOLE_SHADOW_RADIUS + 0.08, Math.hypot(startDx, startDz));
        const startAz = Math.atan2(startDz, startDx);
        const startRelY = startY - bh.y;
        const wrap = Math.max(0.65, star.streamWrapAngle);

        for (let sIdx = 0; sIdx <= segs; sIdx += 1) {
          const u = sIdx / segs;
          const uNext = Math.min(1, (sIdx + 1) / segs);

          // Spiral smoothly from torn star nozzle down into the tilted accretion plane & behind shadow
          const az = startAz + u * wrap;
          const targetEndR = BLACK_HOLE_SHADOW_RADIUS * 0.96;
          const radialCurve = Math.pow(1.0 - u, 0.78);
          const curR = targetEndR + (startR - targetEndR) * radialCurve;
          // Match disk tilt [0.24, 0, -0.09] as stream circularizes
          const diskTiltY = -Math.sin(az) * curR * 0.22 + Math.cos(az) * curR * 0.08;
          const px = bh.x + Math.cos(az) * curR;
          const py = bh.y + startRelY * Math.pow(1.0 - u, 1.65) + diskTiltY * u;
          const pz = bh.z + Math.sin(az) * curR;

          const az2 = startAz + uNext * wrap;
          const r2 = targetEndR + (startR - targetEndR) * Math.pow(1.0 - uNext, 0.78);
          const nx = bh.x + Math.cos(az2) * r2;
          const ny =
            bh.y +
            startRelY * Math.pow(1.0 - uNext, 1.65) +
            (-Math.sin(az2) * r2 * 0.22 + Math.cos(az2) * r2 * 0.08) * uNext;
          const nz = bh.z + Math.sin(az2) * r2;

          let tx = nx - px;
          let ty = ny - py;
          let tz = nz - pz;
          if (sIdx === segs) {
            tx = -Math.sin(az);
            ty = 0;
            tz = Math.cos(az);
          }
          const vx = camX - px;
          const vy = camY - py;
          const vz = camZ - pz;

          // Camera-facing ribbon normal = normalize(cross(tangent, viewVec))
          let cx = ty * vz - tz * vy;
          let cy = tz * vx - tx * vz;
          let cz = tx * vy - ty * vx;
          const cLen = Math.max(0.0001, Math.hypot(cx, cy, cz));
          cx /= cLen;
          cy /= cLen;
          cz /= cLen;

          const halfWidth =
            (0.045 + radius * 0.65 * (1.0 - u * 0.52) + Math.sin(u * Math.PI) * 0.065) *
            (0.55 + 0.45 * ribbonStrength);

          const base = sIdx * 6;
          pos[base] = px - cx * halfWidth;
          pos[base + 1] = py - cy * halfWidth;
          pos[base + 2] = pz - cz * halfWidth;
          pos[base + 3] = px + cx * halfWidth;
          pos[base + 4] = py + cy * halfWidth;
          pos[base + 5] = pz + cz * halfWidth;
        }
        rb.posAttr.needsUpdate = true;

        slot.boundStreamUniforms.uTime.value = t;
        slot.boundStreamUniforms.uCoreColor.value.set(star.coreColorHex);
        slot.boundStreamUniforms.uCoronaColor.value.set(star.coronaColorHex);
        slot.boundStreamUniforms.uBhCenter.value.set(bh.x, bh.y, bh.z);
        slot.boundStreamUniforms.uStreamAlpha.value = ribbonStrength * opacity * 0.94;
      } else {
        boundMesh.visible = false;
      }

      // Stage 4A: Unbound Hyperbolic Outward Ejection Tail Ribbon (ESO eso2018b)
      if (star.outflowIntensity > 0.04) {
        outflowMesh.visible = true;
        const ob = slot.outflowRibbon;
        const pos = ob.positions;
        const segs = ob.segments;

        const outDirX = -star.dirToBhX;
        const outDirY = -star.dirToBhY * 0.55;
        const outDirZ = -star.dirToBhZ;
        const tangX = -outDirZ;
        const tangZ = outDirX;
        const tailLength = (0.95 + star.outflowIntensity * 2.65) * (0.6 + 0.4 * opacity);

        for (let sIdx = 0; sIdx <= segs; sIdx += 1) {
          const u = sIdx / segs;
          const curveFlare = u * u * 0.85;
          const px =
            star.renderX +
            outDirX * (radius * 0.8 + u * tailLength) -
            tangX * curveFlare * 0.95;
          const py = star.renderY + outDirY * u * tailLength * 0.65;
          const pz =
            star.renderZ +
            outDirZ * (radius * 0.8 + u * tailLength) -
            tangZ * curveFlare * 0.95;

          const vx = camX - px;
          const vy = camY - py;
          const vz = camZ - pz;
          let cx = outDirY * vz - outDirZ * vy;
          let cy = outDirZ * vx - outDirX * vz;
          let cz = outDirX * vy - outDirY * vx;
          const cLen = Math.max(0.0001, Math.hypot(cx, cy, cz));
          cx /= cLen;
          cy /= cLen;
          cz /= cLen;

          // Outflow fan widens slightly as unbound gas expands into space
          const halfW = (radius * 0.55 + u * 0.16) * star.outflowIntensity;
          const base = sIdx * 6;
          pos[base] = px - cx * halfW;
          pos[base + 1] = py - cy * halfW;
          pos[base + 2] = pz - cz * halfW;
          pos[base + 3] = px + cx * halfW;
          pos[base + 4] = py + cy * halfW;
          pos[base + 5] = pz + cz * halfW;
        }
        ob.posAttr.needsUpdate = true;

        slot.outflowStreamUniforms.uTime.value = t;
        slot.outflowStreamUniforms.uCoreColor.value.set(star.coreColorHex);
        slot.outflowStreamUniforms.uCoronaColor.value.set(star.coronaColorHex);
        slot.outflowStreamUniforms.uBhCenter.value.set(bh.x, bh.y, bh.z);
        slot.outflowStreamUniforms.uStreamAlpha.value = star.outflowIntensity * opacity * 0.72;
      } else {
        outflowMesh.visible = false;
      }

      // Stage 4B: Stream-Stream Self-Collision Shock Hotspot (NASA Swift ASASSN-14li)
      if (star.fallbackShockIntensity > 0.04) {
        shockMesh.visible = true;
        const shockAz = star.orbitalAzimuth + 2.35;
        const shockR = 1.96;
        const shockTiltY = -Math.sin(shockAz) * shockR * 0.22 + Math.cos(shockAz) * shockR * 0.08;
        shockMesh.position.set(
          bh.x + Math.cos(shockAz) * shockR,
          bh.y + shockTiltY,
          bh.z + Math.sin(shockAz) * shockR
        );
        const shockScale = 0.65 + star.fallbackShockIntensity * 0.75;
        shockMesh.scale.set(shockScale, shockScale, 1);
        slot.shockUniforms.uTime.value = t;
        slot.shockUniforms.uIntensity.value = star.fallbackShockIntensity * opacity;
      } else {
        shockMesh.visible = false;
      }
    }

    const pool = cosmicSimulationManager.tidalPool;
    const { geo, positions, colors, sizes, alphas, posAttr, colAttr, sizeAttr, alphaAttr } =
      streamBuffers;

    let activeCount = 0;
    for (let i = 0; i < pool.length; i += 1) {
      const p = pool[i];
      if (!p.active) continue;

      const lifeNorm = Math.min(1, Math.max(0, p.life / Math.max(0.05, p.maxLife)));
      const fadeIn = Math.min(1, lifeNorm * 5.5);
      const fadeOut = 1.0 - lifeNorm * Math.sqrt(lifeNorm);
      const rDist = Math.hypot(p.x - bh.x, p.y - bh.y, p.z - bh.z);
      const horizonFade = THREE.MathUtils.smoothstep(
        rDist,
        BLACK_HOLE_SHADOW_RADIUS * 0.99,
        BLACK_HOLE_SHADOW_RADIUS + 0.22
      );

      const idx = activeCount++;
      positions[idx * 3] = p.x;
      positions[idx * 3 + 1] = p.y;
      positions[idx * 3 + 2] = p.z;

      const heat =
        p.role === 'outflow' ? 0.15 : 1.0 - THREE.MathUtils.smoothstep(rDist, 1.3, 3.9);
      colors[idx * 3] = THREE.MathUtils.lerp(p.r, 1.0, heat * 0.68);
      colors[idx * 3 + 1] = THREE.MathUtils.lerp(p.g, 0.88, heat * 0.58);
      colors[idx * 3 + 2] = THREE.MathUtils.lerp(p.b, 0.62, heat * 0.48);

      sizes[idx] = p.size * (0.88 + (1.0 - lifeNorm) * 0.55);
      alphas[idx] = fadeIn * fadeOut * horizonFade * 0.92;
    }

    geo.setDrawRange(0, activeCount);
    if (activeCount > 0 || prevActiveStreamRef.current > 0) {
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
      sizeAttr.needsUpdate = true;
      alphaAttr.needsUpdate = true;
      prevActiveStreamRef.current = activeCount;
    }
  });

  return (
    <group name="star-capture-system">
      {slots.map((slot, idx) => (
        <group key={idx}>
          <group
            ref={(el) => {
              groupRefs.current[idx] = el;
            }}
            visible={false}
          >
            <mesh
              ref={(el) => {
                coreMeshRefs.current[idx] = el;
              }}
              geometry={sphereGeo}
              renderOrder={3}
            >
              <shaderMaterial
                vertexShader={starSurfaceVertexShader}
                fragmentShader={starSurfaceFragmentShader}
                uniforms={slot.surface}
                transparent
                depthWrite
                depthTest
              />
            </mesh>

            <mesh
              ref={(el) => {
                coronaMeshRefs.current[idx] = el;
              }}
              geometry={quadGeo}
              renderOrder={4}
            >
              <shaderMaterial
                vertexShader={coronaVertexShader}
                fragmentShader={coronaFragmentShader}
                uniforms={slot.corona}
                transparent
                depthWrite={false}
                depthTest
                blending={THREE.AdditiveBlending}
              />
            </mesh>
          </group>

          {/* Continuous 3D Bound Spaghettification Tidal Stream Ribbon */}
          <mesh
            ref={(el) => {
              boundRibbonMeshRefs.current[idx] = el;
            }}
            geometry={slot.boundRibbon.geo}
            visible={false}
            frustumCulled={false}
            renderOrder={3}
          >
            <shaderMaterial
              vertexShader={ribbonVertexShader}
              fragmentShader={ribbonFragmentShader}
              uniforms={slot.boundStreamUniforms}
              transparent
              side={THREE.DoubleSide}
              depthWrite={false}
              depthTest
              blending={THREE.AdditiveBlending}
            />
          </mesh>

          {/* Unbound Hyperbolic Outward Ejection Tail Ribbon (eso2018b) */}
          <mesh
            ref={(el) => {
              outflowRibbonMeshRefs.current[idx] = el;
            }}
            geometry={slot.outflowRibbon.geo}
            visible={false}
            frustumCulled={false}
            renderOrder={3}
          >
            <shaderMaterial
              vertexShader={ribbonVertexShader}
              fragmentShader={ribbonFragmentShader}
              uniforms={slot.outflowStreamUniforms}
              transparent
              side={THREE.DoubleSide}
              depthWrite={false}
              depthTest
              blending={THREE.AdditiveBlending}
            />
          </mesh>

          {/* Returning Fallback Stream-Stream Self-Collision Shock Hotspot (ASASSN-14li) */}
          <mesh
            ref={(el) => {
              shockMeshRefs.current[idx] = el;
            }}
            geometry={quadGeo}
            visible={false}
            renderOrder={4}
          >
            <shaderMaterial
              vertexShader={coronaVertexShader}
              fragmentShader={shockHotspotFragmentShader}
              uniforms={slot.shockUniforms}
              transparent
              depthWrite={false}
              depthTest
              blending={THREE.AdditiveBlending}
            />
          </mesh>
        </group>
      ))}

      <points geometry={streamBuffers.geo} renderOrder={3} frustumCulled={false}>
        <shaderMaterial
          vertexShader={streamVertexShader}
          fragmentShader={streamFragmentShader}
          transparent
          depthWrite={false}
          depthTest
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}
