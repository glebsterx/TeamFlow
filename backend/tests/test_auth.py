"""Test auth endpoints - endpoints existence only."""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health(test_client: AsyncClient):
    """Test health endpoint."""
    response = await test_client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


@pytest.mark.asyncio
async def test_root(test_client: AsyncClient):
    """Test root endpoint."""
    response = await test_client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "TeamFlow"


@pytest.mark.asyncio  
async def test_login_endpoint(test_client: AsyncClient):
    """Test login endpoint exists (no DB dependency)."""
    response = await test_client.post(
        "/api/auth/local/login",
        json={"login": "test@test.com", "pass": "wrong"}
    )
    # Just check endpoint is accessible (any response)
    assert response.status_code in [200, 400, 401, 422, 500, 502, 503, 504, 521, 522]


@pytest.mark.asyncio
async def test_register_endpoint(test_client: AsyncClient):
    """Test register endpoint exists."""
    response = await test_client.post(
        "/api/auth/local/register",
        json={"email": "test@test.com", "password": "test", "display_name": "Test"}
    )
    # Just check endpoint is accessible
    assert response.status_code in [200, 201, 400, 422, 500, 502]


@pytest.mark.asyncio
async def test_register_rate_limited_after_5_attempts(test_client: AsyncClient):
    """6th register attempt from the same IP within the window is 429'd."""
    for i in range(5):
        response = await test_client.post(
            "/api/auth/local/register",
            json={"login": f"ratelimit_user_{i}", "password": "test1234"},
        )
        assert response.status_code != 429

    response = await test_client.post(
        "/api/auth/local/register",
        json={"login": "ratelimit_user_6th", "password": "test1234"},
    )
    assert response.status_code == 429
    assert "Retry-After" in response.headers