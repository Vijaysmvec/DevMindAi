# DEVMIND AI — SINGULARITY: EXTREME
## Application Security, Authentication & Production Readiness Audit Report

- **Application Version**: `2.1.0` (`SINGULARITY: EXTREME`)
- **Audit Scope**: Full-stack application (`src/`, `components/`, `backend/app/`, `tests/`, `backend/tests/`, build & deployment manifests)
- **Status Taxonomy**: `PASS` | `FAIL` | `NEEDS CONFIGURATION` | `NOT TESTED` | `ACCEPTED RISK`

---

## 1. Executive Summary

DevMind AI (`SINGULARITY: EXTREME`) has undergone a comprehensive architectural security overhaul, authentication upgrade, and WebGL/event-system safety verification in preparation for a controlled public MVP launch.

All critical and high-severity application-layer vulnerabilities identified during baseline inspection — including unauthenticated fallback access, hardcoded development JWT secrets, client-transmitted Gemini API keys, missing per-user repository isolation (IDOR), unverified archive paths (ZIP-slip / ZIP-bomb), missing rate limiting, and absent HTTP security headers — have been remediated in code and verified with automated unit, integration, and end-to-end tests.

| Domain | Status | Summary |
| :--- | :---: | :--- |
| Server-Side Authentication & Session Revocation | **PASS** | Deny-by-default `get_current_user`; Argon2id hashing; signed `access` + `refresh` JWTs with `token_version` revocation. |
| Google Sign-In (`firebase/auth` + `firebase-admin`) | **PASS** *(Code)* / **NEEDS CONFIGURATION** *(Cloud Keys)* | Official Firebase Web SDK & Admin SDK wired end-to-end with `firebase_uid` deduplication; requires user's Firebase project keys in `.env` for live Google popup login. |
| Role-Based Access Control (`user` / `admin`) & IDOR | **PASS** | Server-enforced `require_admin`, mass-assignment blocked (`extra="forbid"`), and `get_owned_repo` enforced across all repository, RAG chat, architecture, review, security, and docs routes. |
| Startup Environment Validation & Secret Isolation | **PASS** *(Code)* / **NEEDS CONFIGURATION** *(Key Rotation)* | `validate_startup_config()` fails closed in `production`/`staging`; zero secrets in source/Git; client Gemini key removed. **Action Required**: Rotate the `GEMINI_API_KEY` previously shared in chat before public launch. |
| API Input Validation, ZIP-Slip & ZIP-Bomb Defenses | **PASS** | Strict Pydantic schemas, `413` body limit, path traversal blocker, symlink rejection, `50x` compression ratio cap, and `12 MB` cumulative extraction cap. |
| Rate Limiting & Abuse Protection | **PASS** *(Single-Node)* / **NEEDS CONFIGURATION** *(Multi-Node Redis)* | Per-user + per-IP sliding-window limiter returning `429` + `Retry-After`; Redis adapter built-in (`REDIS_URL` needed for multi-replica horizontal scaling). |
| HTTP Security Headers & CORS | **PASS** | CSP, HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options: DENY`, `Cache-Control: no-store`, strict origin allowlist. |
| Python & Production JS Dependencies | **PASS** | `pip-audit`: **0 vulnerabilities**; `npm audit --omit=dev`: **0 vulnerabilities** (`14` local dev-only tooling advisories documented as `ACCEPTED RISK`). |
| WebGL, Ingestion Bus & Text-Gravity Safety | **PASS** | Exact-once `particleId` deduplication, capped shockwave coalescing, passive bubble-phase input listeners (`1` listener, zero leaks), zero text telemetry storage. |

---

## 2. Threat Model

### Assets Protected
1. **User Identities & Credentials**: Google OAuth identities (`firebase_uid`), Argon2id password hashes, session JWTs, and administrative privileges.
2. **Private Source Code & Embeddings**: Uploaded repositories, AST symbol tables, hybrid vector chunks (`CodeChunk`), chat histories (`ChatMessage`), and `MemoryMesh` nodes.
3. **Server-Side AI Quota & Credentials**: Google Gemini API credentials (`GEMINI_API_KEY`) and LLM compute budget.
4. **Client Workstation Integrity**: Browser DOM/input state, native undo/redo history, and GPU/CPU frame budget.

### Primary Threat Actors & Attack Vectors Mitigated
- **Unauthenticated Internet Scanners / Credential Stuffers**: Blocked via deny-by-default bearer auth, Argon2id memory-hard hashing, and per-IP sliding-window rate limits (`429 Retry-After`).
- **Authenticated Horizontal Privilege Escalation (IDOR)**: Blocked via `get_owned_repo()` ownership verification and `AuditLog` tracking (`authz.idor_blocked`).
- **Vertical Privilege Escalation (Role Tampering)**: Blocked via `ConfigDict(extra="forbid")` on registration/profile schemas and server-only `require_admin` checks (`authz.admin_denied`).
- **Malicious Archive Uploads (ZIP-Slip / Symlink / Decompression Bombs)**: Blocked via `_sanitize_repo_relpath()`, external attribute symlink checks, per-entry compression-ratio checks (`<= 50x`), and cumulative byte caps.
- **Prompt Injection & System Prompt Exfiltration**: Mitigated via pre-flight `PromptShield` inspection (`scan_prompt_shield`) prior to Gemini invocation.
- **UI/Rendering Denial-of-Service**: Mitigated via `MAX_ACTIVE_GLYPHS = 120`, `115ms` shockwave coalescing, `<= 1.0` intensity clamping, and adaptive software-GL quality scaling.

---

## 3. Trust Boundaries

```
[ Browser SPA (Untrusted Client) ]
   |-- HTTPS + Strict CORS + CSP + Bearer Access Token (No Gemini API Key)
   v
[ SecurityHardeningMiddleware -> SlidingWindowRateLimiter ]
   |-- 413 Body Limit, X-Request-ID, Secret-Redacted Audit Logging
   v
[ FastAPI Auth & RBAC Layer (get_current_user / require_admin / get_owned_repo) ]
   |-- Verifies JWT (iss, aud, exp, typ, ver) & Firebase Admin OIDC Claims (RS256)
   v
[ Isolated Data & AI Plane ]
   |-- PostgreSQL + pgvector (SSL required in prod) / Local Dev SQLite
   |-- Google Gemini API (Server-side GEMINI_API_KEY + PromptShield Gate)
```

---

## 4. Authentication Assessment

| Control | Status | Verification Evidence |
| :--- | :---: | :--- |
| Official Google OAuth 2.0 / OIDC Integration (`firebase/auth` + `firebase-admin`) | **PASS** | Wired in `src/services/firebaseClient.ts` (`signInWithPopup` + `GoogleAuthProvider`) and `backend/app/auth.py` (`fb_auth.verify_id_token` checking RS256 signature, `exp`, `iss`, `aud`, `email_verified`). |
| Live Google Cloud OAuth Browser Popup | **NEEDS CONFIGURATION** | Requires user-supplied `VITE_FIREBASE_*` and `FIREBASE_PROJECT_ID` in untracked `.env`. UI displays setup checklist honestly when unconfigured. |
| Stable External UID Mapping & Account Deduplication | **PASS** | Verified in `test_google_oauth_signup_deduplication_and_uid_conflict_guard`: maps by `User.firebase_uid`, prevents duplicate rows on repeat logins, and returns `409` on cross-UID email hijack attempts. |
| Modern Password Hashing (`Argon2id`) | **PASS** | `argon2-cffi` (`time_cost=2`, `memory_cost=65536`, `parallelism=2`) verified in `test_argon2id_lifecycle_mass_assignment_revocation_and_deletion`. |
| Session Refresh & Server-Side Logout Revocation | **PASS** | Separate `access` (30m) and `refresh` (7d) JWTs bound to `User.token_version`. `POST /api/auth/logout` increments `token_version`, immediately invalidating outstanding tokens (`401`). |
| Dev Session Endpoint Isolation (`/api/auth/dev-session`) | **PASS** | Strictly returns `404` when `APP_ENV` is `production` or `staging` (`test_dev_session_endpoint_disabled_in_production`). |

---

## 5. Authorization & RBAC Assessment

| Control | Status | Verification Evidence |
| :--- | :---: | :--- |
| Deny-by-Default Endpoint Protection | **PASS** | Anonymous fallback completely removed from `get_current_user`. Unauthenticated calls to `/api/repos`, `/api/chat/history`, `/api/settings/visual`, and `/api/admin/*` return `401`. |
| Least-Privilege Default Role (`user`) & Mass-Assignment Block | **PASS** | All self-registered and Google OAuth users default to `role="user"` unless matching server-side `INITIAL_ADMIN_EMAIL`. Supplying `"role": "admin"` in JSON returns `422`. |
| Protected Administrative Endpoints (`/api/admin/*`) | **PASS** | `require_admin` enforces `user.role == "admin"` server-side, returning `403` and recording `authz.admin_denied` audit events for standard users. |
| Disabled & Deleted Account Enforcement | **PASS** | Disabled users immediately receive `403` across API calls and login; account deletion (`DELETE /api/auth/me`) purges owned repositories/messages/settings and tombstones the identity. |
| Per-User Project Ownership (IDOR Prevention) | **PASS** | Verified in `test_cross_user_idor_isolation_across_all_repository_endpoints` across repo listing, file inspection, deletion, architecture graph, CWE audit, docs generation, and RAG chat (`403` + `authz.idor_blocked`). |

---

## 6. Secrets & Environment Assessment

| Control | Status | Details |
| :--- | :---: | :--- |
| Hardcoded Secrets Removed from Codebase | **PASS** | Former fallback `"devmind_singularity_dev_secret_change_in_prod"` and seeded plaintext demo password removed; source & test tree scanned cleanly. |
| Client-Side Gemini Key Exposure Eliminated | **PASS** | Removed browser `X-Gemini-Key` header/storage and removed API key input from `VisualSettingsModal.tsx`; `GEMINI_API_KEY` is strictly server-side. |
| Fail-Closed Startup Environment Validation | **PASS** | `validate_startup_config()` raises `RuntimeError` in `production`/`staging` if `DEBUG=true`, `JWT_SECRET_KEY < 32 chars`, `DATABASE_URL` uses SQLite, `FRONTEND_URL`/`CORS_ALLOWED_ORIGINS` lack `https://` or contain `*`, or `FIREBASE_PROJECT_ID` is unset. |
| Git Ignore Hygiene (`.gitignore` & `.env.example`) | **PASS** | `.env`, `.env.*`, `*.db`, `*.pem`, `*service-account*.json`, and `firebase-adminsdk*.json` are excluded from version control; `.env.example` contains safe placeholders only. |
| Previously Pasted Chat Gemini API Key Rotation | **NEEDS CONFIGURATION** | Because the `GEMINI_API_KEY` (`AQ....`, Project `1030371811567`) was pasted in chat during earlier setup, **rotate this key in Google Cloud Console** before exposing the deployment publicly. |

---

## 7. API & Input Validation Assessment

- **Status**: **PASS**
- All request models use `ConfigDict(extra="forbid")` with explicit `min_length`, `max_length`, numeric bounds (`ge`/`le`), and regex validation for email addresses and `https://` profile avatar URLs (`javascript:` URLs rejected with `422`).
- Global payload size ceiling (`MAX_REQUEST_BYTES = 6 MB`) enforced in `SecurityHardeningMiddleware` (`413 Payload Too Large`).
- Repository uploads enforce `_sanitize_repo_relpath()` (blocking `..`, leading `/`, Windows drive roots `C:`, and null bytes), symlink rejection, entry count cap (`500`), per-entry compression ratio guard (`50x`), and total uncompressed ceiling (`12 MB`).
- Global unhandled exception handler returns a generic `500` JSON body with `request_id` — stack traces are never leaked to clients, and OpenAPI `/docs` + `/redoc` are disabled automatically in `production`/`staging`.

---

## 8. Database Security Assessment

| Control | Status | Details |
| :--- | :---: | :--- |
| Parameterized Queries (SQL Injection Defense) | **PASS** | 100% SQLAlchemy 2.x ORM bound parameters; zero string-concatenated SQL statements. |
| Schema Constraints & Composite Indexing | **PASS** | Unique indexes on `users.email` and `users.firebase_uid`; foreign keys on all user/repository child tables; composite index `ix_repositories_user_created` (`user_id`, `created_at`). |
| Production PostgreSQL TLS Enforcement | **PASS** *(Code)* / **NEEDS CONFIGURATION** *(Prod DB)* | `backend/app/database.py` enforces `connect_args={"ssl": "require"}` for non-localhost PostgreSQL in production. Provision a managed PostgreSQL + `pgvector` instance (`DATABASE_URL`) prior to public launch. |

---

## 9. Dependency Vulnerability Findings

### Python Backend (`pip-audit`) — **PASS**
- Executed `backend/.venv/Scripts/pip-audit.exe --format json` across all 83 installed packages (`fastapi 0.162.0`, `firebase-admin 7.7.0`, `argon2-cffi 25.1.0`, `cryptography 50.0.2`, `sqlalchemy 2.1.8`, `pyjwt 2.15.1`, `uvicorn 0.54.0`, etc.).
- **Result**: **0 known vulnerabilities**.

### Frontend Production Bundle (`npm audit --omit=dev`) — **PASS**
- Applied `overrides` (`@grpc/grpc-js@^1.14.0`, `esbuild@^0.25.0`), upgraded `postcss@^8.5.32` & `vite@^5.4.21`, and executed `npm audit fix`.
- **Result (`npm audit --omit=dev`)**: **0 vulnerabilities** across all production runtime dependencies.

### Frontend Local Dev Tooling (`npm audit` including `devDependencies`) — **ACCEPTED RISK**
- `14` advisories remain exclusively in local build/test `devDependencies` (`vite 5.4.21` dev-server advisories, `vitest 2.1.9` / `tinypool`, `minimatch` in `typescript-eslint`, and `playwright 1.49.1` browser-installer advisory).
- **Rationale**: None of these packages are bundled into `dist/` or deployed to production servers. Resolving them requires major breaking upgrades (`vite@8.x` and `vitest@4.x`). Do not expose `npm run dev` or `vitest` ports to untrusted networks; upgrade to Vite 8 + Vitest 4 in a dedicated build-tooling milestone.

---

## 10. Frontend Security Assessment

- **Status**: **PASS**
- **Production Source Maps Disabled**: `vite.config.ts` sets `build.sourcemap = false`; verified zero `.map` files in `dist/assets/`.
- **Telemetry Gating**: `window.__DEVMIND_COSMIC__` and `window.__DEVMIND_GRAVITY_LISTENERS__` are gated behind `!import.meta.env.PROD` so internal diagnostics are stripped in production builds.
- **XSS Prevention**: React auto-escaping used throughout; zero `dangerouslySetInnerHTML` usage across `src/` and `components/`. External Google profile avatars enforce `https://` validation and `referrerPolicy="no-referrer"`.
- **Silent Session Recovery**: `src/services/api.ts` automatically attempts a single `POST /api/auth/refresh` rotation on `401` before clearing auth state.

---

## 11. WebGL / Animation / Event-System Safety Assessment

- **Status**: **PASS**
- **Exact-Once Trajectory Ingestion**: `cosmicEngine.registerParticleIngestion()` deduplicates strictly by `particleId` inside a bounded `2,048`-entry FIFO ring buffer and only fires when a particle's actual simulated trajectory crosses the Event Horizon (`dist <= 40px` for text glyphs; `r <= 1.05` for accretion dust).
- **Shockwave Flash & Memory Protection**: `spawnOrAggregateShockwave()` coalesces bursts within `115ms`, caps `intensity <= 1.0`, limits concurrent shockwaves to `<= 6`, and suppresses shockwaves automatically when `prefers-reduced-motion: reduce` is active.
- **Input & Undo Integrity**: `GravityTextEffect.tsx` attaches a single passive bubble-phase listener set (`__DEVMIND_GRAVITY_LISTENERS__ === 1`), never calls `preventDefault()`, preserves native browser `Ctrl+Z`, `Ctrl+Y`, and `Ctrl+Shift+Z`, and never logs or persists deleted user text.
- **Pointer-Events Safety & Adaptive Quality**: All 5 visual canvases (`black-hole-scene-container`, `cosmic-shockwave-canvas`, `gravitational-cursor-canvas`, `gravity-subglass-canvas`, `gravity-foreground-canvas`) enforce `pointer-events: none`. Software/low-FPS renderers automatically scale DPR and shader FBM octaves down.

---

## 12. Rate Limiting & Abuse Protection Assessment

- **Status**: **PASS** *(Single-Instance)* / **NEEDS CONFIGURATION** *(Multi-Instance Redis)*
- `SlidingWindowRateLimiter` enforces strict per-IP limits on auth endpoints (`/google`: 15/min, `/register`: 10/min, `/login`: 12/min, `/refresh`: 25/min) and composite `user:{id}:ip:{ip}` limits on authenticated AI/upload endpoints (`chat_send`: 20/min, `repo_upload`: 8–10/min, `code_review`: 15/min, `docs_gen`: 10/min), returning HTTP `429` with standard `Retry-After` headers.
- Built-in `redis.asyncio` sorted-set pipeline activates automatically when `REDIS_URL` is configured for multi-instance deployments.

---

## 13. Logging & Monitoring Assessment

- **Status**: **PASS**
- Every HTTP request receives a validated or generated `X-Request-ID` propagated to responses, structured JSON logs (`emit_structured_log`), and database `AuditLog` rows.
- `redact_secrets()` scrubs `AQ.*` keys, `AIza*` keys, `Bearer` tokens, and JSON `password` / `id_token` / `refresh_token` / `access_token` / `private_key` / `secret` values prior to log output.
- Security-critical events (`auth.google_signup`, `auth.google_login`, `auth.login_failed`, `auth.logout`, `auth.account_deleted`, `authz.admin_denied`, `authz.idor_blocked`, `admin.user_updated`) are persisted in `audit_logs` and inspectable by admins in `AdminConsoleModule`.

---

## 14. Fixed Issues Summary

1. Removed anonymous user fallback in `get_current_user()` (eliminated authentication bypass).
2. Removed hardcoded development JWT secret and seeded plaintext password; upgraded password hashing to `Argon2id`.
3. Implemented `firebase/auth` + `firebase-admin` Google OAuth 2.0 / OIDC flow with `firebase_uid` deduplication and conflict protection.
4. Added `access` + `refresh` token rotation and `token_version` immediate server-side revocation on logout/disable/role change.
5. Added server-side `user` / `admin` RBAC (`require_admin`) and `AdminConsoleModule`.
6. Enforced `get_owned_repo()` across every repository-scoped endpoint (eliminated cross-user IDOR).
7. Removed client-side `GEMINI_API_KEY` storage/headers; restricted Gemini access strictly to server environment.
8. Added `_sanitize_repo_relpath()`, symlink rejection, compression-ratio ZIP-bomb guard, and `413` request size limit.
9. Added `SecurityHardeningMiddleware` (CSP, HSTS, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options: DENY`, `Cache-Control: no-store`, `X-Request-ID`) and `SlidingWindowRateLimiter`.
10. Upgraded visual engine to near-extremal 6-tier Kerr rotation, 6 ultra-fine particle systems, trajectory-verified Event Horizon ingestion, Full-Screen Cosmic Shockwave, and crystal-clear `0.36`-alpha dynamic glass.

---

## 15. Remaining Risks

1. **Chat-Exposed Gemini Key (`NEEDS CONFIGURATION`)**: The `GEMINI_API_KEY` shared earlier in conversation history must be rotated in Google Cloud Console before public launch.
2. **External Production Backing Services (`NEEDS CONFIGURATION`)**: Live Google Sign-In requires Firebase project keys; multi-instance rate limiting requires `REDIS_URL`; production persistence requires a TLS-enabled PostgreSQL + `pgvector` database (`DATABASE_URL`).
3. **Bearer Token Storage Trade-Off (`ACCEPTED RISK` for Cross-Origin SPA MVP)**: Short-lived (30m) access tokens are held in client storage to support cross-origin Vercel -> Render/Railway deployments where third-party cookies are blocked by modern browsers, mitigated by strict CSP, zero `dangerouslySetInnerHTML`, `token_version` server-side revocation, and `no-store` caching. Deploying frontend and API under a single parent domain enables migrating refresh tokens to `HttpOnly; Secure; SameSite=Strict` cookies in v2.2.

---

## 16. Pre-Launch Checklist

- [ ] **Rotate `GEMINI_API_KEY`** in Google Cloud Console (`projects/1030371811567`) and set the new key strictly in your backend host's secret manager.
- [ ] **Create/Configure Firebase Project**: Enable Google Sign-In provider, add your production domain to Firebase Authorized Domains, set `VITE_FIREBASE_*` on Vercel, and set `FIREBASE_PROJECT_ID` + `FIREBASE_SERVICE_ACCOUNT_JSON` on Render/Railway.
- [ ] **Provision Managed PostgreSQL + `pgvector`** (e.g., Supabase / Neon / Railway Postgres) with SSL enabled and set `DATABASE_URL`.
- [ ] **Provision Managed Redis** (if running `> 1` backend worker/replica) and set `REDIS_URL`.
- [ ] **Set Production Environment Variables**: `APP_ENV=production`, `DEBUG=false`, strong 48+ char `JWT_SECRET_KEY`, `FRONTEND_URL=https://<your-domain>`, `CORS_ALLOWED_ORIGINS=https://<your-domain>`, and `INITIAL_ADMIN_EMAIL=<your-admin-email>`.
- [ ] **Verify Live OAuth & Headers Post-Deploy**: Confirm `GET /api/health` returns `200` with HSTS/CSP headers, `/docs` returns `404`, and live Google Sign-In completes end-to-end.
