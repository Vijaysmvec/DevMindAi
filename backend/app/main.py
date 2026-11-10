import asyncio
import io
import json
import os
import re
import zipfile
from contextlib import asynccontextmanager
from pathlib import PurePosixPath
from typing import Any, Callable, Literal

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import delete, desc, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from .auth import (
    create_access_token,
    create_refresh_token,
    decode_jwt_token,
    get_current_user,
    get_firebase_verifier,
    hash_password,
    record_audit_event,
    require_admin,
    verify_password,
)
from .config import settings, validate_startup_config
from .database import AsyncSessionLocal, get_db, init_db
from .models import (
    AuditLog,
    ChatMessage,
    CodeChunk,
    GeneratedDoc,
    MemoryNode,
    ModelTelemetry,
    RepoFile,
    Repository,
    SecurityScanRecord,
    User,
    UserVisualSettings,
    utcnow,
)
from .security_middleware import (
    SecurityHardeningMiddleware,
    emit_structured_log,
    limit_by_ip,
    rate_limiter,
    resolve_client_ip,
)
from .seed import STARTER_FILES, seed_initial_workspace
from .services.code_parser import parse_repository_file
from .services.gemini_service import (
    analyze_code_review,
    generate_chat_answer,
    get_effective_active_model,
    synthesize_documentation,
)
from .services.security_engine import audit_repository_files, scan_prompt_shield
from .services.vector_engine import embed_text, rank_by_similarity

EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")
SAFE_URL_RE = re.compile(r"^https://[A-Za-z0-9.\-_/~:%?=&+#]+$")


@asynccontextmanager
async def lifespan(app: FastAPI):
    notices = validate_startup_config()
    for note in notices:
        emit_structured_log("startup.config_notice", message=note)
    await init_db()
    async with AsyncSessionLocal() as session:
        await seed_initial_workspace(session)
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    debug=settings.DEBUG,
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None if settings.is_production else "/redoc",
    openapi_url=None if settings.is_production else "/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(SecurityHardeningMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    expose_headers=["X-Request-ID", "Retry-After"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    req_id = getattr(request.state, "request_id", "unknown")
    emit_structured_log(
        "http.unhandled_exception",
        request_id=req_id,
        path=request.url.path,
        error_type=type(exc).__name__,
        error_msg=str(exc),
    )
    return JSONResponse(
        status_code=500,
        content={
            "detail": "An unexpected server error occurred.",
            "request_id": req_id,
        },
        headers={"X-Request-ID": req_id},
    )


# ----------------------------
# Rate Limit Helpers (Per-User + Per-IP)
# ----------------------------
def limit_authenticated(scope: str, max_requests: int, window_seconds: int = 60):
    async def _dep(request: Request, user: User = Depends(get_current_user)) -> User:
        ip = getattr(request.state, "client_ip", None) or resolve_client_ip(request)
        await rate_limiter.check(scope, f"user:{user.id}:ip:{ip}", max_requests, window_seconds)
        return user

    return _dep


# ----------------------------
# Strict Pydantic Schemas (extra="forbid")
# ----------------------------
class GoogleAuthRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id_token: str = Field(..., min_length=20, max_length=8192)


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str = Field(..., min_length=5, max_length=254)
    username: str = Field(..., min_length=2, max_length=80)
    password: str = Field(..., min_length=10, max_length=128)

    @field_validator("email")
    @classmethod
    def validate_email_fmt(cls, v: str) -> str:
        norm = v.strip().lower()
        if not EMAIL_RE.match(norm):
            raise ValueError("Invalid email address format")
        return norm


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str = Field(..., min_length=5, max_length=254)
    password: str = Field(..., min_length=1, max_length=128)


class RefreshTokenRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    refresh_token: str = Field(..., min_length=20, max_length=4096)


class ProfileUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    display_name: str | None = Field(default=None, min_length=2, max_length=120)
    photo_url: str | None = Field(default=None, max_length=500)

    @field_validator("photo_url")
    @classmethod
    def validate_photo_url(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return None
        if not SAFE_URL_RE.match(v.strip()):
            raise ValueError("Profile photo URL must use https://")
        return v.strip()


class AdminUserUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    account_status: Literal["active", "disabled"] | None = None
    role: Literal["user", "admin"] | None = None


class VisualSettingsPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mode: Literal["cinematic", "focus"] = "cinematic"
    background_animation: bool = True
    black_hole_rotation_intensity: float = Field(default=1.0, ge=0.0, le=2.5)
    background_pulse_intensity: float = Field(default=1.0, ge=0.0, le=2.5)
    gravitational_cursor_strength: float = Field(default=1.0, ge=0.0, le=2.5)
    particle_density: float = Field(default=1.0, ge=0.05, le=2.5)
    glass_transparency: float = Field(default=0.08, ge=0.02, le=0.92)
    dynamic_glass_reflections: bool = True
    text_deletion_animation: bool = True
    undo_reversal_animation: bool = True
    energy_pulses: bool = True
    graphics_quality: Literal["low", "medium", "high", "ultra", "auto"] = "auto"
    reduced_motion: bool = False


class FileInputItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    path: str = Field(..., min_length=1, max_length=320)
    content: str = Field(..., max_length=300_000)


class CreateRepoRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(..., min_length=1, max_length=120)
    description: str = Field(default="", max_length=1000)
    files: list[FileInputItem] = Field(..., min_length=1, max_length=120)


class ChatSendRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: str = Field(..., min_length=1, max_length=12_000)
    repo_id: int | None = None
    simulate_error: bool = False


class CodeReviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    repo_id: int | None = None
    file_path: str = Field(default="snippet.ts", min_length=1, max_length=320)
    code: str | None = Field(default=None, max_length=250_000)


class PromptShieldScanRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    prompt: str = Field(..., min_length=1, max_length=16_000)
    repo_id: int | None = None


class MemoryCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(..., min_length=1, max_length=200)
    content: str = Field(..., min_length=1, max_length=10_000)
    category: str = Field(default="architecture", min_length=1, max_length=64)
    tags: list[str] = Field(default_factory=list, max_length=16)
    importance: float = Field(default=0.85, ge=0.0, le=1.0)
    repo_id: int | None = None


class DocsGenerateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    repo_id: int
    doc_type: Literal[
        "architecture_guide",
        "api_reference",
        "onboarding_handbook",
        "onboarding_runbook",
        "security_runbook",
        "security_governance",
    ] = "architecture_guide"


class ModelDoctorDiagnoseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sample_prompt: str = Field(
        default="Explain how GravitationalLens bends starlight around the EventHorizon.",
        min_length=3,
        max_length=4000,
    )
    temperature: float = Field(default=0.35, ge=0.0, le=2.0)


# ----------------------------
# Serialization & Ownership Helpers
# ----------------------------
def _serialize_user(u: User) -> dict[str, Any]:
    return {
        "id": u.id,
        "firebase_uid": u.firebase_uid,
        "email": u.email,
        "username": u.display_name or u.username,
        "display_name": u.display_name or u.username,
        "photo_url": u.photo_url,
        "provider": u.provider,
        "role": u.role,
        "account_status": u.account_status,
        "created_at": u.created_at.isoformat() if u.created_at else None,
        "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
    }


def _serialize_visual_settings(vis: UserVisualSettings) -> dict[str, Any]:
    return {
        "mode": vis.mode,
        "background_animation": vis.background_animation,
        "black_hole_rotation_intensity": vis.black_hole_rotation_intensity,
        "background_pulse_intensity": vis.background_pulse_intensity,
        "gravitational_cursor_strength": vis.gravitational_cursor_strength,
        "particle_density": vis.particle_density,
        "glass_transparency": vis.glass_transparency,
        "dynamic_glass_reflections": vis.dynamic_glass_reflections,
        "text_deletion_animation": vis.text_deletion_animation,
        "undo_reversal_animation": vis.undo_reversal_animation,
        "energy_pulses": vis.energy_pulses,
        "graphics_quality": vis.graphics_quality,
        "reduced_motion": vis.reduced_motion,
    }


def _sanitize_repo_relpath(raw_path: str) -> str:
    """
    Part G Section 11.5: Strict Path Traversal & ZIP-Slip Validator.
    Rejects null bytes, Windows drive letters, absolute roots, and '..' traversal segments.
    """
    if not raw_path or "\x00" in raw_path:
        raise HTTPException(status_code=400, detail="Unsafe file path rejected")

    norm = raw_path.replace("\\", "/").strip()
    if norm.startswith("/") or re.match(r"^[A-Za-z]:", norm):
        raise HTTPException(status_code=400, detail="Absolute or drive-qualified file paths are forbidden")

    posix = PurePosixPath(norm)
    parts = posix.parts
    if not parts or any(p in ("..", "") for p in parts):
        raise HTTPException(status_code=400, detail="Path traversal ('..') segments are forbidden")

    clean = "/".join(parts)
    if len(clean) > 320:
        raise HTTPException(status_code=400, detail="File path exceeds maximum allowed length")
    return clean


async def get_owned_repo(
    repo_id: int,
    user: User,
    request: Request,
    db: AsyncSession,
) -> Repository:
    """
    Part G Section 11.4: Deny-by-default per-user project ownership check (prevents IDOR).
    """
    res = await db.execute(select(Repository).where(Repository.id == repo_id))
    repo = res.scalar_one_or_none()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    if repo.user_id != user.id:
        await record_audit_event(
            db,
            request,
            event_type="authz.idor_blocked",
            user_id=user.id,
            target_resource=f"repository:{repo_id}",
            status_str="denied",
        )
        await db.commit()
        raise HTTPException(status_code=403, detail="Access denied: repository belongs to another user")
    return repo


# ----------------------------
# Health & System Telemetry
# ----------------------------
@app.get("/api/health")
async def health_check():
    return {
        "status": "singularity_online",
        "version": settings.VERSION,
        "environment": settings.APP_ENV,
        "database_mode": "postgresql+pgvector" if settings.is_postgres else "sqlite+vector_hybrid",
        "gemini_configured": bool(settings.get_gemini_key()),
        "gemini_model": get_effective_active_model(),
        "firebase_configured": bool(settings.FIREBASE_PROJECT_ID),
    }


# ----------------------------
# Part E & F: Google Authentication & Account Lifecycle
# ----------------------------
@app.post("/api/auth/google", dependencies=[Depends(limit_by_ip("auth_google", 15, 60))])
async def authenticate_with_google(
    payload: GoogleAuthRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    firebase_verifier: Callable[[str], dict[str, Any]] = Depends(get_firebase_verifier),
):
    claims = firebase_verifier(payload.id_token)
    firebase_uid = str(claims.get("uid") or claims.get("sub")).strip()
    email = str(claims.get("email") or "").strip().lower()
    raw_name = str(claims.get("name") or email.split("@")[0]).strip()[:120]
    picture = claims.get("picture")
    safe_photo = picture.strip()[:500] if isinstance(picture, str) and SAFE_URL_RE.match(picture.strip()) else None

    # 1. Lookup strictly by stable external provider identity (firebase_uid) first
    res_uid = await db.execute(select(User).where(User.firebase_uid == firebase_uid))
    user = res_uid.scalar_one_or_none()
    is_new_user = False

    if user is None:
        # Check if an existing unlinked account shares this verified email
        res_email = await db.execute(select(User).where(User.email == email))
        existing_by_email = res_email.scalar_one_or_none()
        if existing_by_email is not None:
            if existing_by_email.firebase_uid and existing_by_email.firebase_uid != firebase_uid:
                await record_audit_event(
                    db,
                    request,
                    event_type="auth.google_uid_conflict",
                    user_id=existing_by_email.id,
                    status_str="denied",
                )
                await db.commit()
                raise HTTPException(status_code=409, detail="Email is already bound to a different external identity")
            user = existing_by_email
            user.firebase_uid = firebase_uid
            user.provider = "google"
        else:
            is_new_user = True
            initial_role = (
                "admin"
                if settings.INITIAL_ADMIN_EMAIL and email == settings.INITIAL_ADMIN_EMAIL
                else "user"
            )
            user = User(
                firebase_uid=firebase_uid,
                email=email,
                username=raw_name,
                display_name=raw_name,
                photo_url=safe_photo,
                provider="google",
                role=initial_role,
                account_status="active",
                password_hash=None,
                last_login_at=utcnow(),
            )
            db.add(user)
            await db.flush()
            db.add(UserVisualSettings(user_id=user.id, glass_transparency=0.08))

    if user.account_status == "disabled":
        await record_audit_event(db, request, "auth.google_disabled", user_id=user.id, status_str="denied")
        await db.commit()
        raise HTTPException(status_code=403, detail="Account has been disabled by an administrator")

    if user.account_status == "deleted":
        raise HTTPException(status_code=403, detail="Account has been deleted")

    # Sync latest profile metadata & login timestamp without overwriting role
    user.email = email
    if safe_photo and not user.photo_url:
        user.photo_url = safe_photo
    user.last_login_at = utcnow()

    await record_audit_event(
        db,
        request,
        event_type="auth.google_signup" if is_new_user else "auth.google_login",
        user_id=user.id,
        details={"provider": "google", "is_new_user": is_new_user},
    )
    await db.commit()
    await db.refresh(user)

    return {
        "access_token": create_access_token(user),
        "refresh_token": create_refresh_token(user),
        "is_new_user": is_new_user,
        "user": _serialize_user(user),
    }


@app.post("/api/auth/register", dependencies=[Depends(limit_by_ip("auth_register", 10, 60))])
async def register_user(
    payload: RegisterRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    email = payload.email
    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email is already registered")

    clean_name = payload.username.strip()
    initial_role = (
        "admin" if settings.INITIAL_ADMIN_EMAIL and email == settings.INITIAL_ADMIN_EMAIL else "user"
    )
    user = User(
        email=email,
        username=clean_name,
        display_name=clean_name,
        provider="local",
        role=initial_role,  # Never controllable by frontend request
        account_status="active",
        password_hash=hash_password(payload.password),
        last_login_at=utcnow(),
    )
    db.add(user)
    await db.flush()

    db.add(UserVisualSettings(user_id=user.id, glass_transparency=0.08))
    await record_audit_event(db, request, "auth.register", user_id=user.id)
    await db.commit()
    await db.refresh(user)

    return {
        "access_token": create_access_token(user),
        "refresh_token": create_refresh_token(user),
        "user": _serialize_user(user),
    }


@app.post("/api/auth/login", dependencies=[Depends(limit_by_ip("auth_login", 12, 60))])
async def login_user(
    payload: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    email = payload.email.strip().lower()
    res = await db.execute(select(User).where(User.email == email))
    user = res.scalar_one_or_none()

    if not user or user.account_status == "deleted" or not verify_password(payload.password, user.password_hash):
        await record_audit_event(
            db,
            request,
            event_type="auth.login_failed",
            user_id=user.id if user else None,
            status_str="denied",
        )
        await db.commit()
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if user.account_status == "disabled":
        await record_audit_event(db, request, "auth.login_disabled", user_id=user.id, status_str="denied")
        await db.commit()
        raise HTTPException(status_code=403, detail="Account has been disabled")

    user.last_login_at = utcnow()
    await record_audit_event(db, request, "auth.login", user_id=user.id)
    await db.commit()
    await db.refresh(user)

    return {
        "access_token": create_access_token(user),
        "refresh_token": create_refresh_token(user),
        "user": _serialize_user(user),
    }


@app.post("/api/auth/refresh", dependencies=[Depends(limit_by_ip("auth_refresh", 25, 60))])
async def refresh_session(
    payload: RefreshTokenRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    decoded = decode_jwt_token(payload.refresh_token, expected_type="refresh")
    user_id = int(decoded["sub"])
    res = await db.execute(select(User).where(User.id == user_id))
    user = res.scalar_one_or_none()

    if not user or user.account_status != "active":
        raise HTTPException(status_code=401, detail="Account is not active")
    if int(decoded.get("ver", -1)) != user.token_version:
        raise HTTPException(status_code=401, detail="Refresh token has been revoked")

    return {
        "access_token": create_access_token(user),
        "refresh_token": create_refresh_token(user),
        "user": _serialize_user(user),
    }


@app.post("/api/auth/logout")
async def logout_session(
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user.token_version += 1
    await record_audit_event(db, request, "auth.logout", user_id=user.id)
    await db.commit()
    return {"logged_out": True}


@app.post("/api/auth/dev-session", dependencies=[Depends(limit_by_ip("auth_dev", 30, 60))])
async def create_local_dev_session(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Development-only workstation session bootstrapper.
    Strictly disabled (404) in staging and production environments.
    """
    if settings.is_production:
        raise HTTPException(status_code=404, detail="Not found")

    res = await db.execute(select(User).where(User.email == "commander@devmind.ai"))
    user = res.scalar_one_or_none()
    if not user or user.account_status != "active":
        raise HTTPException(status_code=404, detail="Development profile unavailable")

    user.last_login_at = utcnow()
    await record_audit_event(db, request, "auth.dev_session", user_id=user.id)
    await db.commit()
    await db.refresh(user)

    return {
        "access_token": create_access_token(user),
        "refresh_token": create_refresh_token(user),
        "user": _serialize_user(user),
    }


@app.get("/api/auth/me")
async def current_user_profile(user: User = Depends(get_current_user)):
    return _serialize_user(user)


@app.patch("/api/auth/me")
async def update_user_profile(
    payload: ProfileUpdateRequest,
    request: Request,
    user: User = Depends(limit_authenticated("profile_update", 20, 60)),
    db: AsyncSession = Depends(get_db),
):
    if payload.display_name is not None:
        clean = payload.display_name.strip()
        user.display_name = clean
        user.username = clean
    if "photo_url" in payload.model_fields_set:
        user.photo_url = payload.photo_url

    await record_audit_event(db, request, "auth.profile_updated", user_id=user.id)
    await db.commit()
    await db.refresh(user)
    return _serialize_user(user)


@app.delete("/api/auth/me")
async def delete_own_account(
    request: Request,
    user: User = Depends(limit_authenticated("account_delete", 5, 60)),
    db: AsyncSession = Depends(get_db),
):
    uid = user.id
    repo_ids_res = await db.execute(select(Repository.id).where(Repository.user_id == uid))
    repo_ids = [r[0] for r in repo_ids_res.all()]

    # Delete user-scoped dependent rows BEFORE deleting parent repositories (strict FK ordering)
    await db.execute(delete(ChatMessage).where(ChatMessage.user_id == uid))
    await db.execute(delete(MemoryNode).where(MemoryNode.user_id == uid))
    await db.execute(delete(SecurityScanRecord).where(SecurityScanRecord.user_id == uid))
    await db.execute(delete(ModelTelemetry).where(ModelTelemetry.user_id == uid))
    await db.execute(delete(UserVisualSettings).where(UserVisualSettings.user_id == uid))

    if repo_ids:
        await db.execute(delete(CodeChunk).where(CodeChunk.repo_id.in_(repo_ids)))
        await db.execute(delete(RepoFile).where(RepoFile.repo_id.in_(repo_ids)))
        await db.execute(delete(GeneratedDoc).where(GeneratedDoc.repo_id.in_(repo_ids)))
        await db.execute(delete(Repository).where(Repository.id.in_(repo_ids)))

    user.account_status = "deleted"
    user.token_version += 1
    user.firebase_uid = None
    user.password_hash = None
    user.photo_url = None
    user.display_name = "Deleted User"
    user.username = "Deleted User"
    user.email = f"deleted-{uid}-{int(utcnow().timestamp())}@deleted.invalid"

    await record_audit_event(db, request, "auth.account_deleted", user_id=uid)
    await db.commit()
    return {"deleted": True}


# ----------------------------
# Part E & G: Protected Administrative Endpoints
# ----------------------------
@app.get("/api/admin/users")
async def admin_list_users(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=10_000),
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    _ = admin_user
    res = await db.execute(select(User).order_by(desc(User.created_at)).offset(offset).limit(limit))
    return [_serialize_user(u) for u in res.scalars().all()]


@app.patch("/api/admin/users/{target_user_id}/status")
async def admin_update_user_status(
    target_user_id: int,
    payload: AdminUserUpdateRequest,
    request: Request,
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(User).where(User.id == target_user_id))
    target = res.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Target user not found")

    if target.id == admin_user.id and (payload.account_status == "disabled" or payload.role == "user"):
        raise HTTPException(status_code=400, detail="Administrators cannot disable or demote their own active session")

    changes: dict[str, str] = {}
    if payload.account_status is not None:
        target.account_status = payload.account_status
        changes["account_status"] = payload.account_status
        if payload.account_status == "disabled":
            target.token_version += 1

    if payload.role is not None:
        target.role = payload.role
        changes["role"] = payload.role
        target.token_version += 1

    await record_audit_event(
        db,
        request,
        event_type="admin.user_updated",
        user_id=admin_user.id,
        target_resource=f"user:{target.id}",
        details=changes,
    )
    await db.commit()
    await db.refresh(target)
    return _serialize_user(target)


@app.get("/api/admin/audit-logs")
async def admin_list_audit_logs(
    limit: int = Query(default=50, ge=1, le=100),
    admin_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    _ = admin_user
    res = await db.execute(select(AuditLog).order_by(desc(AuditLog.created_at)).limit(limit))
    return [
        {
            "id": log.id,
            "request_id": log.request_id,
            "user_id": log.user_id,
            "event_type": log.event_type,
            "ip_address": log.ip_address,
            "target_resource": log.target_resource,
            "status": log.status,
            "details": json.loads(log.details_json or "{}"),
            "created_at": log.created_at.isoformat(),
        }
        for log in res.scalars().all()
    ]


# ----------------------------
# Persistent Visual Settings
# ----------------------------
@app.get("/api/settings/visual")
async def get_visual_settings(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(UserVisualSettings).where(UserVisualSettings.user_id == user.id))
    vis = res.scalar_one_or_none()
    if not vis:
        vis = UserVisualSettings(user_id=user.id, glass_transparency=0.08)
        db.add(vis)
        await db.commit()
        await db.refresh(vis)
    return _serialize_visual_settings(vis)


@app.put("/api/settings/visual")
async def update_visual_settings(
    payload: VisualSettingsPayload,
    user: User = Depends(limit_authenticated("visual_settings", 60, 60)),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(select(UserVisualSettings).where(UserVisualSettings.user_id == user.id))
    vis = res.scalar_one_or_none()
    if not vis:
        vis = UserVisualSettings(user_id=user.id)
        db.add(vis)

    for field_name, value in payload.model_dump().items():
        setattr(vis, field_name, value)

    await db.commit()
    await db.refresh(vis)
    return _serialize_visual_settings(vis)


# ----------------------------
# Repository Upload, Starter Provisioning & Indexing (Strict Ownership)
# ----------------------------
async def _index_repo_files(
    db: AsyncSession,
    user_id: int,
    name: str,
    description: str,
    files: list[dict[str, str]],
) -> Repository:
    repo = Repository(user_id=user_id, name=name, description=description, status="indexed")
    db.add(repo)
    await db.flush()

    lang_counts: dict[str, int] = {}
    total_symbols = 0
    total_chunks = 0

    bounded_files = files[: settings.MAX_REPO_FILES]
    for item in bounded_files:
        path = _sanitize_repo_relpath(item["path"])
        content = item["content"][:300_000]
        parsed = parse_repository_file(path, content)
        lang = parsed["language"]
        lang_counts[lang] = lang_counts.get(lang, 0) + 1
        total_symbols += len(parsed["symbols"])

        db.add(
            RepoFile(
                repo_id=repo.id,
                path=path,
                language=lang,
                content=content,
                loc=parsed["loc"],
                symbols_json=json.dumps(parsed["symbols"]),
                imports_json=json.dumps(parsed["imports"]),
                complexity_score=parsed["complexity"],
            )
        )

        for ch in parsed["chunks"]:
            vec = embed_text(f"{ch['file_path']} {ch['symbol_name']} {ch['content']}")
            chunk_kwargs = dict(
                repo_id=repo.id,
                file_path=ch["file_path"],
                start_line=ch["start_line"],
                end_line=ch["end_line"],
                symbol_name=ch["symbol_name"],
                content=ch["content"],
                embedding_json=json.dumps(vec),
            )
            if settings.is_postgres and hasattr(CodeChunk, "pg_embedding"):
                chunk_kwargs["pg_embedding"] = vec
            db.add(CodeChunk(**chunk_kwargs))
            total_chunks += 1

    repo.language_summary_json = json.dumps(lang_counts)
    repo.file_count = len(bounded_files)
    repo.symbol_count = total_symbols
    repo.chunk_count = total_chunks
    await db.commit()
    await db.refresh(repo)
    return repo


@app.get("/api/repos")
async def list_repositories(
    limit: int = Query(default=50, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(Repository)
        .where(Repository.user_id == user.id)
        .order_by(desc(Repository.created_at))
        .limit(limit)
    )
    repos = res.scalars().all()
    return [
        {
            "id": r.id,
            "name": r.name,
            "description": r.description,
            "languages": json.loads(r.language_summary_json or "{}"),
            "file_count": r.file_count,
            "symbol_count": r.symbol_count,
            "chunk_count": r.chunk_count,
            "status": r.status,
            "created_at": r.created_at.isoformat(),
        }
        for r in repos
    ]


@app.post("/api/repos/starter")
async def provision_starter_repository(
    user: User = Depends(limit_authenticated("repo_upload", 10, 60)),
    db: AsyncSession = Depends(get_db),
):
    existing_res = await db.execute(
        select(Repository).where(
            Repository.user_id == user.id,
            Repository.name == "Singularity Core Engine",
        )
    )
    existing = existing_res.scalars().first()
    if existing:
        return {
            "id": existing.id,
            "name": existing.name,
            "file_count": existing.file_count,
            "symbol_count": existing.symbol_count,
            "chunk_count": existing.chunk_count,
            "status": existing.status,
        }

    repo = await _index_repo_files(
        db=db,
        user_id=user.id,
        name="Singularity Core Engine",
        description="Reference gravitational intelligence runtime, GLSL accretion shaders, hybrid vector RAG, and PromptShield gateway.",
        files=STARTER_FILES,
    )
    return {
        "id": repo.id,
        "name": repo.name,
        "file_count": repo.file_count,
        "symbol_count": repo.symbol_count,
        "chunk_count": repo.chunk_count,
        "status": repo.status,
    }


@app.post("/api/repos/create")
async def create_repository(
    payload: CreateRepoRequest,
    request: Request,
    user: User = Depends(limit_authenticated("repo_upload", 10, 60)),
    db: AsyncSession = Depends(get_db),
):
    repo = await _index_repo_files(
        db=db,
        user_id=user.id,
        name=payload.name.strip(),
        description=payload.description.strip(),
        files=[{"path": f.path, "content": f.content} for f in payload.files],
    )
    await record_audit_event(
        db,
        request,
        event_type="repo.created",
        user_id=user.id,
        target_resource=f"repository:{repo.id}",
    )
    await db.commit()
    return {
        "id": repo.id,
        "name": repo.name,
        "file_count": repo.file_count,
        "symbol_count": repo.symbol_count,
        "chunk_count": repo.chunk_count,
        "status": repo.status,
    }


@app.post("/api/repos/upload-zip")
async def upload_repository_zip(
    request: Request,
    name: str = Form(..., min_length=1, max_length=120),
    description: str = Form("", max_length=1000),
    file: UploadFile = File(...),
    user: User = Depends(limit_authenticated("repo_upload", 8, 60)),
    db: AsyncSession = Depends(get_db),
):
    raw_bytes = await file.read(settings.MAX_ZIP_UPLOAD_BYTES + 1)
    if len(raw_bytes) > settings.MAX_ZIP_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"ZIP archive exceeds {settings.MAX_ZIP_UPLOAD_BYTES // (1024 * 1024)} MB limit",
        )

    extracted_files: list[dict[str, str]] = []
    allowed_exts = {
        ".py",
        ".ts",
        ".tsx",
        ".js",
        ".jsx",
        ".glsl",
        ".sql",
        ".md",
        ".json",
        ".css",
        ".html",
        ".go",
        ".rs",
    }
    total_uncompressed = 0

    try:
        with zipfile.ZipFile(io.BytesIO(raw_bytes)) as zf:
            infos = zf.infolist()
            if len(infos) > 500:
                raise HTTPException(status_code=400, detail="ZIP archive contains too many entries (max 500)")

            for info in infos:
                # Validate EVERY archive path against ZIP-slip BEFORE any extraction or skip checks
                clean_entry = _sanitize_repo_relpath(info.filename.rstrip("/")) if info.filename.rstrip("/") else ""
                if info.is_dir() or not clean_entry:
                    continue

                # Reject symbolic links inside ZIP archives
                is_symlink = ((info.external_attr >> 16) & 0o170000) == 0o120000
                if is_symlink:
                    raise HTTPException(status_code=400, detail="Symbolic links inside ZIP archives are forbidden")

                # ZIP-bomb compression ratio guard
                if info.file_size > 65_536:
                    ratio = info.file_size / max(1, info.compress_size)
                    if ratio > settings.MAX_ZIP_COMPRESSION_RATIO:
                        raise HTTPException(
                            status_code=400,
                            detail="ZIP archive rejected: excessive compression ratio (potential ZIP bomb)",
                        )

                if info.file_size > 250_000:
                    continue

                if any(
                    seg in ("node_modules", ".git", "__pycache__", "dist")
                    for seg in clean_entry.split("/")
                ):
                    continue

                _, ext = os.path.splitext(clean_entry.lower())
                if ext in allowed_exts:
                    with zf.open(info, "r") as member_fp:
                        data = member_fp.read(250_001)
                    if len(data) > 250_000:
                        continue
                    total_uncompressed += len(data)
                    if total_uncompressed > settings.MAX_ZIP_UNCOMPRESSED_BYTES:
                        raise HTTPException(
                            status_code=400,
                            detail="ZIP archive rejected: cumulative uncompressed size exceeds safe threshold",
                        )
                    text_data = data.decode("utf-8", errors="replace")
                    extracted_files.append({"path": clean_entry, "content": text_data})
                    if len(extracted_files) >= settings.MAX_REPO_FILES:
                        break
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Uploaded archive is not a valid ZIP file")

    if not extracted_files:
        raise HTTPException(status_code=400, detail="No supported source code files found inside ZIP archive")

    repo = await _index_repo_files(
        db=db,
        user_id=user.id,
        name=name.strip(),
        description=description.strip(),
        files=extracted_files,
    )
    await record_audit_event(
        db,
        request,
        event_type="repo.uploaded_zip",
        user_id=user.id,
        target_resource=f"repository:{repo.id}",
    )
    await db.commit()
    return {
        "id": repo.id,
        "name": repo.name,
        "file_count": repo.file_count,
        "symbol_count": repo.symbol_count,
        "chunk_count": repo.chunk_count,
        "status": repo.status,
    }


@app.get("/api/repos/{repo_id}/files")
async def get_repository_files(
    repo_id: int,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_owned_repo(repo_id, user, request, db)
    res = await db.execute(select(RepoFile).where(RepoFile.repo_id == repo_id).order_by(RepoFile.path.asc()))
    files = res.scalars().all()
    return [
        {
            "id": f.id,
            "path": f.path,
            "language": f.language,
            "loc": f.loc,
            "complexity": f.complexity_score,
            "symbols": json.loads(f.symbols_json or "[]"),
            "imports": json.loads(f.imports_json or "[]"),
            "content": f.content,
        }
        for f in files
    ]


@app.delete("/api/repos/{repo_id}")
async def delete_repository(
    repo_id: int,
    request: Request,
    user: User = Depends(limit_authenticated("repo_delete", 20, 60)),
    db: AsyncSession = Depends(get_db),
):
    await get_owned_repo(repo_id, user, request, db)
    # Clean up or unlink child records referencing repositories.id prior to deleting parent row
    await db.execute(
        delete(ChatMessage).where(ChatMessage.repo_id == repo_id, ChatMessage.user_id == user.id)
    )
    await db.execute(
        update(MemoryNode)
        .where(MemoryNode.repo_id == repo_id, MemoryNode.user_id == user.id)
        .values(repo_id=None)
    )
    await db.execute(
        update(SecurityScanRecord)
        .where(SecurityScanRecord.repo_id == repo_id, SecurityScanRecord.user_id == user.id)
        .values(repo_id=None)
    )
    await db.execute(delete(CodeChunk).where(CodeChunk.repo_id == repo_id))
    await db.execute(delete(RepoFile).where(RepoFile.repo_id == repo_id))
    await db.execute(delete(GeneratedDoc).where(GeneratedDoc.repo_id == repo_id))
    await db.execute(delete(Repository).where(Repository.id == repo_id, Repository.user_id == user.id))
    await record_audit_event(
        db,
        request,
        event_type="repo.deleted",
        user_id=user.id,
        target_resource=f"repository:{repo_id}",
    )
    await db.commit()
    return {"deleted": True, "repo_id": repo_id}


# ----------------------------
# Codebase Chat (RAG + Gemini + PromptShield + MemoryMesh)
# ----------------------------
@app.get("/api/chat/history")
async def get_chat_history(
    request: Request,
    repo_id: int | None = None,
    limit: int = Query(default=100, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if repo_id is not None:
        await get_owned_repo(repo_id, user, request, db)

    stmt = select(ChatMessage).where(ChatMessage.user_id == user.id)
    if repo_id is not None:
        stmt = stmt.where(ChatMessage.repo_id == repo_id)
    stmt = stmt.order_by(ChatMessage.created_at.asc()).limit(limit)
    res = await db.execute(stmt)
    msgs = res.scalars().all()
    return [
        {
            "id": m.id,
            "role": m.role,
            "content": m.content,
            "citations": json.loads(m.citations_json or "[]"),
            "shield_status": m.shield_status,
            "latency_ms": m.latency_ms,
            "model_used": m.model_used,
            "created_at": m.created_at.isoformat(),
        }
        for m in msgs
    ]


@app.post("/api/chat/send")
async def send_chat_message(
    payload: ChatSendRequest,
    request: Request,
    user: User = Depends(limit_authenticated("gemini_ai", 24, 60)),
    db: AsyncSession = Depends(get_db),
):
    if not settings.is_production and (payload.simulate_error or payload.message.strip() == "__SIMULATE_ERROR__"):
        raise HTTPException(
            status_code=503,
            detail="Simulated Singularity telemetry interruption — input preserved safely.",
        )

    question = payload.message.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    repo: Repository | None = None
    if payload.repo_id is not None:
        repo = await get_owned_repo(payload.repo_id, user, request, db)
    else:
        r_res = await db.execute(
            select(Repository).where(Repository.user_id == user.id).order_by(Repository.id.asc()).limit(1)
        )
        repo = r_res.scalar_one_or_none()

    repo_id = repo.id if repo else None
    repo_name = repo.name if repo else "Unbound Workspace"

    # 1. PromptShield Pre-Flight Inspection
    shield = scan_prompt_shield(question)
    db.add(
        SecurityScanRecord(
            user_id=user.id,
            repo_id=repo_id,
            scan_type="chat_preflight",
            input_excerpt=question[:180],
            risk_score=shield["risk_score"],
            verdict=shield["verdict"],
            findings_json=json.dumps(shield["findings"]),
        )
    )

    if shield["verdict"] == "BLOCKED":
        await record_audit_event(
            db,
            request,
            event_type="security.prompt_blocked",
            user_id=user.id,
            status_str="blocked",
            details={"risk_score": shield["risk_score"]},
        )
        await db.commit()
        raise HTTPException(
            status_code=422,
            detail=f"PromptShield blocked high-risk payload (Risk {shield['risk_score']}/100): {shield['findings'][0]['title']}",
        )

    # 2. Vector RAG Retrieval (strictly scoped to owned repo_id)
    query_vec = embed_text(shield["sanitized_prompt"])
    retrieved_chunks: list[dict[str, Any]] = []
    if repo_id:
        ch_res = await db.execute(select(CodeChunk).where(CodeChunk.repo_id == repo_id))
        all_chunks = [
            {
                "file_path": c.file_path,
                "start_line": c.start_line,
                "end_line": c.end_line,
                "symbol_name": c.symbol_name,
                "content": c.content,
                "embedding": c.embedding_json,
            }
            for c in ch_res.scalars().all()
        ]
        retrieved_chunks = rank_by_similarity(query_vec, all_chunks, top_k=4)

    # 3. MemoryMesh Context Retrieval (strictly scoped to user.id)
    mem_res = await db.execute(select(MemoryNode).where(MemoryNode.user_id == user.id))
    all_mems = [
        {
            "id": m.id,
            "title": m.title,
            "content": m.content,
            "category": m.category,
            "embedding": m.embedding_json,
        }
        for m in mem_res.scalars().all()
    ]
    top_memories = rank_by_similarity(query_vec, all_mems, top_k=3)

    # 4. Gemini / Hybrid Generation (server-side credentials only, non-blocking thread offload)
    gen = await asyncio.to_thread(
        generate_chat_answer,
        question=shield["sanitized_prompt"],
        repo_name=repo_name,
        retrieved_chunks=retrieved_chunks,
        memories=top_memories,
    )

    citations = [
        {
            "file_path": c["file_path"],
            "start_line": c["start_line"],
            "end_line": c["end_line"],
            "symbol": c["symbol_name"],
            "score": c["score"],
        }
        for c in retrieved_chunks
    ]

    user_msg = ChatMessage(
        user_id=user.id,
        repo_id=repo_id,
        role="user",
        content=question,
        citations_json="[]",
        shield_status=shield["verdict"],
    )
    assistant_msg = ChatMessage(
        user_id=user.id,
        repo_id=repo_id,
        role="assistant",
        content=gen["answer"],
        citations_json=json.dumps(citations),
        shield_status=shield["verdict"],
        latency_ms=gen["latency_ms"],
        model_used=gen["model_used"],
    )
    db.add(user_msg)
    db.add(assistant_msg)

    db.add(
        ModelTelemetry(
            user_id=user.id,
            operation="codebase_chat",
            model_name=gen["model_used"],
            latency_ms=gen["latency_ms"],
            prompt_tokens=max(40, len(question) // 3 + 180),
            completion_tokens=max(60, len(gen["answer"]) // 4),
            status="healthy",
            health_score=98.6,
            notes=f"RAG chunks={len(citations)}, shield={shield['verdict']}",
        )
    )

    await db.commit()
    await db.refresh(assistant_msg)

    return {
        "user_message": {
            "id": user_msg.id,
            "role": "user",
            "content": user_msg.content,
            "shield_status": shield["verdict"],
        },
        "assistant_message": {
            "id": assistant_msg.id,
            "role": "assistant",
            "content": assistant_msg.content,
            "citations": citations,
            "shield_status": shield["verdict"],
            "latency_ms": assistant_msg.latency_ms,
            "model_used": assistant_msg.model_used,
            "created_at": assistant_msg.created_at.isoformat(),
        },
    }


@app.delete("/api/chat/clear")
async def clear_chat_history(
    request: Request,
    repo_id: int | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if repo_id is not None:
        await get_owned_repo(repo_id, user, request, db)

    stmt = delete(ChatMessage).where(ChatMessage.user_id == user.id)
    if repo_id is not None:
        stmt = stmt.where(ChatMessage.repo_id == repo_id)
    await db.execute(stmt)
    await db.commit()
    return {"cleared": True}


# ----------------------------
# Architecture Explorer
# ----------------------------
@app.get("/api/architecture/{repo_id}")
async def explore_architecture(
    repo_id: int,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    repo = await get_owned_repo(repo_id, user, request, db)

    f_res = await db.execute(select(RepoFile).where(RepoFile.repo_id == repo_id))
    files = f_res.scalars().all()

    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    stem_to_path: dict[str, str] = {}

    for f in files:
        base_stem = os.path.splitext(os.path.basename(f.path))[0]
        stem_to_path[base_stem] = f.path
        layer = (
            "shader"
            if f.language == "glsl"
            else "security"
            if "security" in f.path.lower() or "shield" in f.path.lower()
            else "intelligence"
            if "rag" in f.path.lower() or "vector" in f.path.lower()
            else "telemetry"
            if "telemetry" in f.path.lower() or "metric" in f.path.lower()
            else "core"
        )
        symbols = json.loads(f.symbols_json or "[]")
        nodes.append(
            {
                "id": f.path,
                "label": os.path.basename(f.path),
                "path": f.path,
                "language": f.language,
                "layer": layer,
                "loc": f.loc,
                "complexity": f.complexity_score,
                "symbol_count": len(symbols),
                "symbols": symbols,
            }
        )

    for f in files:
        imports = json.loads(f.imports_json or "[]")
        for imp in imports:
            imp_base = os.path.splitext(os.path.basename(imp))[0]
            target = stem_to_path.get(imp_base)
            if target and target != f.path:
                edges.append({"source": f.path, "target": target, "relation": "imports"})

    avg_complexity = round(sum(n["complexity"] for n in nodes) / max(1, len(nodes)), 2)
    return {
        "repo_id": repo.id,
        "repo_name": repo.name,
        "nodes": nodes,
        "edges": edges,
        "metrics": {
            "module_count": len(nodes),
            "dependency_edges": len(edges),
            "average_complexity": avg_complexity,
            "coupling_index": round(len(edges) / max(1, len(nodes)), 2),
        },
    }


# ----------------------------
# AI Code Review
# ----------------------------
@app.post("/api/review/analyze")
async def run_code_review(
    payload: CodeReviewRequest,
    request: Request,
    user: User = Depends(limit_authenticated("gemini_ai", 20, 60)),
    db: AsyncSession = Depends(get_db),
):
    target_code = payload.code
    target_path = _sanitize_repo_relpath(payload.file_path)

    if payload.repo_id is not None:
        await get_owned_repo(payload.repo_id, user, request, db)
        if not target_code.strip():
            res = await db.execute(
                select(RepoFile).where(RepoFile.repo_id == payload.repo_id, RepoFile.path == target_path)
            )
            rf = res.scalar_one_or_none()
            if rf:
                target_code = rf.content

    if not target_code.strip():
        raise HTTPException(status_code=400, detail="Provide source code or select a valid repository file")

    parsed = parse_repository_file(target_path, target_code)
    result = await asyncio.to_thread(
        analyze_code_review,
        code=target_code,
        file_path=target_path,
        language=parsed["language"],
    )

    db.add(
        ModelTelemetry(
            user_id=user.id,
            operation="ai_code_review",
            model_name=result["model_used"],
            latency_ms=result["latency_ms"],
            prompt_tokens=max(50, len(target_code) // 4),
            completion_tokens=220,
            status="healthy",
            health_score=float(result["quality_score"]),
            notes=f"Reviewed {target_path}",
        )
    )
    await db.commit()
    return result


# ----------------------------
# PromptShield & Security Center
# ----------------------------
@app.post("/api/security/prompt-shield")
async def evaluate_prompt_shield(
    payload: PromptShieldScanRequest,
    request: Request,
    user: User = Depends(limit_authenticated("security_scan", 30, 60)),
    db: AsyncSession = Depends(get_db),
):
    if payload.repo_id is not None:
        await get_owned_repo(payload.repo_id, user, request, db)

    scan = scan_prompt_shield(payload.prompt)
    db.add(
        SecurityScanRecord(
            user_id=user.id,
            repo_id=payload.repo_id,
            scan_type="prompt_shield",
            input_excerpt=payload.prompt[:200],
            risk_score=scan["risk_score"],
            verdict=scan["verdict"],
            findings_json=json.dumps(scan["findings"]),
        )
    )
    await record_audit_event(
        db,
        request,
        event_type="security.prompt_shield_scan",
        user_id=user.id,
        details={"verdict": scan["verdict"], "risk_score": scan["risk_score"]},
    )
    await db.commit()
    return scan


@app.get("/api/security/repo-audit/{repo_id}")
async def run_repository_security_audit(
    repo_id: int,
    request: Request,
    user: User = Depends(limit_authenticated("security_scan", 20, 60)),
    db: AsyncSession = Depends(get_db),
):
    await get_owned_repo(repo_id, user, request, db)
    res = await db.execute(select(RepoFile).where(RepoFile.repo_id == repo_id))
    files = [{"path": f.path, "content": f.content} for f in res.scalars().all()]
    audit = audit_repository_files(files)
    db.add(
        SecurityScanRecord(
            user_id=user.id,
            repo_id=repo_id,
            scan_type="repo_static_audit",
            input_excerpt=f"Audited {len(files)} files in repo #{repo_id}",
            risk_score=audit["risk_score"],
            verdict=audit["verdict"],
            findings_json=json.dumps(audit["findings"][:15]),
        )
    )
    await record_audit_event(
        db,
        request,
        event_type="security.repo_audit",
        user_id=user.id,
        target_resource=f"repository:{repo_id}",
        details={"verdict": audit["verdict"], "finding_count": audit["finding_count"]},
    )
    await db.commit()
    return audit


@app.get("/api/security/history")
async def get_security_scan_history(
    limit: int = Query(default=25, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(SecurityScanRecord)
        .where(SecurityScanRecord.user_id == user.id)
        .order_by(desc(SecurityScanRecord.created_at))
        .limit(limit)
    )
    rows = res.scalars().all()
    return [
        {
            "id": r.id,
            "scan_type": r.scan_type,
            "input_excerpt": r.input_excerpt,
            "risk_score": r.risk_score,
            "verdict": r.verdict,
            "findings": json.loads(r.findings_json or "[]"),
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


# ----------------------------
# ModelDoctor Telemetry & Diagnostics
# ----------------------------
@app.get("/api/model-doctor/status")
async def get_model_doctor_status(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(ModelTelemetry)
        .where(ModelTelemetry.user_id == user.id)
        .order_by(desc(ModelTelemetry.created_at))
        .limit(30)
    )
    logs = res.scalars().all()
    avg_latency = round(sum(t.latency_ms for t in logs) / max(1, len(logs)), 2)
    total_tokens = sum(t.prompt_tokens + t.completion_tokens for t in logs)
    avg_health = round(sum(t.health_score for t in logs) / max(1, len(logs)), 1)

    return {
        "active_model": get_effective_active_model(),
        "gemini_live_key_detected": bool(settings.get_gemini_key()),
        "vector_backend": "pgvector (PostgreSQL)" if settings.is_postgres else "Hybrid Local Vector + SQLite",
        "average_latency_ms": avg_latency,
        "total_tokens_processed": total_tokens,
        "system_health_score": avg_health or 98.5,
        "telemetry": [
            {
                "id": t.id,
                "operation": t.operation,
                "model_name": t.model_name,
                "latency_ms": t.latency_ms,
                "prompt_tokens": t.prompt_tokens,
                "completion_tokens": t.completion_tokens,
                "status": t.status,
                "health_score": t.health_score,
                "notes": t.notes,
                "created_at": t.created_at.isoformat(),
            }
            for t in logs
        ],
    }


@app.post("/api/model-doctor/diagnose")
async def run_model_doctor_diagnostic(
    payload: ModelDoctorDiagnoseRequest,
    user: User = Depends(limit_authenticated("gemini_ai", 15, 60)),
    db: AsyncSession = Depends(get_db),
):
    prompt = payload.sample_prompt.strip()
    est_tokens = max(12, len(prompt) // 4)
    clarity_score = min(
        99, max(62, 100 - (15 if len(prompt) < 20 else 0) - (10 if payload.temperature > 0.85 else 0))
    )
    hallucination_risk = (
        "LOW" if payload.temperature <= 0.45 else ("MODERATE" if payload.temperature <= 0.8 else "HIGH")
    )

    gen = await asyncio.to_thread(
        generate_chat_answer,
        question=prompt,
        repo_name="ModelDoctor Calibration Probe",
        retrieved_chunks=[],
        memories=[],
    )

    rec = ModelTelemetry(
        user_id=user.id,
        operation="model_doctor_probe",
        model_name=gen["model_used"],
        latency_ms=gen["latency_ms"],
        prompt_tokens=est_tokens,
        completion_tokens=max(30, len(gen["answer"]) // 4),
        status="healthy",
        health_score=float(clarity_score),
        notes=f"Temp={payload.temperature}, HallucinationRisk={hallucination_risk}",
    )
    db.add(rec)
    await db.commit()

    return {
        "clarity_score": clarity_score,
        "hallucination_risk": hallucination_risk,
        "measured_latency_ms": gen["latency_ms"],
        "model_used": gen["model_used"],
        "recommendations": [
            "Keep temperature between 0.20 and 0.40 for deterministic AST & code review synthesis.",
            "Attach repository file context chunks via hybrid vector search to ground symbol references.",
            "Keep PromptShield pre-flight active to block adversarial prompt drift.",
        ],
        "probe_output_preview": gen["answer"][:420],
    }


# ----------------------------
# MemoryMesh Semantic Graph
# ----------------------------
@app.get("/api/memory-mesh")
async def list_memory_nodes(
    limit: int = Query(default=100, ge=1, le=200),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        select(MemoryNode)
        .where(MemoryNode.user_id == user.id)
        .order_by(desc(MemoryNode.importance), desc(MemoryNode.created_at))
        .limit(limit)
    )
    nodes = res.scalars().all()
    return [
        {
            "id": n.id,
            "title": n.title,
            "content": n.content,
            "category": n.category,
            "tags": json.loads(n.tags_json or "[]"),
            "importance": n.importance,
            "links": json.loads(n.links_json or "[]"),
            "created_at": n.created_at.isoformat(),
        }
        for n in nodes
    ]


@app.post("/api/memory-mesh")
async def create_memory_node(
    payload: MemoryCreateRequest,
    request: Request,
    user: User = Depends(limit_authenticated("memory_write", 30, 60)),
    db: AsyncSession = Depends(get_db),
):
    if payload.repo_id is not None:
        await get_owned_repo(payload.repo_id, user, request, db)

    clean_tags = [t.strip()[:48] for t in payload.tags if t.strip()][:16]
    vec = embed_text(f"{payload.title} {payload.content} {' '.join(clean_tags)}")
    node = MemoryNode(
        user_id=user.id,
        repo_id=payload.repo_id,
        title=payload.title.strip(),
        content=payload.content.strip(),
        category=payload.category.strip(),
        tags_json=json.dumps(clean_tags),
        importance=payload.importance,
        embedding_json=json.dumps(vec),
        links_json=json.dumps(clean_tags[:3]),
    )
    db.add(node)
    await db.commit()
    await db.refresh(node)
    return {
        "id": node.id,
        "title": node.title,
        "content": node.content,
        "category": node.category,
        "tags": clean_tags,
        "importance": node.importance,
        "links": clean_tags[:3],
        "created_at": node.created_at.isoformat(),
    }


@app.get("/api/memory-mesh/search")
async def search_memory_mesh(
    q: str = Query(..., min_length=1, max_length=500),
    user: User = Depends(limit_authenticated("memory_search", 40, 60)),
    db: AsyncSession = Depends(get_db),
):
    qvec = embed_text(q)
    res = await db.execute(select(MemoryNode).where(MemoryNode.user_id == user.id).limit(300))
    candidates = [
        {
            "id": n.id,
            "title": n.title,
            "content": n.content,
            "category": n.category,
            "tags": json.loads(n.tags_json or "[]"),
            "importance": n.importance,
            "embedding": n.embedding_json,
        }
        for n in res.scalars().all()
    ]
    ranked = rank_by_similarity(qvec, candidates, top_k=8)
    for item in ranked:
        item.pop("embedding", None)
    return ranked


@app.delete("/api/memory-mesh/{node_id}")
async def delete_memory_node(
    node_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    res = await db.execute(
        delete(MemoryNode).where(MemoryNode.id == node_id, MemoryNode.user_id == user.id)
    )
    if (res.rowcount or 0) == 0:
        raise HTTPException(status_code=404, detail="Memory node not found")
    await db.commit()
    return {"deleted": True, "id": node_id}


# ----------------------------
# Documentation Generator
# ----------------------------
@app.post("/api/docs-gen/generate")
async def generate_repo_documentation(
    payload: DocsGenerateRequest,
    request: Request,
    user: User = Depends(limit_authenticated("gemini_ai", 12, 60)),
    db: AsyncSession = Depends(get_db),
):
    repo = await get_owned_repo(payload.repo_id, user, request, db)

    f_res = await db.execute(select(RepoFile).where(RepoFile.repo_id == repo.id))
    files = [
        {
            "path": f.path,
            "language": f.language,
            "loc": f.loc,
            "symbols": json.loads(f.symbols_json or "[]"),
        }
        for f in f_res.scalars().all()
    ]

    md, latency_ms, model_used = await asyncio.to_thread(
        synthesize_documentation,
        repo_name=repo.name,
        doc_type=payload.doc_type,
        files=files,
    )

    doc_title = f"{repo.name} — {payload.doc_type.replace('_', ' ').title()}"
    doc = GeneratedDoc(
        user_id=user.id,
        repo_id=repo.id,
        doc_type=payload.doc_type,
        title=doc_title,
        markdown_content=md,
    )
    db.add(doc)
    db.add(
        ModelTelemetry(
            user_id=user.id,
            operation="docs_generator",
            model_name=model_used,
            latency_ms=latency_ms,
            prompt_tokens=240,
            completion_tokens=max(120, len(md) // 4),
            status="healthy",
            health_score=99.0,
            notes=f"Generated {payload.doc_type} for {repo.name}",
        )
    )
    await db.commit()
    await db.refresh(doc)

    return {
        "id": doc.id,
        "repo_id": doc.repo_id,
        "doc_type": doc.doc_type,
        "title": doc.title,
        "markdown_content": doc.markdown_content,
        "latency_ms": latency_ms,
        "model_used": model_used,
        "created_at": doc.created_at.isoformat(),
    }


@app.get("/api/docs-gen/{repo_id}")
async def list_generated_docs(
    repo_id: int,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await get_owned_repo(repo_id, user, request, db)
    res = await db.execute(
        select(GeneratedDoc)
        .where(GeneratedDoc.repo_id == repo_id, GeneratedDoc.user_id == user.id)
        .order_by(desc(GeneratedDoc.created_at))
        .limit(15)
    )
    docs = res.scalars().all()
    return [
        {
            "id": d.id,
            "doc_type": d.doc_type,
            "title": d.title,
            "markdown_content": d.markdown_content,
            "created_at": d.created_at.isoformat(),
        }
        for d in docs
    ]
