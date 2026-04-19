"""Pytest configuration and fixtures."""
import pytest
import os
from typing import AsyncGenerator
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.config import settings
import os

# Use local database (tests run locally, not in container)
TEST_DATABASE_URL = "sqlite+aiosqlite:///./data/teamflow.db"


@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    """Use production database (backup already made)."""
    # We use settings.DATABASE_URL (production DB)
    # Tests run on real data
    yield


@pytest.fixture(scope="session")
def event_loop():
    """Create event loop for async tests."""
    import asyncio
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest.fixture(scope="function")
async def test_db_session(setup_test_db):
    """Create test database session."""
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        yield session
    
    await engine.dispose()


@pytest.fixture(scope="function")
async def test_client() -> AsyncGenerator[AsyncClient, None]:
    """Create test HTTP client."""
    from app.web.app import app
    
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client