"""Web API routes - no auth."""
import json
import asyncio
import logging
from typing import Optional, List
from fastapi import APIRouter, Query, BackgroundTasks, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text, delete, func
from sqlalchemy.orm import selectinload
from datetime import datetime
from pydantic import BaseModel, ConfigDict
import secrets
from app.core.db import get_db
from app.services.task_service import TaskService
from app.repositories.user_repository import UserRepository
from app.domain.enums import TaskStatus
from app.domain.models import Task, Project, Meeting, Comment, Blocker
from app.web import schemas
from app.web.schemas import TaskResponse, TaskDetailResponse, StatsResponse, BotInfoResponse, TelegramUserResponse
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/bot-info", response_model=BotInfoResponse)
async def get_bot_info():
    return BotInfoResponse(
        username=settings.TELEGRAM_BOT_USERNAME,
        bot_name=settings.APP_NAME
    )


@router.get("/tasks", response_model=List[TaskResponse])
async def get_tasks(
    status: Optional[TaskStatus] = None,
    db: AsyncSession = Depends(get_db)
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
    service = TaskService(db)
    tasks = await service.get_all_tasks()
    from app.repositories.task_repository import TaskRepository
    repo = TaskRepository(db)
    archived = await repo.get_archived()
    deleted = await repo.get_deleted()
    return {
        "total": len(tasks),
        "todo": len([t for t in tasks if t.status == TaskStatus.TODO.value]),
        "doing": len([t for t in tasks if t.status == TaskStatus.DOING.value]),
        "done": len([t for t in tasks if t.status == TaskStatus.DONE.value]),
        "blocked": len([t for t in tasks if t.status == TaskStatus.BLOCKED.value]),
        "on_hold": len([t for t in tasks if t.status == TaskStatus.ON_HOLD.value]),
        "archived": len(archived),
        "deleted": len(deleted),
    }


@router.get("/users", response_model=List[TelegramUserResponse])
async def get_users(db: AsyncSession = Depends(get_db)):
    """Get all known telegram users."""
    repo = UserRepository(db)
    users = await repo.get_all()
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
    db: AsyncSession = Depends(get_db)
):
    """Изменить статус задачи."""
    from app.domain.enums import TaskStatus
    from fastapi import HTTPException
    
    service = TaskService(db)
    try:
        if request.status == TaskStatus.BLOCKED.value and request.block_reason:
            await service.block_task(task_id, request.block_reason.strip())
        else:
            await service.change_status(task_id, TaskStatus(request.status))
        await db.commit()

        # Повторяющаяся задача: при DONE создаём следующий экземпляр
        if request.status == TaskStatus.DONE.value:
            from sqlalchemy import select as sa_select
            from app.domain.models import Task as TaskModel
            from app.domain.enums import TaskSource
            result = await db.execute(sa_select(TaskModel).where(TaskModel.id == task_id))
            task = result.scalar_one_or_none()
            if task and task.recurrence and task.due_date:
                from datetime import timedelta
                delta = {
                    "daily": timedelta(days=1),
                    "weekly": timedelta(weeks=1),
                    "monthly": timedelta(days=30),
                }.get(task.recurrence)
                if delta:
                    next_due = task.due_date + delta
                    # Не создавать если вышли за recurrence_end_date
                    if not task.recurrence_end_date or next_due <= task.recurrence_end_date:
                        next_task = TaskModel(
                            title=task.title,
                            description=task.description,
                            project_id=task.project_id,
                            assignee_id=task.assignee_id,
                            assignee_name=task.assignee_name,
                            assignee_telegram_id=task.assignee_telegram_id,
                            priority=task.priority,
                            due_date=next_due,
                            recurrence=task.recurrence,
                            recurrence_end_date=task.recurrence_end_date,
                            source=TaskSource.MANUAL_COMMAND.value,
                            status="TODO",
                        )
                        db.add(next_task)
                        await db.commit()

        background_tasks.add_task(send_push,
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
    db: AsyncSession = Depends(get_db)
):
    """Назначить задачу пользователю."""
    service = TaskService(db)
    task = await service.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if request.user_id:
        user_repo = UserRepository(db)
        user = await user_repo.get_by_telegram_id(request.user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        await service.assign_task(task_id, user)
        await db.commit()
        background_tasks.add_task(send_push,
            title=f"Задача назначена: #{task_id}",
            body=task.title,
            url=f"/?task={task_id}",
        )
    else:
        # Снять исполнителя
        task.assignee_id = None
        task.assignee_telegram_id = None
        task.assignee_name = None
        await db.commit()

    return {"ok": True}


# ============= PROJECTS API =============

class ProjectCreateRequest(BaseModel):
    """Создание проекта."""
    name: str
    description: Optional[str] = None
    emoji: Optional[str] = "📁"
    parent_project_id: Optional[int] = None


class ProjectUpdateRequest(BaseModel):
    """Обновление проекта."""
    name: Optional[str] = None
    description: Optional[str] = None
    emoji: Optional[str] = None
    is_active: Optional[bool] = None
    parent_project_id: Optional[int] = None


class ProjectResponse(BaseModel):
    """Проект."""
    id: int
    name: str
    description: Optional[str]
    emoji: Optional[str]
    is_active: bool
    created_at: datetime
    parent_project_id: Optional[int] = None
    model_config = ConfigDict(from_attributes=True)


@router.get("/projects", response_model=List[ProjectResponse])
async def get_projects(db: AsyncSession = Depends(get_db)):
    """Получить все проекты."""
    from app.repositories.project_repository import ProjectRepository
    repo = ProjectRepository(db)
    projects = await repo.get_all_active()
    return projects


@router.post("/projects", response_model=ProjectResponse)
async def create_project(request: ProjectCreateRequest, db: AsyncSession = Depends(get_db)):
    """Создать проект."""
    from app.repositories.project_repository import ProjectRepository
    repo = ProjectRepository(db)
    
    # Validate parent_project_id if provided
    if request.parent_project_id is not None:
        parent = await repo.get_by_id(request.parent_project_id)
        if not parent:
            raise HTTPException(status_code=404, detail="Parent project not found")
        # Prevent self-reference
        if request.parent_project_id == request.name:
            pass  # Will be validated after creation
    
    project = await repo.create(
        name=request.name,
        description=request.description,
        emoji=request.emoji,
        parent_project_id=request.parent_project_id
    )
    await db.commit()
    return project


@router.patch("/projects/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: int,
    request: ProjectUpdateRequest,
    db: AsyncSession = Depends(get_db)
):
    """Обновить проект."""
    from app.repositories.project_repository import ProjectRepository
    repo = ProjectRepository(db)
    project = await repo.get_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if request.name is not None:
        project.name = request.name
    if request.description is not None:
        project.description = request.description
    if request.emoji is not None:
        project.emoji = request.emoji
    if request.is_active is not None:
        project.is_active = request.is_active
    if request.parent_project_id is not None:
        # Prevent self-reference
        if request.parent_project_id == project_id:
            raise HTTPException(status_code=400, detail="Project cannot be its own parent")
        # Validate parent exists
        parent = await repo.get_by_id(request.parent_project_id)
        if not parent:
            raise HTTPException(status_code=404, detail="Parent project not found")
        project.parent_project_id = request.parent_project_id

    await db.commit()
    await db.refresh(project)
    return project


@router.get("/projects/archived", response_model=List[ProjectResponse])
async def get_archived_projects(db: AsyncSession = Depends(get_db)):
    """Получить архивные проекты."""
    from app.repositories.project_repository import ProjectRepository
    repo = ProjectRepository(db)
    projects = await repo.get_archived()
    return projects


@router.post("/projects/{project_id}/archive", response_model=ProjectResponse)
async def archive_project(project_id: int, db: AsyncSession = Depends(get_db)):
    """Архивировать проект (is_active=False)."""
    from app.repositories.project_repository import ProjectRepository
    repo = ProjectRepository(db)
    await repo.archive(project_id)
    await db.commit()
    return await repo.get_by_id(project_id)


@router.post("/projects/{project_id}/restore", response_model=ProjectResponse)
async def restore_project(project_id: int, db: AsyncSession = Depends(get_db)):
    """Восстановить проект из архива."""
    from app.repositories.project_repository import ProjectRepository
    repo = ProjectRepository(db)
    await repo.restore(project_id)
    await db.commit()
    return await repo.get_by_id(project_id)


@router.get("/projects/{project_id}/can-delete")
async def check_can_delete_project(project_id: int, db: AsyncSession = Depends(get_db)):
    """Проверить можно ли удалить проект."""
    from app.repositories.project_repository import ProjectRepository
    repo = ProjectRepository(db)
    result = await repo.can_delete(project_id)
    return result


@router.delete("/projects/{project_id}")
async def delete_project(project_id: int, db: AsyncSession = Depends(get_db)):
    """Удалить проект (мягкое удаление с проверкой)."""
    from app.repositories.project_repository import ProjectRepository
    repo = ProjectRepository(db)
    project = await repo.get_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Check if can be deleted
    check = await repo.can_delete(project_id)
    if not check["can_delete"]:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "PROJECT_HAS_DEPENDENCIES",
                "message": "Нельзя удалить проект с подпроектами или задачами",
                **check
            }
        )

    await repo.soft_delete(project_id)
    await db.commit()
    return {"ok": True}


class ProjectAssignRequest(BaseModel):
    """Назначение задачи в проект."""
    project_id: Optional[int] = None


@router.post("/tasks/{task_id}/project")
async def assign_task_to_project(
    task_id: int,
    request: ProjectAssignRequest,
    db: AsyncSession = Depends(get_db)
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


# ============= MEETINGS API =============

class MeetingCreateRequest(BaseModel):
    """Создание встречи."""
    summary: str
    meeting_date: Optional[datetime] = None


class MeetingUpdateRequest(BaseModel):
    """Обновление встречи."""
    summary: Optional[str] = None
    meeting_date: Optional[datetime] = None


class MeetingResponse(BaseModel):
    """Встреча."""
    id: int
    meeting_date: datetime
    summary: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


@router.get("/meetings", response_model=List[MeetingResponse])
async def get_meetings(db: AsyncSession = Depends(get_db)):
    """Получить все встречи."""
    from app.domain.models import Meeting
    result = await db.execute(
        select(Meeting).order_by(Meeting.meeting_date.desc()).limit(50)
    )
    meetings = result.scalars().all()
    return list(meetings)


@router.post("/meetings", response_model=MeetingResponse)
async def create_meeting(request: MeetingCreateRequest, db: AsyncSession = Depends(get_db)):
    """Создать встречу."""
    from app.domain.models import Meeting
    from app.core.clock import Clock
    
    meeting = Meeting(
        summary=request.summary,
        meeting_date=request.meeting_date or Clock.now()
    )
    db.add(meeting)
    await db.commit()
    await db.refresh(meeting)
    return meeting


@router.patch("/meetings/{meeting_id}", response_model=MeetingResponse)
async def update_meeting(
    meeting_id: int,
    request: MeetingUpdateRequest,
    db: AsyncSession = Depends(get_db)
):
    """Обновить встречу."""
    from app.domain.models import Meeting
    result = await db.execute(select(Meeting).where(Meeting.id == meeting_id))
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    
    if request.summary is not None:
        meeting.summary = request.summary
    if request.meeting_date is not None:
        meeting.meeting_date = request.meeting_date
    
    await db.commit()
    await db.refresh(meeting)
    return meeting


@router.delete("/meetings/{meeting_id}")
async def delete_meeting(meeting_id: int, db: AsyncSession = Depends(get_db)):
    """Удалить встречу."""
    from app.domain.models import Meeting
    result = await db.execute(select(Meeting).where(Meeting.id == meeting_id))
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    
    await db.delete(meeting)
    await db.commit()
    return {"ok": True}


# ============= TASKS API EXTENSIONS =============

class TaskCreateRequest(BaseModel):
    """Создание задачи."""
    title: str
    description: Optional[str] = None
    project_id: Optional[int] = None
    parent_task_id: Optional[int] = None
    assignee_telegram_id: Optional[int] = None
    due_date: Optional[datetime] = None
    priority: Optional[str] = "NORMAL"
    backlog: bool = False
    recurrence: Optional[str] = None
    recurrence_end_date: Optional[datetime] = None


class TaskUpdateRequest(BaseModel):
    """Обновление задачи."""
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    priority: Optional[str] = None
    parent_task_id: Optional[int] = None
    backlog: Optional[bool] = None
    recurrence: Optional[str] = None
    recurrence_end_date: Optional[datetime] = None
    # Optimistic locking — client sends the updated_at they read
    expected_updated_at: Optional[datetime] = None


class SubtaskCreateRequest(BaseModel):
    """Создание подзадачи."""
    title: str
    description: Optional[str] = None
    assignee_telegram_id: Optional[int] = None
    due_date: Optional[datetime] = None
    priority: Optional[str] = "NORMAL"


@router.post("/tasks", response_model=TaskResponse)
async def create_task_api(request: TaskCreateRequest, db: AsyncSession = Depends(get_db)):
    """Создать задачу через API."""
    from app.domain.enums import TaskSource
    service = TaskService(db)
    
    task = await service.create_task(
        title=request.title,
        description=request.description,
        source=TaskSource.MANUAL_COMMAND
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
        task.backlog_added_at = datetime.utcnow()

    if request.recurrence:
        task.recurrence = request.recurrence
    if request.recurrence_end_date:
        task.recurrence_end_date = request.recurrence_end_date

    if request.assignee_telegram_id:
        user_repo = UserRepository(db)
        user = await user_repo.get_by_telegram_id(request.assignee_telegram_id)
        if user:
            task.assignee_id = user.id
            task.assignee_telegram_id = user.telegram_id
            task.assignee_name = user.display_name
    
    await db.commit()
    from app.repositories.task_repository import TaskRepository
    return await TaskRepository(db).get_by_id(task.id)


@router.patch("/tasks/{task_id}", response_model=TaskResponse)
async def update_task_api(
    task_id: int,
    request: TaskUpdateRequest,
    db: AsyncSession = Depends(get_db)
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
                    "expected_updated_at": request.expected_updated_at.isoformat()
                }
            )

    if request.title is not None:
        task.title = request.title
    if request.description is not None:
        task.description = request.description
    if 'due_date' in request.model_fields_set:
        task.due_date = request.due_date
    if request.priority is not None:
        task.priority = request.priority
    if 'parent_task_id' in request.model_fields_set:
        if request.parent_task_id is None:
            task.parent_task_id = None
        else:
            if request.parent_task_id == task_id:
                raise HTTPException(status_code=400, detail="Task cannot be its own parent")
            from app.repositories.task_repository import TaskRepository
            parent = await TaskRepository(db).get_by_id(request.parent_task_id)
            if not parent:
                raise HTTPException(status_code=404, detail="Parent task not found")
            task.parent_task_id = request.parent_task_id

    if request.backlog is not None:
        task.backlog = request.backlog
        task.backlog_added_at = datetime.utcnow() if request.backlog else None

    if 'recurrence' in request.model_fields_set:
        task.recurrence = request.recurrence
    if 'recurrence_end_date' in request.model_fields_set:
        task.recurrence_end_date = request.recurrence_end_date

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
    raise HTTPException(status_code=403, detail="Permanent deletion is disabled. Tasks are kept for audit.")


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


@router.post("/tasks/{task_id}/subtasks", response_model=TaskResponse)
async def create_subtask(
    task_id: int,
    request: SubtaskCreateRequest,
    db: AsyncSession = Depends(get_db)
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

    if request.assignee_telegram_id:
        user_repo = UserRepository(db)
        user = await user_repo.get_by_telegram_id(request.assignee_telegram_id)
        if user:
            subtask.assignee_id = user.id
            subtask.assignee_telegram_id = user.telegram_id
            subtask.assignee_name = user.display_name

    await db.commit()
    from app.repositories.task_repository import TaskRepository
    repo = TaskRepository(db)
    return await repo.get_by_id(subtask.id)


# ============= BACKLOG API =============

@router.get("/backlog", response_model=List[TaskResponse])
async def get_backlog_tasks(
    project_id: Optional[int] = None,
    no_project: bool = False,
    db: AsyncSession = Depends(get_db)
):
    """Получить задачи в бэклоге. no_project=true — только задачи без проекта."""
    from sqlalchemy import select as sa_select
    query = (
        sa_select(Task)
        .where(Task.backlog == True)   # noqa: E712
        .where(Task.archived == False)  # noqa: E712
        .where(Task.deleted == False)   # noqa: E712
        .order_by(Task.backlog_added_at.desc())
    )
    if no_project:
        query = query.where(Task.project_id == None)  # noqa: E711
    elif project_id is not None:
        query = query.where(Task.project_id == project_id)
    from sqlalchemy.orm import selectinload
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
async def add_comment(task_id: int, request: CommentCreateRequest, db: AsyncSession = Depends(get_db)):
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


@router.put("/tasks/{task_id}/comments/{comment_id}", response_model=schemas.CommentResponse)
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
    task_id: int,
    comment_id: int,
    db: AsyncSession = Depends(get_db),
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
    cutoff = datetime.utcnow() - timedelta(days=7)
    result = await db.execute(
        sa_update(TaskModel)
        .where(TaskModel.status == "DONE")
        .where(TaskModel.archived == False)  # noqa: E712
        .where(TaskModel.deleted == False)   # noqa: E712
        .where(TaskModel.completed_at != None)  # noqa: E711
        .where(TaskModel.completed_at < cutoff)
        .values(archived=True)
    )
    await db.commit()
    return {"archived": result.rowcount}


# ============= WEB PUSH API =============

async def send_push(title: str, body: str, url: str = "/") -> None:
    """Send Web Push notification to all active subscriptions."""
    if not settings.VAPID_PRIVATE_KEY or not settings.VAPID_PUBLIC_KEY:
        return

    try:
        from pywebpush import webpush, WebPushException  # noqa: F401
        from app.domain.models import PushSubscription as PushSubscriptionModel
    except ImportError:
        logger.warning("pywebpush not installed — push notifications disabled")
        return

    from app.core.db import AsyncSessionLocal
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(PushSubscriptionModel))
        subs = result.scalars().all()

    private_key = settings.VAPID_PRIVATE_KEY.replace("\\n", "\n")
    payload = json.dumps({"title": title, "body": body, "url": url})

    for sub in subs:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                },
                data=payload,
                vapid_private_key=private_key,
                vapid_claims={"sub": f"mailto:{settings.VAPID_CLAIMS_EMAIL}"},
            )
        except Exception as exc:  # noqa: BLE001
            logger.debug("Push delivery failed for endpoint %s: %s", sub.endpoint[:40], exc)


@router.get("/push/vapid-public-key")
async def get_vapid_public_key():
    """Return VAPID public key for client-side subscription."""
    return {"public_key": settings.VAPID_PUBLIC_KEY}


@router.post("/push/subscribe")
async def push_subscribe(
    request: schemas.PushSubscriptionCreate,
    db: AsyncSession = Depends(get_db),
):
    """Save or update a Web Push subscription (upsert by endpoint)."""
    from app.domain.models import PushSubscription as PushSubscriptionModel

    result = await db.execute(
        select(PushSubscriptionModel).where(PushSubscriptionModel.endpoint == request.endpoint)
    )
    sub = result.scalar_one_or_none()

    if sub:
        sub.p256dh = request.keys["p256dh"]
        sub.auth = request.keys["auth"]
        sub.user_telegram_id = request.user_telegram_id
    else:
        sub = PushSubscriptionModel(
            endpoint=request.endpoint,
            p256dh=request.keys["p256dh"],
            auth=request.keys["auth"],
            user_telegram_id=request.user_telegram_id,
        )
        db.add(sub)

    await db.commit()
    return {"ok": True}


@router.delete("/push/unsubscribe")
async def push_unsubscribe(
    request: schemas.UnsubscribeRequest,
    db: AsyncSession = Depends(get_db),
):
    """Remove a Web Push subscription by endpoint."""
    from app.domain.models import PushSubscription as PushSubscriptionModel

    result = await db.execute(
        select(PushSubscriptionModel).where(PushSubscriptionModel.endpoint == request.endpoint)
    )
    sub = result.scalar_one_or_none()
    if sub:
        await db.delete(sub)
        await db.commit()
    return {"ok": True}


# ============= SEARCH API =============

@router.get("/search")
async def search_tasks(q: str = Query(default=""), limit: int = 20, db: AsyncSession = Depends(get_db)):
    """Полнотекстовый поиск по задачам (id + title + description)."""
    from sqlalchemy import or_, cast, String
    q = q.strip()
    if len(q) < 2:
        return []
    limit = min(limit, 50)
    # Поиск по ID задачи (без #)
    try:
        task_id = int(q)
        id_match = (Task.id == task_id)
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
        .where(or_(
            id_match if id_match else cast(Task.id, String).like(f"%{q}%"),
            Task.title.like(f"%{q_lower}%"),
            Task.title.like(f"%{q_upper}%"),
            Task.title.like(f"%{q_title}%"),
            Task.description.like(f"%{q_lower}%"),
            Task.description.like(f"%{q_upper}%"),
            Task.description.like(f"%{q_title}%"),
        ))
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
            "assignee_name": t.assignee_name,
            "assignee_telegram_id": t.assignee_telegram_id,
            "due_date": t.due_date.isoformat() if t.due_date else None,
            "archived": t.archived,
            "deleted": t.deleted,
            "backlog": t.backlog,
        }
        for t in tasks
    ]



# ============= SPRINT STATUS & REORDER =============

@router.patch("/sprints/{sprint_id}/status", response_model=dict)
async def update_sprint_status(sprint_id: int, req: dict, db: AsyncSession = Depends(get_db)):
    """Сменить статус спринта (activate/complete/archive)."""
    from app.domain.models import Sprint, SprintTask, Task, Project
    from sqlalchemy import update
    
    valid_statuses = ["planned", "active", "completed", "archived"]
    status = req.get("status", "planned")
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
    
    result = await db.execute(select(Sprint).where(Sprint.id == sprint_id))
    sprint = result.scalar_one_or_none()
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")
    
    await db.execute(update(Sprint).where(Sprint.id == sprint_id).values(status=status))
    await db.commit()
    
    # Return simple response
    return {"ok": True, "status": status, "id": sprint_id}


@router.patch("/sprints/reorder")
async def reorder_sprints(req: dict, db: AsyncSession = Depends(get_db)):
    """Изменить порядок спринтов."""
    from app.domain.models import Sprint
    from sqlalchemy import update
    
    sprint_ids = req.get("sprint_ids", [])
    for position, sprint_id in enumerate(sprint_ids):
        await db.execute(update(Sprint).where(Sprint.id == sprint_id).values(position=position))
    
    await db.commit()
    return {"ok": True}


@router.patch("/sprints/{sprint_id}/tasks/reorder")
async def reorder_sprint_tasks(sprint_id: int, req: dict, db: AsyncSession = Depends(get_db)):
    """Изменить порядок задач в спринте."""
    from app.domain.models import SprintTask
    from sqlalchemy import update
    
    task_ids = req.get("task_ids", [])
    for position, task_id in enumerate(task_ids):
        await db.execute(
            update(SprintTask)
            .where(SprintTask.sprint_id == sprint_id)
            .where(SprintTask.task_id == task_id)
            .values(position=position)
        )
    
    await db.commit()
    return {"ok": True}


# ============= DIGEST API =============

@router.get("/digest")
async def get_digest(db: AsyncSession = Depends(get_db)):
    """Данные для страницы дайджеста."""
    from app.repositories.project_repository import ProjectRepository
    from app.domain.enums import TaskStatus as TS, TaskPriority as TP
    from datetime import datetime, timedelta

    service = TaskService(db)
    all_tasks = await service.get_all_tasks()

    proj_repo = ProjectRepository(db)
    projects = await proj_repo.get_all_active()

    today = datetime.utcnow().date()
    soon = today + timedelta(days=7)

    terminal = {TS.DONE.value, TS.ON_HOLD.value}
    active_statuses = {TS.TODO.value, TS.DOING.value, TS.BLOCKED.value}

    def is_overdue(t) -> bool:
        return bool(t.due_date and t.due_date.date() < today and t.status not in terminal)

    def is_due_soon(t) -> bool:
        return bool(t.due_date and today <= t.due_date.date() <= soon and t.status not in terminal)

    def avg_completion_days(tasks_list) -> float | None:
        done = [t for t in tasks_list if t.status == TS.DONE.value and t.completed_at and t.created_at]
        if not done:
            return None
        return round(sum((t.completed_at - t.created_at).total_seconds() for t in done) / len(done) / 86400, 1)

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
            "high":   sum(1 for t in active_tasks if t.priority == TP.HIGH.value),
            "normal": sum(1 for t in active_tasks if t.priority == TP.NORMAL.value),
            "low":    sum(1 for t in active_tasks if t.priority == TP.LOW.value),
        },
        # Бэклог (#86)
        "backlog": sum(1 for t in all_tasks if getattr(t, 'is_backlog', False)),
    }

    # Задачи с дедлайнами (#87) — списки, не только счётчики
    overdue_tasks = sorted(
        [t for t in all_tasks if is_overdue(t)],
        key=lambda t: t.due_date
    )[:10]
    due_soon_tasks = sorted(
        [t for t in all_tasks if is_due_soon(t)],
        key=lambda t: t.due_date
    )[:10]

    def task_brief(t):
        return {
            "id": t.id,
            "title": t.title,
            "due_date": t.due_date.date().isoformat() if t.due_date else None,
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
        subtask_progress.append({
            "id": parent.id,
            "title": parent.title,
            "project_id": parent.project_id,
            "done": done_ch,
            "total": total_ch,
            "pct": round(done_ch / total_ch * 100) if total_ch else 0,
        })
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
            "backlog": sum(1 for t in proj_tasks if getattr(t, 'is_backlog', False)),
            "overdue": sum(1 for t in proj_tasks if is_overdue(t)),
            "due_soon": sum(1 for t in proj_tasks if is_due_soon(t)),
            "avg_completion_days": avg_completion_days(proj_tasks),
        }

    project_stats = []
    for proj in projects:
        proj_tasks = [t for t in top_tasks if t.project_id == proj.id]
        if not proj_tasks:
            continue
        project_stats.append(proj_stat(proj_tasks, proj.id, proj.name, proj.emoji or "📁"))

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
        elif task.assignee_name:
            name = task.assignee_name
        else:
            continue
        if name not in performers:
            performers[name] = {"completed": 0, "total": 0, "on_time": 0, "with_deadline": 0, "_done_secs": []}
        performers[name]["total"] += 1
        if task.status == TS.DONE.value:
            performers[name]["completed"] += 1
            if task.due_date:
                performers[name]["with_deadline"] += 1
                completed_at = task.completed_at or task.updated_at
                if completed_at and completed_at <= task.due_date:
                    performers[name]["on_time"] += 1
            if task.completed_at and task.created_at:
                performers[name]["_done_secs"].append((task.completed_at - task.created_at).total_seconds())

    top_performers = sorted(
        [{"name": n, **v} for n, v in performers.items()],
        key=lambda x: x["completed"],
        reverse=True
    )[:10]
    for p in top_performers:
        secs = p.pop("_done_secs", [])
        p["avg_days"] = round(sum(secs) / len(secs) / 86400, 1) if secs else None

    # Активность комментариев за неделю (#90)
    from app.domain.models import Comment
    week_ago = datetime.utcnow() - timedelta(days=7)
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
            key=lambda x: -x["count"]
        ),
    }

    # Прогресс активных спринтов (#91)
    from app.domain.models import Sprint, SprintTask
    from sqlalchemy.orm import selectinload
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
            sprint_progress.append({
                "id": sp.id, "name": sp.name,
                "total": 0, "done": 0, "doing": 0, "todo": 0, "blocked": 0, "pct": 0,
            })
            continue
        sp_tasks = [t for t in all_tasks if t.id in set(task_ids)]
        sp_done = sum(1 for t in sp_tasks if t.status == TS.DONE.value)
        sp_total = len(sp_tasks)
        sprint_progress.append({
            "id": sp.id,
            "name": sp.name,
            "total": sp_total,
            "done": sp_done,
            "doing": sum(1 for t in sp_tasks if t.status == TS.DOING.value),
            "todo": sum(1 for t in sp_tasks if t.status == TS.TODO.value),
            "blocked": sum(1 for t in sp_tasks if t.status == TS.BLOCKED.value),
            "pct": round(sp_done / sp_total * 100) if sp_total else 0,
        })

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


@router.get("/export")
async def export_data(
    project_id: Optional[int] = None,
    include: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """Export all data as JSON. include=tasks,projects,meetings,comments (default: all)."""
    parts = set(include.split(",")) if include else {"tasks", "projects", "meetings", "comments"}
    today = datetime.utcnow().strftime("%Y-%m-%d")

    payload: dict = {
        "version": settings.VERSION,
        "exported_at": datetime.utcnow().isoformat(),
        "filters": {"project_id": project_id, "include": sorted(parts)},
        "projects": [],
        "tasks": [],
        "meetings": [],
        "comments": [],
        "sprints": [],
    }

    if "projects" in parts:
        q = select(Project)
        if project_id:
            q = q.where(Project.id == project_id)
        rows = (await db.execute(q)).scalars().all()
        payload["projects"] = [
            {"id": r.id, "name": r.name, "description": r.description,
             "emoji": r.emoji, "is_active": r.is_active, "parent_project_id": r.parent_project_id,
             "created_at": _dt(r.created_at)}
            for r in rows
        ]

    if "tasks" in parts:
        q = select(Task).where(Task.deleted == False)  # noqa: E712
        if project_id:
            q = q.where(Task.project_id == project_id)
        rows = (await db.execute(q)).scalars().all()
        payload["tasks"] = [
            {"id": r.id, "title": r.title, "description": r.description,
             "status": r.status, "priority": r.priority,
             "project_id": r.project_id, "parent_task_id": r.parent_task_id,
             "assignee_id": r.assignee_id, "assignee_name": r.assignee_name,
             "assignee_telegram_id": r.assignee_telegram_id,
             "source": r.source, "source_message_id": r.source_message_id,
             "source_chat_id": r.source_chat_id,
             "due_date": _dt(r.due_date), "definition_of_done": r.definition_of_done,
             "archived": r.archived, "deleted": r.deleted,
             "backlog": r.backlog, "backlog_added_at": _dt(r.backlog_added_at),
             "created_at": _dt(r.created_at), "updated_at": _dt(r.updated_at),
             "started_at": _dt(r.started_at), "completed_at": _dt(r.completed_at)}
            for r in rows
        ]

    if "comments" in parts:
        q = select(Comment)
        if project_id:
            task_ids = [t["id"] for t in payload["tasks"]]
            if task_ids:
                q = q.where(Comment.task_id.in_(task_ids))
            else:
                payload["comments"] = []
                q = None
        if q is not None:
            rows = (await db.execute(q)).scalars().all()
            payload["comments"] = [
                {"id": r.id, "task_id": r.task_id, "text": r.text,
                 "author_name": r.author_name, "author_telegram_id": r.author_telegram_id,
                 "created_at": _dt(r.created_at)}
                for r in rows
            ]

    if "meetings" in parts and not project_id:
        rows = (await db.execute(select(Meeting))).scalars().all()
        payload["meetings"] = [
            {"id": r.id, "meeting_date": _dt(r.meeting_date),
             "summary": r.summary, "created_at": _dt(r.created_at)}
            for r in rows
        ]

    if "sprints" in parts:
        from app.domain.models import Sprint, SprintTask
        q = select(Sprint)
        if project_id:
            q = q.where(Sprint.project_id == project_id)
        rows = (await db.execute(q)).scalars().all()
        payload["sprints"] = [
            {"id": r.id, "name": r.name, "description": r.description,
             "project_id": r.project_id, "start_date": _dt(r.start_date),
             "end_date": _dt(r.end_date), "is_active": r.is_active,
             "created_at": _dt(r.created_at)}
            for r in rows
        ]

    return JSONResponse(
        content=payload,
        headers={"Content-Disposition": f"attachment; filename=teamflow-export-{today}.json"},
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
    counts = {"projects": 0, "tasks": 0, "meetings": 0, "comments": 0, "sprints": 0}

    if req.mode == "full":
        # Soft-delete tasks and projects; hard-delete meetings and comments
        await db.execute(text("UPDATE tasks SET deleted = 1"))
        await db.execute(text("UPDATE projects SET is_active = 0"))
        await db.execute(text("DELETE FROM comments"))
        await db.execute(text("DELETE FROM meetings"))
        await db.execute(text("DELETE FROM sprint_tasks"))
        await db.execute(text("UPDATE sprints SET is_active = 0"))
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
            exists = (await db.execute(select(Project).where(Project.id == p["id"]))).scalar_one_or_none()
            if exists:
                continue
        proj = Project(
            id=p["id"], name=p["name"], description=p.get("description"),
            emoji=p.get("emoji", "📁"), is_active=p.get("is_active", True),
            parent_project_id=p.get("parent_project_id"),
            created_at=_parse_dt(p.get("created_at")) or datetime.utcnow(),
        )
        db.add(proj)
        counts["projects"] += 1

    await db.flush()

    # Tasks — two passes: top-level first, then children (to satisfy FK on parent_task_id)
    tasks_data = data.get("tasks", [])
    for parent_pass in (True, False):
        for t in tasks_data:
            if bool(t.get("parent_task_id")) == parent_pass:
                continue
            if req.mode == "merge":
                exists = (await db.execute(select(Task).where(Task.id == t["id"]))).scalar_one_or_none()
                if exists:
                    continue
            task = Task(
                id=t["id"], title=t["title"], description=t.get("description"),
                status=t.get("status", "TODO"), priority=t.get("priority", "NORMAL"),
                project_id=t.get("project_id"), parent_task_id=t.get("parent_task_id"),
                assignee_id=t.get("assignee_id"), assignee_name=t.get("assignee_name"),
                assignee_telegram_id=t.get("assignee_telegram_id"),
                source=t.get("source", "IMPORT"),
                source_message_id=t.get("source_message_id"),
                source_chat_id=t.get("source_chat_id"),
                due_date=_parse_dt(t.get("due_date")),
                definition_of_done=t.get("definition_of_done"),
                archived=t.get("archived", False), deleted=t.get("deleted", False),
                backlog=t.get("backlog", False),
                backlog_added_at=_parse_dt(t.get("backlog_added_at")),
                created_at=_parse_dt(t.get("created_at")) or datetime.utcnow(),
                updated_at=_parse_dt(t.get("updated_at")) or datetime.utcnow(),
                started_at=_parse_dt(t.get("started_at")),
                completed_at=_parse_dt(t.get("completed_at")),
            )
            db.add(task)
            counts["tasks"] += 1

    await db.flush()

    # Meetings
    for m in data.get("meetings", []):
        if req.mode == "merge":
            exists = (await db.execute(select(Meeting).where(Meeting.id == m["id"]))).scalar_one_or_none()
            if exists:
                continue
        meeting = Meeting(
            id=m["id"], summary=m["summary"],
            meeting_date=_parse_dt(m.get("meeting_date")) or datetime.utcnow(),
            created_at=_parse_dt(m.get("created_at")) or datetime.utcnow(),
        )
        db.add(meeting)
        counts["meetings"] += 1

    # Comments
    for c in data.get("comments", []):
        if req.mode == "merge":
            exists = (await db.execute(select(Comment).where(Comment.id == c["id"]))).scalar_one_or_none()
            if exists:
                continue
        comment = Comment(
            id=c["id"], task_id=c["task_id"], text=c["text"],
            author_name=c.get("author_name"), author_telegram_id=c.get("author_telegram_id"),
            created_at=_parse_dt(c.get("created_at")) or datetime.utcnow(),
        )
        db.add(comment)
        counts["comments"] += 1

    # Sprints
    from app.domain.models import Sprint, SprintTask
    for s in data.get("sprints", []):
        if req.mode == "merge":
            exists = (await db.execute(select(Sprint).where(Sprint.id == s["id"]))).scalar_one_or_none()
            if exists:
                continue
        sprint = Sprint(
            id=s["id"], name=s["name"], description=s.get("description"),
            project_id=s.get("project_id"), start_date=_parse_dt(s.get("start_date")),
            end_date=_parse_dt(s.get("end_date")), is_active=s.get("is_active", True),
            created_at=_parse_dt(s.get("created_at")) or datetime.utcnow(),
        )
        db.add(sprint)
        counts["sprints"] += 1

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
    api_key = ApiKey(
        key=key,
        name=req.name,
        description=req.description,
    )
    db.add(api_key)
    await db.commit()
    await db.refresh(api_key)
    return api_key


@router.patch("/api-keys/{key_id}", response_model=ApiKeyResponse)
async def update_api_key(key_id: int, req: ApiKeyUpdateRequest, db: AsyncSession = Depends(get_db)):
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
    from app.domain.models import ApiKey
    result = await db.execute(select(ApiKey).where(ApiKey.id == key_id))
    api_key = result.scalar_one_or_none()
    if not api_key:
        raise HTTPException(status_code=404, detail="API key not found")
    
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


# ============= SPRINTS API =============

class SprintCreateRequest(BaseModel):
    """Создание спринта."""
    name: str
    description: Optional[str] = None
    project_id: Optional[int] = None
    start_date: datetime
    end_date: datetime

class SprintUpdateRequest(BaseModel):
    """Обновление спринта."""
    name: Optional[str] = None
    description: Optional[str] = None
    project_id: Optional[int] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    is_active: Optional[bool] = None

class SprintTaskAddRequest(BaseModel):
    """Добавление задачи в спринт."""
    task_id: int
    position: Optional[int] = None

class SprintTaskResponse(BaseModel):
    """Задача в спринте с деталями."""
    id: int
    sprint_id: int
    task_id: int
    position: int
    created_at: datetime
    # Task details
    task_title: str
    task_status: str
    task_priority: str
    model_config = ConfigDict(from_attributes=True)

class SprintResponse(BaseModel):
    """Спринт с задачами."""
    id: int
    name: str
    description: Optional[str]
    project_id: Optional[int]
    project_name: Optional[str] = None
    start_date: datetime
    end_date: datetime
    status: str
    position: int = 0
    is_deleted: bool = False
    created_at: datetime
    tasks: List[SprintTaskResponse] = []
    model_config = ConfigDict(from_attributes=True)


@router.get("/sprints", response_model=List[SprintResponse])
async def get_sprints(db: AsyncSession = Depends(get_db)):
    """Получить все спринты."""
    from app.domain.models import Sprint, SprintTask, Task, Project
    result = await db.execute(
        select(Sprint)
        .options(
            selectinload(Sprint.tasks)
            .selectinload(SprintTask.task)
            .selectinload(Task.project)
        )
        .order_by(Sprint.position, Sprint.start_date)
    )
    sprints = list(result.scalars().all())
    
    response = []
    for sprint in sprints:
        # Get project name if exists
        project_name = None
        if sprint.project_id:
            proj_result = await db.execute(select(Project).where(Project.id == sprint.project_id))
            proj = proj_result.scalar_one_or_none()
            if proj:
                project_name = proj.name
        
        task_list = []
        for st in sorted(sprint.tasks, key=lambda x: x.position):
            task_list.append({
                "id": st.id,
                "sprint_id": st.sprint_id,
                "task_id": st.task_id,
                "position": st.position,
                "created_at": st.created_at,
                "task_title": st.task.title,
                "task_status": st.task.status,
                "task_priority": st.task.priority
            })

        response.append({
            "id": sprint.id,
            "name": sprint.name,
            "description": sprint.description,
            "project_id": sprint.project_id,
            "project_name": project_name,
            "start_date": sprint.start_date,
            "end_date": sprint.end_date,
            "status": sprint.status,
            "position": sprint.position,
            "is_deleted": sprint.is_deleted,
            "created_at": sprint.created_at,
            "tasks": task_list
        })
    return response


@router.post("/sprints", response_model=SprintResponse)
async def create_sprint(request: SprintCreateRequest, db: AsyncSession = Depends(get_db)):
    """Создать спринт."""
    from app.domain.models import Sprint
    max_pos_result = await db.execute(select(func.max(Sprint.position)))
    max_pos = max_pos_result.scalar_one_or_none() or 0
    sprint = Sprint(
        name=request.name,
        description=request.description,
        project_id=request.project_id,
        start_date=request.start_date,
        end_date=request.end_date,
        position=max_pos + 1,
    )
    db.add(sprint)
    await db.commit()
    await db.refresh(sprint)
    return {
        "id": sprint.id,
        "name": sprint.name,
        "description": sprint.description,
        "project_id": sprint.project_id,
        "project_name": None,
        "start_date": sprint.start_date,
        "end_date": sprint.end_date,
        "status": sprint.status,
        "position": sprint.position,
        "created_at": sprint.created_at,
        "tasks": []
    }


@router.get("/sprints/{sprint_id}", response_model=SprintResponse)
async def get_sprint(sprint_id: int, db: AsyncSession = Depends(get_db)):
    """Получить спринт по ID."""
    from app.domain.models import Sprint, SprintTask, Task, Project
    result = await db.execute(
        select(Sprint)
        .options(
            selectinload(Sprint.tasks)
            .selectinload(SprintTask.task)
        )
        .where(Sprint.id == sprint_id)
    )
    sprint = result.scalar_one_or_none()
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")
    
    # Get project name
    project_name = None
    if sprint.project_id:
        proj_result = await db.execute(select(Project).where(Project.id == sprint.project_id))
        proj = proj_result.scalar_one_or_none()
        if proj:
            project_name = proj.name
    
    task_list = []
    for st in sorted(sprint.tasks, key=lambda x: x.position):
        task_list.append({
            "id": st.id,
            "sprint_id": st.sprint_id,
            "task_id": st.task_id,
            "position": st.position,
            "created_at": st.created_at,
            "task_title": st.task.title,
            "task_status": st.task.status,
            "task_priority": st.task.priority
        })

    return {
        "id": sprint.id,
        "name": sprint.name,
        "description": sprint.description,
        "project_id": sprint.project_id,
        "project_name": project_name,
        "start_date": sprint.start_date,
        "end_date": sprint.end_date,
        "status": sprint.status,
        "position": sprint.position,
        "created_at": sprint.created_at,
        "tasks": task_list
    }


@router.patch("/sprints/{sprint_id}", response_model=SprintResponse)
async def update_sprint(sprint_id: int, request: SprintUpdateRequest, db: AsyncSession = Depends(get_db)):
    """Обновить спринт."""
    from app.domain.models import Sprint, SprintTask, Task, Project
    result = await db.execute(select(Sprint).where(Sprint.id == sprint_id))
    sprint = result.scalar_one_or_none()
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")
    
    if request.name is not None:
        sprint.name = request.name
    if request.description is not None:
        sprint.description = request.description
    if request.project_id is not None:
        sprint.project_id = request.project_id
    if request.start_date is not None:
        sprint.start_date = request.start_date
    if request.end_date is not None:
        sprint.end_date = request.end_date
    if request.is_active is not None:
        sprint.status = "active" if request.is_active else "planned"
    
    await db.commit()
    await db.refresh(sprint)
    
    # Reload tasks
    tasks_result = await db.execute(
        select(SprintTask)
        .options(selectinload(SprintTask.task))
        .where(SprintTask.sprint_id == sprint_id)
        .order_by(SprintTask.position)
    )
    sprint_tasks = tasks_result.scalars().all()
    
    # Get project name
    project_name = None
    if sprint.project_id:
        proj_result = await db.execute(select(Project).where(Project.id == sprint.project_id))
        proj = proj_result.scalar_one_or_none()
        if proj:
            project_name = proj.name
    
    task_list = []
    for st in sprint_tasks:
        task_list.append({
            "id": st.id,
            "sprint_id": st.sprint_id,
            "task_id": st.task_id,
            "position": st.position,
            "created_at": st.created_at,
            "task_title": st.task.title,
            "task_status": st.task.status,
            "task_priority": st.task.priority
        })
    
    return {
        "id": sprint.id,
        "name": sprint.name,
        "description": sprint.description,
        "project_id": sprint.project_id,
        "project_name": project_name,
        "start_date": sprint.start_date,
        "end_date": sprint.end_date,
        "status": sprint.status,
        "position": sprint.position,
        "created_at": sprint.created_at,
        "tasks": task_list
    }


@router.delete("/sprints/{sprint_id}")
async def delete_sprint(sprint_id: int, db: AsyncSession = Depends(get_db)):
    """Удалить спринт."""
    from app.domain.models import Sprint
    from sqlalchemy import update as sa_update
    result = await db.execute(select(Sprint).where(Sprint.id == sprint_id))
    sprint = result.scalar_one_or_none()
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")

    await db.execute(sa_update(Sprint).where(Sprint.id == sprint_id).values(is_deleted=True))
    await db.commit()
    return {"ok": True}


@router.post("/sprints/{sprint_id}/restore")
async def restore_sprint(sprint_id: int, db: AsyncSession = Depends(get_db)):
    """Восстановить удалённый спринт."""
    from app.domain.models import Sprint
    result = await db.execute(select(Sprint).where(Sprint.id == sprint_id))
    sprint = result.scalar_one_or_none()
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")
    from sqlalchemy import update as sa_update
    await db.execute(sa_update(Sprint).where(Sprint.id == sprint_id).values(is_deleted=False))
    await db.commit()
    return {"ok": True}


@router.post("/sprints/{sprint_id}/tasks", response_model=SprintTaskResponse)
async def add_task_to_sprint(sprint_id: int, request: SprintTaskAddRequest, db: AsyncSession = Depends(get_db)):
    """Добавить задачу в спринт."""
    from app.domain.models import Sprint, SprintTask, Task
    # Check sprint exists
    sprint_result = await db.execute(select(Sprint).where(Sprint.id == sprint_id))
    sprint = sprint_result.scalar_one_or_none()
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")
    
    # Check task exists
    task_result = await db.execute(select(Task).where(Task.id == request.task_id))
    task = task_result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # Get max position
    max_pos_result = await db.execute(select(func.max(SprintTask.position)).where(SprintTask.sprint_id == sprint_id))
    max_pos = max_pos_result.scalar_one_or_none() or 0
    
    sprint_task = SprintTask(
        sprint_id=sprint_id,
        task_id=request.task_id,
        position=request.position if request.position is not None else (max_pos + 1)
    )
    db.add(sprint_task)
    await db.commit()
    await db.refresh(sprint_task)
    # Reload task for response fields
    task_result2 = await db.execute(select(Task).where(Task.id == request.task_id))
    task = task_result2.scalar_one()
    return {
        "id": sprint_task.id,
        "sprint_id": sprint_task.sprint_id,
        "task_id": sprint_task.task_id,
        "position": sprint_task.position,
        "created_at": sprint_task.created_at,
        "task_title": task.title,
        "task_status": task.status,
        "task_priority": task.priority,
    }


@router.delete("/sprints/{sprint_id}/tasks/{task_id}")
async def remove_task_from_sprint(sprint_id: int, task_id: int, db: AsyncSession = Depends(get_db)):
    """Удалить задачу из спринта."""
    from app.domain.models import SprintTask
    result = await db.execute(
        select(SprintTask)
        .where(SprintTask.sprint_id == sprint_id)
        .where(SprintTask.task_id == task_id)
    )
    sprint_task = result.scalar_one_or_none()
    if not sprint_task:
        raise HTTPException(status_code=404, detail="Task not in sprint")
    
    await db.delete(sprint_task)
    await db.commit()
    return {"ok": True}


@router.get("/sprints/{sprint_id}/tasks", response_model=List[SprintTaskResponse])
async def get_sprint_tasks(sprint_id: int, db: AsyncSession = Depends(get_db)):
    """Получить задачи спринта."""
    from app.domain.models import SprintTask
    result = await db.execute(
        select(SprintTask)
        .options(selectinload(SprintTask.task))
        .where(SprintTask.sprint_id == sprint_id)
        .order_by(SprintTask.position)
    )
    sprint_tasks = list(result.scalars().all())
    return [
        {
            "id": st.id,
            "sprint_id": st.sprint_id,
            "task_id": st.task_id,
            "position": st.position,
            "created_at": st.created_at,
            "task_title": st.task.title,
            "task_status": st.task.status,
            "task_priority": st.task.priority,
        }
        for st in sprint_tasks
    ]

