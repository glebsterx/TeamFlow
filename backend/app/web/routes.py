"""Web API routes - no auth."""

import json
import asyncio
import logging
from typing import Optional, List
from fastapi import APIRouter, Query, BackgroundTasks, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text, delete, or_
from sqlalchemy.orm import selectinload
from datetime import datetime
from pydantic import BaseModel, ConfigDict, field_validator
from datetime import date
import secrets
from app.core.db import get_db, AsyncSessionLocal
from app.core.clock import Clock
from app.services.task_service import TaskService
from app.repositories.user_repository import UserRepository
from app.domain.enums import TaskStatus
from app.domain.models import Task, Project, Meeting, Comment, LocalAccount
from app.web import schemas
from app.web.schemas import (
    TaskResponse,
    TaskDetailResponse,
    StatsResponse,
    BotInfoResponse,
)
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()

# Public, unauthenticated endpoints shown on the pre-login Welcome/Login page
# (e.g. the bot username for the "Login via Telegram" button). Mounted in
# app.py WITHOUT the account-auth dependency — everything else in `router`
# requires a logged-in session.
public_router = APIRouter()


@public_router.get("/bot-info", response_model=BotInfoResponse)
async def get_bot_info(db: AsyncSession = Depends(get_db)):
    from app.services.settings_service import SettingsService

    username = await SettingsService.get(db, "bot_username") or ""
    return BotInfoResponse(username=username, bot_name=settings.APP_NAME)


@router.get("/tasks", response_model=List[TaskResponse])
async def get_tasks(
    status: Optional[TaskStatus] = None, db: AsyncSession = Depends(get_db)
):
    service = TaskService(db)
    tasks = await service.get_all_tasks(status)
    return tasks


@router.get("/tasks/{task_id}", response_model=TaskDetailResponse)
async def get_task(task_id: int, db: AsyncSession = Depends(get_db)):
    service = TaskService(db)
    task = await service.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.get("/stats", response_model=StatsResponse)
async def get_stats(db: AsyncSession = Depends(get_db)):
    """#260 — Optimized: simple COUNT queries instead of loading full objects."""
    from app.domain.models import Task as TaskModel
    from sqlalchemy import func as sa_func
    from sqlalchemy import select as sa_select

    async def count(where) -> int:
        result = await db.execute(sa_select(sa_func.count(TaskModel.id)).where(*where))
        return result.scalar() or 0

    base = [
        TaskModel.archived == False,
        TaskModel.deleted == False,
        TaskModel.backlog == False,
    ]

    return {
        "total": await count(base),
        "todo": await count(base + [TaskModel.status == TaskStatus.TODO.value]),
        "doing": await count(base + [TaskModel.status == TaskStatus.DOING.value]),
        "done": await count(base + [TaskModel.status == TaskStatus.DONE.value]),
        "blocked": await count(base + [TaskModel.status == TaskStatus.BLOCKED.value]),
        "on_hold": await count(base + [TaskModel.status == TaskStatus.ON_HOLD.value]),
        "archived": await count(
            [TaskModel.archived == True, TaskModel.deleted == False]
        ),
        "deleted": await count([TaskModel.deleted == True]),
    }


@router.get("/users", response_model=List[schemas.LocalAccountResponse])
async def get_users(db: AsyncSession = Depends(get_db)):
    """Get all active users."""
    repo = UserRepository(db)
    users = await repo.get_all_accounts()
    return users


class AssignRequest(BaseModel):
    """Request body для назначения задачи."""

    user_id: Optional[int] = None


class StatusChangeRequest(BaseModel):
    """Request body для смены статуса."""

    status: str
    block_reason: Optional[str] = None


@router.post("/tasks/{task_id}/status")
async def change_task_status(
    task_id: int,
    request: StatusChangeRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Изменить статус задачи.

    #260 — Optimized: single SELECT, no redundant queries, reused task object.
    """
    from app.domain.enums import TaskStatus
    from fastapi import HTTPException
    from app.domain.models import Task as TaskModel

    service = TaskService(db)
    try:
        # #260 — Fetch task ONCE with minimal relations, reuse throughout
        repo = service.repository
        task = await repo.get_by_id_light(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        old_status = task.status

        if request.status == TaskStatus.BLOCKED.value and request.block_reason:
            await service.block_task(task, request.block_reason.strip())
        else:
            await service.change_status(task_id, TaskStatus(request.status))
        await db.commit()

        # #260 — Reuse the same task object (already in session, fields updated)
        # Trigger webhook for status change
        if old_status and old_status != request.status:
            from app.services.webhook_service import trigger_task_status_changed

            task_data = {
                "id": task.id,
                "title": task.title,
                "status": task.status,
                "project_id": task.project_id,
                "assignee_id": task.assignee_id,
            }
            background_tasks.add_task(
                trigger_task_status_changed, old_status, request.status, task_data
            )

        # #260 — Reuse the same task object for recurrence (no additional SELECT)
        if request.status == TaskStatus.DONE.value:
            from app.domain.enums import TaskSource
            from datetime import timedelta

            if task.recurrence and task.due_date:
                delta = {
                    "daily": timedelta(days=1),
                    "weekly": timedelta(weeks=1),
                    "monthly": timedelta(days=30),
                }.get(task.recurrence)
                if delta:
                    next_due = task.due_date + delta
                    if (
                        not task.recurrence_end_date
                        or next_due <= task.recurrence_end_date
                    ):
                        next_task = TaskModel(
                            title=task.title,
                            description=task.description,
                            project_id=task.project_id,
                            assignee_id=task.assignee_id,
                            priority=task.priority,
                            due_date=next_due,
                            recurrence=task.recurrence,
                            recurrence_end_date=task.recurrence_end_date,
                            source=TaskSource.MANUAL_COMMAND.value,
                            status="TODO",
                        )
                        db.add(next_task)
                        await db.commit()

        background_tasks.add_task(
            send_push,
            title=f"Задача обновлена: #{task_id}",
            body=f"Новый статус: {request.status}",
            url=f"/?task={task_id}",
        )
        return {"ok": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/tasks/{task_id}/assign")
async def assign_task_api(
    task_id: int,
    request: AssignRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Назначить задачу пользователю."""
    service = TaskService(db)
    task = await service.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if request.user_id:
        result = await db.execute(
            select(LocalAccount).where(LocalAccount.id == request.user_id)
        )
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        await service.assign_task(task_id, user)
        await db.commit()
    else:
        # Снять исполнителя
        task.assignee_id = None

        await db.commit()

    return {"ok": True}


# ============= PROJECTS API =============


class ProjectAssignRequest(BaseModel):
    """Назначение задачи в проект."""

    project_id: Optional[int] = None


@router.post("/tasks/{task_id}/project")
async def assign_task_to_project(
    task_id: int, request: ProjectAssignRequest, db: AsyncSession = Depends(get_db)
):
    """Назначить задачу в проект."""
    service = TaskService(db)
    task = await service.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    task.project_id = request.project_id
    await db.commit()
    await db.refresh(task)

    return {"ok": True, "project_id": task.project_id}


# ============= TASKS API EXTENSIONS =============


class TaskCreateRequest(BaseModel):
    """Создание задачи."""

    title: str
    description: Optional[str] = None
    project_id: Optional[int] = None
    parent_task_id: Optional[int] = None
    assignee_id: Optional[int] = None
    due_date: Optional[datetime] = None
    priority: Optional[str] = "NORMAL"
    backlog: bool = False
    is_idea: bool = False
    recurrence: Optional[str] = None
    recurrence_end_date: Optional[datetime] = None

    @field_validator("due_date", mode="before")
    @classmethod
    def parse_due_date(cls, v):
        if v is None:
            return v
        if isinstance(v, datetime):
            return v
        if isinstance(v, date):
            return datetime.combine(v, datetime.min.time())
        # Try parsing string
        for fmt in ["%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"]:
            try:
                return datetime.strptime(str(v), fmt)
            except ValueError:
                continue
        return v  # Return as-is, let Pydantic handle validation
    source: Optional[str] = None  # overrides default TaskSource if provided


class TaskUpdateRequest(BaseModel):
    """Обновление задачи."""

    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    priority: Optional[str] = None
    parent_task_id: Optional[int] = None
    backlog: Optional[bool] = None
    is_idea: Optional[bool] = None
    recurrence: Optional[str] = None
    recurrence_end_date: Optional[datetime] = None
    time_spent: Optional[int] = None
    completed_at: Optional[datetime] = None
    # Optimistic locking — client sends the updated_at they read
    expected_updated_at: Optional[datetime] = None


class SubtaskCreateRequest(BaseModel):
    """Создание подзадачи."""

    title: str
    description: Optional[str] = None
    assignee_id: Optional[int] = None
    due_date: Optional[datetime] = None
    priority: Optional[str] = "NORMAL"


@router.post("/tasks", response_model=TaskResponse)
async def create_task_api(
    request: TaskCreateRequest, db: AsyncSession = Depends(get_db)
):
    """Создать задачу через API."""
    from app.domain.enums import TaskSource

    service = TaskService(db)

    # Используем source из запроса если передан и валиден
    try:
        task_source = (
            TaskSource(request.source) if request.source else TaskSource.MANUAL_COMMAND
        )
    except ValueError:
        task_source = TaskSource.MANUAL_COMMAND

    task = await service.create_task(
        title=request.title, description=request.description, source=task_source
    )

    if request.project_id:
        task.project_id = request.project_id

    if request.parent_task_id:
        task.parent_task_id = request.parent_task_id

    if request.due_date is not None:
        task.due_date = request.due_date

    if request.priority:
        task.priority = request.priority

    if request.backlog:
        task.backlog = True
        task.backlog_added_at = Clock.now()

    if request.is_idea:
        task.is_idea = True

    if request.recurrence:
        task.recurrence = request.recurrence
    if request.recurrence_end_date:
        task.recurrence_end_date = request.recurrence_end_date

    if request.assignee_id:
        result = await db.execute(
            select(LocalAccount).where(LocalAccount.id == request.assignee_id)
        )
        user = result.scalar_one_or_none()
        if user:
            task.assignee_id = user.id

    await db.commit()
    from app.repositories.task_repository import TaskRepository

    return await TaskRepository(db).get_by_id(task.id)


# ============= KNOWLEDGE / IDEAS API =============


@router.get("/ideas", response_model=list[dict])
async def get_ideas(db: AsyncSession = Depends(get_db)):
    """Return ideas (tasks with is_idea=True)."""
    q = select(Task).where(Task.deleted == False, Task.is_idea == True).order_by(Task.updated_at.desc())
    rows = (await db.execute(q)).scalars().all()
    return [
        {
            "id": t.id,
            "title": t.title,
            "description": t.description,
            "project_id": t.project_id,
            "is_idea": t.is_idea,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "updated_at": t.updated_at.isoformat() if t.updated_at else None,
        }
        for t in rows
    ]


@router.post("/tasks/{task_id}/convert-to-task")
async def convert_idea_to_task(task_id: int, db: AsyncSession = Depends(get_db)):
    """Convert an idea to a regular task (set is_idea=False)."""
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if not task.is_idea:
        raise HTTPException(status_code=400, detail="Task is not an idea")
    task.is_idea = False
    await db.commit()
    return {"ok": True, "id": task_id, "is_idea": False}


@router.post("/tasks/{task_id}/convert-to-idea")
async def convert_task_to_idea(task_id: int, db: AsyncSession = Depends(get_db)):
    """Convert a regular task to an idea (set is_idea=True)."""
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    task.is_idea = True
    await db.commit()
    return {"ok": True, "id": task_id, "is_idea": True}


# ============= KNOWLEDGE BASE (folders + pages) API =============


@router.patch("/tasks/{task_id}", response_model=TaskResponse)
async def update_task_api(
    task_id: int, request: TaskUpdateRequest, db: AsyncSession = Depends(get_db)
):
    """Обновить задачу."""
    service = TaskService(db)
    task = await service.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Optimistic locking check
    if request.expected_updated_at is not None:
        # Compare timestamps (allow 1 second tolerance for clock skew)
        time_diff = abs((task.updated_at - request.expected_updated_at).total_seconds())
        if time_diff > 1:
            raise HTTPException(
                status_code=409,  # Conflict
                detail={
                    "code": "CONCURRENT_EDIT",
                    "message": "Задача была изменена другим пользователем",
                    "current_updated_at": task.updated_at.isoformat(),
                    "expected_updated_at": request.expected_updated_at.isoformat(),
                },
            )

    if request.title is not None:
        task.title = request.title
    if request.description is not None:
        task.description = request.description
    if "due_date" in request.model_fields_set:
        task.due_date = request.due_date
    if request.priority is not None:
        task.priority = request.priority
    if "parent_task_id" in request.model_fields_set:
        if request.parent_task_id is None:
            task.parent_task_id = None
        else:
            if request.parent_task_id == task_id:
                raise HTTPException(
                    status_code=400, detail="Task cannot be its own parent"
                )
            from app.repositories.task_repository import TaskRepository

            parent = await TaskRepository(db).get_by_id(request.parent_task_id)
            if not parent:
                raise HTTPException(status_code=404, detail="Parent task not found")
            task.parent_task_id = request.parent_task_id

    if request.backlog is not None:
        task.backlog = request.backlog
        task.backlog_added_at = Clock.now() if request.backlog else None

    if "recurrence" in request.model_fields_set:
        task.recurrence = request.recurrence
    if "recurrence_end_date" in request.model_fields_set:
        task.recurrence_end_date = request.recurrence_end_date

    if "time_spent" in request.model_fields_set:
        task.time_spent = request.time_spent

    if "completed_at" in request.model_fields_set:
        task.completed_at = request.completed_at

    await db.commit()
    from app.repositories.task_repository import TaskRepository

    return await TaskRepository(db).get_by_id(task_id)


@router.delete("/tasks/{task_id}")
async def delete_task_api(task_id: int, db: AsyncSession = Depends(get_db)):
    """Мягкое удаление задачи (помечает как deleted)."""
    service = TaskService(db)
    task = await service.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    task.deleted = True
    await db.commit()
    return {"ok": True}


@router.delete("/tasks/{task_id}/permanent")
async def permanent_delete_task_api(task_id: int):
    """Безвозвратное удаление отключено — задачи хранятся навсегда."""
    raise HTTPException(
        status_code=403,
        detail="Permanent deletion is disabled. Tasks are kept for audit.",
    )


@router.post("/tasks/{task_id}/restore")
async def restore_deleted_task(task_id: int, db: AsyncSession = Depends(get_db)):
    """Восстановить удалённую задачу."""
    from sqlalchemy import select as sa_select

    result = await db.execute(sa_select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    task.deleted = False
    task.archived = False
    await db.commit()
    return {"ok": True}


class AddTimeRequest(BaseModel):
    """Добавление времени к задаче."""

    minutes: int


@router.patch("/tasks/{task_id}/time")
async def add_time_to_task(
    task_id: int, request: AddTimeRequest, db: AsyncSession = Depends(get_db)
):
    """Добавить потраченное время к задаче."""
    from sqlalchemy import select as sa_select

    if request.minutes <= 0:
        raise HTTPException(status_code=400, detail="Minutes must be positive")
    if request.minutes > 10000:
        raise HTTPException(status_code=400, detail="Minutes cannot exceed 10000")

    result = await db.execute(sa_select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Add time
    current_time = getattr(task, "time_spent", 0) or 0
    task.time_spent = current_time + request.minutes

    await db.commit()

    return {
        "ok": True,
        "task_id": task_id,
        "time_spent": task.time_spent,
        "added_minutes": request.minutes,
    }


@router.post("/tasks/{task_id}/subtasks", response_model=TaskResponse)
async def create_subtask(
    task_id: int, request: SubtaskCreateRequest, db: AsyncSession = Depends(get_db)
):
    """Создать подзадачу."""
    from app.domain.enums import TaskSource

    service = TaskService(db)

    parent = await service.get_task(task_id)
    if not parent:
        raise HTTPException(status_code=404, detail="Parent task not found")

    subtask = await service.create_task(
        title=request.title,
        description=request.description,
        source=TaskSource.MANUAL_COMMAND,
    )
    subtask.parent_task_id = task_id
    subtask.priority = request.priority or "NORMAL"

    if request.due_date:
        subtask.due_date = request.due_date

    if request.assignee_id:
        result = await db.execute(
            select(LocalAccount).where(LocalAccount.id == request.assignee_id)
        )
        user = result.scalar_one_or_none()
        if user:
            subtask.assignee_id = user.id

    await db.commit()
    from app.repositories.task_repository import TaskRepository

    repo = TaskRepository(db)
    return await repo.get_by_id(subtask.id)


# ============= BACKLOG API =============


@router.get("/backlog", response_model=List[TaskResponse])
async def get_backlog_tasks(
    project_id: Optional[int] = None,
    no_project: bool = False,
    db: AsyncSession = Depends(get_db),
):
    """Получить задачи в бэклоге. no_project=true — только задачи без проекта."""
    from sqlalchemy import select as sa_select

    query = (
        sa_select(Task)
        .where(Task.backlog == True)  # noqa: E712
        .where(Task.archived == False)  # noqa: E712
        .where(Task.deleted == False)  # noqa: E712
        .order_by(Task.backlog_added_at.desc())
    )
    if no_project:
        query = query.where(Task.project_id == None)  # noqa: E711
    elif project_id is not None:
        query = query.where(Task.project_id == project_id)

    query = query.options(
        selectinload(Task.blockers),
        selectinload(Task.assignee),
        selectinload(Task.subtasks).selectinload(Task.assignee),
        selectinload(Task.tags),
    )
    result = await db.execute(query)
    return result.scalars().all()


# ============= ARCHIVE API =============


@router.get("/archive", response_model=List[TaskResponse])
async def get_archived_tasks(db: AsyncSession = Depends(get_db)):
    """Получить архивные задачи."""
    from app.repositories.task_repository import TaskRepository

    repo = TaskRepository(db)
    return await repo.get_archived()


@router.get("/deleted", response_model=List[TaskResponse])
async def get_deleted_tasks(db: AsyncSession = Depends(get_db)):
    """Получить удалённые задачи."""
    from app.repositories.task_repository import TaskRepository

    repo = TaskRepository(db)
    return await repo.get_deleted()


@router.post("/tasks/{task_id}/archive")
async def archive_task(task_id: int, db: AsyncSession = Depends(get_db)):
    """Архивировать задачу."""
    service = TaskService(db)
    task = await service.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    task.archived = True
    await db.commit()
    return {"ok": True}


@router.post("/tasks/{task_id}/unarchive")
async def unarchive_task(task_id: int, db: AsyncSession = Depends(get_db)):
    """Разархивировать задачу."""
    service = TaskService(db)
    task = await service.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    task.archived = False
    await db.commit()
    return {"ok": True}


# ============= COMMENTS API =============


class CommentCreateRequest(BaseModel):
    text: str
    author_name: Optional[str] = None
    author_telegram_id: Optional[int] = None


@router.get("/tasks/{task_id}/comments", response_model=List[schemas.CommentResponse])
async def get_comments(task_id: int, db: AsyncSession = Depends(get_db)):
    from app.domain.models import Comment

    result = await db.execute(
        select(Comment).where(Comment.task_id == task_id).order_by(Comment.created_at)
    )
    return result.scalars().all()


@router.post("/tasks/{task_id}/comments", response_model=schemas.CommentResponse)
async def add_comment(
    task_id: int, request: CommentCreateRequest, db: AsyncSession = Depends(get_db)
):
    from app.domain.models import Comment

    comment = Comment(
        task_id=task_id,
        text=request.text.strip(),
        author_name=request.author_name,
        author_telegram_id=request.author_telegram_id,
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    return comment


@router.put(
    "/tasks/{task_id}/comments/{comment_id}", response_model=schemas.CommentResponse
)
async def update_comment(
    task_id: int,
    comment_id: int,
    request: schemas.CommentUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update comment text."""
    from app.domain.models import Comment

    result = await db.execute(
        select(Comment).where(Comment.id == comment_id, Comment.task_id == task_id)
    )
    comment = result.scalar_one_or_none()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    comment.text = request.text.strip()
    await db.commit()
    await db.refresh(comment)
    return comment


@router.delete("/tasks/{task_id}/comments/{comment_id}")
async def delete_comment(
    task_id: int, comment_id: int, db: AsyncSession = Depends(get_db)
):
    """Delete a comment."""
    from app.domain.models import Comment

    result = await db.execute(
        select(Comment).where(Comment.id == comment_id, Comment.task_id == task_id)
    )
    comment = result.scalar_one_or_none()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    await db.delete(comment)
    await db.commit()
    return {"ok": True}


@router.post("/tasks/auto-archive")
async def auto_archive_done_tasks(db: AsyncSession = Depends(get_db)):
    """Архивировать все DONE задачи старше 7 дней."""
    from sqlalchemy import update as sa_update
    from datetime import timedelta
    from app.domain.models import Task as TaskModel

    cutoff = Clock.now() - timedelta(days=7)
    result = await db.execute(
        sa_update(TaskModel)
        .where(TaskModel.status == "DONE")
        .where(TaskModel.archived == False)  # noqa: E712
        .where(TaskModel.deleted == False)  # noqa: E712
        .where(TaskModel.completed_at != None)  # noqa: E711
        .where(TaskModel.completed_at < cutoff)
        .values(archived=True)
    )
    await db.commit()
    return {"archived": result.rowcount}


# ============= WEB PUSH API =============


async def send_push(title: str, body: str, url: str = "/", task_id: int = None) -> None:
    """Send Web Push notification to all active subscriptions.

    #272 — VAPID keys and email stored in app_settings DB.
    #260 — Runs in thread pool to avoid blocking event loop.
    #317 — Conditional: only send to users who have relevant notifications enabled.
    """
    from app.core.db import AsyncSessionLocal
    from app.domain.models import PushSubscription as PushSubscriptionModel, AppSetting
    from app.services.vapid_service import (
        get_vapid_private_key,
        get_vapid_claims_email,
        set_vapid_keys,
        generate_vapid_keys,
    )
    from pywebpush import webpush, WebPushException

    async with AsyncSessionLocal() as session:
        private_key = await get_vapid_private_key(session)
        claims_email = await get_vapid_claims_email(session)

        # Auto-generate keys if not configured
        if not private_key:
            logger.info("send_push: VAPID keys not found, auto-generating")
            private_key, public_key = generate_vapid_keys()
            await set_vapid_keys(session, private_key, public_key)
            logger.info("send_push: VAPID keys generated and saved to DB")

        # Fetch subscriptions with account_id
        result = await session.execute(
            select(PushSubscriptionModel).where(
                PushSubscriptionModel.account_id != None
            )
        )
        subs = list(result.scalars().all())

    if not subs:
        logger.info("send_push: no subscriptions with account_id, skipping")
        return

    # Load user preferences for conditional push
    user_prefs = {}  # account_id -> dict
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(AppSetting))
        for setting in result.scalars().all():
            if setting.key.startswith("notif_prefs_"):
                try:
                    acc_id = int(setting.key.replace("notif_prefs_", ""))
                    user_prefs[acc_id] = json.loads(setting.value)
                except Exception:
                    pass

    logger.info("send_push: sending '%s' to %d subscription(s), email=%s", title, len(subs), claims_email)

    sent_count = 0
    fail_count = 0

    async def _send_one(sub):
        """Отправить один push в thread pool."""
        nonlocal sent_count, fail_count

        # Check user preferences
        if sub.account_id and sub.account_id in user_prefs:
            prefs = user_prefs[sub.account_id]
            if not prefs.get("status_changed", True):
                logger.info("send_push: skipped for account_id=%d (status_changed disabled)", sub.account_id)
                return

        loop = asyncio.get_event_loop()
        payload = json.dumps({"title": title, "body": body, "url": url})
        try:
            await loop.run_in_executor(
                None,
                lambda: webpush(
                    subscription_info={
                        "endpoint": sub.endpoint,
                        "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                    },
                    data=payload,
                    vapid_private_key=private_key,
                    vapid_claims={"sub": f"mailto:{claims_email}"},
                    content_encoding="aes128gcm",
                    ttl=3600,
                    headers={"Urgency": "high"},
                    timeout=10,
                ),
            )
            sent_count += 1
            logger.info("Push sent OK to %s (account_id=%d)", sub.endpoint[:60], sub.account_id)
        except WebPushException as exc:
            fail_count += 1
            if (
                hasattr(exc, "response")
                and exc.response is not None
                and exc.response.status_code == 410
            ):
                async with AsyncSessionLocal() as session:
                    await session.execute(
                        delete(PushSubscriptionModel).where(
                            PushSubscriptionModel.endpoint == sub.endpoint
                        )
                    )
                    await session.commit()
                logger.info(
                    "Push cleanup: removed expired endpoint %s", sub.endpoint[:40]
                )
            else:
                logger.error(
                    "Push delivery FAILED for %s: %s (status %s)",
                    sub.endpoint[:40],
                    exc,
                    getattr(getattr(exc, "response", None), "status_code", "?"),
                )
        except Exception as exc:
            fail_count += 1
            logger.error("Push delivery ERROR for %s: %s", sub.endpoint[:40], exc)

    # Отправляем все параллельно с timeout
    try:
        await asyncio.wait_for(
            asyncio.gather(*[_send_one(sub) for sub in subs], return_exceptions=True),
            timeout=15.0,
        )
    except asyncio.TimeoutError:
        logger.warning("send_push timed out after 15s")

    logger.info("send_push done: %d sent, %d failed", sent_count, fail_count)


# ============= SEARCH API =============


@router.get("/search")
async def search_tasks(
    q: str = Query(default=""), limit: int = 20, db: AsyncSession = Depends(get_db)
):
    """Полнотекстовый поиск по задачам (id + title + description)."""
    from sqlalchemy import cast, String

    q = q.strip()
    if len(q) < 2:
        return []
    limit = min(limit, 50)
    # Поиск по ID задачи (без #)
    try:
        task_id = int(q)
        id_match = Task.id == task_id
    except (ValueError, TypeError):
        id_match = None
    # Поиск по title и description (case-insensitive через multiple LIKE)
    q_lower = q.lower()
    q_upper = q.upper()
    q_title = q.capitalize()
    result = await db.execute(
        select(Task)
        .where(Task.deleted == False)
        .where(Task.archived == False)
        .where(
            or_(
                id_match if id_match else cast(Task.id, String).like(f"%{q}%"),
                Task.title.like(f"%{q_lower}%"),
                Task.title.like(f"%{q_upper}%"),
                Task.title.like(f"%{q_title}%"),
                Task.description.like(f"%{q_lower}%"),
                Task.description.like(f"%{q_upper}%"),
                Task.description.like(f"%{q_title}%"),
            )
        )
        .order_by(Task.updated_at.desc())
        .limit(limit)
    )
    tasks = result.scalars().all()
    return [
        {
            "id": t.id,
            "title": t.title,
            "description": t.description or "",
            "status": t.status,
            "priority": t.priority,
            "project_id": t.project_id,
            "parent_task_id": t.parent_task_id,
            "due_date": t.due_date.isoformat() if t.due_date else None,
            "archived": t.archived,
            "deleted": t.deleted,
            "backlog": t.backlog,
        }
        for t in tasks
    ]


# ============= DIGEST API =============


@router.get("/digest")
async def get_digest(db: AsyncSession = Depends(get_db)):
    """Данные для страницы дайджеста."""
    from app.repositories.project_repository import ProjectRepository
    from app.domain.enums import TaskStatus as TS, TaskPriority as TP
    from datetime import timedelta

    service = TaskService(db)
    all_tasks = await service.get_all_tasks()

    proj_repo = ProjectRepository(db)
    projects = await proj_repo.get_all_active()

    today = Clock.now().date()
    soon = today + timedelta(days=7)

    terminal = {TS.DONE.value, TS.ON_HOLD.value}
    active_statuses = {TS.TODO.value, TS.DOING.value, TS.BLOCKED.value}

    def is_overdue(t) -> bool:
        return bool(
            t.due_date and t.due_date.date() < today and t.status not in terminal
        )

    def is_due_soon(t) -> bool:
        return bool(
            t.due_date
            and today <= t.due_date.date() <= soon
            and t.status not in terminal
        )

    def avg_completion_days(tasks_list) -> float | None:
        done = [
            t
            for t in tasks_list
            if t.status == TS.DONE.value and t.completed_at and t.created_at
        ]
        if not done:
            return None
        return round(
            sum((t.completed_at - t.created_at).total_seconds() for t in done)
            / len(done)
            / 86400,
            1,
        )

    # Только верхнеуровневые задачи для статистики по проектам
    top_tasks = [t for t in all_tasks if not t.parent_task_id]
    # Активные задачи (не DONE, не ON_HOLD, не удалённые)
    active_tasks = [t for t in all_tasks if t.status in active_statuses]

    # Общая статистика
    stats = {
        "total": len(all_tasks),
        "active": len(active_tasks),
        "todo": sum(1 for t in all_tasks if t.status == TS.TODO.value),
        "doing": sum(1 for t in all_tasks if t.status == TS.DOING.value),
        "done": sum(1 for t in all_tasks if t.status == TS.DONE.value),
        "blocked": sum(1 for t in all_tasks if t.status == TS.BLOCKED.value),
        "on_hold": sum(1 for t in all_tasks if t.status == TS.ON_HOLD.value),
        "overdue": sum(1 for t in all_tasks if is_overdue(t)),
        "due_soon": sum(1 for t in all_tasks if is_due_soon(t)),
        "avg_completion_days": avg_completion_days(all_tasks),
        # Разбивка по приоритетам (#85)
        "priority": {
            "urgent": sum(1 for t in active_tasks if t.priority == TP.URGENT.value),
            "high": sum(1 for t in active_tasks if t.priority == TP.HIGH.value),
            "normal": sum(1 for t in active_tasks if t.priority == TP.NORMAL.value),
            "low": sum(1 for t in active_tasks if t.priority == TP.LOW.value),
        },
        # Бэклог (#86)
        "backlog": sum(1 for t in all_tasks if getattr(t, "is_backlog", False)),
    }

    # Задачи с дедлайнами (#87) — списки, не только счётчики
    overdue_tasks = sorted(
        [t for t in all_tasks if is_overdue(t)], key=lambda t: t.due_date
    )[:10]
    due_soon_tasks = sorted(
        [t for t in all_tasks if is_due_soon(t)], key=lambda t: t.due_date
    )[:10]

    def task_brief(t):
        return {
            "id": t.id,
            "title": t.title,
            "due_date": t.due_date.isoformat() if t.due_date else None,
            "priority": t.priority,
            "status": t.status,
            "project_id": t.project_id,
        }

    # Прогресс подзадач (#89) — задачи у которых есть дети
    task_map = {t.id: t for t in all_tasks}
    children_map: dict = {}
    for t in all_tasks:
        if t.parent_task_id:
            children_map.setdefault(t.parent_task_id, []).append(t)

    subtask_progress = []
    for tid, children in children_map.items():
        parent = task_map.get(tid)
        if not parent or parent.status == TS.DONE.value:
            continue
        total_ch = len(children)
        done_ch = sum(1 for c in children if c.status == TS.DONE.value)
        subtask_progress.append(
            {
                "id": parent.id,
                "title": parent.title,
                "project_id": parent.project_id,
                "done": done_ch,
                "total": total_ch,
                "pct": round(done_ch / total_ch * 100) if total_ch else 0,
            }
        )
    subtask_progress.sort(key=lambda x: (-x["total"], -x["pct"]))
    subtask_progress = subtask_progress[:15]

    # Статистика по проектам (только top-level задачи)
    def proj_stat(proj_tasks, proj_id, name, emoji):
        active_p = [t for t in proj_tasks if t.status in active_statuses]
        return {
            "id": proj_id,
            "name": name,
            "emoji": emoji,
            "total": len(proj_tasks),
            "active": len(active_p),
            "done": sum(1 for t in proj_tasks if t.status == TS.DONE.value),
            "doing": sum(1 for t in proj_tasks if t.status == TS.DOING.value),
            "todo": sum(1 for t in proj_tasks if t.status == TS.TODO.value),
            "blocked": sum(1 for t in proj_tasks if t.status == TS.BLOCKED.value),
            "on_hold": sum(1 for t in proj_tasks if t.status == TS.ON_HOLD.value),
            "backlog": sum(1 for t in proj_tasks if getattr(t, "is_backlog", False)),
            "overdue": sum(1 for t in proj_tasks if is_overdue(t)),
            "due_soon": sum(1 for t in proj_tasks if is_due_soon(t)),
            "avg_completion_days": avg_completion_days(proj_tasks),
        }

    project_stats = []
    for proj in projects:
        proj_tasks = [t for t in top_tasks if t.project_id == proj.id]
        if not proj_tasks:
            continue
        project_stats.append(
            proj_stat(proj_tasks, proj.id, proj.name, proj.emoji or "📁")
        )

    no_proj = [t for t in top_tasks if not t.project_id]
    if no_proj:
        project_stats.append(proj_stat(no_proj, None, "Без проекта", "📋"))

    # Топ активных проектов (#88) — сортировка по числу активных задач
    project_stats.sort(key=lambda p: (-p["active"], -p["total"]))

    # Топ исполнителей
    performers: dict = {}
    for task in all_tasks:
        if task.assignee:
            name = task.assignee.display_name
        else:
            continue
        if name not in performers:
            performers[name] = {
                "completed": 0,
                "total": 0,
                "on_time": 0,
                "with_deadline": 0,
                "_done_secs": [],
            }
        performers[name]["total"] += 1
        if task.status == TS.DONE.value:
            performers[name]["completed"] += 1
            if task.due_date:
                performers[name]["with_deadline"] += 1
                completed_at = task.completed_at or task.updated_at
                if completed_at and completed_at <= task.due_date:
                    performers[name]["on_time"] += 1
            if task.completed_at and task.created_at:
                performers[name]["_done_secs"].append(
                    (task.completed_at - task.created_at).total_seconds()
                )

    top_performers = sorted(
        [{"name": n, **v} for n, v in performers.items()],
        key=lambda x: x["completed"],
        reverse=True,
    )[:10]
    for p in top_performers:
        secs = p.pop("_done_secs", [])
        p["avg_days"] = round(sum(secs) / len(secs) / 86400, 1) if secs else None

    # Активность комментариев за неделю (#90)
    from app.domain.models import Comment

    week_ago = Clock.now() - timedelta(days=7)
    comments_result = await db.execute(
        select(Comment).where(Comment.created_at >= week_ago)
    )
    week_comments = list(comments_result.scalars().all())
    comment_authors: dict = {}
    for c in week_comments:
        name = c.author_name or "Аноним"
        comment_authors[name] = comment_authors.get(name, 0) + 1
    comment_activity = {
        "total": len(week_comments),
        "by_author": sorted(
            [{"name": n, "count": v} for n, v in comment_authors.items()],
            key=lambda x: -x["count"],
        ),
    }

    # Прогресс активных спринтов (#91)
    from app.domain.models import Sprint

    sprints_result = await db.execute(
        select(Sprint)
        .where(Sprint.status == "active", Sprint.is_deleted == False)
        .options(selectinload(Sprint.tasks))
        .order_by(Sprint.position)
    )
    active_sprints = list(sprints_result.scalars().all())
    sprint_progress = []
    for sp in active_sprints:
        task_ids = [st.task_id for st in sp.tasks]
        if not task_ids:
            sprint_progress.append(
                {
                    "id": sp.id,
                    "name": sp.name,
                    "total": 0,
                    "done": 0,
                    "doing": 0,
                    "todo": 0,
                    "blocked": 0,
                    "pct": 0,
                }
            )
            continue
        sp_tasks = [t for t in all_tasks if t.id in set(task_ids)]
        sp_done = sum(1 for t in sp_tasks if t.status == TS.DONE.value)
        sp_total = len(sp_tasks)
        sprint_progress.append(
            {
                "id": sp.id,
                "name": sp.name,
                "total": sp_total,
                "done": sp_done,
                "doing": sum(1 for t in sp_tasks if t.status == TS.DOING.value),
                "todo": sum(1 for t in sp_tasks if t.status == TS.TODO.value),
                "blocked": sum(1 for t in sp_tasks if t.status == TS.BLOCKED.value),
                "pct": round(sp_done / sp_total * 100) if sp_total else 0,
            }
        )

    return {
        "stats": stats,
        "projects": project_stats,
        "top_performers": top_performers,
        "overdue_tasks": [task_brief(t) for t in overdue_tasks],
        "due_soon_tasks": [task_brief(t) for t in due_soon_tasks],
        "subtask_progress": subtask_progress,
        "comment_activity": comment_activity,
        "sprint_progress": sprint_progress,
    }


# ============= EXPORT / IMPORT =============


def _dt(v) -> str | None:
    return v.isoformat() if v else None


async def _stream_json_array(items):
    """Yield '[item, item, ...]' incrementally from an async iterator of dicts.

    Keeps at most one serialized item in memory at a time, instead of building
    the whole list (and then its JSON string) before writing anything out —
    matters for tables (tasks, comments) that can grow unbounded over time.
    """
    yield "["
    first = True
    async for item in items:
        if not first:
            yield ","
        first = False
        yield json.dumps(item, ensure_ascii=False)
    yield "]"


@router.get("/export")
async def export_data(
    project_id: Optional[int] = None,
    include: Optional[str] = None,
):
    """Export all data as JSON, streamed chunk-by-chunk to keep peak memory bounded.

    Opens its own DB session inside the generator rather than using the usual
    `Depends(get_db)` — a `yield`-dependency's session is closed as soon as
    the route handler returns the response object, which for a
    StreamingResponse happens before the generator (and its DB queries) has
    even started running.
    """
    parts = (
        set(include.split(","))
        if include
        else {
            "tasks",
            "projects",
            "meetings",
            "comments",
            "sprints",
            "tags",
            "dependencies",
            "templates",
        }
    )
    today = Clock.now().strftime("%Y-%m-%d")

    async def generate():
        async with AsyncSessionLocal() as db:
            yield "{"
            yield f'"version":{json.dumps(settings.VERSION)},'
            yield f'"exported_at":{json.dumps(Clock.now().isoformat())},'
            yield f'"filters":{json.dumps({"project_id": project_id, "include": sorted(parts)})},'

            yield '"projects":'
            if "projects" in parts:
                q = select(Project)
                if project_id:
                    q = q.where(Project.id == project_id)
                rows = (await db.execute(q)).scalars().all()
                yield json.dumps(
                    [
                        {
                            "id": r.id,
                            "name": r.name,
                            "description": r.description,
                            "emoji": r.emoji,
                            "is_active": r.is_active,
                            "parent_project_id": r.parent_project_id,
                            "deleted": getattr(r, "deleted", False),
                            "created_at": _dt(r.created_at),
                        }
                        for r in rows
                    ],
                    ensure_ascii=False,
                )
            else:
                yield "[]"

            task_ids: list[int] = []
            yield ',"tasks":'
            if "tasks" in parts:
                q = select(Task).where(Task.deleted == False)  # noqa: E712
                if project_id:
                    q = q.where(Task.project_id == project_id)

                async def _tasks():
                    result = await db.stream_scalars(q)
                    async for r in result:
                        task_ids.append(r.id)
                        yield {
                            "id": r.id,
                            "title": r.title,
                            "description": r.description,
                            "status": r.status,
                            "priority": r.priority,
                            "project_id": r.project_id,
                            "parent_task_id": r.parent_task_id,
                            "assignee_id": r.assignee_id,
                            "source": r.source,
                            "source_message_id": r.source_message_id,
                            "source_chat_id": r.source_chat_id,
                            "due_date": _dt(r.due_date),
                            "definition_of_done": r.definition_of_done,
                            "archived": r.archived,
                            "deleted": r.deleted,
                            "backlog": r.backlog,
                            "backlog_added_at": _dt(r.backlog_added_at),
                            "recurrence": getattr(r, "recurrence", None),
                            "recurrence_end_date": _dt(getattr(r, "recurrence_end_date", None)),
                            "created_at": _dt(r.created_at),
                            "updated_at": _dt(r.updated_at),
                            "started_at": _dt(r.started_at),
                            "completed_at": _dt(r.completed_at),
                        }

                async for chunk in _stream_json_array(_tasks()):
                    yield chunk
            else:
                yield "[]"

            # Tags per task
            yield ',"tags":'
            if "tags" in parts and task_ids:
                from app.domain.models import Tag

                tag_rows = (await db.execute(select(Tag))).scalars().all()
                yield json.dumps(
                    [{"id": t.id, "name": t.name, "color": t.color} for t in tag_rows],
                    ensure_ascii=False,
                )
            else:
                yield "[]"

            yield ',"task_tags":'
            if "tags" in parts and task_ids:
                from app.domain.models import task_tags as task_tags_table

                tt_rows = (
                    await db.execute(
                        select(task_tags_table).where(task_tags_table.c.task_id.in_(task_ids))
                    )
                ).all()
                yield json.dumps(
                    [{"task_id": tt.task_id, "tag_id": tt.tag_id} for tt in tt_rows],
                    ensure_ascii=False,
                )
            else:
                yield "[]"

            # Dependencies
            yield ',"task_dependencies":'
            if "dependencies" in parts and task_ids:
                from app.domain.models import TaskDependency

                dep_rows = (
                    (
                        await db.execute(
                            select(TaskDependency).where(TaskDependency.task_id.in_(task_ids))
                        )
                    )
                    .scalars()
                    .all()
                )
                yield json.dumps(
                    [
                        {
                            "task_id": d.task_id,
                            "depends_on_id": d.depends_on_id,
                            "created_at": _dt(d.created_at),
                        }
                        for d in dep_rows
                    ],
                    ensure_ascii=False,
                )
            else:
                yield "[]"

            yield ',"comments":'
            if "comments" in parts and not (project_id and not task_ids):
                q = select(Comment)
                if project_id and task_ids:
                    q = q.where(Comment.task_id.in_(task_ids))

                async def _comments():
                    result = await db.stream_scalars(q)
                    async for r in result:
                        yield {
                            "id": r.id,
                            "task_id": r.task_id,
                            "text": r.text,
                            "author_name": r.author_name,
                            "author_telegram_id": r.author_telegram_id,
                            "created_at": _dt(r.created_at),
                        }

                async for chunk in _stream_json_array(_comments()):
                    yield chunk
            else:
                yield "[]"

            yield ',"meetings":'
            if "meetings" in parts:
                from app.domain.models import MeetingParticipant

                q = select(Meeting)
                if project_id:
                    from app.domain.models import MeetingProject

                    mp_sub = select(MeetingProject.meeting_id).where(
                        MeetingProject.project_id == project_id
                    )
                    q = q.where(Meeting.id.in_(mp_sub))
                rows = (await db.execute(q)).scalars().all()
                meeting_list = []
                for r in rows:
                    parts_rows = (
                        (
                            await db.execute(
                                select(MeetingParticipant).where(
                                    MeetingParticipant.meeting_id == r.id
                                )
                            )
                        )
                        .scalars()
                        .all()
                    )
                    meeting_list.append(
                        {
                            "id": r.id,
                            "meeting_date": _dt(r.meeting_date),
                            "summary": r.summary,
                            "title": getattr(r, "title", None),
                            "meeting_type": getattr(r, "meeting_type", None),
                            "duration_min": getattr(r, "duration_min", None),
                            "agenda": getattr(r, "agenda", None),
                            "created_at": _dt(r.created_at),
                            "participants": [
                                {
                                    "display_name": p.display_name,
                                    "telegram_user_id": p.telegram_user_id,
                                }
                                for p in parts_rows
                            ],
                        }
                    )
                yield json.dumps(meeting_list, ensure_ascii=False)
            else:
                yield "[]"

            sprint_ids: list[int] = []
            yield ',"sprints":'
            if "sprints" in parts:
                from app.domain.models import Sprint

                q = select(Sprint).where(Sprint.is_deleted == False)  # noqa: E712
                if project_id:
                    q = q.where(Sprint.project_id == project_id)
                rows = (await db.execute(q)).scalars().all()
                sprint_list = []
                for r in rows:
                    sprint_ids.append(r.id)
                    sprint_list.append(
                        {
                            "id": r.id,
                            "name": r.name,
                            "description": r.description,
                            "project_id": r.project_id,
                            "status": r.status,
                            "position": r.position,
                            "start_date": _dt(r.start_date),
                            "end_date": _dt(r.end_date),
                            "created_at": _dt(r.created_at),
                        }
                    )
                yield json.dumps(sprint_list, ensure_ascii=False)
            else:
                yield "[]"

            yield ',"sprint_tasks":'
            if "sprints" in parts and sprint_ids:
                from app.domain.models import SprintTask

                st_rows = (
                    (
                        await db.execute(
                            select(SprintTask).where(SprintTask.sprint_id.in_(sprint_ids))
                        )
                    )
                    .scalars()
                    .all()
                )
                yield json.dumps(
                    [
                        {"sprint_id": st.sprint_id, "task_id": st.task_id, "position": st.position}
                        for st in st_rows
                    ],
                    ensure_ascii=False,
                )
            else:
                yield "[]"

            yield ',"task_templates":'
            if "templates" in parts:
                from app.web.routes_templates import TaskTemplate

                rows = (await db.execute(select(TaskTemplate))).scalars().all()
                yield json.dumps(
                    [
                        {
                            "id": r.id,
                            "name": r.name,
                            "fields_json": r.fields_json,
                            "created_at": _dt(r.created_at),
                        }
                        for r in rows
                    ],
                    ensure_ascii=False,
                )
            else:
                yield "[]"

            yield "}"

    return StreamingResponse(
        generate(),
        media_type="application/json",
        headers={
            "Content-Disposition": f"attachment; filename=teamflow-export-{today}.json"
        },
    )


class ImportRequest(BaseModel):
    mode: str  # "full" | "merge"
    data: dict


@router.post("/import")
async def import_data(req: ImportRequest, db: AsyncSession = Depends(get_db)):
    """Import data from export JSON. mode=full clears existing data; mode=merge skips ID conflicts."""
    if req.mode not in ("full", "merge"):
        raise HTTPException(status_code=400, detail="mode must be 'full' or 'merge'")

    data = req.data
    counts = {
        "projects": 0,
        "tasks": 0,
        "meetings": 0,
        "comments": 0,
        "sprints": 0,
        "tags": 0,
        "task_tags": 0,
        "dependencies": 0,
        "templates": 0,
    }

    if req.mode == "full":
        await db.execute(text("UPDATE tasks SET deleted = 1"))
        await db.execute(text("UPDATE projects SET is_active = 0"))
        await db.execute(text("DELETE FROM comments"))
        await db.execute(text("DELETE FROM meetings"))
        await db.execute(text("DELETE FROM meeting_participants"))
        await db.execute(text("DELETE FROM sprint_tasks"))
        await db.execute(text("UPDATE sprints SET status = 'archived'"))
        await db.execute(text("DELETE FROM task_tags"))
        await db.execute(text("DELETE FROM task_dependencies"))
        await db.commit()

    def _parse_dt(v):
        if not v:
            return None
        try:
            return datetime.fromisoformat(v)
        except Exception:
            return None

    # Projects
    for p in data.get("projects", []):
        if req.mode == "merge":
            if (
                await db.execute(select(Project).where(Project.id == p["id"]))
            ).scalar_one_or_none():
                continue
        db.add(
            Project(
                id=p["id"],
                name=p["name"],
                description=p.get("description"),
                emoji=p.get("emoji", "📁"),
                is_active=p.get("is_active", True),
                parent_project_id=p.get("parent_project_id"),
                created_at=_parse_dt(p.get("created_at")) or Clock.now(),
            )
        )
        counts["projects"] += 1
    await db.flush()

    # Tasks — two passes: roots first, then children
    tasks_data = data.get("tasks", [])
    for parent_pass in (False, True):
        for t in tasks_data:
            if bool(t.get("parent_task_id")) != parent_pass:
                continue
            if req.mode == "merge":
                if (
                    await db.execute(select(Task).where(Task.id == t["id"]))
                ).scalar_one_or_none():
                    continue
            db.add(
                Task(
                    id=t["id"],
                    title=t["title"],
                    description=t.get("description"),
                    status=t.get("status", "TODO"),
                    priority=t.get("priority", "NORMAL"),
                    project_id=t.get("project_id"),
                    parent_task_id=t.get("parent_task_id"),
                    assignee_id=t.get("assignee_id"),
                    source=t.get("source", "IMPORT"),
                    source_message_id=t.get("source_message_id"),
                    source_chat_id=t.get("source_chat_id"),
                    due_date=_parse_dt(t.get("due_date")),
                    definition_of_done=t.get("definition_of_done"),
                    archived=t.get("archived", False),
                    deleted=t.get("deleted", False),
                    backlog=t.get("backlog", False),
                    backlog_added_at=_parse_dt(t.get("backlog_added_at")),
                    recurrence=t.get("recurrence"),
                    recurrence_end_date=_parse_dt(t.get("recurrence_end_date")),
                    created_at=_parse_dt(t.get("created_at")) or Clock.now(),
                    updated_at=_parse_dt(t.get("updated_at")) or Clock.now(),
                    started_at=_parse_dt(t.get("started_at")),
                    completed_at=_parse_dt(t.get("completed_at")),
                )
            )
            counts["tasks"] += 1
    await db.flush()

    # Tags
    from app.domain.models import Tag, TaskDependency
    from app.domain.models import task_tags as task_tags_table
    from app.web.routes_templates import TaskTemplate
    from sqlalchemy import insert

    for tg in data.get("tags", []):
        if req.mode == "merge":
            if (
                await db.execute(select(Tag).where(Tag.id == tg["id"]))
            ).scalar_one_or_none():
                continue
        db.add(Tag(id=tg["id"], name=tg["name"], color=tg.get("color", "#6366f1")))
        counts["tags"] += 1
    await db.flush()

    # Task-tag relations
    for tt in data.get("task_tags", []):
        if req.mode == "merge":
            existing = await db.execute(
                select(task_tags_table).where(
                    task_tags_table.c.task_id == tt["task_id"],
                    task_tags_table.c.tag_id == tt["tag_id"],
                )
            )
            if existing.first():
                continue
        await db.execute(insert(task_tags_table).values(task_id=tt["task_id"], tag_id=tt["tag_id"]))
        counts["task_tags"] += 1

    # Dependencies
    for dep in data.get("task_dependencies", []):
        if req.mode == "merge":
            if (
                await db.execute(
                    select(TaskDependency).where(
                        TaskDependency.task_id == dep["task_id"],
                        TaskDependency.depends_on_id == dep["depends_on_id"],
                    )
                )
            ).scalar_one_or_none():
                continue
        db.add(
            TaskDependency(
                task_id=dep["task_id"],
                depends_on_id=dep["depends_on_id"],
                created_at=_parse_dt(dep.get("created_at")) or Clock.now(),
            )
        )
        counts["dependencies"] += 1

    # Templates
    for tmpl in data.get("task_templates", []):
        if req.mode == "merge":
            if (
                await db.execute(
                    select(TaskTemplate).where(TaskTemplate.id == tmpl["id"])
                )
            ).scalar_one_or_none():
                continue
        db.add(
            TaskTemplate(
                id=tmpl["id"],
                name=tmpl["name"],
                fields_json=tmpl.get("fields_json"),
                created_at=_parse_dt(tmpl.get("created_at")) or Clock.now(),
            )
        )
        counts["templates"] += 1

    # Meetings v2
    from app.domain.models import MeetingParticipant

    for m in data.get("meetings", []):
        if req.mode == "merge":
            if (
                await db.execute(select(Meeting).where(Meeting.id == m["id"]))
            ).scalar_one_or_none():
                continue
        db.add(
            Meeting(
                id=m["id"],
                summary=m.get("summary"),
                title=m.get("title"),
                meeting_type=m.get("meeting_type"),
                duration_min=m.get("duration_min"),
                agenda=m.get("agenda"),
                meeting_date=_parse_dt(m.get("meeting_date")) or Clock.now(),
                created_at=_parse_dt(m.get("created_at")) or Clock.now(),
            )
        )
        counts["meetings"] += 1
        for p in m.get("participants", []):
            db.add(
                MeetingParticipant(
                    meeting_id=m["id"],
                    display_name=p.get("display_name", ""),
                    telegram_user_id=p.get("telegram_user_id"),
                )
            )
    await db.flush()

    # Comments
    for c in data.get("comments", []):
        if req.mode == "merge":
            if (
                await db.execute(select(Comment).where(Comment.id == c["id"]))
            ).scalar_one_or_none():
                continue
        db.add(
            Comment(
                id=c["id"],
                task_id=c["task_id"],
                text=c["text"],
                author_name=c.get("author_name"),
                author_telegram_id=c.get("author_telegram_id"),
                created_at=_parse_dt(c.get("created_at")) or Clock.now(),
            )
        )
        counts["comments"] += 1

    # Sprints
    from app.domain.models import Sprint, SprintTask

    for s in data.get("sprints", []):
        if req.mode == "merge":
            if (
                await db.execute(select(Sprint).where(Sprint.id == s["id"]))
            ).scalar_one_or_none():
                continue
        db.add(
            Sprint(
                id=s["id"],
                name=s["name"],
                description=s.get("description"),
                project_id=s.get("project_id"),
                status=s.get("status", "planned"),
                position=s.get("position", 0),
                start_date=_parse_dt(s.get("start_date")),
                end_date=_parse_dt(s.get("end_date")),
                created_at=_parse_dt(s.get("created_at")) or Clock.now(),
            )
        )
        counts["sprints"] += 1
    await db.flush()

    for st in data.get("sprint_tasks", []):
        if req.mode == "merge":
            if (
                await db.execute(
                    select(SprintTask).where(
                        SprintTask.sprint_id == st["sprint_id"],
                        SprintTask.task_id == st["task_id"],
                    )
                )
            ).scalar_one_or_none():
                continue
        db.add(
            SprintTask(
                sprint_id=st["sprint_id"],
                task_id=st["task_id"],
                position=st.get("position", 0),
            )
        )

    await db.commit()
    return {"imported": counts}


# ============= API KEYS =============


class ApiKeyResponse(BaseModel):
    id: int
    key: str
    name: str
    description: Optional[str]
    is_active: bool
    created_at: datetime
    last_used_at: Optional[datetime]
    model_config = ConfigDict(from_attributes=True)


class ApiKeyCreateRequest(BaseModel):
    name: str
    description: Optional[str] = None


class ApiKeyUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


# ============= BOT STATUS / API KEYS =============


@router.get("/bot-status")
async def get_bot_status_endpoint():
    """Статус Telegram-бота — живой ли, когда последний раз видели."""
    from app.telegram.deadline_notifier import get_bot_status_from_db

    return await get_bot_status_from_db()


@router.get("/api-keys", response_model=List[ApiKeyResponse])
async def get_api_keys(db: AsyncSession = Depends(get_db)):
    """Get all API keys."""
    from app.domain.models import ApiKey

    result = await db.execute(select(ApiKey).order_by(ApiKey.created_at.desc()))
    keys = list(result.scalars().all())
    return keys


@router.post("/api-keys", response_model=ApiKeyResponse)
async def create_api_key(req: ApiKeyCreateRequest, db: AsyncSession = Depends(get_db)):
    """Create new API key."""
    from app.domain.models import ApiKey

    key = secrets.token_hex(32)  # 64 chars
    api_key = ApiKey(key=key, name=req.name, description=req.description)
    db.add(api_key)
    await db.commit()
    await db.refresh(api_key)
    return api_key


@router.patch("/api-keys/{key_id}", response_model=ApiKeyResponse)
async def update_api_key(
    key_id: int, req: ApiKeyUpdateRequest, db: AsyncSession = Depends(get_db)
):
    """Update API key."""
    from app.domain.models import ApiKey

    result = await db.execute(select(ApiKey).where(ApiKey.id == key_id))
    api_key = result.scalar_one_or_none()
    if not api_key:
        raise HTTPException(status_code=404, detail="API key not found")

    if req.name is not None:
        api_key.name = req.name
    if req.description is not None:
        api_key.description = req.description
    if req.is_active is not None:
        api_key.is_active = req.is_active

    await db.commit()
    await db.refresh(api_key)
    return api_key


@router.delete("/api-keys/{key_id}")
async def delete_api_key(key_id: int, db: AsyncSession = Depends(get_db)):
    """Delete API key."""
    from app.domain.models import ApiKey, ApiKeyLog

    result = await db.execute(select(ApiKey).where(ApiKey.id == key_id))
    api_key = result.scalar_one_or_none()
    if not api_key:
        raise HTTPException(status_code=404, detail="API key not found")

    # Delete related logs first (CASCADE not enabled in SQLite by default)
    await db.execute(
        delete(ApiKeyLog).where(ApiKeyLog.api_key_id == key_id)
    )

    await db.delete(api_key)
    await db.commit()
    return {"ok": True}


@router.get("/api-keys/{key_id}/regenerate", response_model=ApiKeyResponse)
async def regenerate_api_key(key_id: int, db: AsyncSession = Depends(get_db)):
    """Regenerate API key."""
    from app.domain.models import ApiKey

    result = await db.execute(select(ApiKey).where(ApiKey.id == key_id))
    api_key = result.scalar_one_or_none()
    if not api_key:
        raise HTTPException(status_code=404, detail="API key not found")

    api_key.key = secrets.token_hex(32)
    await db.commit()
    await db.refresh(api_key)
    return api_key


@router.get("/api-keys/{key_id}/logs")
async def get_api_key_logs(key_id: int, db: AsyncSession = Depends(get_db)):
    """Get API key usage logs."""
    from app.domain.models import ApiKey, ApiKeyLog
    from sqlalchemy import select

    # First check key exists
    result = await db.execute(select(ApiKey).where(ApiKey.id == key_id))
    api_key = result.scalar_one_or_none()
    if not api_key:
        raise HTTPException(status_code=404, detail="API key not found")

    # Get logs
    result = await db.execute(
        select(ApiKeyLog)
        .where(ApiKeyLog.api_key_id == key_id)
        .order_by(ApiKeyLog.created_at.desc())
        .limit(100)
    )
    logs = result.scalars().all()

    return [
        {
            "id": log.id,
            "endpoint": log.endpoint,
            "method": log.method,
            "ip_address": log.ip_address,
            "user_agent": log.user_agent,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        }
        for log in logs
    ]
