"""Bootstrap — auto-generate secrets and ensure minimal config on startup."""
import os
import secrets
import shutil
import logging
from datetime import datetime
from pathlib import Path
from app.core.clock import Clock

logger = logging.getLogger(__name__)

DEFAULT_SECRET_KEY = "change-this-secret-key-in-production"

DB_FILE = "/app/data/teamflow.db"
BACKUP_DIR = "/app/data/backups"
MAX_BACKUPS = 10


def _read_env_file(path: str = "/app/.env") -> dict[str, str]:
    """Read .env file into dict."""
    env = {}
    if not os.path.exists(path):
        return env
    with open(path, "r") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, _, value = line.partition("=")
                env[key.strip()] = value.strip()
    return env


def _write_env_var(path: str, key: str, value: str):
    """Append or update a single env var in .env file."""
    env = _read_env_file(path)
    if key in env:
        # Rewrite the file with updated value
        lines = []
        with open(path, "r") as f:
            for line in f:
                stripped = line.strip()
                if stripped.startswith(f"{key}="):
                    lines.append(f"{key}={value}\n")
                else:
                    lines.append(line)
        with open(path, "w") as f:
            f.writelines(lines)
    else:
        # Append
        with open(path, "a") as f:
            f.write(f"{key}={value}\n")
    logger.info(f"[bootstrap] {key} written to .env")


async def bootstrap_secret_key():
    """Generate and store SECRET_KEY if not set in .env or DB.
    
    Priority: .env -> DB -> generate new
    """
    import secrets
    from app.config import set_secret_key_cache
    
    # Check .env first
    env_secret = os.environ.get("SECRET_KEY", "")
    if env_secret and env_secret != DEFAULT_SECRET_KEY:
        # Also save to DB for consistency
        try:
            from app.core.db import AsyncSessionLocal
            from app.domain.models import AppSetting
            from sqlalchemy import select
            
            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    select(AppSetting).where(AppSetting.key == "secret_key")
                )
                existing = result.scalar_one_or_none()
                if not existing:
                    session.add(AppSetting(key="secret_key", value=env_secret))
                    await session.commit()
                    logger.info("[bootstrap] SECRET_KEY from .env saved to DB")
        except Exception as e:
            logger.warning(f"[bootstrap] Could not save SECRET_KEY to DB: {e}")
        
        set_secret_key_cache(env_secret)
        return
    
    # Check DB
    try:
        from app.core.db import AsyncSessionLocal
        from app.domain.models import AppSetting
        from sqlalchemy import select
        
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(AppSetting).where(AppSetting.key == "secret_key")
            )
            existing = result.scalar_one_or_none()
            if existing and existing.value and existing.value != DEFAULT_SECRET_KEY:
                os.environ["SECRET_KEY"] = existing.value
                set_secret_key_cache(existing.value)
                logger.info("[bootstrap] SECRET_KEY loaded from DB")
                return
    except Exception as e:
        logger.warning(f"[bootstrap] Could not read SECRET_KEY from DB: {e}")
    
    # Generate new
    new_key = secrets.token_urlsafe(48)
    os.environ["SECRET_KEY"] = new_key
    set_secret_key_cache(new_key)
    
    # Save to DB
    try:
        from app.core.db import AsyncSessionLocal
        from app.domain.models import AppSetting
        
        async with AsyncSessionLocal() as session:
            session.add(AppSetting(key="secret_key", value=new_key))
            await session.commit()
    except Exception as e:
        logger.warning(f"[bootstrap] Could not save SECRET_KEY to DB: {e}")
    
    # Try to save to .env (may fail in container without volume mount)
    try:
        _write_env_var("/app/.env", "SECRET_KEY", new_key)
    except Exception as e:
        logger.warning(f"[bootstrap] Could not write SECRET_KEY to .env: {e}")
    
    logger.info("[bootstrap] SECRET_KEY auto-generated")


async def bootstrap_default_settings():
    """Set default BASE_URL, FRONTEND_PORT in DB if not already set.
    
    This ensures first-time installation works even with empty .env and empty DB.
    """
    # These defaults are also in config.py, but we store them in DB
    # so they can be changed via UI and persist across restarts
    default_base_url = "http://localhost"
    default_frontend_port = "5180"
    
    try:
        # Import here to avoid circular imports
        from app.core.db import AsyncSessionLocal
        from app.domain.models import AppSetting
        from sqlalchemy import select
        
        async with AsyncSessionLocal() as session:
            # Check if base_url is set
            result = await session.execute(
                select(AppSetting).where(AppSetting.key == "base_url")
            )
            existing = result.scalar_one_or_none()
            if not existing or not existing.value:
                setting = AppSetting(key="base_url", value=default_base_url)
                session.add(setting)
                logger.info(f"[bootstrap] Set default base_url={default_base_url}")
            
            # Check if frontend_port is set
            result = await session.execute(
                select(AppSetting).where(AppSetting.key == "frontend_port")
            )
            existing = result.scalar_one_or_none()
            if not existing or not existing.value:
                setting = AppSetting(key="frontend_port", value=default_frontend_port)
                session.add(setting)
                logger.info(f"[bootstrap] Set default frontend_port={default_frontend_port}")
            
            await session.commit()
            
    except Exception as e:
        logger.warning(f"[bootstrap] Could not set default settings in DB: {e}")


def bootstrap_vapid_keys():
    """VAPID keys are now stored in DB (app_settings), not .env.

    Initial generation happens at runtime when the first push subscription is created
    or via the settings UI. No file-based bootstrap needed.
    """
    pass  # Keys are managed via vapid_service and settings UI


def backup_database():
    """Auto-backup SQLite database at startup. Keeps last MAX_BACKUPS."""
    if not os.path.exists(DB_FILE):
        logger.info("[bootstrap] No database file found, skipping backup")
        return

    try:
        os.makedirs(BACKUP_DIR, exist_ok=True)
        timestamp = Clock.now().strftime("%Y%m%d-%H%M%S")
        backup_file = os.path.join(BACKUP_DIR, f"teamflow-{timestamp}.db")
        shutil.copy2(DB_FILE, backup_file)
        logger.info(f"[bootstrap] Database backed up to {backup_file}")

        # Clean old backups
        backups = sorted(
            [f for f in os.listdir(BACKUP_DIR) if f.startswith("teamflow-") and f.endswith(".db")],
            reverse=True,
        )
        for old in backups[MAX_BACKUPS:]:
            os.remove(os.path.join(BACKUP_DIR, old))
            logger.info(f"[bootstrap] Removed old backup: {old}")
    except Exception as e:
        logger.warning(f"[bootstrap] Database backup failed: {e}")
