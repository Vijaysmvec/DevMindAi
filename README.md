# DEVMIND AI — SINGULARITY: EXTREME (v2.3 — COSMIC DEVOURER)

> **Where intelligence meets gravity. Where code enters the event horizon. Where every interaction feels and sounds alive — hardened for production.**

**DevMind AI — SINGULARITY: EXTREME (v2.3 — COSMIC DEVOURER)** is a production-hardened full-stack AI repository intelligence workstation suspended inside a living real-time 3D relativistic Kerr black-hole cosmic simulation powered by **Three.js**, **React Three Fiber**, custom **GLSL volumetric & lensing shaders**, `120 Hz` interpolated celestial capture physics (`StarCaptureSystem` & `PlanetCaptureSystem`), the high-presence **Procedural Web Audio Cosmic Audio Engine**, **FastAPI**, **Firebase Google OAuth 2.0 / OIDC + Argon2id RBAC**, **PostgreSQL + pgvector** (with automatic local **SQLite + Hybrid Vector** dev mode), and **Google Gemini**.

---

## Key Capabilities

### 1. Extreme Near-Extremal Kerr Visual Engine (`components/space/` & `components/glass/`)
- **6-Tier Relativistic Rotation Hierarchy**: Independently rotating Inner Disk (`5.2x`), Inner Plasma Ring (`3.75x`), Middle Disk (`2.15x`), Outer Accretion Ring (`0.95x`), Background Cosmic Dust (`0.18x`), and Distant Lensed Starfield (`0.014x`) with Kerr frame-dragging asymmetry, relativistic Doppler beaming, and adaptive FBM shader quality.
- **6 Independent Ultra-Fine Particle Systems**:
  1. `AccretionDiskDust` (instanced micro-grains spiraling across the disk & crossing the ISCO)
  2. `InnerPlasmaParticles` (high-velocity ISCO plasma streaks)
  3. `OrbitalParticles` (inclined orbital grains with cursor curvature)
  4. `CosmicDust` (deep-field drifting cosmic grains)
  5. `GravitationalCursor` (passive Einstein lensing micro-halo + 84 trajectory-curved interaction grains)
  6. `GravityTextEffect` (`11px` cosmic character fragments shrinking into fine plasma grains)
- **Trajectory-Verified Event Horizon Ingestion & Full-Screen Cosmic Shockwave**:
  - `ParticleIngestionEvent` fires strictly once per `particleId` when a particle's actual simulated trajectory crosses the Event Horizon (`<= 40px` / `r <= 1.05`).
  - `CosmicShockwaveOverlay` expands a luminous golden-white / cyan / amber shockwave across 100% of the viewport behind the UI, coalescing rapid bursts (`115ms` window, intensity capped `<= 1.0`).
- **Crystal-Clear Dynamic Glass**: `rgba(5, 8, 16, 0.36)` transparency, `blur(18px) saturate(165%)`, crisp `rgba(210, 230, 255, 0.20)` edge refraction, and synchronized `--shockwave-boost` border reflections.
- **Gravitational Text Deletion & Native Undo/Redo (`Ctrl+Z` / `Ctrl+Y` / `Ctrl+Shift+Z`)**: Passively tracks `Backspace`, `Delete`, hold-delete, selection deletion, `Cut`, and replacement without calling `preventDefault()`, preserving native browser undo stacks while reversing particle trajectories outward on undo.

### 2. Singularity Cosmic Audio Engine (`src/audio/` & `src/components/audio/` — v2.2)
- **100% Procedural Web Audio API Soundscape**: Zero external audio files or third-party dependencies. Synthesizes four independent cosmic layers in real time:
  1. **Event Horizon Drone**: Evolving sub-cosmic sine/triangle oscillators, brownian rumble, slow FM/filter LFOs, and subtle metallic resonance.
  2. **Accretion Disk Plasma**: Swirling orbital stereo turbulence (`StereoPannerNode`), soft electrical micro-crackle, and metallic harmonics.
  3. **Gravitational Ingestion Pull**: Continuous approach tension (`PARTICLE_APPROACH`) + rising gravitational pull, descending Event Horizon pitch sweep, and crystalline disappearance chime strictly synchronized to `registerParticleIngestion` (`particleId` deduplicated & `85 ms` burst-coalesced).
  4. **Singularity Shockwave Pulse**: Deep sub-impact, viewport-synced swept noise wave, metallic resonance, and shimmering tail matched to `CosmicShockwaveOverlay`.
- **Three Live-Switchable Presets & Top-Right Crystal-Glass Controls**: Switch seamlessly between `Deep Space`, `Singularity` *(Recommended Default)*, and `Cosmic Storm`, adjust Master Volume (`65%` default), toggle any of the 5 layers independently, trigger **Test Sound**, or engage instant anti-click **Master Mute**.
- **Subtle `AnalyserNode` Audio-Visual Sync & Autoplay Safety**: Audio defaults **OFF** until an explicit user gesture, stays strictly silent on Login/Sign-Up screens, suspends when tabs are hidden, persists per authenticated user across reloads, and subtly modulates disk glow, inner plasma, cosmic dust brightness, energy rings, and glass specular reflections without altering black-hole physics. See [`COSMIC_AUDIO_ENGINE.md`](./COSMIC_AUDIO_ENGINE.md).

### 3. Authentication, RBAC & Production Security (`backend/app/` & `src/modules/`)
- **Google Sign-In (`firebase/auth` + `firebase-admin`)**: Official Google OAuth popup flow on frontend paired with backend RS256 OIDC ID-token verification (`iss`, `aud`, `exp`, `email_verified`) mapped to stable `User.firebase_uid`.
- **Argon2id Account Lifecycle & Session Revocation**: `argon2-cffi` password hashing, `access` (30m) + `refresh` (7d) JWT rotation, immediate server-side revocation via `token_version` on logout/disable, profile editing, and full account deletion (`DELETE /api/auth/me`).
- **Server-Side RBAC & Per-User IDOR Isolation**: `user` / `admin` roles (`require_admin` protecting `/api/admin/*`), `AdminConsoleModule` for user governance & audit logs, and `get_owned_repo()` isolating repositories across all endpoints.
- **Defense-in-Depth Hardening**: Fail-closed `validate_startup_config()` in `production`/`staging`, `SecurityHardeningMiddleware` (CSP, HSTS, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options: DENY`, `Cache-Control: no-store`, `413` body limit, `X-Request-ID`), per-user/per-IP `SlidingWindowRateLimiter` (Redis + in-memory), ZIP-slip & ZIP-bomb guards, and secret-redacted structured audit logging.

### 4. Workstation Modules Preserved & Hardened
1. **Singularity Codebase Chat** (Hybrid Vector RAG + AST citations + Gemini synthesis)
2. **Command Deck Dashboard**
3. **Repository Manager & Secure `.zip` / Multi-File AST Indexer**
4. **Orbital Architecture Explorer**
5. **AI Code Review**
6. **PromptShield Security Center** (Adversarial prompt firewall + static CWE scanner)
7. **ModelDoctor** (Live latency, token & temperature calibration probes)
8. **MemoryMesh** (Semantic associative developer memory graph)
9. **Documentation Generator** (AST Markdown synthesis)
10. **Admin Security Console** (RBAC user management & Request-ID audit trail)

---

## Environment & Network Topology

Copy `.env.example` to an untracked `.env` file and populate credentials as needed:

| Environment | Frontend Origin | Backend API Origin | Database | Google OAuth Redirect / Authorized Domain |
| :--- | :--- | :--- | :--- | :--- |
| **Local Dev** | `http://127.0.0.1:5173` (Vite proxy `/api` -> `:8765`) | `http://127.0.0.1:8765` | Async SQLite (`backend/devmind_singularity.db`) or Docker `pgvector` | `localhost` / `127.0.0.1` in Firebase Console |
| **Staging / Prod** | `https://<your-frontend-domain>` (`vercel.json`) | `https://<your-api-domain>` (`render.yaml` / `railway.json`) | Managed PostgreSQL + `pgvector` (`ssl=require`) | `https://<your-frontend-domain>` in Firebase Authorized Domains; `CORS_ALLOWED_ORIGINS` locked to exact `https://` origin |

> **Security Note**: Never place `GEMINI_API_KEY`, `JWT_SECRET_KEY`, `DATABASE_URL`, or `FIREBASE_SERVICE_ACCOUNT_JSON` in `VITE_*` variables. `validate_startup_config()` refuses to boot in `production`/`staging` if mandatory secrets or `https://` origins are missing.

---

## Local Development Quick Start

### 1. Start the FastAPI Backend
```powershell
.\backend\.venv\Scripts\uvicorn.exe backend.app.main:app --host 127.0.0.1 --port 8765
```

### 2. Start the Vite Frontend Workstation
```powershell
npm run dev -- --host 127.0.0.1 --port 5173
```
Open `http://127.0.0.1:5173`.

---

## Automated Verification & Security Audits

```powershell
# TypeScript strict check, ESLint, Vitest physics/ingestion unit tests, and production bundle
npm run typecheck
npm run lint
npm run test:unit
npm run build

# Backend Auth, Google OIDC, RBAC, IDOR, Rate-Limit, ZIP-Slip/Bomb & Header Pytest suite
.\backend\.venv\Scripts\pytest.exe -v

# End-to-End 18-Point Animation, Shockwave, Undo/Redo, Auth & Workstation Playwright suite
npx playwright test

# Dependency Vulnerability Audits
npm audit --omit=dev
.\backend\.venv\Scripts\pip-audit.exe
```

See [`SECURITY_AUDIT_REPORT.md`](./SECURITY_AUDIT_REPORT.md) for the complete 16-section threat model, security verification results, and pre-launch checklist.
"# DevMindAi" 
