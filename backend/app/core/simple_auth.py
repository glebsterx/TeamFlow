"""Simple password-based authentication."""
from datetime import datetime, timedelta
from typing import Optional
import jwt
import bcrypt
from app.config import settings
from app.core.clock import Clock


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against hash."""
    return bcrypt.checkpw(plain_password.encode(), hashed_password.encode())


def get_password_hash(password: str) -> str:
    """Get password hash."""
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def create_simple_access_token(username: str) -> str:
    """Create JWT token for simple auth."""
    expire = Clock.now() + timedelta(days=30)  # 30 days
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
