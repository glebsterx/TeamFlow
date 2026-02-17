"""Database connection and session management."""
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy import text
from app.config import settings

Base = declarative_base()


def _make_engine():
    kwargs = {"echo": settings.DEBUG, "future": True}
    if "sqlite" in settings.DATABASE_URL:
        from sqlalchemy.pool import NullPool
        kwargs["poolclass"] = NullPool
        kwargs["connect_args"] = {"check_same_thread": False, "timeout": 10}
    else:
        kwargs["pool_size"] = settings.DB_POOL_SIZE
        kwargs["max_overflow"] = settings.DB_MAX_OVERFLOW
        kwargs["pool_pre_ping"] = True
    return create_async_engine(settings.DATABASE_URL, **kwargs)


engine = _make_engine()

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def _run_migrations():
    """Add missing columns to existing databases (safe to run multiple times)."""
    if "sqlite" not in settings.DATABASE_URL:
        return

    import aiosqlite
    db_file = settings.DATABASE_URL.replace("sqlite+aiosqlite:///", "")

    async with aiosqlite.connect(db_file) as db:
        # Получаем текущие колонки tasks
        async with db.execute("PRAGMA table_info(tasks)") as cur:
            cols = {row[1] async for row in cur}

        # Добавляем отсутствующие колонки
        migrations = [
            ("assignee_id", "ALTER TABLE tasks ADD COLUMN assignee_id INTEGER"),
            ("source_chat_id", "ALTER TABLE tasks ADD COLUMN source_chat_id BIGINT"),
        ]
        for col, sql in migrations:
            if col not in cols:
                await db.execute(sql)
                print(f"[migrate] Added column tasks.{col}")

        await db.commit()


async def init_db():
    """Initialize database — create all tables + run migrations."""
    from app.domain.models import Task, Blocker, Meeting, TelegramUser  # noqa
    from app.domain.user import User  # noqa

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        if "sqlite" in settings.DATABASE_URL:
            await conn.execute(text("PRAGMA journal_mode=WAL"))
            await conn.execute(text("PRAGMA synchronous=NORMAL"))
            await conn.execute(text("PRAGMA busy_timeout=5000"))

    await _run_migrations()
