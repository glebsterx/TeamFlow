"""Application configuration."""
from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional


class Settings(BaseSettings):
    """Application settings."""
    
    # Application
    APP_NAME: str = "TeamFlow"
    VERSION: str = "0.8.24"
    DEBUG: bool = False
    
    # Server
    BASE_URL: str = "http://localhost"
    BACKEND_PORT: int = 8180
    FRONTEND_PORT: int = 5180
    
    # Telegram Bot
    TELEGRAM_BOT_TOKEN: Optional[str] = None  # Can be configured later via UI
    TELEGRAM_CHAT_ID: Optional[int] = None  # Optional - bot works in all chats
    TELEGRAM_BOT_USERNAME: str = ""
    TELEGRAM_PROXY_URL: Optional[str] = None  # socks5://... (MTProxy не поддерживается)
    DEADLINE_NOTIFY_HOURS: str = "24,3"

    # Telegram Mini App
    WEBAPP_URL: Optional[str] = None  # URL веб-интерфейса для кнопки Mini App в боте

    # Frontend Web UI (основной интерфейс)
    FRONTEND_URL: Optional[str] = None  # URL основного веб-интерфейса
    
    # Database (with async driver)
    DATABASE_URL: str = "sqlite+aiosqlite:///./data/teamflow.db"
    
    # Web API (internal port)
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    
    # CORS (external ports)
    BACKEND_CORS_ORIGINS: list[str] = [
        "http://localhost:5180",
        "http://127.0.0.1:5180",
    ]
    
    # Security
    SECRET_KEY: str = ""

    # Web Push (VAPID) — stored in app_settings DB, not .env
    VAPID_CLAIMS_EMAIL: str = "admin@teamflow.local"
    
    # Performance
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 10
    
    @property
    def web_url(self) -> str:
        """Get Web UI URL (sync fallback)."""
        return f"{self.BASE_URL}:{self.FRONTEND_PORT}"
    
    @property
    def api_url(self) -> str:
        """Get API URL (sync fallback)."""
        return f"{self.BASE_URL}:{self.BACKEND_PORT}"
    
    model_config = {
        "env_file": ".env",
        "case_sensitive": True,
        "extra": "ignore"
    }
    
async def _get_db_setting(key: str) -> str | None:
    """Get setting from DB (fallback for .env values)."""
    try:
        from app.core.db import AsyncSessionLocal
        from sqlalchemy import select
        from app.domain.models import AppSetting
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(AppSetting).where(AppSetting.key == key)
            )
            setting = result.scalar_one_or_none()
            return setting.value if setting and setting.value else None
    except Exception:
        return None


async def get_secret_key_async() -> str:
    """Get SECRET_KEY from DB or .env or generate new."""
    from app.core.db import AsyncSessionLocal
    from sqlalchemy import select
    from app.domain.models import AppSetting
    import secrets
    
    # Try DB first
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(AppSetting).where(AppSetting.key == "secret_key")
            )
            setting = result.scalar_one_or_none()
            if setting and setting.value:
                return setting.value
    except Exception:
        pass
    
    # Fallback to .env
    if settings.SECRET_KEY:
        return settings.SECRET_KEY
    
    # Generate new (should not happen if bootstrap ran correctly)
    new_key = secrets.token_urlsafe(48)
    try:
        async with AsyncSessionLocal() as session:
            session.add(AppSetting(key="secret_key", value=new_key))
            await session.commit()
    except Exception:
        pass
    return new_key


# Sync fallback - populated at startup from bootstrap_secret_key()
_secret_key_cache: str | None = None


def get_secret_key() -> str:
    """Get SECRET_KEY synchronously (cached at startup)."""
    global _secret_key_cache
    if _secret_key_cache:
        return _secret_key_cache
    # Fallback to pydantic settings (may be empty on first run)
    return settings.SECRET_KEY


def set_secret_key_cache(key: str):
    """Set the cached secret key (called from bootstrap)."""
    global _secret_key_cache
    _secret_key_cache = key


# Alias for convenience in auth modules
get_secret = get_secret_key


async def get_base_url_async() -> str:
    """Get BASE_URL from DB or .env."""
    db_val = await _get_db_setting("base_url")
    return db_val or settings.BASE_URL


async def get_frontend_port_async() -> int:
    """Get FRONTEND_PORT from DB or .env."""
    db_val = await _get_db_setting("frontend_port")
    return int(db_val) if db_val else settings.FRONTEND_PORT


async def get_web_url_async() -> str:
    """Get full web URL (BASE_URL:FRONTEND_PORT)."""
    base = await get_base_url_async()
    port = await get_frontend_port_async()
    return f"{base}:{port}"


def get_web_url_cached() -> str:
    """Synchronous get_web_url with caching (call once at startup)."""
    if not hasattr(get_web_url_cached, '_cached'):
        base = settings.BASE_URL or "http://localhost"
        port = settings.FRONTEND_PORT
        get_web_url_cached._cached = f"{base}:{port}"
    return get_web_url_cached._cached


def get_base_url_cached() -> str:
    """Synchronous get_base_url with caching."""
    if not hasattr(get_base_url_cached, '_cached'):
        get_base_url_cached._cached = settings.BASE_URL or "http://localhost"
    return get_base_url_cached._cached


def refresh_url_cache():
    """Refresh URL cache (call after settings save)."""
    if hasattr(get_web_url_cached, '_cached'):
        delattr(get_web_url_cached, '_cached')
    if hasattr(get_base_url_cached, '_cached'):
        delattr(get_base_url_cached, '_cached')


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


settings = get_settings()
