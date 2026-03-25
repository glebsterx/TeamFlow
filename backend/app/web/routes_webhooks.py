"""Webhook API endpoints."""
import json
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import AsyncSessionLocal, get_db
from app.domain.models import Webhook, WebhookLog
from app.web.schemas import (
    WebhookCreate,
    WebhookUpdate,
    WebhookResponse,
    WebhookLogResponse,
    WebhookTestRequest,
)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


async def get_db_session():
    async with AsyncSessionLocal() as session:
        yield session


@router.get("", response_model=List[WebhookResponse])
async def get_webhooks(db: AsyncSession = Depends(get_db_session)):
    """GET /api/webhooks — список всех вебхуков."""
    result = await db.execute(select(Webhook).order_by(Webhook.created_at.desc()))
    return result.scalars().all()


@router.post("", response_model=WebhookResponse, status_code=201)
async def create_webhook(webhook: WebhookCreate, db: AsyncSession = Depends(get_db_session)):
    """POST /api/webhooks — создание нового вебхука."""
    db_webhook = Webhook(
        url=webhook.url,
        events=json.dumps(webhook.events),
        secret=webhook.secret,
        is_active=webhook.is_active,
    )
    db.add(db_webhook)
    await db.commit()
    await db.refresh(db_webhook)
    return db_webhook


@router.get("/{webhook_id}", response_model=WebhookResponse)
async def get_webhook(webhook_id: int, db: AsyncSession = Depends(get_db_session)):
    """GET /api/webhooks/{id} — получить вебхук."""
    result = await db.execute(select(Webhook).where(Webhook.id == webhook_id))
    webhook = result.scalar_one_or_none()
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook not found")
    return webhook


@router.patch("/{webhook_id}", response_model=WebhookResponse)
async def update_webhook(
    webhook_id: int,
    webhook_update: WebhookUpdate,
    db: AsyncSession = Depends(get_db_session),
):
    """PATCH /api/webhooks/{id} — обновление вебхука."""
    result = await db.execute(select(Webhook).where(Webhook.id == webhook_id))
    webhook = result.scalar_one_or_none()
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook not found")

    if webhook_update.url is not None:
        webhook.url = webhook_update.url
    if webhook_update.events is not None:
        webhook.events = json.dumps(webhook_update.events)
    if webhook_update.secret is not None:
        webhook.secret = webhook_update.secret
    if webhook_update.is_active is not None:
        webhook.is_active = webhook_update.is_active

    await db.commit()
    await db.refresh(webhook)
    return webhook


@router.delete("/{webhook_id}", status_code=204)
async def delete_webhook(webhook_id: int, db: AsyncSession = Depends(get_db_session)):
    """DELETE /api/webhooks/{id} — удаление вебхука."""
    result = await db.execute(select(Webhook).where(Webhook.id == webhook_id))
    webhook = result.scalar_one_or_none()
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook not found")

    await db.delete(webhook)
    await db.commit()
    return None


@router.post("/{webhook_id}/test")
async def test_webhook(
    webhook_id: int,
    test_request: WebhookTestRequest,
    db: AsyncSession = Depends(get_db_session),
):
    """POST /api/webhooks/{id}/test — тестовый запрос."""
    import aiohttp

    result = await db.execute(select(Webhook).where(Webhook.id == webhook_id))
    webhook = result.scalar_one_or_none()
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook not found")

    payload = {
        "event": test_request.event,
        "webhook_id": webhook.id,
        "timestamp": str(webhook.created_at),
    }

    # Sign payload if secret is set
    import hmac
    import hashlib

    signature = None
    if webhook.secret:
        signature = hmac.new(
            webhook.secret.encode(), json.dumps(payload).encode(), hashlib.sha256
        ).hexdigest()

    headers = {"Content-Type": "application/json"}
    if signature:
        headers["X-Webhook-Signature"] = signature

    log_entry = WebhookLog(webhook_id=webhook.id, event=test_request.event)

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(webhook.url, json=payload, headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                log_entry.status_code = resp.status
                try:
                    log_entry.response = await resp.text()
                except:
                    log_entry.response = None
    except Exception as e:
        log_entry.error = str(e)

    db.add(log_entry)
    await db.commit()

    return {
        "status": "success" if log_entry.status_code and 200 <= log_entry.status_code < 300 else "failed",
        "status_code": log_entry.status_code,
        "error": log_entry.error,
    }


@router.get("/{webhook_id}/logs", response_model=List[WebhookLogResponse])
async def get_webhook_logs(webhook_id: int, db: AsyncSession = Depends(get_db_session)):
    """GET /api/webhooks/{id}/logs — получить логи вебхука."""
    result = await db.execute(
        select(WebhookLog)
        .where(WebhookLog.webhook_id == webhook_id)
        .order_by(WebhookLog.created_at.desc())
        .limit(50)
    )
    return result.scalars().all()