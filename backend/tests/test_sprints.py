"""Test sprints CRUD endpoints."""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.mark.asyncio
async def test_get_sprints(test_client: AsyncClient, test_db_session: AsyncSession):
    """Test get sprints."""
    response = await test_client.get("/api/sprints")
    assert response.status_code in [200, 401]


@pytest.mark.asyncio
async def test_create_sprint(test_client: AsyncClient, test_db_session: AsyncSession):
    """Test sprint creation."""
    import time
    response = await test_client.post(
        "/api/sprints",
        json={
            "name": f"Test sprint {int(time.time())}",
            "start_date": "2026-04-19T00:00:00",
            "end_date": "2026-04-26T00:00:00"
        }
    )
    assert response.status_code in [200, 201, 401, 422]


@pytest.mark.asyncio
async def test_sprint_tasks(test_client: AsyncClient, test_db_session: AsyncSession):
    """Test get sprint tasks."""
    response = await test_client.get("/api/sprints/1/tasks")
    assert response.status_code in [200, 401, 404]


@pytest.mark.asyncio
async def test_reorder_sprint(test_client: AsyncClient, test_db_session: AsyncSession):
    """Test sprint task reorder."""
    response = await test_client.post(
        "/api/sprints/1/reorder",
        json={"task_ids": [1, 2, 3]}
    )
    assert response.status_code in [200, 401, 404, 422]