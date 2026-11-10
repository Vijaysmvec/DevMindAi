# DEVMIND AI — SINGULARITY: EXTREME v2.4
## CODENAME: THE DEVOURER — BLACK HOLE APOCALYPSE
### Cinematic Visual, Astrophysical VFX & Original Cosmic Horror Audio Architecture

---

## 1. Scientific Video References Studied

Before implementing the v2.4 upgrade, the following six observational and supercomputer visualization references from ESO and NASA were studied to ground the real-time shaders and celestial destruction lifecycles in authentic astrophysical phenomena (without copying, embedding, or redistributing any external media):

1. **ESO — Supermassive Black Hole Rips Star Apart (`eso1644b`)**  
   https://www.eso.org/public/videos/eso1644b/
2. **ESO — Death by Spaghettification (`eso2018b` / AT2019qiz)**  
   https://www.eso.org/public/videos/eso2018b/
3. **NASA Hubble — Black Hole Tidal Disruption Event**  
   https://science.nasa.gov/asset/hubble/black-hole-tidal-disruption-event/
4. **NASA Goddard SVS — Isolated Black Hole Visualization (`SVS 14620`)**  
   https://svs.gsfc.nasa.gov/14620/
5. **NASA Goddard SVS — Supercomputer Simulations Test Star-Destroying Black Holes (`SVS 14000`)**  
   https://svs.gsfc.nasa.gov/14000/
6. **NASA Swift — Mapping a Star's Death Spiral into a Black Hole (`ASASSN-14li`)**  
   https://www.nasa.gov/universe/nasas-swift-mission-maps-a-stars-death-spiral-into-a-black-hole/

---

## 2. Visual Reference Findings

| Astrophysical Phenomenon | Key Findings from ESO & NASA References | Real-Time Implementation in v2.4 |
| :--- | :--- | :--- |
| **Event-Horizon Shadow** | A black hole has no glowing solid surface; its shadow ($r_{\text{shadow}} \approx 2.6\,r_s$) is an absolute lightless void flattened into a slight **D-shape** on the prograde side by Kerr spin ($a_* \approx 0.94$). | `EventHorizon.tsx` renders a pure `#000000` depth-occluding Kerr D-shaped void (`BLACK_HOLE_SHADOW_RADIUS = 1.15`) that eclipses background stars and behind-horizon matter. |
| **Relativistic Photon Ring** | Light orbiting the photon sphere forms razor-thin nested sub-rings ($n=1,2,3$) hugging the shadow edge with strong Doppler beaming on the approaching side. | `GravitationalLens.tsx` synthesizes crisp $n=1$ primary, $n=2$ secondary, and $n=3$ asymptotic white-gold photon rings with approaching-side relativistic boost. |
| **Gravitational Lensing** | Background stars stretch tangentially into Einstein arcs near the Einstein radius, while the far side of the accretion disk bends over the north and south poles of the shadow. | `StarField.tsx` applies radial Einstein deflection + Kerr frame-dragging + tangential arc elongation; `GravitationalLens.tsx` renders upper/lower lensed disk arches. |
| **Stellar Spaghettification** | Stars do not vanish or explode into uniform spheres of dots; differential gravity stretches them radially, compresses them orthogonally, and pulls out a continuous curving plasma ribbon (~50% bound fallback, ~50% unbound outflow wind as in `eso2018b`). | `StarCaptureSystem.tsx` renders a convective star with surface tearing, a dynamic 44-segment 3D **Bound Fallback Ribbon** coiling up to ~325° around the shadow, and a 20-segment **Unbound Outflow Tail**. |
| **Stream-Stream Collision Shock** | Returning bound stellar debris collides with incoming stream material near pericenter (`NASA SVS 14000`, `ASASSN-14li`), creating a brilliant UV/X-ray shock hotspot that circularizes gas into the accretion disk. | `CosmicSimulationManager.ts` + `StarCaptureSystem.tsx` compute `fallbackShockIntensity` once stream wrap exceeds ~140°, illuminating a pulsing white-cyan/amber pericenter shock hotspot. |

---

## 3. Event-Horizon Shadow Design (`components/space/EventHorizon.tsx`)

- **Zero Surface Emission**: The event horizon never emits surface glow or specular highlights. Every fragment inside the Kerr shadow boundary outputs `vec4(0.0, 0.0, 0.0, 1.0)`.
- **Kerr Spin Asymmetry**: The billboard shader computes prograde D-flattening (`progradeFlatten`) on the approaching left limb (`x < 0`) and slight retrograde expansion on the receding right limb, matching near-extremal Kerr black-hole shadow geometry (`SVS 14620`).
- **True 3D Occlusion**: An inner pure-black depth sphere (`r = 1.145`, `depthWrite: true`) + shadow billboard (`renderOrder = 5`) cleanly occlude behind-horizon stars, orbital particles, and infalling tidal ribbons while allowing foreground inclined accretion gas (`z > 0`) to pass naturally in front of the shadow.

---

## 4. Photon Ring Architecture (`components/space/GravitationalLens.tsx`)

- **Nested Relativistic Sub-Rings**:
  - **$n = 1$ Primary Photon Ring** (`r ≈ 1.168`): Razor-thin (`σ ≈ 0.0115`) white-hot gold inner edge.
  - **$n = 2$ Demagnified Ring** (`r ≈ 1.192`): Ultra-fine (`σ ≈ 0.0065`) warm-gold secondary lensed image.
  - **$n = 3$ Asymptotic Whisper** (`r ≈ 1.157`): Tightly hugging boundary glimmer right against the `#000000` shadow.
- **Doppler Beaming & Ingestion Flare**: Approaching plasma (`left/front azimuth`) receives a `~2.1x` relativistic beaming boost, while receding matter redshifts toward deep copper-crimson. When tidal streams cross the shadow (`horizonIngestionFlash` + `streamImpactAzimuth`), a localized azimuthal flare ripples around the photon ring.

---

## 5. Gravitational Lensing Implementation (`GravitationalLens.tsx` & `StarField.tsx`)

1. **Einstein Ring & Bent Disk Halo (`GravitationalLens.tsx`)**: Simulates light from the obscured far side of the accretion disk bending over the upper and lower limbs of the shadow (`upperBentDisk` + `lowerBentDisk`) with Kerr frame-dragging spiral shear sampled from the shared 256×256 hardware cosmic noise texture (`noiseTexture.ts`).
2. **Tangential Stellar Lensing (`StarField.tsx`)**: All `3000` multi-layer stars transform into black-hole-relative view coordinates in the vertex shader, deflecting radially outward near the Einstein radius, swirling via frame-dragging, occluding cleanly inside `r < 1.15`, and stretching tangentially (`vLensArc`) in the fragment shader to produce subtle Einstein arcs.

---

## 6. Volumetric Accretion Disk Architecture

Rather than a flat 2D ring, the accretion structure combines four depth-layered shader systems plus three Instanced/Point particle streams:

1. **Inner Relativistic ISCO Plasma (`components/space/InnerPlasmaRing.tsx`)**: Blazing white-gold inner margin (`r = 1.18 .. 1.98`) with rapid spiral shear, ingestion surge response, and filmic highlight rolloff.
2. **Dense Main Filamentary Disk (`components/space/AccretionDisk.tsx`)**: Multi-band radiative disk (`r = 1.20 .. 4.95`) featuring twisted magnetohydrodynamic-inspired spiral filaments, dark optical-depth dust absorption lanes, relativistic Doppler asymmetry, and localized azimuthal brightening where disrupted stellar streams impact the disk.
3. **3D Volumetric Corona Strata (`components/space/AccretionVolume.tsx`)**: Merged single-draw-call 3D flared vertical strata (`4` strata in `CINEMATIC` mode, `2` in `BALANCED`, `0` in `PERFORMANCE`) with radially flaring scale height $H(r) \propto r^{1.35}$ that wrap above and below the midplane.
4. **Broad Outer Cool Gas & Dust (`components/space/OuterAccretionRing.tsx`)**: Extended copper, burnt-sienna, and deep-crimson outer torus (`r = 3.2 .. 7.8`) fading smoothly into cosmic dust.
5. **Filmic HDR Compression**: All luminous shaders apply asymptotic filmic highlight rolloff (`col / (1.0 + col * k)`) so high-energy flashes stay crisp and fiery rather than washing out into flat white/neon bloom.

---

## 7. Star Tidal Disruption Lifecycle (`StarCaptureSystem.tsx` & `CosmicSimulationManager.ts`)

Every captured star (`red_dwarf`, `yellow_main`, `white_luminous`, `blue_giant`) progresses monotonically through a **6-stage astrophysical TDE sequence** (mapped across 8 state-machine checkpoints with configurable `disruptionDurationScale`):

1. **Stage 1 — Approach (`SPAWNING -> STABLE -> GRAVITATIONALLY_ATTRACTED`)**: Recognizable spherical star with animated convective granulation, limb darkening, and subtle solar prominences curving into the gravitational well (`STAR_APPROACH`).
2. **Stage 2 — Tidal Stretching (`ORBITAL_CAPTURE`)**: Differential gravity elongates the star along `uStretchDir` toward the black hole while compressing its perpendicular waist (`inverse-square-root volume conservation`) and opening glowing surface fissures (`STAR_TIDAL_STRETCH`).
3. **Stage 3 — Spaghettification (`TIDAL_DISRUPTION`)**: Stellar layers strip away into a continuous dynamic 3D **Bound Spaghettification Ribbon** (`44` cross-quads updated zero-allocation per frame) coiling around the black hole + `480` pooled multi-role plasma knots (`STAR_DISRUPTION` / `STAR_TIDAL_DISRUPTION`).
4. **Stage 4 — Debris Fallback, Collision Shock & Outflow (`ENERGY_DEPLETION`)**:
   - **Bound Fallback Stream** spirals inward toward the photon ring (`STAR_DEBRIS_STREAM`).
   - **Stream-Stream Self-Collision Shock** (`ASASSN-14li`) ignites a pulsing white-cyan/gold pericenter shock billboard as the wrapping stream intersects itself.
   - **Unbound Outward Ejection Tail** (`eso2018b`) flings a secondary 20-segment hyperbolic debris wind outward into deep space (`totalOutflowParticlesEmitted`).
5. **Stage 5 — Circularizing Accretion (`STAR_ACCRETION`)**: Infalling gas brightens the local accretion disk at `streamImpactAzimuth` and boosts `accretionSurge` + `horizonIngestionFlash`.
6. **Stage 6 — Progressive Event-Horizon Disappearance (`FINAL_CONSUMPTION -> DISAPPEARANCE`)**: Remaining core and ribbon stretch asymptotically into the `#000000` shadow (`STAR_CONSUMED`), triggering a synchronized energy pulse (`registerParticleIngestion`) before sequential respawn.

---

## 8. Planetary Destruction Lifecycle (`PlanetCaptureSystem.tsx` & `CosmicSimulationManager.ts`)

Planetary destruction is engineered separately from stellar TDEs so planets fracture mechanically and compositionally according to their archetype (`rocky`, `molten`, `gas_giant`, `ice`, `moon`):

1. **Distorted Orbit & Tidal Elongation**: Captured planets enter a decaying eccentric spiral (`PLANET_CAPTURED`) and deform along the radial tidal vector.
2. **Type-Specific Roche Fracture**: Inside the Roche limit (`r < 3.65`), glowing magma cracks (`rocky`/`molten`), cryo-fissures (`ice`/`moon`), or turbulent atmospheric shear bands (`gas_giant`) spread across the planetary crust (`PLANET_FRAGMENTATION` / `PLANET_FRAGMENTED`).
3. **Irregular 3D Crustal Boulders & Mutual Collisions**: Up to `48` irregular non-uniformly scaled `DodecahedronGeometry` boulders detach from the body, tumble in 3D orbit, eject a hyperbolic fraction outward, and undergo pairwise orbital collision checks that spawn up to `12` glowing collision shock flashes (`totalBoulderCollisions`) plus `260` fine debris/gas stream particles.
4. **Progressive Core Plunge**: The eroded core spirals into the `#000000` shadow (`PLANET_ACCRETION` -> `PLANET_CONSUMED`), never shrinking instantaneously into a dot.

---

## 9. Original Cosmic Horror Audio Design (`src/audio/*`)

The v2.4 audio engine is **100% original procedural Web Audio API synthesis** inspired by the emotional scale of cosmic-horror and hard-sci-fi cinema — **zero copyrighted recordings, zero external audio files, and zero melodies, chord progressions, or arrangements copied from *Interstellar* or Hans Zimmer**.

### Six Independent Layers
- **Layer A — The Void (`drone`)**: Ultra-deep cosmic sub-fundamental (`36.71 Hz` D1 in `CINEMATIC_HORROR`), sustained synthetic organ fifth (`1.498x`), octave (`2.003x`), warm twelfth (`3.002x`), subtle dark minor-ninth dissonant overtone (`2.118x`), brownian void rumble, and metallic horizon resonance.
- **Layer B — Gravitational Pressure (`gravitationalPressure`)**: Continuous low pulsing tension LFO, distant choir-like dual-formant atmospheric pads (`392 Hz` & `784 Hz` bandpass vowel formants), and sparse metallic relativistic horizon ticks (`getHorizonTickBuffer`, spaced every `1.25s`), dynamically swelling with `cosmicSimulationManager.gravitationalTension` as stars or planets approach disruption.
- **Layer C — Accretion Storm (`plasma`)**: Swirling pink-turbulence bandpass noise, soft electrical plasma crackles, harmonic overtones, and orbital stereo panning.
- **Layer D — Stellar Destruction (`starConsumption`)**: Dedicated synthesis voices for `STAR_APPROACH`, `STAR_CAPTURED`, `STAR_TIDAL_STRETCH`, `STAR_DISRUPTION`, `STAR_DEBRIS_STREAM`, and `STAR_ACCRETION` / `STAR_CONSUMED`.
- **Layer E — Planetary Destruction (`planetConsumption`)**: Dedicated synthesis voices for `PLANET_CAPTURED`, `PLANET_FRAGMENTATION` (crustal crackle + structural boulder sub-impact), and `PLANET_ACCRETION` / `PLANET_CONSUMED`.
- **Layer F — Cosmic Shockwave (`shockwave`)**: Sub-impact + expanding filtered viewport wave + shimmering tail routed into the procedural `2.2s` dark void `ConvolverNode` reverberation bus (`getDarkReverbBuffer`).

### Safety, Presets & Controls
- **Presets**: `DEEP_SPACE`, `SINGULARITY` (default), `COSMIC_STORM`, `HIGH_INTENSITY`, and **`CINEMATIC_HORROR`** (`Apocalypse`).
- **Cinematic Audio Mode (`cinematicAudioMode`)**: Optional user toggle raising pre-limiter presence (`1.58 -> 1.84`) and dark void reverb wetness while strictly protected by the `28 Hz` subsonic highpass, `6500 Hz` lowpass ceiling, and `-4.0 dB` (`10:1`) soft-knee `DynamicsCompressorNode` limiter.
- **Strict Autoplay & Lifecycle Discipline**: Starts OFF/uninitialized on load, strictly silent on the unauthenticated Login/Sign-Up screen, suspends on hidden tabs, deduplicates every particle & celestial `eventId`, and enforces polyphony caps (`VOICE_LIMITS`) with deterministic node disconnection.

---

## 10. Performance Profile & Quality Modes

To guarantee butter-smooth **60 FPS** alongside the workstation glass UI:
- **Zero React Re-Renders in Animation Loops**: All `useFrame` hooks mutate pre-allocated `Float32Array` geometry attributes, `InstancedMesh` matrices, and shader uniforms directly.
- **Hardware Bilinear Noise Lookup**: Expensive per-pixel trigonometric FBM loops are replaced by 1–2 lookups into a shared 256×256 tileable RGBA `DataTexture` (`src/engine/noiseTexture.ts`).
- **Fixed 120 Hz Physics Substepping**: `CosmicSimulationManager.step(dt)` clamps `dt <= 0.05s` and steps orbital/tidal physics at fixed `1/120s` increments for frame-rate-independent trajectories across 30 Hz, 60 Hz, and 144 Hz monitors.
- **Three Quality Modes (`VisualSettingsModal.tsx`)**:
  - **`CINEMATIC`**: `100%` particle/debris pool budget, `4` 3D volumetric accretion strata, adaptive DPR `[1.0, 1.35]`.
  - **`BALANCED`**: `72%` pool budget, `2` volumetric strata, DPR `[1.0, 1.15]`.
  - **`PERFORMANCE`**: `42%` pool budget, `0` extra volumetric strata, DPR `[0.85, 1.0]` (plus automatic software-WebGL fallback scaling).

---

## 11. Verified Test & Build Results

All five verification suites were executed against the v2.4 codebase and passed with zero errors:

1. **TypeScript Typecheck (`npm run typecheck`)**: Passed (`tsc --noEmit`, exit code `0`).
2. **Unit Test Suite (`npm run test:unit`)**: Passed — **4/4 test suites, 26/26 unit tests** (`vitest run`, exit code `0`):
   - `src/engine/__tests__/cosmicEngine.test.ts` (`6/6` passed)
   - `src/engine/__tests__/cosmicDevourer.test.ts` (`6/6` passed — 6-stage TDE spaghettification, outflow wind, `shadowRadius = 1.15`, planetary boulders & shards, `disruptionDurationScale`, `stableCameraMode`, 30 FPS vs 120 FPS determinism)
   - `src/services/__tests__/storeAndApi.test.ts` (`6/6` passed)
   - `src/audio/__tests__/cosmicAudioEngine.test.ts` (`8/8` passed — `CINEMATIC_HORROR` preset, `cinematicAudioMode`, `gravitationalPressure` layer, all Phase 9 TDE/planetary events, dark reverb convolver disposal, per-user persistence, tab visibility)
3. **ESLint Static Analysis (`npm run lint`)**: Passed (`eslint src components`, `0` errors, `0` warnings).
4. **Production Bundle Build (`npm run build`)**: Passed (`tsc -b && vite build`, `1680` modules transformed cleanly in `8.17s`).
5. **Playwright End-to-End Suite (`npx playwright test`)**: Passed — **10/10 Chromium E2E tests** (`exit code 0`):
   - `tests/cosmicAudio.spec.ts` (`2/2` passed — zero AuthPortal autoplay, `CINEMATIC_HORROR` preset + `Cinematic Audio Mode` + reload persistence, `1.15` shadow radius, TDE/planet spawning, `Stable Camera Viewing Mode`, timeline slider, WebGL static fallback)
   - `tests/singularity.spec.ts` (`8/8` passed — Kerr rotation, cursor deflection, Backspace/Delete particle ingestion & shockwaves, `Ctrl+Z` undo reversal, Auth/Argon2id/Google Sign-In checklist, mobile/reduced-motion/Focus Mode, RAG Chat + PromptShield + all workstation modules, unauthenticated Login entry point)

---

## 12. Known Limitations & Scientific Honesty

- **Real-Time Phenomenological Shaders vs. Full GR Ray-Tracing**: Lensing, Kerr D-shadow asymmetry, Doppler beaming, and $n=1,2,3$ photon rings are real-time analytical GLSL approximations calibrated to match relativistic visualizations (`SVS 14620`), not per-pixel numerical integration of null geodesics in the Kerr metric.
- **Lagrangian Ribbon & Pool Approximation vs. 3D GRMHD**: Stellar spaghettification ribbons, fallback collision shocks, unbound hyperbolic outflows, and planetary boulder collisions use softened relativistic-inspired orbital mechanics and zero-allocation particle pools rather than grid-based 3D magnetohydrodynamics (`SVS 14000`).
- **Browser Gesture Requirement**: Per W3C Web Audio autoplay policy, cosmic audio never plays automatically on page load and activates strictly upon explicit user interaction.
