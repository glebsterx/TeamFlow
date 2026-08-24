"""Projects routes — CRUD, members, archive/restore."""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime
from pydantic import BaseModel, ConfigDict

from app.core.db import get_db
from app.repositories.project_repository import ProjectRepository
from app.services.project_member_service import ProjectMemberService

router = APIRouter()


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

    repo = ProjectRepository(db)
    projects = await repo.get_all_active()
    return projects


@router.post("/projects", response_model=ProjectResponse)
async def create_project(
    request: ProjectCreateRequest, db: AsyncSession = Depends(get_db)
):
    """Создать проект."""

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
        parent_project_id=request.parent_project_id,
    )
    await db.commit()
    return project


@router.patch("/projects/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: int, request: ProjectUpdateRequest, db: AsyncSession = Depends(get_db)
):
    """Обновить проект."""

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
            raise HTTPException(
                status_code=400, detail="Project cannot be its own parent"
            )
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

    repo = ProjectRepository(db)
    projects = await repo.get_archived()
    return projects


@router.post("/projects/{project_id}/archive", response_model=ProjectResponse)
async def archive_project(project_id: int, db: AsyncSession = Depends(get_db)):
    """Архивировать проект (is_active=False)."""

    repo = ProjectRepository(db)
    await repo.archive(project_id)
    await db.commit()
    return await repo.get_by_id(project_id)


@router.post("/projects/{project_id}/restore", response_model=ProjectResponse)
async def restore_project(project_id: int, db: AsyncSession = Depends(get_db)):
    """Восстановить проект из архива."""

    repo = ProjectRepository(db)
    await repo.restore(project_id)
    await db.commit()
    return await repo.get_by_id(project_id)


@router.get("/projects/{project_id}/can-delete")
async def check_can_delete_project(project_id: int, db: AsyncSession = Depends(get_db)):
    """Проверить можно ли удалить проект."""

    repo = ProjectRepository(db)
    result = await repo.can_delete(project_id)
    return result


@router.delete("/projects/{project_id}")
async def delete_project(project_id: int, db: AsyncSession = Depends(get_db)):
    """Удалить проект (мягкое удаление с проверкой)."""

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
                **check,
            },
        )

    await repo.soft_delete(project_id)
    await db.commit()
    return {"ok": True}


# ============= PROJECT MEMBERS =============


class ProjectMemberCreate(BaseModel):
    telegram_user_id: int
    role: str = "viewer"


class ProjectMemberUpdate(BaseModel):
    role: str


@router.get("/projects/{project_id}/members")
async def get_project_members(project_id: int, db: AsyncSession = Depends(get_db)):
    """Получить участников проекта."""

    members = await ProjectMemberService.get_project_members(db, project_id)
    return [
        {
            "id": m.id,
            "project_id": m.project_id,
            "telegram_user_id": m.telegram_user_id,
            "role": m.role,
            "created_at": m.created_at.isoformat() if m.created_at else None,
            "user": {
                "id": m.user.id,
                "display_name": m.user.display_name or m.user.first_name,
                "username": m.user.username,
            }
            if m.user
            else None,
        }
        for m in members
    ]


@router.post("/projects/{project_id}/members")
async def add_project_member(
    project_id: int, data: ProjectMemberCreate, db: AsyncSession = Depends(get_db)
):
    """Добавить участника в проект."""

    member = await ProjectMemberService.add_member(
        db, project_id, data.telegram_user_id, data.role
    )
    await db.commit()
    return {
        "id": member.id,
        "project_id": member.project_id,
        "telegram_user_id": member.telegram_user_id,
        "role": member.role,
    }


@router.patch("/projects/{project_id}/members/{user_id}")
async def update_project_member(
    project_id: int,
    user_id: int,
    data: ProjectMemberUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Изменить роль участника проекта."""

    ok = await ProjectMemberService.update_member_role(
        db, project_id, user_id, data.role
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Участник не найден")
    await db.commit()
    return {"status": "ok"}


@router.delete("/projects/{project_id}/members/{user_id}")
async def remove_project_member(
    project_id: int, user_id: int, db: AsyncSession = Depends(get_db)
):
    """Удалить участника из проекта."""

    ok = await ProjectMemberService.remove_member(db, project_id, user_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Участник не найден")
    await db.commit()
    return {"status": "ok"}
