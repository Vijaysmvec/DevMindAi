import json
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings
from .database import get_db
from .models import AuditLog, User, utcnow
from .security_middleware import emit_structured_log, resolve_client_ip

# Part G Section 11.11: Argon2id modern password hashing
_password_hasher = PasswordHasher(
    time_cost=2,
    memory_cost=65536,
    parallelism=2,
    hash_len=32,
    salt_len=16,
)

_firebase_initialized = False


def hash_password(password: str) -> str:
    return _password_hasher.hash(password)


def verify_password(password: str, stored_hash: str | None) -> bool:
    if not stored_hash:
        return False
    try:
        return _password_hasher.verify(stored_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def _create_jwt(user: User, token_type: str, ttl: timedelta) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "ver": user.token_version,
        "role": user.role,
        "typ": token_type,
        "iss": settings.JWT_ISSUER,
        "aud": settings.JWT_AUDIENCE,
        "iat": now,
        "exp": now + ttl,
        "jti": secrets.token_hex(12),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_access_token(user: User) -> str:
    return _create_jwt(user, "access", timedelta(minutes=settings.JWT_ACCESS_EXPIRE_MINUTES))


def create_refresh_token(user: User) -> str:
    return _create_jwt(user, "refresh", timedelta(days=settings.JWT_REFRESH_EXPIRE_DAYS))


def decode_jwt_token(token: str, expected_type: str = "access") -> dict[str, Any]:
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            issuer=settings.JWT_ISSUER,
            audience=settings.JWT_AUDIENCE,
            options={"require": ["sub", "exp", "iss", "aud", "typ", "ver"]},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session token has expired")
    except jwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication token")

    if payload.get("typ") != expected_type:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
    return payload


def _ensure_firebase_admin() -> Any:
    global _firebase_initialized
    import firebase_admin
    from firebase_admin import auth as fb_auth
    from firebase_admin import credentials

    if not settings.FIREBASE_PROJECT_ID:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Firebase Google Authentication is not yet configured on the server. "
                "Set FIREBASE_PROJECT_ID (and optional FIREBASE_SERVICE_ACCOUNT_JSON) in .env."
            ),
        )

    if not firebase_admin._apps:
        if settings.FIREBASE_SERVICE_ACCOUNT_JSON:
            try:
                cert_dict = json.loads(settings.FIREBASE_SERVICE_ACCOUNT_JSON)
                cred = credentials.Certificate(cert_dict)
                firebase_admin.initialize_app(cred, {"projectId": settings.FIREBASE_PROJECT_ID})
            except Exception as exc:
                emit_structured_log("firebase.init_failed", reason=str(exc))
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Invalid Firebase service account configuration",
                )
        elif settings.GOOGLE_APPLICATION_CREDENTIALS:
            cred_path = Path(settings.GOOGLE_APPLICATION_CREDENTIALS)
            if not cred_path.is_absolute() and not cred_path.exists():
                root_candidate = Path(__file__).resolve().parents[2] / cred_path
                if root_candidate.exists():
                    cred_path = root_candidate
            cred = credentials.Certificate(str(cred_path))
            firebase_admin.initialize_app(cred, {"projectId": settings.FIREBASE_PROJECT_ID})
        else:
            # Verify Google-signed Firebase ID tokens using public certs & project audience
            firebase_admin.initialize_app(options={"projectId": settings.FIREBASE_PROJECT_ID})
        _firebase_initialized = True

    return fb_auth


def verify_firebase_id_token_live(id_token: str) -> dict[str, Any]:
    """
    Verifies Firebase Google OAuth ID token using Firebase Admin SDK:
    validates RS256 signature, expiration (exp), issuer (https://securetoken.google.com/<projectId>),
    audience (<projectId>), and non-empty subject (uid).
    """
    fb_auth = _ensure_firebase_admin()
    try:
        decoded = fb_auth.verify_id_token(
            id_token,
            check_revoked=bool(settings.FIREBASE_SERVICE_ACCOUNT_JSON),
            clock_skew_seconds=10,
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid, expired, or revoked Google identity token",
        )

    uid = decoded.get("uid") or decoded.get("sub")
    email = (decoded.get("email") or "").strip().lower()
    if not uid or not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google identity token is missing verified uid or email",
        )
    if decoded.get("email_verified") is False:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google account email address must be verified",
        )
    return decoded


def get_firebase_verifier() -> Callable[[str], dict[str, Any]]:
    """Injectable dependency so automated tests can provide deterministic mock OIDC claims safely."""
    return verify_firebase_id_token_live


async def record_audit_event(
    db: AsyncSession,
    request: Request | None,
    event_type: str,
    user_id: int | None = None,
    target_resource: str = "",
    status_str: str = "success",
    details: dict[str, Any] | None = None,
) -> None:
    req_id = getattr(request.state, "request_id", "") if request else ""
    ip_addr = (getattr(request.state, "client_ip", "") or resolve_client_ip(request)) if request else ""
    db.add(
        AuditLog(
            request_id=req_id,
            user_id=user_id,
            event_type=event_type,
            ip_address=ip_addr,
            target_resource=target_resource[:255],
            status=status_str[:32],
            details_json=json.dumps(details or {}),
            created_at=utcnow(),
        )
    )
    emit_structured_log(
        f"audit.{event_type}",
        request_id=req_id,
        user_id=user_id,
        target=target_resource,
        status=status_str,
    )


async def get_current_user(
    request: Request,
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    Deny-by-default server-side authentication.
    Never trusts client-supplied user IDs; never falls back to an anonymous account.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    payload = decode_jwt_token(token, expected_type="access")
    try:
        user_id = int(payload["sub"])
    except (KeyError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or user.account_status == "deleted":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account is no longer active")

    if user.account_status == "disabled":
        await record_audit_event(
            db,
            request,
            event_type="auth.disabled_rejected",
            user_id=user.id,
            status_str="denied",
        )
        await db.commit()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account has been disabled")

    if int(payload.get("ver", -1)) != user.token_version:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session has been revoked")

    return user


async def require_admin(
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Server-side RBAC enforcement for all administrative endpoints."""
    if user.role != "admin":
        await record_audit_event(
            db,
            request,
            event_type="authz.admin_denied",
            user_id=user.id,
            target_resource=request.url.path,
            status_str="denied",
        )
        await db.commit()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrative privileges required")
    return user
