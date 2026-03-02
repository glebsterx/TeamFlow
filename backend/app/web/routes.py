"""Web API routes - no auth."""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime
from pydantic import BaseModel, ConfigDict
from app.core.db import get_db
from app.services.task_service import TaskService
from app.repositories.user_repository import UserRepository
from app.domain.enums import TaskStatus
from app.domain.models import Task
from app.web.schemas import TaskResponse, TaskDetailResponse, StatsResponse, BotInfoResponse, TelegramUserResponse
from app.config import settings

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
    return {
        "total": len(tasks),
        "todo": len([t for t in tasks if t.status == TaskStatus.TODO.value]),
        "doing": len([t for t in tasks if t.status == TaskStatus.DOING.value]),
        "done": len([t for t in tasks if t.status == TaskStatus.DONE.value]),
        "blocked": len([t for t in tasks if t.status == TaskStatus.BLOCKED.value]),
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


@router.post("/tasks/{task_id}/status")
async def change_task_status(
    task_id: int,
    request: StatusChangeRequest,
    db: AsyncSession = Depends(get_db)
):
    """Изменить статус задачи."""
    from app.domain.enums import TaskStatus
    service = TaskService(db)
    await service.change_status(task_id, TaskStatus(request.status))
    await db.commit()
    return {"ok": True}


@router.post("/tasks/{task_id}/assign")
async def assign_task_api(
    task_id: int,
    request: AssignRequest,
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


class ProjectUpdateRequest(BaseModel):
    """Обновление проекта."""
    name: Optional[str] = None
    description: Optional[str] = None
    emoji: Optional[str] = None
    is_active: Optional[bool] = None


class ProjectResponse(BaseModel):
    """Проект."""
    id: int
    name: str
    description: Optional[str]
    emoji: Optional[str]
    is_active: bool
    created_at: datetime
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
    project = await repo.create(
        name=request.name,
        description=request.description,
        emoji=request.emoji
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
    
    await db.commit()
    await db.refresh(project)
    return project


@router.delete("/projects/{project_id}")
async def delete_project(project_id: int, db: AsyncSession = Depends(get_db)):
    """Удалить проект (мягкое удаление)."""
    from app.repositories.project_repository import ProjectRepository
    repo = ProjectRepository(db)
    project = await repo.get_by_id(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    project.is_active = False
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


class TaskUpdateRequest(BaseModel):
    """Обновление задачи."""
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    priority: Optional[str] = None
    parent_task_id: Optional[int] = None


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

    if request.assignee_telegram_id:
        user_repo = UserRepository(db)
        user = await user_repo.get_by_telegram_id(request.assignee_telegram_id)
        if user:
            task.assignee_id = user.id
            task.assignee_telegram_id = user.telegram_id
            task.assignee_name = user.display_name
    
    await db.commit()
    await db.refresh(task)
    return task


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


# ============= DIGEST API =============

@router.get("/digest")
async def get_digest(db: AsyncSession = Depends(get_db)):
    """Данные для страницы дайджеста."""
    from app.repositories.project_repository import ProjectRepository
    from app.domain.enums import TaskStatus as TS
    from datetime import datetime, timedelta

    service = TaskService(db)
    all_tasks = await service.get_all_tasks()

    proj_repo = ProjectRepository(db)
    projects = await proj_repo.get_all_active()

    today = datetime.utcnow().date()
    soon = today + timedelta(days=7)

    def is_overdue(t) -> bool:
        return bool(t.due_date and t.due_date.date() < today and t.status != TS.DONE.value)

    def is_due_soon(t) -> bool:
        return bool(t.due_date and today <= t.due_date.date() <= soon and t.status != TS.DONE.value)

    def avg_completion_days(tasks_list) -> float | None:
        done = [t for t in tasks_list if t.status == TS.DONE.value and t.completed_at and t.created_at]
        if not done:
            return None
        return round(sum((t.completed_at - t.created_at).total_seconds() for t in done) / len(done) / 86400, 1)

    # Только верхнеуровневые задачи для статистики по проектам
    top_tasks = [t for t in all_tasks if not t.parent_task_id]

    # Общая статистика
    stats = {
        "total": len(all_tasks),
        "todo": sum(1 for t in all_tasks if t.status == TS.TODO.value),
        "doing": sum(1 for t in all_tasks if t.status == TS.DOING.value),
        "done": sum(1 for t in all_tasks if t.status == TS.DONE.value),
        "blocked": sum(1 for t in all_tasks if t.status == TS.BLOCKED.value),
        "overdue": sum(1 for t in all_tasks if is_overdue(t)),
        "due_soon": sum(1 for t in all_tasks if is_due_soon(t)),
        "avg_completion_days": avg_completion_days(all_tasks),
    }

    # Статистика по проектам (только top-level задачи)
    project_stats = []
    for proj in projects:
        proj_tasks = [t for t in top_tasks if t.project_id == proj.id]
        if not proj_tasks:
            continue
        project_stats.append({
            "id": proj.id,
            "name": proj.name,
            "emoji": proj.emoji or "📁",
            "total": len(proj_tasks),
            "done": sum(1 for t in proj_tasks if t.status == TS.DONE.value),
            "doing": sum(1 for t in proj_tasks if t.status == TS.DOING.value),
            "todo": sum(1 for t in proj_tasks if t.status == TS.TODO.value),
            "blocked": sum(1 for t in proj_tasks if t.status == TS.BLOCKED.value),
            "overdue": sum(1 for t in proj_tasks if is_overdue(t)),
            "due_soon": sum(1 for t in proj_tasks if is_due_soon(t)),
            "avg_completion_days": avg_completion_days(proj_tasks),
        })

    # Задачи без проекта (только top-level)
    no_proj = [t for t in top_tasks if not t.project_id]
    if no_proj:
        project_stats.append({
            "id": None,
            "name": "Без проекта",
            "emoji": "📋",
            "total": len(no_proj),
            "done": sum(1 for t in no_proj if t.status == TS.DONE.value),
            "doing": sum(1 for t in no_proj if t.status == TS.DOING.value),
            "todo": sum(1 for t in no_proj if t.status == TS.TODO.value),
            "blocked": sum(1 for t in no_proj if t.status == TS.BLOCKED.value),
            "overdue": sum(1 for t in no_proj if is_overdue(t)),
            "due_soon": sum(1 for t in no_proj if is_due_soon(t)),
            "avg_completion_days": avg_completion_days(no_proj),
        })

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

    return {
        "stats": stats,
        "projects": project_stats,
        "top_performers": top_performers,
    }
