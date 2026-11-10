# DEVMIND AI — SINGULARITY: EXTREME v2.3 (`COSMIC DEVOURER`)

> **Note on Scientific Framing**: The gravitational trajectories, tidal disruption streams, Roche fragmentation clouds, Kerr frame-dragging shaders, and procedural acoustic layers in **COSMIC DEVOURER** are **artistic, astrophysically inspired real-time interactive visualizations** engineered for 60–144 FPS browser rendering—not exact numerical general-relativistic magnetohydrodynamic (GRMHD) or N-body solvers.

---

## 1. Architecture Overview

`COSMIC DEVOURER` evolves the existing **DevMind AI — SINGULARITY: EXTREME** workstation into a living cosmic environment where a rotating black hole drifts continuously through deep space, warps surrounding starlight, sustains a thick multi-layer ringed and volumetric gas accretion structure, captures and tidally consumes stars sequentially, shatters planets inside its Roche limit, and synchronizes every celestial event with high-presence procedural Web Audio synthesis.

### Core Modules
| Module | Responsibility |
| :--- | :--- |
| `src/engine/GravitationalField.ts` | Softened inverse-square gravity (`GM / (r^2 + eps^2)`), prograde Kerr frame-dragging swirl, capture-zone orbital decay, accretion-plane alignment, and zero-allocation tidal/Roche shear evaluation. |
| `src/engine/CelestialBodyFactory.ts` | Monotonically keyed (`star-N`, `planet-N`) procedural generator for 4 stellar spectral classes (`red_dwarf`, `yellow_main`, `white_luminous`, `blue_giant`) and 5 planetary archetypes (`rocky`, `gas_giant`, `ice`, `molten`, `moon`). |
| `src/engine/CosmicSimulationManager.ts` | `120 Hz` fixed-timestep physics accumulator + linear render interpolation (`alpha`), 8-stage sequential star devouring state machine, planetary Roche fragmentation, pre-allocated `360`-particle tidal stream pool & `220`-shard debris pool, cosmic drift vector, per-user settings persistence, and deduplicated event bus. |
| `components/space/EventHorizon.tsx` | Depth-writing (`renderOrder = 0`) pure `#000000` Event Horizon silhouette sphere (`r = 1.06`) with grazing asymmetric white-gold photon knife rim so rear gas is naturally occluded and the shadow stays unmistakably dark. |
| `components/space/GravitationalLens.tsx` | Relativistic primary & secondary (`n = 2`) photon rings, prograde Kerr spin compression, and warped upper/lower lensed accretion disk arches with concentric gas ring lanes. |
| `components/space/InnerPlasmaRing.tsx` | **Layer 1**: Blazing white-hot / orange-white ISCO plasma ring (`r = 1.08 .. 2.28`) with intense Doppler beaming asymmetry, hot ringlets, and fast filaments. |
| `components/space/AccretionDisk.tsx` | **Layer 2**: Main thick rotating gas disk (`r = 1.36 .. 5.18`) combining multi-octave FBM turbulent gas clouds with authentic concentric Keplerian gas rings and optical-depth division lanes. |
| `components/space/OuterAccretionRing.tsx` | **Layer 3**: Wide outer cooling gas envelope (`r = 3.20 .. 7.85`) transitioning through amber, burnt copper, and crimson plasma into deep space. |
| `components/space/AccretionVolume.tsx` | **Layer 4**: Merged 5-stratum 3D flared volumetric gas corona above and below the orbital plane + curved helical plasma filaments (single GPU draw call). |
| `components/space/StarCaptureSystem.tsx` | Boiling 3D photosphere granulation shader, solar corona & flare billboard, teardrop tidal deformation toward the Black Hole, and dynamic `360`-particle luminous tidal plasma stream. |
| `components/space/PlanetCaptureSystem.tsx` | Accretion-lit procedural planet shader (bands, continents, magma fissures under tidal stress, Fresnel atmosphere) + `220`-instance `InstancedMesh` tumbling crustal Roche debris cloud. |
| `components/space/CosmicDriftController.tsx` | Multi-depth parallax FBM nebulae, distant spiral galaxies, and occasional shooting stars flowing past the drifting Black Hole alongside wrapped `StarField` (`2,600` stars) and `CosmicDust` (`780` grains). |

---

## 2. High-Presence Cosmic Audio Upgrade (Phase 1 & Phase 9)

To ensure clear, rich, cinematic audibility across both studio headphones and standard laptop speakers while remaining 100% clip-free:
1. **Increased Starting Gain Profile (`AudioSettings.ts` & `AudioPresets.ts`)**:
   - Default `masterVolume`: **`0.80`** (`80%`)
   - `SINGULARITY` relative layer gains: `droneGain: 0.75`, `plasmaGain: 0.55`, `ingestionGain: 0.85`, `starDestructionGain: 0.90`, `planetIngestionGain: 0.85`, `shockwaveGain: 0.90`
   - Added **`HIGH_INTENSITY`** preset (`droneGain: 0.88`, `plasmaGain: 0.72`, `starDestructionGain: 0.98`, `shockwaveGain: 0.98`).
2. **Speaker-Audible Upper-Bass Harmonics & Presence Bus (`AudioContextManager.ts` & `CosmicSoundGenerator.ts`)**:
   - Added a `3.002x` triangle warm twelfth harmonic (`~131–147 Hz`) alongside the sub-fundamental (`41–49 Hz`) and octave (`~87–98 Hz`), widened drone & plasma filter cutoffs, and routed `mixBus` through a `1.55x` presence stage into a studio soft-knee `DynamicsCompressorNode` (`threshold: -4.0 dB`, `ratio: 10:1`).
3. **Deduplicated Celestial Audio Events (`CosmicAudioEngine.ts` & `CosmicAudioEvents.ts`)**:
   - Synchronizes `STAR_CAPTURED`, `STAR_TIDAL_DISRUPTION`, `STAR_CONSUMED`, `PLANET_CAPTURED`, `PLANET_FRAGMENTED`, `PLANET_CONSUMED`, `ACCRETION_SURGE`, and `COSMIC_DRIFT` via `${objectId}:${type}` deduplication in `AudioPerformanceManager.claimCelestialEventId()`, with independent `starConsumption` and `planetConsumption` layer toggles.
   - Preserves strict browser autoplay compliance (audio starts disabled until explicit user gesture and stays silent on unauthenticated screens).

---

## 3. Sequential 8-Stage Star Devouring & Distinct Planet Roche Breakup

### Star Capture Lifecycle (`StarCaptureSystem`)
Each star progresses smoothly without abrupt popping or instant disappearance:
1. `SPAWNING`: Smooth `spawnFade` (`0 -> 1`) entrance ahead of the black hole's drift trajectory.
2. `STABLE`: Initial prograde tangential approach with boiling photosphere granulation and corona glow.
3. `GRAVITATIONALLY_ATTRACTED`: Trajectory curves inward under softened Kerr gravity.
4. `ORBITAL_CAPTURE`: Enters decaying spiral orbit aligned gradually toward the tilted accretion plane.
5. `TIDAL_DISRUPTION`: Stretches into a teardrop nozzle aimed at `bhWorldAnchor`, emitting a curved luminous plasma ribbon (`tidalPool`) that coils into the inner ring and boosts `accretionSurge`.
6. `ENERGY_DEPLETION`: Stellar mass, radius, and temperature gradually drain as outer plasma feeds the disk.
7. `FINAL_CONSUMPTION`: Remaining stellar core pulses and collapses into the Event Horizon (`STAR_CONSUMED`).
8. `DISAPPEARANCE`: Final fade completes and schedules the next star after `starRespawnDelaySec`.

### Planet Capture Lifecycle (`PlanetCaptureSystem`)
Visually and acoustically distinct from stars:
- Planets (`rocky`, `gas_giant`, `ice`, `molten`, `moon`) are opaque bodies illuminated directionally by the hot accretion disk with axial spin and atmospheric Fresnel scattering.
- Crossing the Roche limit (`r < 3.55`) opens incandescent magma fractures across the crust (`PLANET_FRAGMENTED`) and detaches discrete tumbling 3D rocky/icy shards (`fragmentPool` `InstancedMesh`) before core consumption (`PLANET_CONSUMED`).

---

## 4. Butter-Smooth Frame Pacing & Quality Modes

- **Zero Per-Frame React State Updates & Zero Heap Churn**: All celestial physics, matrices, and buffer attributes mutate pre-allocated typed arrays and scratch vectors inside `useFrame`.
- **Frame-Rate Independence**: `BlackHoleController` applies exponential frame-delta smoothing + exponential camera damping (`1 - exp(-k * dt)`), while `CosmicSimulationManager` steps deterministic `120 Hz` physics substeps (`FIXED_PHYSICS_DT = 1 / 120`) and linearly interpolates `renderX/Y/Z` between `prev` and current states.
- **User Controls (`VisualSettingsModal.tsx`)**: Exposes `PERFORMANCE` / `BALANCED` / `CINEMATIC` quality modes, toggles for `Cosmic Drift`, `Star Devouring`, and `Planet Capture`, sliders for `Accretion Ring Density`, `Volumetric Gas Thickness`, `Star Capture Gravity`, `Planet Roche Intensity`, `Cosmic Simulation Speed`, and `Max Celestial Bodies`, plus quick Cosmic Audio loudness controls.
