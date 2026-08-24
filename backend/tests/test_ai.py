"""Test AI endpoint rate limiting."""
import time
import jwt
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_secret_key


def _token_for(account_id: int) -> str:
    payload = {"sub": str(account_id), "type": "local", "exp": time.time() + 3600}
    return jwt.encode(payload, get_secret_key(), algorithm="HS256")


@pytest.mark.asyncio
async def test_ai_suggest_tags_rate_limited(test_client: AsyncClient, test_db_session: AsyncSession):
    """10 requests/min allowed, the 11th gets 429 — no AI key configured in
    tests, so successful calls 400 ("not configured"), not 200 — the limiter
    runs as a dependency before the handler body, so it still counts them."""
    account_id = int(time.time() * 1000) % 1_000_000_000
    headers = {"Authorization": f"Bearer {_token_for(account_id)}"}

    for _ in range(10):
        response = await test_client.post(
            "/api/ai/suggest-tags",
            json={"title": "Test task"},
            headers=headers,
        )
        assert response.status_code != 429

    response = await test_client.post(
        "/api/ai/suggest-tags",
        json={"title": "Test task"},
        headers=headers,
    )
    assert response.status_code == 429
    assert "Retry-After" in response.headers


@pytest.mark.asyncio
async def test_ai_rate_limit_is_per_account(test_client: AsyncClient, test_db_session: AsyncSession):
    """A different account isn't affected by another account's rate limit."""
    account_a = int(time.time() * 1000) % 1_000_000_000 + 1
    account_b = account_a + 1

    headers_a = {"Authorization": f"Bearer {_token_for(account_a)}"}
    headers_b = {"Authorization": f"Bearer {_token_for(account_b)}"}

    for _ in range(10):
        await test_client.post("/api/ai/suggest-tags", json={"title": "x"}, headers=headers_a)
    exhausted = await test_client.post("/api/ai/suggest-tags", json={"title": "x"}, headers=headers_a)
    assert exhausted.status_code == 429

    fresh = await test_client.post("/api/ai/suggest-tags", json={"title": "x"}, headers=headers_b)
    assert fresh.status_code != 429
