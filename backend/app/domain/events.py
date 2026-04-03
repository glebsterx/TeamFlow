"""Domain events."""
from dataclasses import dataclass
from datetime import datetime
from typing import Optional
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
    changed_by: Optional[int]  # Telegram user ID

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
