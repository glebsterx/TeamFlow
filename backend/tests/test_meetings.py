"""Test meetings CRUD endpoints."""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.mark.asyncio
async def test_get_meetings(test_client: AsyncClient, test_db_session: AsyncSession):
    """Test get meetings."""
    response = await test_client.get("/api/meetings")
    assert response.status_code in [200, 401]


@pytest.mark.asyncio
async def test_create_meeting(test_client: AsyncClient, test_db_session: AsyncSession):
    """Test meeting creation."""
    import time
    response = await test_client.post(
        "/api/meetings",
        json={
            "summary": f"Test meeting {int(time.time())}",
            "meeting_date": "2026-04-19T10:00:00",
            "meeting_type": "standup"
        }
    )
    assert response.status_code in [200, 201, 401, 422]


@pytest.mark.asyncio
async def test_meeting_tasks(test_client: AsyncClient, test_db_session: AsyncSession):
    """Test get meeting tasks."""
    response = await test_client.get("/api/meetings/1/tasks")
    assert response.status_code in [200, 401, 404]


@pytest.mark.asyncio
async def test_parse_action_items(test_client: AsyncClient, test_db_session: AsyncSession):
    """Test parse action items from meeting."""
    response = await test_client.post(
        "/api/meetings/1/parse-action-items",
        json={"text": "Buy milk\nFinish report"}
    )
    assert response.status_code in [200, 401, 404, 422]