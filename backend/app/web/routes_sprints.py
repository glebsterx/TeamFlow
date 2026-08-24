"""Sprints routes — CRUD, task assignment, status/reorder."""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update, update as sa_update
from sqlalchemy.orm import selectinload
from datetime import datetime
from pydantic import BaseModel, ConfigDict

from app.core.db import get_db
from app.domain.models import Sprint, SprintTask, Task, Project

router = APIRouter()


# ============= SPRINT STATUS & REORDER =============


@router.patch("/sprints/{sprint_id}/status", response_model=dict)
async def update_sprint_status(
    sprint_id: int, req: dict, db: AsyncSession = Depends(get_db)
):
    """Сменить статус спринта (activate/complete/archive)."""

    valid_statuses = ["planned", "active", "completed", "archived"]
    status = req.get("status", "planned")
    if status not in valid_statuses:
        raise HTTPException(
            status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}"
        )

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

    sprint_ids = req.get("sprint_ids", [])
    for position, sprint_id in enumerate(sprint_ids):
        await db.execute(
            update(Sprint).where(Sprint.id == sprint_id).values(position=position)
        )

    await db.commit()
    return {"ok": True}


@router.patch("/sprints/{sprint_id}/tasks/reorder")
async def reorder_sprint_tasks(
    sprint_id: int, req: dict, db: AsyncSession = Depends(get_db)
):
    """Изменить порядок задач в спринте."""

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

    result = await db.execute(
        select(Sprint)
        .options(
            selectinload(
                Sprint.project
            ),  # #260 — fix N+1: project loaded in same query
            selectinload(Sprint.tasks)
            .selectinload(SprintTask.task)
            .selectinload(Task.project),
        )
        .order_by(Sprint.position, Sprint.start_date)
    )
    sprints = list(result.scalars().all())

    response = []
    for sprint in sprints:
        project_name = sprint.project.name if sprint.project else None

        task_list = []
        for st in sorted(sprint.tasks, key=lambda x: x.position):
            task_list.append(
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
            )

        response.append(
            {
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
                "tasks": task_list,
            }
        )
    return response


@router.post("/sprints", response_model=SprintResponse)
async def create_sprint(
    request: SprintCreateRequest, db: AsyncSession = Depends(get_db)
):
    """Создать спринт."""

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
        "tasks": [],
    }


@router.get("/sprints/{sprint_id}", response_model=SprintResponse)
async def get_sprint(sprint_id: int, db: AsyncSession = Depends(get_db)):
    """Получить спринт по ID."""

    result = await db.execute(
        select(Sprint)
        .options(selectinload(Sprint.tasks).selectinload(SprintTask.task))
        .where(Sprint.id == sprint_id)
    )
    sprint = result.scalar_one_or_none()
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")

    # Get project name
    project_name = None
    if sprint.project_id:
        proj_result = await db.execute(
            select(Project).where(Project.id == sprint.project_id)
        )
        proj = proj_result.scalar_one_or_none()
        if proj:
            project_name = proj.name

    task_list = []
    for st in sorted(sprint.tasks, key=lambda x: x.position):
        task_list.append(
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
        )

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
        "tasks": task_list,
    }


@router.patch("/sprints/{sprint_id}", response_model=SprintResponse)
async def update_sprint(
    sprint_id: int, request: SprintUpdateRequest, db: AsyncSession = Depends(get_db)
):
    """Обновить спринт."""

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
        proj_result = await db.execute(
            select(Project).where(Project.id == sprint.project_id)
        )
        proj = proj_result.scalar_one_or_none()
        if proj:
            project_name = proj.name

    task_list = []
    for st in sprint_tasks:
        task_list.append(
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
        )

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
        "tasks": task_list,
    }


@router.delete("/sprints/{sprint_id}")
async def delete_sprint(sprint_id: int, db: AsyncSession = Depends(get_db)):
    """Удалить спринт."""

    result = await db.execute(select(Sprint).where(Sprint.id == sprint_id))
    sprint = result.scalar_one_or_none()
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")

    await db.execute(
        sa_update(Sprint).where(Sprint.id == sprint_id).values(is_deleted=True)
    )
    await db.commit()
    return {"ok": True}


@router.post("/sprints/{sprint_id}/restore")
async def restore_sprint(sprint_id: int, db: AsyncSession = Depends(get_db)):
    """Восстановить удалённый спринт."""

    result = await db.execute(select(Sprint).where(Sprint.id == sprint_id))
    sprint = result.scalar_one_or_none()
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")

    await db.execute(
        sa_update(Sprint).where(Sprint.id == sprint_id).values(is_deleted=False)
    )
    await db.commit()
    return {"ok": True}


@router.post("/sprints/{sprint_id}/tasks", response_model=SprintTaskResponse)
async def add_task_to_sprint(
    sprint_id: int, request: SprintTaskAddRequest, db: AsyncSession = Depends(get_db)
):
    """Добавить задачу в спринт."""

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
    max_pos_result = await db.execute(
        select(func.max(SprintTask.position)).where(SprintTask.sprint_id == sprint_id)
    )
    max_pos = max_pos_result.scalar_one_or_none() or 0

    sprint_task = SprintTask(
        sprint_id=sprint_id,
        task_id=request.task_id,
        position=request.position if request.position is not None else (max_pos + 1),
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
async def remove_task_from_sprint(
    sprint_id: int, task_id: int, db: AsyncSession = Depends(get_db)
):
    """Удалить задачу из спринта."""

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
