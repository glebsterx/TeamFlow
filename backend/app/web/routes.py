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
    assignee_telegram_id: Optional[int] = None


class TaskUpdateRequest(BaseModel):
    """Обновление задачи."""
    title: Optional[str] = None
    description: Optional[str] = None


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
    
    await db.commit()
    await db.refresh(task)
    return task


@router.delete("/tasks/{task_id}")
async def delete_task_api(task_id: int, db: AsyncSession = Depends(get_db)):
    """Удалить задачу."""
    service = TaskService(db)
    task = await service.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    from app.repositories.task_repository import TaskRepository
    repo = TaskRepository(db)
    await repo.delete(task_id)
    await db.commit()
    return {"ok": True}
