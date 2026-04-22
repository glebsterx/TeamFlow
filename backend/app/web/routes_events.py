"""Domain events API."""
from typing import Optional
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from app.core.db import get_db
from app.domain import events as events_module

router = APIRouter()


class EventResponse(BaseModel):
    id: int
    event_type: str
    payload: dict
    task_id: Optional[int]
    created_at: Optional[str]


@router.get("", response_model=list[EventResponse])
async def get_events(
    task_id: int = Query(None, description="Filter by task ID"),
    limit: int = Query(100, le=500),
    is_enabled: bool = Query(None, description="Check if event store is enabled"),
) -> list[dict]:
    """Get domain events."""
    if is_enabled is not None:
        enabled = await events_module.is_event_store_enabled()
        return {"enabled": enabled}
    
    return await events_module.get_events(task_id=task_id, limit=limit)


@router.get("/enabled")
async def check_enabled() -> dict:
    """Check if event store is enabled."""
    enabled = await events_module.is_event_store_enabled()
    return {"enabled": enabled}