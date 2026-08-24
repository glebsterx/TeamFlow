"""Simple in-memory per-account rate limiting.

The app runs as a single uvicorn process (no --workers, see app/main.py),
so an in-memory dict is a safe, dependency-free choice here — no Redis
needed. This would need revisiting if the backend is ever scaled to
multiple processes/replicas, since each would keep its own counters.
"""
import time
from collections import defaultdict, deque
from typing import Deque, Dict, Tuple

from fastapi import Depends, HTTPException

from app.core.deps import get_current_account_id

_buckets: Dict[Tuple[str, int], Deque[float]] = defaultdict(deque)


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
