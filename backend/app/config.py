"""Application configuration."""
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings."""
    
    # Application
    APP_NAME: str = "TeamFlow"
    VERSION: str = "0.3.0"
    DEBUG: bool = False
    
    # Telegram Bot
    TELEGRAM_BOT_TOKEN: str
    TELEGRAM_CHAT_ID: int
    TELEGRAM_BOT_USERNAME: str = ""
    
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
    SECRET_KEY: str = "change-this-secret-key-in-production"
    
    # Performance
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 10
    
    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


settings = get_settings()
