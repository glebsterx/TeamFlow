"""Meetings routes — CRUD, task linking, action-item parsing."""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from datetime import datetime
import re
from pydantic import BaseModel, ConfigDict

from app.core.db import get_db
from app.core.clock import Clock
from app.domain.models import Meeting, MeetingProject, MeetingParticipant, MeetingTask

router = APIRouter()


class MeetingParticipantInfo(BaseModel):
    id: int
    display_name: str
    telegram_user_id: Optional[int] = None
    model_config = ConfigDict(from_attributes=True)


class MeetingTaskInfo(BaseModel):
    id: int
    task_id: int
    task_title: Optional[str] = None
    task_status: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class MeetingResponse(BaseModel):
    """Встреча v2."""

    id: int
    meeting_date: datetime
    summary: str
    created_at: datetime
    title: Optional[str] = None
    meeting_type: Optional[str] = None
    duration_min: Optional[int] = None
    agenda: Optional[str] = None
    project_ids: List[int] = []
    participants: List[MeetingParticipantInfo] = []
    tasks: List[MeetingTaskInfo] = []
    model_config = ConfigDict(from_attributes=True)


class ParticipantInput(BaseModel):
    """Участник встречи — имя + опционально telegram_user_id."""

    display_name: str
    telegram_user_id: Optional[int] = None


class MeetingCreateRequest(BaseModel):
    """Создание встречи v2."""

    summary: str
    meeting_date: Optional[datetime] = None
    title: Optional[str] = None
    meeting_type: Optional[str] = None
    duration_min: Optional[int] = None
    agenda: Optional[str] = None
    project_ids: List[int] = []
    participant_names: List[str] = []  # legacy
    participants: Optional[List[ParticipantInput]] = None  # v2 с telegram_user_id


class MeetingUpdateRequest(BaseModel):
    """Обновление встречи v2."""

    summary: Optional[str] = None
    meeting_date: Optional[datetime] = None
    title: Optional[str] = None
    meeting_type: Optional[str] = None
    duration_min: Optional[int] = None
    agenda: Optional[str] = None
    project_ids: Optional[List[int]] = None
    participant_names: Optional[List[str]] = None  # legacy: просто имена
    participants: Optional[List[ParticipantInput]] = None  # v2: имя + telegram_user_id


def _meeting_to_response(m) -> dict:
    """Convert Meeting ORM to MeetingResponse dict."""
    return {
        "id": m.id,
        "meeting_date": m.meeting_date,
        "summary": m.summary,
        "created_at": m.created_at,
        "title": m.title,
        "meeting_type": m.meeting_type,
        "duration_min": m.duration_min,
        "agenda": m.agenda,
        "project_ids": [mp.project_id for mp in (m.projects or [])],
        "participants": [
            {
                "id": p.id,
                "display_name": p.display_name,
                "telegram_user_id": p.telegram_user_id,
            }
            for p in (m.participants or [])
        ],
        "tasks": [
            {
                "id": mt.id,
                "task_id": mt.task_id,
                "task_title": mt.task.title if mt.task else None,
                "task_status": mt.task.status if mt.task else None,
            }
            for mt in (m.meeting_tasks or [])
        ],
    }


def _meeting_opts():

    return [
        selectinload(Meeting.projects),
        selectinload(Meeting.participants),
        selectinload(Meeting.meeting_tasks).selectinload(MeetingTask.task),
    ]


@router.get("/meetings", response_model=List[MeetingResponse])
async def get_meetings(
    meeting_type: Optional[str] = None,
    project_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
):
    """Получить встречи v2 с фильтрами."""

    query = (
        select(Meeting)
        .options(*_meeting_opts())
        .order_by(Meeting.meeting_date.desc())
        .limit(100)
    )
    if meeting_type:
        query = query.where(Meeting.meeting_type == meeting_type)
    result = await db.execute(query)
    meetings = result.scalars().all()
    if project_id:
        meetings = [
            m for m in meetings if any(mp.project_id == project_id for mp in m.projects)
        ]
    return [_meeting_to_response(m) for m in meetings]


@router.post("/meetings", response_model=MeetingResponse)
async def create_meeting(
    request: MeetingCreateRequest, db: AsyncSession = Depends(get_db)
):
    """Создать встречу v2."""

    meeting = Meeting(
        summary=request.summary,
        meeting_date=request.meeting_date or Clock.now(),
        title=request.title,
        meeting_type=request.meeting_type,
        duration_min=request.duration_min,
        agenda=request.agenda,
    )
    db.add(meeting)
    await db.flush()
    for pid in request.project_ids or []:
        db.add(MeetingProject(meeting_id=meeting.id, project_id=pid))
    # participants (v2) имеет приоритет над participant_names (legacy)
    if request.participants:
        for p in request.participants:
            if p.display_name.strip():
                db.add(
                    MeetingParticipant(
                        meeting_id=meeting.id,
                        display_name=p.display_name.strip(),
                        telegram_user_id=p.telegram_user_id,
                    )
                )
    else:
        for name in request.participant_names or []:
            if name.strip():
                db.add(
                    MeetingParticipant(meeting_id=meeting.id, display_name=name.strip())
                )
    await db.commit()
    result = await db.execute(
        select(Meeting).options(*_meeting_opts()).where(Meeting.id == meeting.id)
    )
    return _meeting_to_response(result.scalar_one())


@router.patch("/meetings/{meeting_id}", response_model=MeetingResponse)
async def update_meeting(
    meeting_id: int, request: MeetingUpdateRequest, db: AsyncSession = Depends(get_db)
):
    """Обновить встречу v2."""

    result = await db.execute(
        select(Meeting).options(*_meeting_opts()).where(Meeting.id == meeting_id)
    )
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if request.summary is not None:
        meeting.summary = request.summary
    if request.meeting_date is not None:
        meeting.meeting_date = request.meeting_date
    if request.title is not None:
        meeting.title = request.title
    if request.meeting_type is not None:
        meeting.meeting_type = request.meeting_type
    if request.duration_min is not None:
        meeting.duration_min = request.duration_min
    if request.agenda is not None:
        meeting.agenda = request.agenda
    if request.project_ids is not None:
        for mp in list(meeting.projects):
            await db.delete(mp)
        for pid in request.project_ids:
            db.add(MeetingProject(meeting_id=meeting_id, project_id=pid))
    # participants (v2 с telegram_user_id) имеет приоритет над participant_names (legacy)
    if request.participants is not None:
        for p in list(meeting.participants):
            await db.delete(p)
        for p in request.participants:
            if p.display_name.strip():
                db.add(
                    MeetingParticipant(
                        meeting_id=meeting_id,
                        display_name=p.display_name.strip(),
                        telegram_user_id=p.telegram_user_id,
                    )
                )
    elif request.participant_names is not None:
        for p in list(meeting.participants):
            await db.delete(p)
        for name in request.participant_names:
            if name.strip():
                db.add(
                    MeetingParticipant(meeting_id=meeting_id, display_name=name.strip())
                )
    await db.commit()
    result2 = await db.execute(
        select(Meeting).options(*_meeting_opts()).where(Meeting.id == meeting_id)
    )
    return _meeting_to_response(result2.scalar_one())


@router.post("/meetings/{meeting_id}/tasks/{task_id}")
async def add_task_to_meeting(
    meeting_id: int, task_id: int, db: AsyncSession = Depends(get_db)
):
    """Привязать задачу к встрече (action item)."""

    existing = await db.execute(
        select(MeetingTask).where(
            MeetingTask.meeting_id == meeting_id, MeetingTask.task_id == task_id
        )
    )
    if not existing.scalar_one_or_none():
        db.add(MeetingTask(meeting_id=meeting_id, task_id=task_id))
        await db.commit()
    return {"ok": True}


@router.delete("/meetings/{meeting_id}/tasks/{task_id}")
async def remove_task_from_meeting(
    meeting_id: int, task_id: int, db: AsyncSession = Depends(get_db)
):

    result = await db.execute(
        select(MeetingTask).where(
            MeetingTask.meeting_id == meeting_id, MeetingTask.task_id == task_id
        )
    )
    mt = result.scalar_one_or_none()
    if mt:
        await db.delete(mt)
        await db.commit()
    return {"ok": True}


@router.post("/meetings/{meeting_id}/parse-action-items")
async def parse_action_items(meeting_id: int, db: AsyncSession = Depends(get_db)):
    """Автопарсинг action items из summary -> предлагает создать задачи."""

    result = await db.execute(select(Meeting).where(Meeting.id == meeting_id))
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    text = (meeting.summary or "") + "\n" + (meeting.agenda or "")
    # Ищем паттерны: "- [ ] ...", "ACTION:", "Задача:", "TODO:", строки начинающиеся с глагола
    patterns = [
        r"[-*]\s*\[\s*\]\s*(.+)",
        r"(?:ACTION|Задача|TODO|ЗАДАЧА|action item)[:\s]+(.+)",
        r"(?:нужно|надо|сделать|исправить|проверить|реализовать)\s+(.+)",
    ]
    items = []
    for pat in patterns:
        for m in re.finditer(pat, text, re.IGNORECASE | re.MULTILINE):
            item = m.group(1).strip()[:200]
            if item and item not in items:
                items.append(item)
    return {"action_items": items[:10]}


@router.delete("/meetings/{meeting_id}")
async def delete_meeting(meeting_id: int, db: AsyncSession = Depends(get_db)):
    """Удалить встречу."""

    result = await db.execute(select(Meeting).where(Meeting.id == meeting_id))
    meeting = result.scalar_one_or_none()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    await db.delete(meeting)
    await db.commit()
    return {"ok": True}
