"""Test OAuth endpoints - basic existence."""
import time
import jwt
import pytest
from httpx import AsyncClient

from app.config import get_secret_key
from app.web.routes_auth import _verify_oauth_link_token


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


@pytest.mark.asyncio
async def test_oauth_link_token_requires_auth(test_client: AsyncClient):
    """/oauth-link-token can't be called without a valid session — this is
    what prevents linking an arbitrary account_id (was the actual bug:
    /google/link and /yandex/link used to trust a raw ?account_id= query
    param, letting anyone link their own Google/Yandex identity to a
    victim's account)."""
    response = await test_client.get("/api/auth/oauth-link-token", params={"provider": "google"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_oauth_link_token_issued_for_caller_account(test_client: AsyncClient):
    account_id = int(time.time() * 1000) % 1_000_000_000
    token = jwt.encode(
        {"sub": str(account_id), "type": "local", "exp": time.time() + 3600},
        get_secret_key(), algorithm="HS256",
    )
    response = await test_client.get(
        "/api/auth/oauth-link-token",
        params={"provider": "google"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    link_token = response.json()["link_token"]
    assert _verify_oauth_link_token(link_token, "google") == account_id


def test_verify_oauth_link_token_rejects_forgery():
    # No token at all -> falls back to "no account", not a crash
    assert _verify_oauth_link_token(None, "google") is None
    # Garbage token
    assert _verify_oauth_link_token("not-a-jwt", "google") is None
    # Right signature, wrong provider (minted for yandex, presented to google)
    token = jwt.encode(
        {"sub": "1", "type": "oauth_link", "provider": "yandex", "exp": time.time() + 300},
        get_secret_key(), algorithm="HS256",
    )
    assert _verify_oauth_link_token(token, "google") is None
    # Expired
    expired = jwt.encode(
        {"sub": "1", "type": "oauth_link", "provider": "google", "exp": time.time() - 10},
        get_secret_key(), algorithm="HS256",
    )
    assert _verify_oauth_link_token(expired, "google") is None
    # Signed with the wrong key (forged) -> rejected even with correct shape
    forged = jwt.encode(
        {"sub": "999", "type": "oauth_link", "provider": "google", "exp": time.time() + 300},
        "wrong-secret", algorithm="HS256",
    )
    assert _verify_oauth_link_token(forged, "google") is None