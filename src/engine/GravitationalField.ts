export interface Vec3Mutable {
  x: number;
  y: number;
  z: number;
}

export interface GravitationalParams {
  /** Effective gravitational constant * black-hole mass */
  mu: number;
  /** Plummer softening squared to prevent numerical blow-up near r -> 0 */
  softeningSq: number;
  /** Maximum acceleration magnitude clamp for guaranteed numerical stability */
  maxAcceleration: number;
  /** Prograde Kerr frame-dragging swirl coefficient */
  frameDragStrength: number;
  /** Capture zone radius within which gentle radial & orbital decay engages */
  captureRadius: number;
  /** Radial inspiral assist factor inside capture zone */
  radialInfallFactor: number;
  /** Inclination alignment rate pulling captured orbits gently toward the disk plane */
  diskPlaneAlignRate: number;
}

export const DEFAULT_GRAVITATIONAL_PARAMS: GravitationalParams = {
  mu: 9.8,
  softeningSq: 0.42,
  maxAcceleration: 24.0,
  frameDragStrength: 2.35,
  captureRadius: 8.8,
  radialInfallFactor: 0.34,
  diskPlaneAlignRate: 0.55,
};

export interface TidalEvaluation {
  distance: number;
  /** Unit vector pointing from celestial body toward the black hole */
  toCenterX: number;
  toCenterY: number;
  toCenterZ: number;
  /** Normalized [0..1] stellar tidal disruption intensity */
  tidalStretch: number;
  /** Normalized [0..1] planetary Roche fragmentation intensity */
  rocheShear: number;
}

/**
 * Pure, zero-allocation bounded gravitational & Kerr frame-dragging field solver.
 * Produces smooth, frame-rate-independent curved capture trajectories without
 * numerical singularities, slingshot explosions, or object teleportation.
 */
export function computeGravitationalAcceleration(
  pos: Readonly<Vec3Mutable>,
  vel: Readonly<Vec3Mutable>,
  bhCenter: Readonly<Vec3Mutable>,
  intensityScale: number,
  params: GravitationalParams,
  outAccel: Vec3Mutable
): number {
  const dx = bhCenter.x - pos.x;
  const dy = bhCenter.y - pos.y;
  const dz = bhCenter.z - pos.z;

  const distSq = dx * dx + dy * dy + dz * dz;
  const dist = Math.sqrt(Math.max(1e-6, distSq));
  const invDist = 1.0 / dist;

  // Unit radial inward vector
  const rx = dx * invDist;
  const ry = dy * invDist;
  const rz = dz * invDist;

  const effectiveMu = params.mu * Math.max(0.15, intensityScale);
  const rawGrav = effectiveMu / (distSq + params.softeningSq);
  const gravMag = Math.min(params.maxAcceleration, rawGrav);

  let ax = rx * gravMag;
  let ay = ry * gravMag;
  let az = rz * gravMag;

  // Prograde Kerr frame-dragging tangential swirl around tilted disk normal (~[0.09, 0.97, 0.23])
  // Note: disk meshes rotate in Three.js XZ counter-clockwise (+cos, +sin -> tangent is (-rz, rx) or (+rz, -rx)).
  // Using (-rz, 0, rx) matches prograde orbital swirl around Y/tilted-Y.
  const horizLen = Math.hypot(rx, rz);
  if (horizLen > 1e-4) {
    const tx = -rz / horizLen;
    const tz = rx / horizLen;
    const frameDrag =
      (params.frameDragStrength * Math.max(0.2, intensityScale)) /
      Math.pow(Math.max(dist, 0.95), 1.45);
    ax += tx * frameDrag;
    az += tz * frameDrag;
  }

  // Inside capture region: apply smooth orbital energy dissipation & disk-plane settling
  // so captured stars and planets curve gracefully into tightening spiral orbits
  if (dist < params.captureRadius) {
    const captureWeight = 1.0 - dist / params.captureRadius;
    // Radial velocity component along inward direction
    const vRadialInward = vel.x * rx + vel.y * ry + vel.z * rz;

    // Dampen outward escape velocity smoothly once inside gravitational capture zone
    if (vRadialInward < 0) {
      const damp = -vRadialInward * (1.25 + captureWeight * 1.8);
      ax += rx * damp;
      ay += ry * damp;
      az += rz * damp;
    }

    // Gentle inspiraling drag so orbits tighten continuously toward tidal disruption & horizon
    const speed = Math.hypot(vel.x, vel.y, vel.z);
    if (speed > 0.01) {
      const drag = params.radialInfallFactor * (0.35 + captureWeight * 0.95) * intensityScale;
      ax += rx * drag * 1.8 - vel.x * drag * 0.22;
      ay += ry * drag * 1.8 - vel.y * drag * 0.28;
      az += rz * drag * 1.8 - vel.z * drag * 0.22;
    }

    // Gently pull vertical offset toward the tilted accretion disk plane (y ≈ -0.24 * z_local)
    const relX = pos.x - bhCenter.x;
    const relZ = pos.z - bhCenter.z;
    const diskPlaneY = bhCenter.y + relZ * 0.24 - relX * 0.09;
    const planeErrorY = diskPlaneY - pos.y;
    ay += planeErrorY * params.diskPlaneAlignRate * (0.4 + captureWeight);
  }

  // Final safety clamp on total acceleration vector
  const totalMag = Math.hypot(ax, ay, az);
  if (totalMag > params.maxAcceleration) {
    const scale = params.maxAcceleration / totalMag;
    ax *= scale;
    ay *= scale;
    az *= scale;
  }

  outAccel.x = ax;
  outAccel.y = ay;
  outAccel.z = az;
  return dist;
}

/**
 * Evaluates normalized tidal elongation & Roche shear factors without allocations.
 */
export function evaluateTidalForces(
  pos: Readonly<Vec3Mutable>,
  bhCenter: Readonly<Vec3Mutable>,
  tidalStartRadius: number,
  rocheLimitRadius: number,
  out: TidalEvaluation
): TidalEvaluation {
  const dx = bhCenter.x - pos.x;
  const dy = bhCenter.y - pos.y;
  const dz = bhCenter.z - pos.z;
  const dist = Math.max(0.001, Math.hypot(dx, dy, dz));

  out.distance = dist;
  out.toCenterX = dx / dist;
  out.toCenterY = dy / dist;
  out.toCenterZ = dz / dist;

  if (dist >= tidalStartRadius) {
    out.tidalStretch = 0;
  } else {
    const raw = (tidalStartRadius - dist) / Math.max(0.4, tidalStartRadius - 1.15);
    out.tidalStretch = Math.min(1, Math.max(0, raw * raw * (3 - 2 * raw)));
  }

  if (dist >= rocheLimitRadius) {
    out.rocheShear = 0;
  } else {
    const rawR = (rocheLimitRadius - dist) / Math.max(0.4, rocheLimitRadius - 1.12);
    out.rocheShear = Math.min(1, Math.max(0, rawR));
  }

  return out;
}
