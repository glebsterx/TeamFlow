"""Test auth endpoints."""
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
    assert "version" in data