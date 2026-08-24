"""Web Push routes — VAPID key, subscribe/unsubscribe, config."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import logging

from app.core.db import get_db
from app.web import schemas
from app.domain.models import PushSubscription as PushSubscriptionModel
from app.services.vapid_service import (
    get_vapid_claims_email,
    set_vapid_keys,
    set_vapid_claims_email,
    generate_vapid_keys,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/push/vapid-public-key")
async def get_vapid_public_key(db: AsyncSession = Depends(get_db)):
    """Return VAPID public key for client-side subscription.

    #272 — Key stored in app_settings DB, auto-generated on first request.
    """
    # local import: the service function shares its name with this route
    # handler — importing it at module level would be shadowed by `def
    # get_vapid_public_key` below, causing infinite self-recursion
    from app.services.vapid_service import get_vapid_public_key

    public_key = await get_vapid_public_key(db)

    # Auto-generate if not set
    if not public_key:
        private_key, public_key = generate_vapid_keys()
        await set_vapid_keys(db, private_key, public_key)
        logger.info("VAPID keys auto-generated on first public key request")

    return {"public_key": public_key}


@router.post("/push/subscribe")
async def push_subscribe(
    request: schemas.PushSubscriptionCreate, db: AsyncSession = Depends(get_db)
):
    """Save or update a Web Push subscription (upsert by endpoint)."""

    result = await db.execute(
        select(PushSubscriptionModel).where(
            PushSubscriptionModel.endpoint == request.endpoint
        )
    )
    sub = result.scalar_one_or_none()

    if sub:
        sub.p256dh = request.keys["p256dh"]
        sub.auth = request.keys["auth"]
        sub.user_telegram_id = request.user_telegram_id
        sub.account_id = request.account_id
    else:
        sub = PushSubscriptionModel(
            endpoint=request.endpoint,
            p256dh=request.keys["p256dh"],
            auth=request.keys["auth"],
            user_telegram_id=request.user_telegram_id,
            account_id=request.account_id,
        )
        db.add(sub)
    await db.commit()
    return {"ok": True}


@router.get("/push/config")
async def get_push_config(db: AsyncSession = Depends(get_db)):
    """Get VAPID public key and claims email for push notifications."""
    # local import: see get_vapid_public_key() route above — name collision
    # with the route handler of the same name
    from app.services.vapid_service import get_vapid_public_key

    public_key = await get_vapid_public_key(db)
    if not public_key:
        private_key, public_key = generate_vapid_keys()
        await set_vapid_keys(db, private_key, public_key)

    email = await get_vapid_claims_email(db)

    return {"public_key": public_key, "claims_email": email}


@router.put("/push/config")
async def update_push_config(
    body: dict, db: AsyncSession = Depends(get_db)
):
    """Update VAPID claims email for push notifications."""

    email = body.get("claims_email", "")
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Invalid email address")

    await set_vapid_claims_email(db, email)
    return {"ok": True, "claims_email": email}


@router.delete("/push/unsubscribe")
async def push_unsubscribe(
    request: schemas.UnsubscribeRequest, db: AsyncSession = Depends(get_db)
):
    """Remove a Web Push subscription by endpoint."""

    result = await db.execute(
        select(PushSubscriptionModel).where(
            PushSubscriptionModel.endpoint == request.endpoint
        )
    )
    sub = result.scalar_one_or_none()
    if sub:
        await db.delete(sub)
        await db.commit()
    return {"ok": True}
