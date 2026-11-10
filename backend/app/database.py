from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from .config import settings


def _build_connect_args() -> dict:
    if not settings.is_postgres:
        return {"check_same_thread": False}
    # Require TLS/SSL on remote PostgreSQL connections in production
    is_local_pg = "127.0.0.1" in settings.DATABASE_URL or "localhost" in settings.DATABASE_URL
    if settings.is_production and not is_local_pg and "ssl" not in settings.DATABASE_URL:
        return {"ssl": "require"}
    return {}


def configure_sqlite_foreign_keys(target_engine: AsyncEngine) -> None:
    """Enforce relational foreign-key constraints on SQLite connections."""

    @event.listens_for(target_engine.sync_engine, "connect")
    def _enable_sqlite_fk(dbapi_connection, _connection_record) -> None:
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("PRAGMA foreign_keys=ON")
        finally:
            cursor.close()


engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    future=True,
    pool_pre_ping=settings.is_postgres,
    connect_args=_build_connect_args(),
)

if not settings.is_postgres:
    configure_sqlite_foreign_keys(engine)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


async def init_db() -> None:
    async with engine.begin() as conn:
        if settings.is_postgres:
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        await conn.run_sync(Base.metadata.create_all)
