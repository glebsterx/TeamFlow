"""Database connection and session management."""
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from sqlalchemy import text
from app.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

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
        # Проверяем есть ли таблица projects
        async with db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'") as cur:
            projects_exists = await cur.fetchone()

        if not projects_exists:
            await db.execute("""
                CREATE TABLE projects (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name VARCHAR(100) NOT NULL UNIQUE,
                    description TEXT,
                    emoji VARCHAR(10) DEFAULT '📁',
                    is_active BOOLEAN DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)
            logger.info("migrate_created_table", table="projects")

        # Получаем текущие колонки tasks
        async with db.execute("PRAGMA table_info(tasks)") as cur:
            cols = {row[1] async for row in cur}

        # Получаем текущие колонки local_accounts
        async with db.execute("PRAGMA table_info(local_accounts)") as cur:
            local_accounts_cols = {row[1] async for row in cur}

        # Получаем текущие колонки api_keys
        async with db.execute("PRAGMA table_info(api_keys)") as cur:
            api_keys_cols = {row[1] async for row in cur}

        # Добавляем отсутствующие колонки
        migrations = [
            ("assignee_id", "ALTER TABLE tasks ADD COLUMN assignee_id INTEGER", cols),
            ("source_chat_id", "ALTER TABLE tasks ADD COLUMN source_chat_id BIGINT", cols),
            ("project_id", "ALTER TABLE tasks ADD COLUMN project_id INTEGER REFERENCES projects(id)", cols),
            ("timezone", "ALTER TABLE local_accounts ADD COLUMN timezone VARCHAR(64)", local_accounts_cols),
            ("key_prefix", "ALTER TABLE api_keys ADD COLUMN key_prefix VARCHAR(12)", api_keys_cols),
        ]
        for col, sql, existing_cols in migrations:
            if col not in existing_cols:
                await db.execute(sql)
                table_map = {
                    "timezone": "local_accounts",
                    "key_prefix": "api_keys",
                }
                table = table_map.get(col, "tasks")
                logger.info("migrate_added_column", table=table, column=col)

        # Migrate existing API keys: hash plain text keys and save prefix
        if api_keys_cols and "key_prefix" not in api_keys_cols:
            pass  # Already added above
        if "key_prefix" in api_keys_cols:
            async with db.execute("SELECT id, key FROM api_keys WHERE key_prefix IS NULL AND LENGTH(key) = 64") as cur:
                plain_keys = [(row[0], row[1]) async for row in cur]
            if plain_keys:
                import hashlib
                for kid, raw_key in plain_keys:
                    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
                    prefix = raw_key[:12]
                    await db.execute(
                        "UPDATE api_keys SET key = ?, key_prefix = ? WHERE id = ?",
                        (key_hash, prefix, kid)
                    )
                logger.info("migrate_api_keys_hashed", count=len(plain_keys))

        await db.commit()


async def init_db():
    """Initialize database — create all tables + run migrations."""
    from app.domain.models import Task, Blocker, Meeting, Comment, PushSubscription  # noqa
    from app.domain.user import User  # noqa

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        if "sqlite" in settings.DATABASE_URL:
            await conn.execute(text("PRAGMA journal_mode=WAL"))
            await conn.execute(text("PRAGMA synchronous=NORMAL"))
            await conn.execute(text("PRAGMA busy_timeout=5000"))

    await _run_migrations()
