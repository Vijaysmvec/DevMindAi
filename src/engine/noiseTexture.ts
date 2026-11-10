import * as THREE from 'three';

let cachedNoiseTexture: THREE.DataTexture | null = null;

function hash2Periodic(ix: number, iy: number, period: number, seed: number): number {
  const px = ((ix % period) + period) % period;
  const py = ((iy % period) + period) % period;
  const h = Math.sin(px * 127.1 + py * 311.7 + seed * 74.7) * 43758.5453123;
  return h - Math.floor(h);
}

function periodicValueNoise(u: number, v: number, period: number, seed: number): number {
  const x = u * period;
  const y = v * period;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3.0 - 2.0 * fx);
  const sy = fy * fy * (3.0 - 2.0 * fy);

  const n00 = hash2Periodic(ix, iy, period, seed);
  const n10 = hash2Periodic(ix + 1, iy, period, seed);
  const n01 = hash2Periodic(ix, iy + 1, period, seed);
  const n11 = hash2Periodic(ix + 1, iy + 1, period, seed);

  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sy;
}

/**
 * Generates and caches a shared seamless 256x256 RGBA GPU noise lookup texture.
 * Replaces expensive per-pixel multi-octave GLSL sin/hash FBM evaluations with
 * hardware-filtered 1-cycle texture lookups for locked 60+ FPS performance:
 *  - R channel: Smooth low-frequency periodic value noise
 *  - G channel: Rich 4-octave billowing turbulent gas FBM
 *  - B channel: High-frequency fine stellar/plasma detail FBM
 *  - A channel: Sharp ridged plasma filament field
 */
export function getCosmicNoiseTexture(): THREE.DataTexture {
  if (cachedNoiseTexture) return cachedNoiseTexture;

  const size = 256;
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    const v = y / size;
    for (let x = 0; x < size; x += 1) {
      const u = x / size;

      const n1 = periodicValueNoise(u, v, 8, 1.1);
      const n2 = periodicValueNoise(u, v, 16, 2.3);
      const n3 = periodicValueNoise(u, v, 32, 3.7);
      const n4 = periodicValueNoise(u, v, 64, 5.9);

      const gasFbm = n1 * 0.50 + n2 * 0.27 + n3 * 0.15 + n4 * 0.08;
      const fineFbm = n2 * 0.46 + n3 * 0.34 + n4 * 0.20;
      const ridge = 1.0 - Math.abs(gasFbm * 2.0 - 1.0);
      const sharpRidge = ridge * ridge;

      const idx = (y * size + x) * 4;
      data[idx] = Math.min(255, Math.max(0, Math.round(n1 * 255)));
      data[idx + 1] = Math.min(255, Math.max(0, Math.round(gasFbm * 255)));
      data[idx + 2] = Math.min(255, Math.max(0, Math.round(fineFbm * 255)));
      data[idx + 3] = Math.min(255, Math.max(0, Math.round(sharpRidge * 255)));
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;

  cachedNoiseTexture = tex;
  return tex;
}
