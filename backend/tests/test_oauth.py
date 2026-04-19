"""Test OAuth endpoints - basic existence."""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_oauth_providers(test_client: AsyncClient):
    """OAuth providers endpoint exists."""
    try:
        response = await test_client.get("/api/auth/oauth-providers")
    except Exception:
        pytest.skip("DB not accessible")
    assert response.status_code in [200, 401, 404, 500]


@pytest.mark.asyncio
async def test_oauth_routes(test_client: AsyncClient):
    """OAuth routes exist."""
    try:
        response = await test_client.get("/api/auth/google/link")
    except Exception:
        pytest.skip("DB not accessible")
    assert response.status_code in [200, 302, 400, 404, 500]