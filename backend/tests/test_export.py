"""Test the streaming JSON export endpoint (/api/export)."""
import time
import pytest
from httpx import AsyncClient


async def _register(test_client: AsyncClient) -> str:
    login = f"export_user_{int(time.time() * 1000)}"
    response = await test_client.post(
        "/api/auth/local/register",
        json={"login": login, "password": "test1234"},
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


@pytest.mark.asyncio
async def test_export_unauthenticated_is_rejected(test_client: AsyncClient):
    response = await test_client.get("/api/export")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_export_contains_created_task(test_client: AsyncClient):
    token = await _register(test_client)
    headers = {"Authorization": f"Bearer {token}"}

    title = f"Export test task {int(time.time() * 1000)}"
    create_resp = await test_client.post(
        "/api/tasks", json={"title": title, "status": "TODO"}, headers=headers
    )
    assert create_resp.status_code in (200, 201), create_resp.text
    task_id = create_resp.json()["id"]

    export_resp = await test_client.get("/api/export", headers=headers)
    assert export_resp.status_code == 200
    assert "attachment; filename=teamflow-export-" in export_resp.headers["content-disposition"]

    data = export_resp.json()
    assert data["version"]
    task_ids = [t["id"] for t in data["tasks"]]
    assert task_id in task_ids
    exported = next(t for t in data["tasks"] if t["id"] == task_id)
    assert exported["title"] == title


@pytest.mark.asyncio
async def test_export_includes_task_tags(test_client: AsyncClient):
    token = await _register(test_client)
    headers = {"Authorization": f"Bearer {token}"}

    task_resp = await test_client.post(
        "/api/tasks", json={"title": "Tagged task", "status": "TODO"}, headers=headers
    )
    task_id = task_resp.json()["id"]

    tag_resp = await test_client.post(
        "/api/tags", json={"name": f"tag_{int(time.time() * 1000)}"}, headers=headers
    )
    assert tag_resp.status_code in (200, 201), tag_resp.text
    tag_id = tag_resp.json()["id"]

    link_resp = await test_client.post(f"/api/tasks/{task_id}/tags/{tag_id}", headers=headers)
    assert link_resp.status_code in (200, 201), link_resp.text

    export_resp = await test_client.get("/api/export", headers=headers)
    assert export_resp.status_code == 200
    data = export_resp.json()
    assert {"id": tag_id, "name": tag_resp.json()["name"], "color": tag_resp.json()["color"]} in data["tags"] or any(
        t["id"] == tag_id for t in data["tags"]
    )
    assert {"task_id": task_id, "tag_id": tag_id} in data["task_tags"]


@pytest.mark.asyncio
async def test_export_import_roundtrip_with_tags_and_templates(test_client: AsyncClient):
    """Regression test: /import used to crash on task_tags/task_templates
    (imported a non-existent `TaskTag` ORM class, and `TaskTemplate` from the
    wrong module) — found while fixing /export to stream."""
    token = await _register(test_client)
    headers = {"Authorization": f"Bearer {token}"}

    task_resp = await test_client.post(
        "/api/tasks", json={"title": "Roundtrip task", "status": "TODO"}, headers=headers
    )
    task_id = task_resp.json()["id"]
    tag_resp = await test_client.post(
        "/api/tags", json={"name": f"rt_tag_{int(time.time() * 1000)}"}, headers=headers
    )
    tag_id = tag_resp.json()["id"]
    await test_client.post(f"/api/tasks/{task_id}/tags/{tag_id}", headers=headers)

    template_resp = await test_client.post(
        "/api/task-templates",
        json={"name": f"tmpl_{int(time.time() * 1000)}", "title": "T"},
        headers=headers,
    )
    assert template_resp.status_code in (200, 201), template_resp.text

    export_resp = await test_client.get("/api/export", headers=headers)
    exported = export_resp.json()

    import_resp = await test_client.post(
        "/api/import",
        json={"mode": "merge", "data": exported},
        headers=headers,
    )
    assert import_resp.status_code == 200, import_resp.text


@pytest.mark.asyncio
async def test_import_full_mode_wipes_existing_tasks(test_client: AsyncClient):
    """mode=full soft-deletes existing tasks before importing (ORM update(),
    used to be raw `text("UPDATE tasks SET deleted = 1")`)."""
    token = await _register(test_client)
    headers = {"Authorization": f"Bearer {token}"}

    task_resp = await test_client.post(
        "/api/tasks", json={"title": "To be wiped", "status": "TODO"}, headers=headers
    )
    task_id = task_resp.json()["id"]

    import_resp = await test_client.post(
        "/api/import",
        json={"mode": "full", "data": {"projects": [], "tasks": []}},
        headers=headers,
    )
    assert import_resp.status_code == 200, import_resp.text

    detail_resp = await test_client.get(f"/api/tasks/{task_id}", headers=headers)
    assert detail_resp.status_code == 200
    assert detail_resp.json()["deleted"] is True


@pytest.mark.asyncio
async def test_export_include_filter_excludes_other_sections(test_client: AsyncClient):
    token = await _register(test_client)
    headers = {"Authorization": f"Bearer {token}"}

    response = await test_client.get("/api/export?include=projects", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["tasks"] == []
    assert data["comments"] == []
    assert data["meetings"] == []
