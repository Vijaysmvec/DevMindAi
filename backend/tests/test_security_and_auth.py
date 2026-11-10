import io
import zipfile
from pathlib import Path
from typing import Any

import httpx
import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from backend.app.auth import create_access_token, get_firebase_verifier, hash_password
from backend.app.config import settings, validate_startup_config
from backend.app.database import Base, configure_sqlite_foreign_keys, get_db
from backend.app.main import app
from backend.app.models import AuditLog, User
from backend.app.security_middleware import rate_limiter, redact_secrets


@pytest_asyncio.fixture()
async def test_env(tmp_path: Path):
    db_file = tmp_path / "test_singularity_security.db"
    engine = create_async_engine(f"sqlite+aiosqlite:///{db_file.as_posix()}", future=True)
    configure_sqlite_foreign_keys(engine)
    SessionTesting = async_sessionmaker(bind=engine, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async def override_get_db():
        async with SessionTesting() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    rate_limiter.reset()

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client, SessionTesting

    app.dependency_overrides.clear()
    rate_limiter.reset()
    await engine.dispose()


@pytest.mark.asyncio
async def test_unauthenticated_endpoints_deny_by_default_and_emit_security_headers(test_env):
    client, _ = test_env

    health = await client.get("/api/health", headers={"X-Request-ID": "req_health_check_01"})
    assert health.status_code == 200
    assert health.headers["X-Request-ID"] == "req_health_check_01"
    assert health.headers["X-Content-Type-Options"] == "nosniff"
    assert health.headers["X-Frame-Options"] == "DENY"
    assert "max-age=63072000" in health.headers["Strict-Transport-Security"]
    assert "default-src 'self'" in health.headers["Content-Security-Policy"]
    assert health.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert "camera=()" in health.headers["Permissions-Policy"]
    assert "no-store" in health.headers["Cache-Control"]

    for protected_url in ("/api/repos", "/api/chat/history", "/api/admin/users", "/api/settings/visual"):
        res = await client.get(protected_url)
        assert res.status_code == 401, f"Expected 401 for {protected_url}, got {res.status_code}"


@pytest.mark.asyncio
async def test_google_oauth_signup_deduplication_and_uid_conflict_guard(test_env):
    client, _ = test_env

    mock_claims: dict[str, Any] = {
        "uid": "firebase-google-uid-001",
        "email": "astra.nova@example.com",
        "email_verified": True,
        "name": "Astra Nova",
        "picture": "https://lh3.googleusercontent.com/a/avatar123",
    }
    app.dependency_overrides[get_firebase_verifier] = lambda: (lambda _tok: mock_claims)

    # First Google login creates account
    first = await client.post("/api/auth/google", json={"id_token": "x" * 32})
    assert first.status_code == 200
    body1 = first.json()
    assert body1["is_new_user"] is True
    assert body1["user"]["provider"] == "google"
    assert body1["user"]["role"] == "user"
    assert body1["user"]["firebase_uid"] == "firebase-google-uid-001"
    uid_db = body1["user"]["id"]

    # Second Google login with same firebase_uid reuses exact same user (no duplicate!)
    second = await client.post("/api/auth/google", json={"id_token": "y" * 32})
    assert second.status_code == 200
    body2 = second.json()
    assert body2["is_new_user"] is False
    assert body2["user"]["id"] == uid_db

    # Attempting to claim the same email with a DIFFERENT firebase_uid is blocked (409)
    mock_claims["uid"] = "different-attacker-firebase-uid"
    conflict = await client.post("/api/auth/google", json={"id_token": "z" * 32})
    assert conflict.status_code == 409


@pytest.mark.asyncio
async def test_argon2id_lifecycle_mass_assignment_revocation_and_deletion(test_env):
    client, SessionTesting = test_env

    # Mass assignment attempt ('role': 'admin') rejected by ConfigDict(extra='forbid')
    forbid_res = await client.post(
        "/api/auth/register",
        json={
            "email": "hacker@example.com",
            "username": "Hacker",
            "password": "StrongPassword!2026",
            "role": "admin",
        },
    )
    assert forbid_res.status_code == 422

    # Legitimate registration
    reg = await client.post(
        "/api/auth/register",
        json={
            "email": "engineer@example.com",
            "username": "Core Engineer",
            "password": "StrongPassword!2026",
        },
    )
    assert reg.status_code == 200
    data = reg.json()
    access = data["access_token"]
    refresh = data["refresh_token"]
    user_id = data["user"]["id"]
    assert data["user"]["role"] == "user"

    # Verify Argon2id hash stored in DB (never plaintext)
    async with SessionTesting() as db:
        u = (await db.execute(select(User).where(User.id == user_id))).scalar_one()
        assert u.password_hash is not None
        assert u.password_hash.startswith("$argon2id$")

    # Unsafe non-HTTPS avatar URL rejected
    bad_pic = await client.patch(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {access}"},
        json={"photo_url": "javascript:alert(1)"},
    )
    assert bad_pic.status_code == 422

    # Valid profile update succeeds
    upd = await client.patch(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {access}"},
        json={"display_name": "Principal Engineer", "photo_url": "https://cdn.example.com/p.png"},
    )
    assert upd.status_code == 200
    assert upd.json()["display_name"] == "Principal Engineer"

    # Refresh flow rotates valid session tokens
    ref_res = await client.post("/api/auth/refresh", json={"refresh_token": refresh})
    assert ref_res.status_code == 200
    new_access = ref_res.json()["access_token"]

    # Logout increments token_version and immediately revokes both access and refresh tokens
    out = await client.post("/api/auth/logout", headers={"Authorization": f"Bearer {new_access}"})
    assert out.status_code == 200

    after_logout = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {new_access}"})
    assert after_logout.status_code == 401
    revoked_refresh = await client.post("/api/auth/refresh", json={"refresh_token": refresh})
    assert revoked_refresh.status_code == 401

    # Re-login and delete account cleanly
    relogin = await client.post(
        "/api/auth/login",
        json={"email": "engineer@example.com", "password": "StrongPassword!2026"},
    )
    assert relogin.status_code == 200
    fresh_token = relogin.json()["access_token"]

    del_res = await client.delete("/api/auth/me", headers={"Authorization": f"Bearer {fresh_token}"})
    assert del_res.status_code == 200
    gone = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {fresh_token}"})
    assert gone.status_code == 401


@pytest.mark.asyncio
async def test_admin_rbac_disabled_account_enforcement_and_audit_logs(test_env):
    client, SessionTesting = test_env

    # Create standard user & admin user
    u_resp = await client.post(
        "/api/auth/register",
        json={"email": "member@example.com", "username": "Member", "password": "MemberPassword!2026"},
    )
    member_token = u_resp.json()["access_token"]
    member_id = u_resp.json()["user"]["id"]

    async with SessionTesting() as db:
        admin = User(
            email="secops-admin@example.com",
            username="SecOps Admin",
            display_name="SecOps Admin",
            provider="local",
            role="admin",
            account_status="active",
            password_hash=hash_password("AdminPassword!2026"),
        )
        db.add(admin)
        await db.commit()
        await db.refresh(admin)
        admin_token = create_access_token(admin)
        admin_id = admin.id

    # Non-admin user receives 403 on admin endpoints
    denied = await client.get("/api/admin/users", headers={"Authorization": f"Bearer {member_token}"})
    assert denied.status_code == 403

    # Admin lists users and audit logs (confirming denied attempt was logged)
    users_list = await client.get("/api/admin/users", headers={"Authorization": f"Bearer {admin_token}"})
    assert users_list.status_code == 200
    assert len(users_list.json()) >= 2

    logs_res = await client.get("/api/admin/audit-logs", headers={"Authorization": f"Bearer {admin_token}"})
    assert logs_res.status_code == 200
    assert any(entry["event_type"] == "authz.admin_denied" for entry in logs_res.json())

    # Admin cannot disable own account
    self_disable = await client.patch(
        f"/api/admin/users/{admin_id}/status",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"account_status": "disabled"},
    )
    assert self_disable.status_code == 400

    # Admin disables member -> member token and login are immediately rejected with 403
    dis = await client.patch(
        f"/api/admin/users/{member_id}/status",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"account_status": "disabled"},
    )
    assert dis.status_code == 200
    assert dis.json()["account_status"] == "disabled"

    blocked_api = await client.get("/api/repos", headers={"Authorization": f"Bearer {member_token}"})
    assert blocked_api.status_code == 403

    blocked_login = await client.post(
        "/api/auth/login",
        json={"email": "member@example.com", "password": "MemberPassword!2026"},
    )
    assert blocked_login.status_code == 403


@pytest.mark.asyncio
async def test_cross_user_idor_isolation_across_all_repository_endpoints(test_env):
    client, SessionTesting = test_env

    u1 = await client.post(
        "/api/auth/register",
        json={"email": "alice@example.com", "username": "Alice", "password": "AlicePassword!2026"},
    )
    u2 = await client.post(
        "/api/auth/register",
        json={"email": "bob@example.com", "username": "Bob", "password": "BobPassword!2026"},
    )
    tok_alice = u1.json()["access_token"]
    tok_bob = u2.json()["access_token"]

    repo_res = await client.post(
        "/api/repos/create",
        headers={"Authorization": f"Bearer {tok_alice}"},
        json={
            "name": "Alice Private Core",
            "description": "Confidential engine",
            "files": [{"path": "src/secret_algo.py", "content": "def compute():\n    return 42\n"}],
        },
    )
    assert repo_res.status_code == 200
    alice_repo_id = repo_res.json()["id"]

    # Bob cannot see Alice's repository in list
    bob_list = await client.get("/api/repos", headers={"Authorization": f"Bearer {tok_bob}"})
    assert bob_list.status_code == 200
    assert bob_list.json() == []

    # Direct IDOR attempts by Bob on Alice's repo_id all fail with 403
    bob_headers = {"Authorization": f"Bearer {tok_bob}"}
    assert (await client.get(f"/api/repos/{alice_repo_id}/files", headers=bob_headers)).status_code == 403
    assert (await client.delete(f"/api/repos/{alice_repo_id}", headers=bob_headers)).status_code == 403
    assert (await client.get(f"/api/architecture/{alice_repo_id}", headers=bob_headers)).status_code == 403
    assert (await client.get(f"/api/security/repo-audit/{alice_repo_id}", headers=bob_headers)).status_code == 403
    assert (
        await client.post(
            "/api/docs-gen/generate",
            headers=bob_headers,
            json={"repo_id": alice_repo_id, "doc_type": "architecture_guide"},
        )
    ).status_code == 403
    assert (
        await client.post(
            "/api/chat/send",
            headers=bob_headers,
            json={"message": "Leak Alice code", "repo_id": alice_repo_id},
        )
    ).status_code == 403

    async with SessionTesting() as db:
        idor_logs = (
            await db.execute(select(AuditLog).where(AuditLog.event_type == "authz.idor_blocked"))
        ).scalars().all()
        assert len(idor_logs) >= 6


@pytest.mark.asyncio
async def test_zip_slip_zip_bomb_payload_ceiling_and_rate_limiting(test_env):
    client, _ = test_env

    reg = await client.post(
        "/api/auth/register",
        json={"email": "uploader@example.com", "username": "Uploader", "password": "UploadPassword!2026"},
    )
    headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}

    # 1. Path traversal in JSON repo create -> 400
    trav = await client.post(
        "/api/repos/create",
        headers=headers,
        json={"name": "BadRepo", "files": [{"path": "../../etc/passwd", "content": "root:x:0:0"}]},
    )
    assert trav.status_code == 400

    # 2. ZIP-Slip archive -> 400
    slip_buf = io.BytesIO()
    with zipfile.ZipFile(slip_buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("../../escape.py", "print('pwned')")
    slip_res = await client.post(
        "/api/repos/upload-zip",
        headers=headers,
        data={"name": "ZipSlipTest"},
        files={"file": ("slip.zip", slip_buf.getvalue(), "application/zip")},
    )
    assert slip_res.status_code == 400

    # 3. High-compression-ratio ZIP bomb (> 50x ratio, > 64KB uncompressed) -> 400
    bomb_buf = io.BytesIO()
    with zipfile.ZipFile(bomb_buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("bomb.py", "A" * 300_000)
    bomb_res = await client.post(
        "/api/repos/upload-zip",
        headers=headers,
        data={"name": "ZipBombTest"},
        files={"file": ("bomb.zip", bomb_buf.getvalue(), "application/zip")},
    )
    assert bomb_res.status_code == 400
    assert "compression ratio" in bomb_res.json()["detail"].lower()

    # 4. Oversized request payload ceiling -> 413
    oversized = await client.post(
        "/api/auth/login",
        content=b"{}",
        headers={
            "Content-Type": "application/json",
            "Content-Length": str(settings.MAX_REQUEST_BYTES + 1024),
        },
    )
    assert oversized.status_code == 413

    # 5. Sliding-window rate limiter -> 429 + Retry-After header
    rate_limiter.reset()
    statuses = []
    retry_after_header = None
    for _ in range(14):
        r = await client.post(
            "/api/auth/login",
            json={"email": "nobody@example.com", "password": "wrongpassword"},
        )
        statuses.append(r.status_code)
        if r.status_code == 429:
            retry_after_header = r.headers.get("Retry-After")
            break

    assert 429 in statuses
    assert retry_after_header is not None and int(retry_after_header) >= 1


def test_production_startup_validation_secret_redaction_and_dev_session_guard(monkeypatch):
    # Fails closed when production config is incomplete or unsafe
    with pytest.raises(RuntimeError, match="Production environment validation failed"):
        validate_startup_config(
            {
                "APP_ENV": "production",
                "DEBUG": "true",
                "JWT_SECRET_KEY": "short",
                "DATABASE_URL": "sqlite+aiosqlite:///./bad.db",
                "FRONTEND_URL": "http://insecure.example.com",
                "CORS_ALLOWED_ORIGINS": "*",
            }
        )

    # Succeeds cleanly when all production security requirements are met
    notices = validate_startup_config(
        {
            "APP_ENV": "production",
            "DEBUG": "false",
            "JWT_SECRET_KEY": "S" * 48,
            "DATABASE_URL": "postgresql+asyncpg://user:pass@db.example.com:5432/devmind",
            "GEMINI_API_KEY": "AIzaSyntheticTestFixtureValue0000000001",
            "GEMINI_MODEL": "gemini-3.5-flash",
            "FRONTEND_URL": "https://singularity.devmind.ai",
            "CORS_ALLOWED_ORIGINS": "https://singularity.devmind.ai",
            "FIREBASE_PROJECT_ID": "devmind-singularity-prod",
        }
    )
    assert notices == []

    # Secret redaction strips API keys, tokens, and credential JSON fields
    raw_log = (
        'key=AQ.SyntheticRedactionFixtureToken000001 auth="Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" '
        '{"password": "MySecretPassword123", "id_token": "eyJ0eXAiOiJKV1QifQ"}'
    )
    redacted = redact_secrets(raw_log)
    assert "SyntheticRedactionFixtureToken" not in redacted
    assert "MySecretPassword123" not in redacted
    assert "eyJhbGciOi" not in redacted
    assert "[REDACTED" in redacted


@pytest.mark.asyncio
async def test_dev_session_endpoint_disabled_in_production(test_env, monkeypatch):
    client, _ = test_env
    monkeypatch.setattr(settings, "APP_ENV", "production")
    res = await client.post("/api/auth/dev-session")
    assert res.status_code == 404
