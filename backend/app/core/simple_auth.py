"""Simple password-based authentication."""
from datetime import datetime, timedelta
from typing import Optional
import jwt
from passlib.context import CryptContext
from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against hash."""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Get password hash."""
    return pwd_context.hash(password)


def create_simple_access_token(username: str) -> str:
    """Create JWT token for simple auth."""
    expire = datetime.utcnow() + timedelta(days=30)  # 30 days
    to_encode = {
        "sub": username,
        "exp": expire,
        "type": "simple_auth"
    }
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm="HS256")


def verify_simple_token(token: str) -> Optional[str]:
    """Verify simple auth token and return username."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        if payload.get("type") != "simple_auth":
            return None
        return payload.get("sub")
    except jwt.PyJWTError:
        return None


# Default password hash for "teamflow" - CHANGE IN PRODUCTION!
DEFAULT_PASSWORD_HASH = "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyYqNk0fGzGK"
