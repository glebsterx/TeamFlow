"""Webhook trigger service."""
import asyncio
import json
import hmac
import hashlib
from typing import Any, Dict, Optional

import aiohttp

from app.core.db import AsyncSessionLocal
from app.domain.models import Webhook, WebhookLog


async def trigger_webhooks(event: str, task_data: Dict[str, Any]) -> None:
    """
    Trigger all webhooks for a given event.
    
    Args:
        event: Event name (task.created, task.status_changed, task.updated, task.deleted)
        task_data: Task data to send in the payload
    """
    async with AsyncSessionLocal() as db:
        # Find all active webhooks that subscribe to this event
        from sqlalchemy import select
        
        result = await db.execute(
            select(Webhook).where(Webhook.is_active == True)
        )
        webhooks = result.scalars().all()
        
        for webhook in webhooks:
            # Check if webhook subscribes to this event
            try:
                events = json.loads(webhook.events)
            except:
                continue
            
            if event not in events:
                continue
            
            # Trigger webhook asynchronously
            asyncio.create_task(
                _trigger_single_webhook(webhook, event, task_data)
            )


async def _trigger_single_webhook(
    webhook: Webhook,
    event: str,
    task_data: Dict[str, Any]
) -> None:
    """Trigger a single webhook with retry logic."""
    from app.core.db import AsyncSessionLocal
    
    # Build payload
    payload = {
        "event": event,
        "task": task_data,
        "timestamp": asyncio.get_event_loop().time() if asyncio.get_event_loop().is_running() else "N/A"
    }
    
    # Sign payload if secret is set
    signature = None
    if webhook.secret:
        signature = hmac.new(
            webhook.secret.encode(),
            json.dumps(payload).encode(),
            hashlib.sha256
        ).hexdigest()
    
    headers = {"Content-Type": "application/json"}
    if signature:
        headers["X-Webhook-Signature"] = signature
    
    # Retry logic: 3 attempts with exponential backoff (1s, 5s, 30s)
    delays = [1, 5, 30]
    
    async with AsyncSessionLocal() as db:
        for attempt, delay in enumerate(delays):
            log_entry = WebhookLog(
                webhook_id=webhook.id,
                event=event,
            )
            
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.post(
                        webhook.url,
                        json=payload,
                        headers=headers,
                        timeout=aiohttp.ClientTimeout(total=15)
                    ) as resp:
                        log_entry.status_code = resp.status
                        try:
                            log_entry.response = await resp.text()
                        except:
                            log_entry.response = None
                        
                        # Success - 2xx status
                        if 200 <= resp.status < 300:
                            webhook.last_triggered_at = log_entry.created_at
                            db.add(log_entry)
                            await db.commit()
                            return  # Exit on success
                        
            except asyncio.TimeoutError:
                log_entry.error = f"Timeout after 15s (attempt {attempt + 1}/3)"
            except aiohttp.ClientError as e:
                log_entry.error = f"Client error: {str(e)} (attempt {attempt + 1}/3)"
            except Exception as e:
                log_entry.error = f"Error: {str(e)} (attempt {attempt + 1}/3)"
            
            # Log failed attempt
            db.add(log_entry)
            await db.commit()
            
            # Wait before next attempt (except on last attempt)
            if attempt < len(delays) - 1:
                await asyncio.sleep(delay)
        
        # All attempts failed - log final failure
        # The log was already added in the loop
        pass


async def trigger_task_created(task_data: Dict[str, Any]) -> None:
    """Trigger webhooks for task.created event."""
    await trigger_webhooks("task.created", task_data)


async def trigger_task_updated(task_data: Dict[str, Any]) -> None:
    """Trigger webhooks for task.updated event."""
    await trigger_webhooks("task.updated", task_data)


async def trigger_task_status_changed(
    old_status: str,
    new_status: str,
    task_data: Dict[str, Any]
) -> None:
    """Trigger webhooks for task.status_changed event."""
    task_data["status_change"] = {
        "old": old_status,
        "new": new_status
    }
    await trigger_webhooks("task.status_changed", task_data)


async def trigger_task_deleted(task_data: Dict[str, Any]) -> None:
    """Trigger webhooks for task.deleted event."""
    await trigger_webhooks("task.deleted", task_data)