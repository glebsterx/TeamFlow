"""Pydantic schemas for Web API."""
from datetime import datetime
from typing import Optional, List, TYPE_CHECKING
from pydantic import BaseModel, ConfigDict


class AssigneeResponse(BaseModel):
    """Assignee info."""
    telegram_id: int
    username: Optional[str]
    first_name: str
    display_name: str

    model_config = ConfigDict(from_attributes=True)


class CommentResponse(BaseModel):
    id: int
    task_id: int
    text: str
    author_name: Optional[str]
    author_telegram_id: Optional[int]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CommentUpdate(BaseModel):
    text: str


class BlockerResponse(BaseModel):
    id: int
    task_id: int
    text: str
    created_by: Optional[int]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SubtaskResponse(BaseModel):
    """Lightweight subtask (no nested subtasks to avoid infinite recursion)."""
    id: int
    title: str
    status: str
    priority: str = "NORMAL"
    assignee: Optional[AssigneeResponse] = None
    due_date: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TaskResponse(BaseModel):
    id: int
    title: str
    description: Optional[str]
    status: str
    priority: str = "NORMAL"
    due_date: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    archived: bool = False
    deleted: bool = False
    backlog: bool = False
    backlog_added_at: Optional[datetime] = None

    # Project
    project_id: Optional[int] = None
    parent_task_id: Optional[int] = None
    subtasks: List[SubtaskResponse] = []

    # Assignee — из связанного объекта
    assignee: Optional[AssigneeResponse] = None
    # Для обратной совместимости
    assignee_name: Optional[str]
    assignee_telegram_id: Optional[int]

    blockers: List[BlockerResponse] = []

    model_config = ConfigDict(from_attributes=True)


class TaskDetailResponse(TaskResponse):
    blockers: List[BlockerResponse] = []
    source: str
    source_chat_id: Optional[int]


class StatsResponse(BaseModel):
    total: int
    todo: int
    doing: int
    done: int
    blocked: int
    on_hold: int = 0
    archived: int = 0
    deleted: int = 0


class TelegramUserResponse(BaseModel):
    id: int
    telegram_id: int
    username: Optional[str]
    first_name: str
    last_name: Optional[str]
    display_name: str
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class BotInfoResponse(BaseModel):
    username: str
    bot_name: str


class PushSubscriptionCreate(BaseModel):
    endpoint: str
    keys: dict  # {"p256dh": "...", "auth": "..."}
    user_telegram_id: Optional[int] = None


class UnsubscribeRequest(BaseModel):
    endpoint: str
