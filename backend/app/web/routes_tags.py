"""Tag + Dependency endpoints."""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.db import get_db
from app.domain.models import Tag, Task, task_tags, TaskDependency

router = APIRouter()


class TagCreate(BaseModel):
    name: str
    color: Optional[str] = "#6366f1"


class TagResponse(BaseModel):
    id: int
    name: str
    color: str

    class Config:
        from_attributes = True


@router.get("/tags", response_model=List[TagResponse])
async def get_tags(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Tag).order_by(Tag.name))
    return result.scalars().all()


@router.post("/tags", response_model=TagResponse)
async def create_tag(body: TagCreate, db: AsyncSession = Depends(get_db)):
    # Check duplicate
    existing = await db.execute(select(Tag).where(Tag.name == body.name.strip()))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Tag already exists")
    tag = Tag(name=body.name.strip(), color=body.color or "#6366f1")
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return tag


@router.delete("/tags/{tag_id}")
async def delete_tag(tag_id: int, db: AsyncSession = Depends(get_db)):
    tag = await db.get(Tag, tag_id)
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    await db.delete(tag)
    await db.commit()
    return {"ok": True}


@router.patch("/tags/{tag_id}", response_model=TagResponse)
async def update_tag(tag_id: int, body: TagCreate, db: AsyncSession = Depends(get_db)):
    tag = await db.get(Tag, tag_id)
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    tag.name = body.name.strip()
    tag.color = body.color or tag.color
    await db.commit()
    await db.refresh(tag)
    return tag


@router.post("/tasks/{task_id}/tags/{tag_id}")
async def add_tag_to_task(task_id: int, tag_id: int, db: AsyncSession = Depends(get_db)):
    task = await db.execute(
        select(Task).where(Task.id == task_id).options(selectinload(Task.tags))
    )
    task = task.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    tag = await db.get(Tag, tag_id)
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    if tag not in task.tags:
        task.tags.append(tag)
        await db.commit()
    return {"ok": True}


@router.delete("/tasks/{task_id}/tags/{tag_id}")
async def remove_tag_from_task(task_id: int, tag_id: int, db: AsyncSession = Depends(get_db)):
    task = await db.execute(
        select(Task).where(Task.id == task_id).options(selectinload(Task.tags))
    )
    task = task.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    tag = await db.get(Tag, tag_id)
    if tag and tag in task.tags:
        task.tags.remove(tag)
        await db.commit()
    return {"ok": True}


# ─── Task Dependencies ────────────────────────────────────────────────────────

class DependencyInfo(BaseModel):
    id: int
    task_id: int
    depends_on_id: int
    depends_on_title: str
    depends_on_status: str

    class Config:
        from_attributes = True


@router.get("/tasks/{task_id}/dependencies", response_model=List[DependencyInfo])
async def get_task_dependencies(task_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(TaskDependency)
        .where(TaskDependency.task_id == task_id)
        .options(selectinload(TaskDependency.depends_on))
    )
    deps = result.scalars().all()
    return [
        DependencyInfo(
            id=d.id, task_id=d.task_id, depends_on_id=d.depends_on_id,
            depends_on_title=d.depends_on.title if d.depends_on else "?",
            depends_on_status=d.depends_on.status if d.depends_on else "?",
        )
        for d in deps
    ]


@router.post("/tasks/{task_id}/dependencies")
async def add_dependency(task_id: int, body: dict, db: AsyncSession = Depends(get_db)):
    """Add dependency: task_id depends on depends_on_id."""
    depends_on_id = body.get("depends_on_id")
    if not depends_on_id:
        raise HTTPException(status_code=400, detail="depends_on_id required")
    if task_id == depends_on_id:
        raise HTTPException(status_code=400, detail="Task cannot depend on itself")
    # Check exists
    task = await db.get(Task, task_id)
    dep_task = await db.get(Task, depends_on_id)
    if not task or not dep_task:
        raise HTTPException(status_code=404, detail="Task not found")
    # Check duplicate
    existing = await db.execute(
        select(TaskDependency).where(
            TaskDependency.task_id == task_id,
            TaskDependency.depends_on_id == depends_on_id,
        )
    )
    if existing.scalar_one_or_none():
        return {"ok": True}
    dep = TaskDependency(task_id=task_id, depends_on_id=depends_on_id)
    db.add(dep)
    await db.commit()
    return {"ok": True, "id": dep.id}


@router.delete("/tasks/{task_id}/dependencies/{dep_id}")
async def remove_dependency(task_id: int, dep_id: int, db: AsyncSession = Depends(get_db)):
    dep = await db.get(TaskDependency, dep_id)
    if dep and dep.task_id == task_id:
        await db.delete(dep)
        await db.commit()
    return {"ok": True}

