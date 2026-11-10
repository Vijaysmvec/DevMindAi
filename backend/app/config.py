import os
import secrets
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables safely from ~/.env, project .env, and backend/.env
HOME_ENV = Path.home() / ".env"
ROOT_ENV = Path(__file__).resolve().parents[2] / ".env"
BACKEND_ENV = Path(__file__).resolve().parents[1] / ".env"

for env_path in (HOME_ENV, ROOT_ENV, BACKEND_ENV):
    if env_path.exists():
        load_dotenv(dotenv_path=env_path, override=False)

_EPHEMERAL_DEV_JWT_SECRET = secrets.token_urlsafe(48)


def _parse_origins(raw: str, app_env: str) -> list[str]:
    if raw and raw.strip():
        return [o.strip().rstrip("/") for o in raw.split(",") if o.strip()]
    if app_env in ("development", "testing"):
        return [
            "http://127.0.0.1:5173",
            "http://localhost:5173",
            "http://127.0.0.1:4173",
            "http://localhost:4173",
        ]
    return []


class Settings:
    PROJECT_NAME: str = "DevMind AI — SINGULARITY: EXTREME"
    VERSION: str = "2.1.0"

    APP_ENV: str = os.getenv("APP_ENV", "development").strip().lower()
    DEBUG: bool = (
        False
        if os.getenv("APP_ENV", "development").strip().lower() in ("production", "staging")
        else os.getenv("DEBUG", "false").strip().lower() == "true"
    )

    # Dual-mode DB: PostgreSQL + pgvector in production, async SQLite in local development
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        f"sqlite+aiosqlite:///{(Path(__file__).resolve().parents[1] / 'devmind_singularity.db').as_posix()}",
    )

    # JWT session configuration (never hardcoded; fails closed in production if unset)
    JWT_SECRET_KEY: str = (
        os.getenv("JWT_SECRET_KEY")
        or os.getenv("JWT_SECRET")
        or ("" if os.getenv("APP_ENV", "development").strip().lower() in ("production", "staging") else _EPHEMERAL_DEV_JWT_SECRET)
    )
    JWT_ALGORITHM: str = "HS256"
    JWT_ISSUER: str = "devmind-singularity-api"
    JWT_AUDIENCE: str = "devmind-singularity-client"
    JWT_ACCESS_EXPIRE_MINUTES: int = int(os.getenv("JWT_ACCESS_EXPIRE_MINUTES", "30"))
    JWT_REFRESH_EXPIRE_DAYS: int = int(os.getenv("JWT_REFRESH_EXPIRE_DAYS", "7"))

    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://127.0.0.1:5173").strip()
    CORS_ALLOWED_ORIGINS: list[str] = _parse_origins(
        os.getenv("CORS_ALLOWED_ORIGINS", ""),
        os.getenv("APP_ENV", "development").strip().lower(),
    )

    # Firebase Admin SDK configuration (Google Sign-In verification)
    FIREBASE_PROJECT_ID: str = os.getenv("FIREBASE_PROJECT_ID", "").strip()
    FIREBASE_SERVICE_ACCOUNT_JSON: str = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip()
    GOOGLE_APPLICATION_CREDENTIALS: str = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "").strip()

    # Optional shared rate-limit backend for multi-instance production deployments
    REDIS_URL: str = os.getenv("REDIS_URL", "").strip()

    # Request & upload security bounds
    MAX_REQUEST_BYTES: int = int(os.getenv("MAX_REQUEST_BYTES", str(6 * 1024 * 1024)))
    MAX_ZIP_UPLOAD_BYTES: int = int(os.getenv("MAX_ZIP_UPLOAD_BYTES", str(5 * 1024 * 1024)))
    MAX_ZIP_UNCOMPRESSED_BYTES: int = int(os.getenv("MAX_ZIP_UNCOMPRESSED_BYTES", str(12 * 1024 * 1024)))
    MAX_ZIP_COMPRESSION_RATIO: float = 50.0
    MAX_REPO_FILES: int = 120

    # Gemini AI configuration (strictly server-side)
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-3.5-flash").strip()
    GEMINI_EMBEDDING_MODEL: str = os.getenv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001").strip()
    EMBEDDING_DIM: int = 128

    # Optional bootstrap admin email (server-side env only, never controllable by client)
    INITIAL_ADMIN_EMAIL: str = os.getenv("INITIAL_ADMIN_EMAIL", "").strip().lower()

    @property
    def is_production(self) -> bool:
        return self.APP_ENV in ("production", "staging")

    @property
    def is_postgres(self) -> bool:
        return self.DATABASE_URL.startswith("postgresql")

    def get_gemini_key(self, _unused_header: str | None = None) -> str | None:
        """Strictly resolves Gemini API key from server-side environment variables."""
        env_val = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if env_val and env_val.strip():
            return env_val.strip()
        if ROOT_ENV.exists() and self.APP_ENV != "testing":
            load_dotenv(dotenv_path=ROOT_ENV, override=False)
            reloaded = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
            if reloaded and reloaded.strip():
                return reloaded.strip()
        return None


def validate_startup_config(env_map: dict[str, str] | None = None) -> list[str]:
    """
    Part G Section 11.2: Strict environment validation at application startup.
    Fails closed (raises RuntimeError) when mandatory production credentials or flags are missing/unsafe.
    Returns non-blocking configuration notices in development/testing.
    """
    src = env_map if env_map is not None else os.environ
    app_env = src.get("APP_ENV", "development").strip().lower()
    if app_env not in ("development", "testing", "staging", "production"):
        raise RuntimeError(f"Invalid APP_ENV '{app_env}'. Expected development, testing, staging, or production.")

    notices: list[str] = []
    jwt_secret = (src.get("JWT_SECRET_KEY") or src.get("JWT_SECRET") or "").strip()
    db_url = src.get("DATABASE_URL", "").strip()
    gemini_key = (src.get("GEMINI_API_KEY") or src.get("GOOGLE_API_KEY") or "").strip()
    gemini_model = src.get("GEMINI_MODEL", "gemini-3.5-flash").strip()
    frontend_url = src.get("FRONTEND_URL", "").strip()
    raw_cors = src.get("CORS_ALLOWED_ORIGINS", "").strip()
    firebase_pid = src.get("FIREBASE_PROJECT_ID", "").strip()
    debug_flag = src.get("DEBUG", "false").strip().lower()

    if app_env in ("production", "staging"):
        errors: list[str] = []
        if debug_flag == "true":
            errors.append("DEBUG must be disabled ('false') in production/staging.")
        if len(jwt_secret) < 32:
            errors.append("JWT_SECRET_KEY must be set and at least 32 characters long in production.")
        if not db_url or db_url.startswith("sqlite"):
            errors.append("DATABASE_URL must point to an encrypted PostgreSQL instance in production (not SQLite).")
        if not gemini_key:
            errors.append("GEMINI_API_KEY is required in production.")
        if not gemini_model:
            errors.append("GEMINI_MODEL is required in production.")
        if not frontend_url.startswith("https://"):
            errors.append("FRONTEND_URL must be an explicit https:// URL in production.")
        cors_list = [c.strip() for c in raw_cors.split(",") if c.strip()]
        if not cors_list or "*" in cors_list or any(not c.startswith("https://") for c in cors_list):
            errors.append("CORS_ALLOWED_ORIGINS must specify explicit https:// origins without wildcards in production.")
        if not firebase_pid:
            errors.append("FIREBASE_PROJECT_ID is required in production for Google OAuth verification.")

        if errors:
            raise RuntimeError("Production environment validation failed: " + " | ".join(errors))
    else:
        if not jwt_secret:
            notices.append("JWT_SECRET_KEY unset in dev/test; using ephemeral in-memory signing key.")
        if not firebase_pid:
            notices.append("FIREBASE_PROJECT_ID not yet configured in .env; Google OAuth will prompt setup checklist.")
        if not gemini_key:
            notices.append("GEMINI_API_KEY not detected; local grounded RAG synthesis fallback active.")

    return notices


settings = Settings()
