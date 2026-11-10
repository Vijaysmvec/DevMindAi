import json
import logging
import math
import re
import time
import uuid
from collections import deque
from typing import Any, Callable

from fastapi import HTTPException, Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from .config import settings

# Structured logger with strict secret/credential redaction
logger = logging.getLogger("devmind.security")
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)

SECRET_PATTERNS = [
    re.compile(r"AQ\.[A-Za-z0-9_\-]{12,}"),
    re.compile(r"AIza[A-Za-z0-9_\-]{20,}"),
    re.compile(r"Bearer\s+[A-Za-z0-9\-_\.]{16,}", re.IGNORECASE),
    re.compile(r'("(?:password|id_token|refresh_token|access_token|private_key|secret)"\s*:\s*)"[^"]*"', re.IGNORECASE),
]

SAFE_REQ_ID_RE = re.compile(r"^[A-Za-z0-9\-_]{8,64}$")


def redact_secrets(text: str) -> str:
    cleaned = text
    cleaned = SECRET_PATTERNS[0].sub("[REDACTED_GOOGLE_KEY]", cleaned)
    cleaned = SECRET_PATTERNS[1].sub("[REDACTED_API_KEY]", cleaned)
    cleaned = SECRET_PATTERNS[2].sub("Bearer [REDACTED_TOKEN]", cleaned)
    cleaned = SECRET_PATTERNS[3].sub(r'\1"[REDACTED]"', cleaned)
    return cleaned


def emit_structured_log(event: str, **fields: Any) -> None:
    payload = {
        "ts": round(time.time(), 3),
        "env": settings.APP_ENV,
        "event": event,
        **fields,
    }
    raw = json.dumps(payload, default=str)
    logger.info(redact_secrets(raw))


def resolve_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded and settings.is_production:
        return forwarded.split(",")[0].strip()[:64]
    if request.client and request.client.host:
        return request.client.host[:64]
    return "127.0.0.1"


CSP_POLICY = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline' https://apis.google.com https://*.firebaseapp.com; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src 'self' data: https://fonts.gstatic.com; "
    "img-src 'self' data: blob: https://*.googleusercontent.com https://*.gstatic.com; "
    "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com "
    "https://www.googleapis.com https://*.firebaseio.com; "
    "frame-src https://*.firebaseapp.com https://accounts.google.com; "
    "worker-src 'self' blob:; "
    "object-src 'none'; "
    "base-uri 'self'; "
    "frame-ancestors 'none'"
)


class SecurityHardeningMiddleware(BaseHTTPMiddleware):
    """
    Part G Sections 11.6, 11.9 & 11.14:
    - Assigns safe X-Request-ID
    - Enforces request body size ceiling (413 Payload Too Large)
    - Injects CSP, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, Frame protection, Cache-Control
    - Emits structured secret-redacted audit telemetry
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        incoming_rid = request.headers.get("x-request-id", "").strip()
        request_id = incoming_rid if SAFE_REQ_ID_RE.match(incoming_rid) else uuid.uuid4().hex
        client_ip = resolve_client_ip(request)

        request.state.request_id = request_id
        request.state.client_ip = client_ip

        content_len_header = request.headers.get("content-length")
        if content_len_header:
            try:
                if int(content_len_header) > settings.MAX_REQUEST_BYTES:
                    return JSONResponse(
                        status_code=413,
                        content={
                            "detail": f"Request payload exceeds maximum allowed size ({settings.MAX_REQUEST_BYTES} bytes).",
                            "request_id": request_id,
                        },
                        headers={"X-Request-ID": request_id},
                    )
            except ValueError:
                return JSONResponse(
                    status_code=400,
                    content={"detail": "Malformed Content-Length header", "request_id": request_id},
                    headers={"X-Request-ID": request_id},
                )

        t0 = time.perf_counter()
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - t0) * 1000.0, 2)

        response.headers["X-Request-ID"] = request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=()"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
        response.headers["Content-Security-Policy"] = CSP_POLICY

        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store, max-age=0"

        if request.url.path.startswith("/api/") and request.url.path != "/api/health":
            emit_structured_log(
                "http.request",
                request_id=request_id,
                method=request.method,
                path=request.url.path,
                status_code=response.status_code,
                duration_ms=duration_ms,
                ip=client_ip,
            )

        return response


class SlidingWindowRateLimiter:
    """
    Part G Section 11.6: Per-User & Per-IP Sliding Window Rate Limiter.
    Uses shared Redis storage automatically when REDIS_URL is configured (multi-instance production),
    with a bounded in-memory sliding-window fallback for single-instance/dev/test runs.
    """

    def __init__(self) -> None:
        self._buckets: dict[str, deque[float]] = {}
        self._redis_client: Any = None
        self._redis_checked = False

    def _get_redis(self) -> Any:
        if self._redis_checked:
            return self._redis_client
        self._redis_checked = True
        if settings.REDIS_URL:
            try:
                import redis.asyncio as aioredis  # type: ignore

                self._redis_client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
            except Exception as exc:
                emit_structured_log("ratelimit.redis_unavailable", reason=str(exc))
                self._redis_client = None
        return self._redis_client

    def reset(self) -> None:
        self._buckets.clear()

    async def check(self, scope: str, identifier: str, max_requests: int, window_seconds: int) -> int:
        key = f"rl:{scope}:{identifier}"
        now = time.monotonic()

        redis_conn = self._get_redis()
        if redis_conn is not None:
            try:
                now_ms = int(time.time() * 1000)
                window_start = now_ms - window_seconds * 1000
                pipe = redis_conn.pipeline()
                pipe.zremrangebyscore(key, 0, window_start)
                pipe.zcard(key)
                _, current_count = await pipe.execute()
                if int(current_count) >= max_requests:
                    raise HTTPException(
                        status_code=429,
                        detail=f"Rate limit exceeded for {scope}. Please retry shortly.",
                        headers={"Retry-After": str(window_seconds)},
                    )
                pipe2 = redis_conn.pipeline()
                pipe2.zadd(key, {f"{now_ms}-{uuid.uuid4().hex[:8]}": now_ms})
                pipe2.expire(key, window_seconds + 2)
                await pipe2.execute()
                return max(0, max_requests - int(current_count) - 1)
            except HTTPException:
                raise
            except Exception:
                # Fall through to in-memory enforcement rather than failing open
                pass

        # Prevent unbounded memory growth across distinct ephemeral keys
        if len(self._buckets) > 4096 and key not in self._buckets:
            stale_keys = [
                k for k, dq in list(self._buckets.items())[:512] if not dq or (now - dq[-1]) > window_seconds
            ]
            for sk in stale_keys:
                self._buckets.pop(sk, None)

        dq = self._buckets.setdefault(key, deque())
        cutoff = now - window_seconds
        while dq and dq[0] <= cutoff:
            dq.popleft()

        if len(dq) >= max_requests:
            retry_after = max(1, math.ceil(window_seconds - (now - dq[0])))
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded for {scope}. Retry in {retry_after}s.",
                headers={"Retry-After": str(retry_after)},
            )

        dq.append(now)
        return max(0, max_requests - len(dq))


rate_limiter = SlidingWindowRateLimiter()


def limit_by_ip(scope: str, max_requests: int, window_seconds: int = 60):
    async def _dep(request: Request) -> None:
        ip = getattr(request.state, "client_ip", None) or resolve_client_ip(request)
        await rate_limiter.check(scope, f"ip:{ip}", max_requests, window_seconds)

    return _dep
