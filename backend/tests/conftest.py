"""Pytest configuration and fixtures."""
import os

# Must be set before any `app.*` module is imported — app.core.db builds its
# engine from settings.DATABASE_URL at import time (module-level singleton).
TEST_DB_FILE = os.path.join(os.path.dirname(__file__), "test_teamflow.db")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{TEST_DB_FILE}"

import pytest
from typing import AsyncGenerator
from httpx import AsyncClient, ASGITransport


@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    """Create a fresh, isolated sqlite file for the test session; remove it after."""
    if os.path.exists(TEST_DB_FILE):
        os.remove(TEST_DB_FILE)

    import asyncio
    from app.core.db import init_db

    asyncio.get_event_loop_policy().new_event_loop().run_until_complete(init_db())

    yield

    if os.path.exists(TEST_DB_FILE):
        os.remove(TEST_DB_FILE)


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
    from app.core.db import AsyncSessionLocal

    async with AsyncSessionLocal() as session:
        yield session


@pytest.fixture(scope="function")
async def test_client() -> AsyncGenerator[AsyncClient, None]:
    """Create test HTTP client."""
    from app.web.app import app
    from app.core.rate_limit import _buckets

    # In-memory rate-limit buckets are a module-level singleton shared across
    # the whole test session — clear between tests so one test's requests
    # don't trip another test's limiter (same synthetic client IP/account).
    _buckets.clear()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client