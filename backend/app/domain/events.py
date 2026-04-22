"""Domain events."""
from dataclasses import dataclass
from datetime import datetime
from typing import Optional, Any
import json
from app.domain.enums import TaskStatus


@dataclass
class DomainEvent:
    """Base domain event."""
    occurred_at: datetime


@dataclass
class TaskCreated(DomainEvent):
    """Event when task is created."""
    task_id: int
    title: str
    assignee_id: Optional[int]
    source: str


@dataclass
class TaskStatusChanged(DomainEvent):
    """Event when task status changes."""
    task_id: int
    old_status: TaskStatus
    new_status: TaskStatus
    changed_by: Optional[int]


@dataclass
class TaskBlocked(DomainEvent):
    """Event when task is blocked."""
    task_id: int
    blocker_text: str
    blocked_by: Optional[int]


@dataclass
class TaskUnblocked(DomainEvent):
    """Event when task is unblocked."""
    task_id: int
    unblocked_by: Optional[int]


@dataclass
class MeetingRecorded(DomainEvent):
    """Event when meeting is recorded."""
    meeting_id: int
    meeting_date: datetime
    summary: str


async def is_event_store_enabled() -> bool:
    """Check if event store is enabled in settings."""
    from app.core.db import AsyncSessionLocal
    from app.services.settings_service import SettingsService
    
    try:
        async with AsyncSessionLocal() as db:
            val = await SettingsService.get(db, "event_store_enabled")
            return val == "true"
    except Exception:
        return False


async def save_event(
    event_type: str,
    payload: dict[str, Any],
    task_id: Optional[int] = None,
) -> None:
    """Save domain event to database if event store is enabled."""
    if not await is_event_store_enabled():
        return
    
    from app.core.db import AsyncSessionLocal
    from app.domain.models import DomainEvent
    from app.core.clock import Clock
    
    try:
        async with AsyncSessionLocal() as db:
            event = DomainEvent(
                event_type=event_type,
                payload=json.dumps(payload, default=str),
                task_id=task_id,
                created_at=Clock.now(),
            )
            db.add(event)
            await db.commit()
    except Exception:
        pass


async def get_events(task_id: Optional[int] = None, limit: int = 100) -> list[dict]:
    """Get domain events, optionally filtered by task_id."""
    from app.core.db import AsyncSessionLocal
    from app.domain.models import DomainEvent
    from sqlalchemy import select
    
    try:
        async with AsyncSessionLocal() as db:
            if task_id:
                result = await db.execute(
                    select(DomainEvent)
                    .where(DomainEvent.task_id == task_id)
                    .order_by(DomainEvent.created_at.desc())
                    .limit(limit)
                )
            else:
                result = await db.execute(
                    select(DomainEvent)
                    .order_by(DomainEvent.created_at.desc())
                    .limit(limit)
                )
            events = result.scalars().all()
            return [
                {
                    "id": e.id,
                    "event_type": e.event_type,
                    "payload": json.loads(e.payload) if e.payload else {},
                    "task_id": e.task_id,
                    "created_at": e.created_at.isoformat() if e.created_at else None,
                }
                for e in events
            ]
    except Exception:
        return []
