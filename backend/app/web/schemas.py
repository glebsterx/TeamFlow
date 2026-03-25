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


class TagResponse(BaseModel):
    id: int
    name: str
    color: str

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
    resolved_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class SubtaskResponse(BaseModel):
    """Lightweight subtask — без вложенных подзадач и без tags (требует отдельного selectinload)."""
    id: int
    title: str
    status: str
    priority: str = "NORMAL"
    assignee: Optional[AssigneeResponse] = None
    due_date: Optional[datetime] = None
    created_at: datetime
    recurrence: Optional[str] = None

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
    tags: List[TagResponse] = []
    recurrence: Optional[str] = None
    recurrence_end_date: Optional[datetime] = None
    time_spent: int = 0  # Потраченное время в минутах

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


# Webhook schemas
class WebhookCreate(BaseModel):
    """Создание вебхука."""
    url: str
    events: List[str]  # ["task.created", "task.status_changed", "task.updated", "task.deleted"]
    secret: Optional[str] = None
    is_active: bool = True


class WebhookUpdate(BaseModel):
    """Обновление вебхука."""
    url: Optional[str] = None
    events: Optional[List[str]] = None
    secret: Optional[str] = None
    is_active: Optional[bool] = None


class WebhookResponse(BaseModel):
    """Ответ вебхука."""
    id: int
    url: str
    events: str  # JSON string
    secret: Optional[str] = None
    is_active: bool
    created_at: datetime
    last_triggered_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class WebhookTestRequest(BaseModel):
    """Запрос на тестирование вебхука."""
    event: str = "test"


class WebhookLogResponse(BaseModel):
    """Лог вызова вебхука."""
    id: int
    webhook_id: int
    event: str
    status_code: Optional[int] = None
    response: Optional[str] = None
    error: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
