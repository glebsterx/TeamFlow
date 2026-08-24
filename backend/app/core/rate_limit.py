"""Simple in-memory per-account rate limiting.

The app runs as a single uvicorn process (no --workers, see app/main.py),
so an in-memory dict is a safe, dependency-free choice here — no Redis
needed. This would need revisiting if the backend is ever scaled to
multiple processes/replicas, since each would keep its own counters.
"""
import time
from collections import defaultdict, deque
from typing import Deque, Dict, Tuple, Union

from fastapi import Depends, HTTPException, Request

from app.core.deps import get_current_account_id

_buckets: Dict[Tuple[str, Union[int, str]], Deque[float]] = defaultdict(deque)


def rate_limiter(name: str, max_requests: int, window_seconds: int):
    """Build a FastAPI dependency: at most `max_requests` per `window_seconds`, per account.

    Usage: `Depends(rate_limiter("ai", max_requests=10, window_seconds=60))`.
    """
    async def _check(account_id: int = Depends(get_current_account_id)) -> int:
        key = (name, account_id)
        now = time.monotonic()
        bucket = _buckets[key]
        while bucket and now - bucket[0] > window_seconds:
            bucket.popleft()
        if len(bucket) >= max_requests:
            retry_after = max(1, int(window_seconds - (now - bucket[0])) + 1)
            raise HTTPException(
                status_code=429,
                detail=f"Слишком много запросов к AI. Попробуйте через {retry_after} сек.",
                headers={"Retry-After": str(retry_after)},
            )
        bucket.append(now)
        return account_id
    return _check


def ip_rate_limiter(name: str, max_requests: int, window_seconds: int, message: str = "Слишком много запросов"):
    """Build a FastAPI dependency: at most `max_requests` per `window_seconds`, per client IP.

    For unauthenticated endpoints (e.g. registration) where there is no
    account_id yet to key on. Uses `request.client.host` directly — this
    deployment has no trusted reverse proxy in front of the API, so
    `X-Forwarded-For` is not honored (client-spoofable).

    Usage: `Depends(ip_rate_limiter("register", max_requests=5, window_seconds=600))`.
    """
    async def _check(request: Request) -> None:
        ip = request.client.host if request.client else "unknown"
        key = (name, ip)
        now = time.monotonic()
        bucket = _buckets[key]
        while bucket and now - bucket[0] > window_seconds:
            bucket.popleft()
        if len(bucket) >= max_requests:
            retry_after = max(1, int(window_seconds - (now - bucket[0])) + 1)
            raise HTTPException(
                status_code=429,
                detail=f"{message}. Попробуйте через {retry_after} сек.",
                headers={"Retry-After": str(retry_after)},
            )
        bucket.append(now)
    return _check
