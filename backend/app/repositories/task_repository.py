"""Task repository for data access."""
from typing import Optional, List
from sqlalchemy import select, case
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.domain.models import Task
from app.domain.enums import TaskStatus, TaskSource


class TaskRepository:
    """Repository for Task entity."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
    
    async def create(self, task: Task) -> Task:
        """Create new task."""
        self.session.add(task)
        await self.session.flush()
        await self.session.refresh(task)
        return task
    
    async def get_by_id(self, task_id: int) -> Optional[Task]:
        """Get task by ID with blockers and subtasks."""
        result = await self.session.execute(
            select(Task)
            .options(
                selectinload(Task.blockers),
                selectinload(Task.assignee),
                selectinload(Task.subtasks).selectinload(Task.assignee),
            )
            .where(Task.id == task_id)
        )
        return result.scalar_one_or_none()

    async def get_all(
        self,
        status: Optional[TaskStatus] = None,
        assignee_telegram_id: Optional[int] = None
    ) -> List[Task]:
        """Get all non-archived, non-deleted tasks (top-level and subtasks)."""
        priority_order = case(
            (Task.priority == 'URGENT', 1),
            (Task.priority == 'HIGH', 2),
            (Task.priority == 'NORMAL', 3),
            (Task.priority == 'LOW', 4),
            else_=5,
        )
        query = (
            select(Task)
            .options(
                selectinload(Task.blockers),
                selectinload(Task.assignee),
                selectinload(Task.subtasks).selectinload(Task.assignee),
            )
            .where(Task.archived == False)  # noqa: E712
            .where(Task.deleted == False)   # noqa: E712
        )
        if status:
            query = query.where(Task.status == status.value)
        if assignee_telegram_id:
            query = query.where(Task.assignee_telegram_id == assignee_telegram_id)

        result = await self.session.execute(
            query.order_by(priority_order, Task.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_archived(self) -> List[Task]:
        """Get archived tasks (not deleted)."""
        result = await self.session.execute(
            select(Task)
            .options(
                selectinload(Task.blockers),
                selectinload(Task.assignee),
                selectinload(Task.subtasks).selectinload(Task.assignee),
            )
            .where(Task.archived == True)  # noqa: E712
            .where(Task.deleted == False)  # noqa: E712
            .order_by(Task.updated_at.desc())
        )
        return list(result.scalars().all())

    async def get_deleted(self) -> List[Task]:
        """Get soft-deleted tasks."""
        result = await self.session.execute(
            select(Task)
            .options(
                selectinload(Task.blockers),
                selectinload(Task.assignee),
                selectinload(Task.subtasks).selectinload(Task.assignee),
            )
            .where(Task.deleted == True)  # noqa: E712
            .order_by(Task.updated_at.desc())
        )
        return list(result.scalars().all())
    
    async def update(self, task: Task) -> Task:
        """Update existing task."""
        await self.session.flush()
        await self.session.refresh(task)
        return task
    
    async def delete(self, task_id: int) -> bool:
        """Delete task."""
        task = await self.get_by_id(task_id)
        if task:
            await self.session.delete(task)
            return True
        return False
    
    async def get_week_tasks(self) -> List[Task]:
        """Get tasks for current week."""
        from app.core.clock import Clock
        from datetime import timedelta

        now = Clock.now()
        week_start = now - timedelta(days=now.weekday())

        result = await self.session.execute(
            select(Task)
            .options(selectinload(Task.blockers), selectinload(Task.assignee))
            .where(Task.created_at >= week_start)
            .order_by(Task.status, Task.created_at.desc())
        )
        return list(result.scalars().all())
