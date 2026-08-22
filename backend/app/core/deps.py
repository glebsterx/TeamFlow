"""Shared FastAPI dependencies (auth, etc.)."""
from typing import Optional

import jwt
from fastapi import Header, HTTPException

from app.config import get_secret_key


async def get_current_account_id(authorization: Optional[str] = Header(default=None)) -> int:
    """Resolve the logged-in account id from the `Authorization: Bearer <jwt>` header.

    Raises HTTPException(401) if the header is missing, malformed, the token is
    expired/invalid, or the token is a refresh token (not an access token).
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Не авторизован")

    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Не авторизован")

    try:
        payload = jwt.decode(token, get_secret_key(), algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Недействительный токен")

    if payload.get("type") == "refresh":
        raise HTTPException(status_code=401, detail="Недействительный токен")

    sub = payload.get("sub")
    if sub is None:
        raise HTTPException(status_code=401, detail="Недействительный токен")

    try:
        return int(sub)
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Недействительный токен")
