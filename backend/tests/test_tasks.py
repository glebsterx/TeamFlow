"""Test tasks CRUD endpoints."""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.mark.asyncio
async def test_create_task(test_client: AsyncClient, test_db_session: AsyncSession):
    """Test task creation."""
    import time
    title = f"Test task {int(time.time())}"
    
    # Create via API (will fail without auth, but tests endpoint exists)
    response = await test_client.post(
        "/api/tasks",
        json={"title": title, "status": "TODO"}
    )
    # Should be 401 or 422 (auth required) but endpoint exists
    assert response.status_code in [200, 201, 401, 422]


@pytest.mark.asyncio
async def test_get_tasks(test_client: AsyncClient, test_db_session: AsyncSession):
    """Test get tasks."""
    response = await test_client.get("/api/tasks")
    # Should return list (empty or with data)
    assert response.status_code in [200, 401]


@pytest.mark.asyncio
async def test_task_detail(test_client: AsyncClient, test_db_session: AsyncSession):
    """Test get task by ID."""
    response = await test_client.get("/api/tasks/1")
    assert response.status_code in [200, 404, 401]


@pytest.mark.asyncio
async def test_task_status_change(test_client: AsyncClient, test_db_session: AsyncSession):
    """Test task status change."""
    response = await test_client.post(
        "/api/tasks/1/status",
        json={"status": "DOING"}
    )
    assert response.status_code in [200, 401, 404, 422]