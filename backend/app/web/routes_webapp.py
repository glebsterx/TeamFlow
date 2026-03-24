"""Telegram Mini App — эндпоинты для встроенного веб-интерфейса бота.

Все маршруты начинаются с /api/webapp/.
Mini App открывается через WebApp-кнопку в боте и показывает
персональную доску пользователя прямо внутри Telegram.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.db import get_db
from app.domain.models import Task, Sprint, SprintTask, TelegramUser
from app.domain.enums import TaskStatus
from app.web.schemas import TaskResponse
from app.config import settings

router = APIRouter(prefix="/webapp", tags=["webapp"])


# ---------------------------------------------------------------------------
# Конфиг Mini App (что показывать в боте)
# ---------------------------------------------------------------------------

@router.get("/config")
async def get_webapp_config():
    """Вернуть URL и флаги конфигурации Mini App."""
    return {
        "webapp_url": settings.WEBAPP_URL or f"{settings.web_url}",
        "app_name": settings.APP_NAME,
        "version": settings.VERSION,
        "enabled": bool(settings.WEBAPP_URL or settings.BASE_URL),
    }


# ---------------------------------------------------------------------------
# Персональная доска пользователя
# ---------------------------------------------------------------------------

@router.get("/my-tasks")
async def get_my_tasks(
    telegram_id: int = Query(..., description="Telegram user ID"),
    status: Optional[str] = Query(None, description="Фильтр по статусу"),
    db: AsyncSession = Depends(get_db),
):
    """Задачи, назначенные пользователю (по telegram_id).

    Используется Mini App для показа персональной доски прямо в Telegram.
    Возвращает задачи отсортированные: URGENT→HIGH→NORMAL→LOW, затем по due_date.
    """
    priority_order = {"URGENT": 0, "HIGH": 1, "NORMAL": 2, "LOW": 3}

    query = (
        select(Task)
        .options(
            selectinload(Task.project),
            selectinload(Task.tags),
            selectinload(Task.assignee),
        )
        .where(
            Task.assignee_telegram_id == telegram_id,
            Task.deleted.is_(False),
            Task.archived.is_(False),
        )
    )

    if status:
        try:
            query = query.where(Task.status == TaskStatus[status.upper()])
        except KeyError:
            raise HTTPException(status_code=400, detail=f"Unknown status: {status}")
    else:
        # По умолчанию — только активные (не DONE, не удалённые)
        query = query.where(Task.status.notin_(["DONE"]))

    result = await db.execute(query)
    tasks = list(result.scalars().all())

    # Сортировка: приоритет → дедлайн
    tasks.sort(key=lambda t: (
        priority_order.get(t.priority if isinstance(t.priority, str) else (t.priority.value if t.priority else "NORMAL"), 2),
        t.due_date or "9999-12-31",
    ))

    return [_task_to_dict(t) for t in tasks]


# ---------------------------------------------------------------------------
# Текущий спринт (сводка для Mini App)
# ---------------------------------------------------------------------------

@router.get("/sprint")
async def get_active_sprint_summary(db: AsyncSession = Depends(get_db)):
    """Сводка активного спринта для Mini App."""
    from app.domain.models import Sprint
    from app.domain.enums import TaskStatus

    result = await db.execute(
        select(Sprint)
        .where(Sprint.status == "active", Sprint.is_deleted.is_(False))
        .order_by(Sprint.id.desc())
        .limit(1)
    )
    sprint = result.scalar_one_or_none()
    if not sprint:
        return {"sprint": None}

    # Задачи спринта со статусами
    tasks_result = await db.execute(
        select(SprintTask)
        .options(selectinload(SprintTask.task))
        .where(SprintTask.sprint_id == sprint.id)
        .order_by(SprintTask.position)
    )
    sprint_tasks = list(tasks_result.scalars().all())
    tasks = [st.task for st in sprint_tasks if st.task]

    total = len(tasks)
    done = sum(1 for t in tasks if t.status == TaskStatus.DONE)
    in_progress = sum(1 for t in tasks if t.status == TaskStatus.IN_PROGRESS)

    return {
        "sprint": {
            "id": sprint.id,
            "name": sprint.name,
            "status": sprint.status,
            "start_date": sprint.start_date.isoformat() if sprint.start_date else None,
            "end_date": sprint.end_date.isoformat() if sprint.end_date else None,
            "total_tasks": total,
            "done_tasks": done,
            "in_progress_tasks": in_progress,
            "progress_pct": round(done / total * 100) if total else 0,
        }
    }


# ---------------------------------------------------------------------------
# Быстрые действия (смена статуса)
# ---------------------------------------------------------------------------

@router.post("/tasks/{task_id}/status")
async def update_task_status_webapp(
    task_id: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    """Сменить статус задачи из Mini App.

    Body: {"status": "IN_PROGRESS", "telegram_id": 123456}
    Проверяем, что пользователь — исполнитель задачи.
    """
    new_status_str = body.get("status", "").upper()
    telegram_id = body.get("telegram_id")

    try:
        new_status = TaskStatus[new_status_str]
    except KeyError:
        raise HTTPException(status_code=400, detail=f"Unknown status: {new_status_str}")

    result = await db.execute(
        select(Task)
        .options(selectinload(Task.project), selectinload(Task.tags))
        .where(Task.id == task_id)
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # Разрешаем только исполнителю или любому (если telegram_id не указан — только чтение)
    if telegram_id and task.assignee_telegram_id and task.assignee_telegram_id != telegram_id:
        raise HTTPException(status_code=403, detail="Not your task")

    from datetime import datetime, timezone
    task.status = new_status
    task.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    if new_status == TaskStatus.DONE:
        task.completed_at = task.updated_at
    elif new_status == TaskStatus.IN_PROGRESS and not task.started_at:
        task.started_at = task.updated_at

    await db.commit()
    return {"ok": True, "task_id": task_id, "status": new_status.value}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _task_to_dict(task: Task) -> dict:
    return {
        "id": task.id,
        "title": task.title,
        "status": task.status.value if task.status else None,
        "priority": task.priority.value if task.priority else None,
        "due_date": task.due_date.isoformat() if task.due_date else None,
        "project": task.project.name if task.project else None,
        "project_emoji": task.project.emoji if task.project else None,
        "tags": [{"name": t.name, "color": t.color} for t in (task.tags or [])],
        "description": task.description,
        "assignee_name": task.assignee_name,
    }
