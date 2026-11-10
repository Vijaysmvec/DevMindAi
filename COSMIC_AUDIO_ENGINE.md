# DEVMIND AI — SINGULARITY: EXTREME v2.2
# COSMIC AUDIO ENGINE — ARCHITECTURE & TECHNICAL GUIDE

The **Cosmic Audio Engine** (`src/audio/` & `src/components/audio/`) is a real-time, 100% procedural Web Audio API soundscape and subtle audio-visual synchronization layer engineered for **DevMind AI — SINGULARITY: EXTREME v2.2**. It synthesizes every cosmic drone, swirling plasma turbulence, relativistic particle ingestion pull, and full-viewport shockwave pulse mathematically in real time—requiring **zero external audio files** and **zero third-party audio dependencies**.

---

## 1. Architecture

The audio subsystem is cleanly decoupled into seven core engine modules (`src/audio/`) and three crystal-glass React UI components (`src/components/audio/`):

| File | Responsibility |
| :--- | :--- |
| `src/audio/AudioSettings.ts` | Defines `CosmicAudioPreferences`, safe defaults (`enabled: false`, `masterVolume: 0.65`, `preset: 'SINGULARITY'`), input clamping/sanitization, and per-user `localStorage` persistence (`devmind_cosmic_audio_v22:<userId>`). |
| `src/audio/AudioPresets.ts` | Acoustic parameter profiles for `DEEP_SPACE`, `SINGULARITY` *(Recommended Default)*, and `COSMIC_STORM`. |
| `src/audio/AudioContextManager.ts` | Manages the single Web Audio API `AudioContext`, user-gesture initialization, `28 Hz` subsonic highpass & `6.5 kHz` harshness-taming lowpass, `-6 dB` (`12:1`) safety compressor/limiter, anti-click Master `GainNode` automation, page visibility suspend/resume, and zero-allocation `AnalyserNode` spectral sampling. |
| `src/audio/AudioPerformanceManager.ts` | Generates and caches seamless procedural noise `AudioBuffer`s once per context, enforces exact-once `particleId` audio deduplication (`2,048`-entry FIFO ring), coalesces rapid multi-glyph ingestion bursts (`85 ms` window), enforces transient polyphony caps, and deterministically disconnects completed `AudioNode`s. |
| `src/audio/CosmicSoundGenerator.ts` | Procedural synthesizer for the **Four Cosmic Sound Layers** (Event Horizon Drone, Accretion Plasma, Gravitational Ingestion, Singularity Shockwave), restrained UI/AI state textures, and the user-initiated **Test Sound**. |
| `src/audio/CosmicAudioEvents.ts` | Connects `cosmicEngine` (`PARTICLE_APPROACH`, `PARTICLE_INGESTED`, `COSMIC_SHOCKWAVE`, interaction states) and `document.visibilitychange` to `CosmicAudioEngine` with idempotent attach/detach cleanup. |
| `src/audio/CosmicAudioEngine.ts` | Central facade coordinating context lifecycle, user authentication scoping, live preset/layer updates, event dispatch, and `AnalyserNode` -> `cosmicEngine.audioVisual` synchronization. |
| `src/components/audio/CosmicAudioController.tsx` | Compact crystal-glass control pill in the top-right workstation navbar (Master Enable/Mute button, inline `AudioVisualizer`, and settings popover trigger). |
| `src/components/audio/CosmicAudioSettings.tsx` | Portal-rendered crystal-glass settings popover with first-use enablement banner, Master ON/OFF switch, instant Mute button, Master Volume slider, 3 Preset cards, 5 independent Layer toggles, and Test Sound button. |
| `src/components/audio/AudioVisualizer.tsx` | Subtle 5-bar spectral telemetry micro-indicator updated via `requestAnimationFrame` with zero React re-renders. |

---

## 2. Audio Signal Flow

```text
[Layer A: Event Horizon Drone] ──► (Sine + Fifth Triangle + Octave Drift + Brown Rumble + Metallic BP + Slow LFO) ─┐
[Layer B: Accretion Plasma]    ──► (Pink Turbulence BP + Soft Crackle + Harmonic + Orbital StereoPanner LFO) ──────┤
[Layer C: Particle Ingestion]  ──► (Continuous Approach Tension + Coalesced Pull/Horizon Pitch Sweep/Crystal Ping) ┼─► [Mix Bus]
[Layer D: Cosmic Shockwave]    ──► (Sub-Impact Pitch Drop + Viewport-Synced Swept Noise + Metallic Ring + Tail) ───┤      │
[UI & AI State Reactivity]     ──► (Subtle Submit Chime / Evolving AI Thinking Pad / Completion Fifth / Soft Warn) ┘      ▼
                                                                                                         [28 Hz Subsonic Highpass]
                                                                                                                  │
                                                                                                         [6.5 kHz Gentle Lowpass]
                                                                                                                  │
                                                                                                   [DynamicsCompressor (-6 dB, 12:1)]
                                                                                                                  │
                                                                                                    [Master GainNode (Smooth Ramps)]
                                                                                                                  │
                                                                                                       [AnalyserNode (256 FFT)]
                                                                                                         │                  │
                                                                                                         ▼                  ▼
                                                                                                 [ctx.destination]  [Subtle 3D Visual Sync]
```

---

## 3. Event Integration & Reactivity Mapping

Audio hooks directly into the existing `cosmicEngine.ts` physics and `singularityStore.ts` state pipeline—never duplicating particle loops or faking events:

| Event | Source Pipeline | Audio Engine Behavior |
| :--- | :--- | :--- |
| `PARTICLE_APPROACH` | `GravityTextEffect.tsx` (`p.progress` toward Event Horizon) -> `cosmicEngine.reportParticleApproach()` | Smoothly lifts resonant gravitational approach tension (`112 Hz -> 250 Hz`) as detached glyphs near the Event Horizon, decaying to silence once crossed. |
| `PARTICLE_INGESTED` | `cosmicEngine.registerParticleIngestion()` (`<= 40px` glyph crossing & `r <= 1.05` disk grain infall) | Plays Layer C: short rising pull -> relativistic descending pitch sweep across the horizon -> soft crystalline disappearance chime. Strictly deduplicated by `particleId` and coalesced (`85 ms` window). **Never triggered by pressing Submit.** |
| `COSMIC_SHOCKWAVE` | `cosmicEngine` shockwave coalescer (`115 ms` window) | Plays Layer D: deep cinematic sub-impact (`54 Hz -> 28 Hz`) + expanding bandpass-swept noise wave + metallic resonance + `~1.28s` shimmering tail synchronized with `CosmicShockwaveOverlay`. |
| `MESSAGE_SUBMITTED` | `singularityStore.setInteractionState('MESSAGE_SUBMITTED')` | Plays a quiet, restrained `330 Hz -> 440 Hz` glass confirmation tone (subordinate to cosmic layers). |
| `AI_THINKING` | `singularityStore.setInteractionState('AI_THINKING')` | Fades in a very subtle evolving `220 Hz + 329.6 Hz` lowpass-modulated harmonic pad while active, smoothly fading out on completion. |
| `AI_RESPONSE` | `singularityStore.setInteractionState('AI_RESPONSE')` | Plays a restrained two-tone `392 Hz -> 587.3 Hz` harmonic completion resonance. |
| `ERROR` | `singularityStore.setInteractionState('ERROR')` | Plays a soft, low-impact `174.6 Hz -> 130.8 Hz` warm triangle warning pulse. |

---

## 4. Audio Presets

Users can switch between three curated presets live without restarting the `AudioContext`:

1. **`DEEP_SPACE` (Ambient & Meditative)**:
   - Dominant `38.89 Hz` atmospheric horizon drone, very delicate plasma shimmer, softest event transients.
2. **`SINGULARITY` *(Default — Recommended)***:
   - Balanced `41.20 Hz` gravitational drone, noticeable swirling stereo plasma turbulence, responsive particle ingestion sweeps, and rich cinematic shockwaves.
3. **`COSMIC_STORM` (Dynamic & Energetic)**:
   - Energetic `43.65 Hz` storm root, faster LFO modulation (`0.165 Hz`), heightened plasma crackle & orbital panning width (`0.85`), and pronounced horizon ingestion & shockwave resonance.

All presets route through the `28 Hz` subsonic filter, `6.5 kHz` harshness filter, and `-6 dB` brickwall safety limiter.

---

## 5. User Controls

Located in the **top-right workstation navigation bar** (`CosmicAudioController.tsx` & `CosmicAudioSettings.tsx`):

1. **Quick Topbar Toggle**: One-click **Enable Audio** (first use) and instant **Master Mute / Unmute** with live 5-bar `AudioVisualizer`.
2. **Master Audio ON / OFF Switch**: Smoothly powers the entire soundscape on or off without destroying reusable audio graphs.
3. **Master Volume Slider**: Continuous `0%–100%` control (default `65%`) using `setTargetAtTime` anti-click gain automation.
4. **Preset Selector**: Live radio group for `Deep Space`, `Singularity`, and `Cosmic Storm`.
5. **5 Independent Layer Switches**:
   - *Event Horizon Drone*
   - *Accretion Disk Plasma*
   - *Particle Ingestion Pull*
   - *Cosmic Shockwave Pulse*
   - *UI & AI Interaction Cues*
6. **Test Sound Button**: Plays an immediate `0.88s` procedural Singularity check chord/sweep to verify output level and active preset.

---

## 6. Browser Autoplay Rules & Tab Visibility

- **Zero Autoplay**: `AudioContext` is **never** constructed or resumed on initial load, page reload, or unauthenticated screens (`AuthPortal`). Audio defaults to **OFF** until an explicit user gesture.
- **Saved Session Unlock**: Preferences (`enabled`, `muted`, `masterVolume`, `preset`, `layers`) persist per authenticated user across reloads. If a returning user previously left audio enabled, `AudioContext` remains uninitialized on reload until their next legitimate pointer/keyboard gesture or clicking **Resume**.
- **Tab Visibility**: When `document.visibilityState === 'hidden'`, master gain smoothly ramps to `0` and `AudioContext` suspends. Returning to the tab resumes playback **only** if the user had audio enabled and unmuted.

---

## 7. Performance Decisions

- **Single `AudioContext`**: Never instantiates more than one `AudioContext`.
- **Cached Procedural Noise Buffers**: Brownian rumble (`3.0s`), pink turbulence (`3.5s`), and micro-crackle (`4.0s`) `AudioBuffer`s are synthesized once with deterministic seeded PRNGs and reused across all continuous and transient voices.
- **Reusable Continuous Nodes**: Drone, Plasma, Approach Tension, and AI Thinking layers use persistent oscillator/filter graphs modulated via `AudioParam.setTargetAtTime`.
- **Bounded Transient Polyphony & Disposal**: `AudioPerformanceManager` caps concurrent transient voices (`ingestion <= 5`, `shockwave <= 3`, `ui <= 3`), coalesces rapid multi-character deletions (`85 ms` window), and disconnects all completed transient nodes via `onended` + deterministic cleanup timers.
- **Zero-Allocation Visual Sync**: `AnalyserNode` (`fftSize: 256`) reuses pre-allocated `Uint8Array` buffers inside `DynamicGlassLighting`'s existing `requestAnimationFrame` loop, applying subtle read-only visual boosts to `AccretionDisk`, `InnerPlasmaRing`, `EventHorizon`, `CosmicDust`, `EnergyPulse`, and crystal-glass reflections—never mutating black-hole rotation physics.

---

## 8. Accessibility & User Safety

- **Authentication Screen Silence**: `CosmicAudioEngine` enforces `effectiveMasterGain = 0` whenever unauthenticated (`!user`), guaranteeing zero unexpected audio on Login or Sign Up screens.
- **Keyboard & Screen-Reader Support**: All switches, radio presets, sliders, and dialogs include `aria-label`, `aria-checked` / `aria-pressed`, `role="switch"` / `role="radiogroup"`, and `Escape` dismissal.
- **Independent of Reduced Motion**: Visual `prefers-reduced-motion` suppresses visual motion/shockwaves while keeping audio preferences independently controllable by the user.
- **Acoustic Safety**: `28 Hz` highpass prevents dangerous sub-bass excursions; `6.5 kHz` lowpass prevents harsh high-frequency spikes; `-6 dB` `DynamicsCompressorNode` prevents sudden loud transients.

---

## 9. Testing Instructions

```powershell
# TypeScript strict check & ESLint
npm run typecheck
npm run lint

# Vitest unit suite (cosmic physics, auth/API store, and 13-point Web Audio engine tests)
npm run test:unit

# Production Vite build
npm run build

# Playwright E2E verification (cosmic audio UI, gesture unlock, ingestion sync, reload persistence & 18-point Singularity suite)
npx playwright test
```

---

## 10. Known Limitations

1. **Browser Gesture Policy Across Reloads**: Per Chromium, Firefox, and Safari Web Audio autoplay security policies, even if a user leaves Cosmic Audio enabled before refreshing the browser, `AudioContext` cannot emit sound after a hard reload until the user clicks, taps, or presses a key on the page. `CosmicAudioController` displays a clear `Resume Audio` indicator and unlocks automatically on the first interaction.
2. **Per-User Client Storage Scope**: To strictly preserve existing database schemas and `extra="forbid"` backend API contracts without requiring database migrations, per-user audio preferences are stored in `localStorage` scoped by authenticated `user.id` (`devmind_cosmic_audio_v22:<userId>`), persisting across reloads and sessions on the same browser/device.
3. **Older Browser `StereoPannerNode` Support**: If a legacy WebView lacks `BaseAudioContext.createStereoPanner`, Layer B (Accretion Plasma) automatically falls back to centered stereo routing without throwing errors.
