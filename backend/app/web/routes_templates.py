"""Task Templates endpoints — GET/POST/DELETE /task-templates."""
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, Column, Integer, String, Text, DateTime, Boolean
from app.core.db import Base, get_db
from app.core.clock import Clock

router = APIRouter()


class TaskTemplate(Base):
    __tablename__ = "task_templates"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    priority = Column(String(10), nullable=False, default="NORMAL")
    project_id = Column(Integer, nullable=True)
    recurrence = Column(String(20), nullable=True)
    fields_json = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=Clock.now)


class TemplateCreate(BaseModel):
    name: str
    title: str
    description: Optional[str] = None
    priority: str = "NORMAL"
    project_id: Optional[int] = None
    recurrence: Optional[str] = None


class TemplateResponse(BaseModel):
    id: int
    name: str
    title: str
    description: Optional[str]
    priority: str
    project_id: Optional[int]
    recurrence: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("/task-templates", response_model=List[TemplateResponse])
async def get_templates(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TaskTemplate).order_by(TaskTemplate.name))
    return result.scalars().all()


@router.post("/task-templates", response_model=TemplateResponse)
async def create_template(body: TemplateCreate, db: AsyncSession = Depends(get_db)):
    tpl = TaskTemplate(
        name=body.name.strip(),
        title=body.title.strip(),
        description=body.description,
        priority=body.priority,
        project_id=body.project_id,
        recurrence=body.recurrence,
    )
    db.add(tpl)
    await db.commit()
    await db.refresh(tpl)
    return tpl


@router.delete("/task-templates/{template_id}")
async def delete_template(template_id: int, db: AsyncSession = Depends(get_db)):
    tpl = await db.get(TaskTemplate, template_id)
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    await db.delete(tpl)
    await db.commit()
    return {"ok": True}
