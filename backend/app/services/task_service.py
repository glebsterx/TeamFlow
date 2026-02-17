"""Task service with business logic."""
from typing import Optional, List
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from app.domain.models import Task, Blocker
from app.domain.enums import TaskStatus, TaskSource
from app.domain.events import TaskCreated, TaskStatusChanged, TaskBlocked
from app.repositories.task_repository import TaskRepository
from app.core.logging import get_logger
from app.core.clock import Clock

logger = get_logger(__name__)


class TaskService:
    """Service for task operations."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self.repository = TaskRepository(session)
    
    async def create_task(
        self,
        title: str,
        description: Optional[str] = None,
        assignee_name: Optional[str] = None,
        assignee_telegram_id: Optional[int] = None,
        due_date: Optional[datetime] = None,
        definition_of_done: Optional[str] = None,
        source: TaskSource = TaskSource.MANUAL_COMMAND,
        source_message_id: Optional[int] = None,
        source_chat_id: Optional[int] = None,
    ) -> Task:
        """Create new task."""
        
        task = Task(
            title=title,
            description=description,
            assignee_name=assignee_name,
            assignee_telegram_id=assignee_telegram_id,
            status=TaskStatus.TODO.value,
            due_date=due_date,
            definition_of_done=definition_of_done,
            source=source.value,
            source_message_id=source_message_id,
            source_chat_id=source_chat_id,
        )
        
        task = await self.repository.create(task)
        
        # Log event
        logger.info("task_created", task_id=task.id, title=task.title, source=source.value)
        
        return task
    
    async def change_status(
        self,
        task_id: int,
        new_status: TaskStatus,
        changed_by: Optional[int] = None
    ) -> Task:
        """Change task status."""
        
        task = await self.repository.get_by_id(task_id)
        if not task:
            raise ValueError(f"Task {task_id} not found")
        
        old_status = TaskStatus(task.status)
        task.status = new_status.value
        
        task = await self.repository.update(task)
        
        logger.info(
            "task_status_changed",
            task_id=task_id,
            old_status=old_status.value,
            new_status=new_status.value
        )
        
        return task
    
    async def block_task(
        self,
        task_id: int,
        blocker_text: str,
        blocked_by: Optional[int] = None
    ) -> Task:
        """Block task with reason."""
        
        task = await self.repository.get_by_id(task_id)
        if not task:
            raise ValueError(f"Task {task_id} not found")
        
        # Change status to BLOCKED
        task.status = TaskStatus.BLOCKED.value
        
        # Add blocker
        blocker = Blocker(
            task_id=task_id,
            text=blocker_text,
            created_by=blocked_by,
        )
        task.blockers.append(blocker)
        
        task = await self.repository.update(task)
        
        logger.info("task_blocked", task_id=task_id, blocker_text=blocker_text)
        
        return task
    
    async def get_task(self, task_id: int) -> Optional[Task]:
        """Get task by ID."""
        return await self.repository.get_by_id(task_id)
    
    async def assign_task(self, task_id: int, user) -> "Task":
        """Назначить задачу пользователю."""
        task = await self.repository.get_by_id(task_id)
        if not task:
            raise ValueError(f"Task {task_id} not found")

        task.assignee_id = user.id
        task.assignee_telegram_id = user.telegram_id
        task.assignee_name = user.display_name

        task = await self.repository.update(task)
        logger.info("task_assigned", task_id=task_id, assignee=user.display_name)
        return task

    async def take_task(self, task_id: int, user) -> "Task":
        """Взять задачу себе и перевести в DOING."""
        task = await self.assign_task(task_id, user)
        if task.status == TaskStatus.TODO.value:
            task.status = TaskStatus.DOING.value
            task = await self.repository.update(task)
        return task

    async def get_all_tasks(
        self,
        status: Optional[TaskStatus] = None,
        assignee_telegram_id: Optional[int] = None
    ) -> List[Task]:
        """Get all tasks with filters."""
        return await self.repository.get_all(status, assignee_telegram_id)
    
    async def get_week_tasks(self) -> List[Task]:
        """Get tasks for current week."""
        return await self.repository.get_week_tasks()
    
    async def update_task(
        self,
        task_id: int,
        title: Optional[str] = None,
        description: Optional[str] = None,
        assignee_name: Optional[str] = None,
        assignee_telegram_id: Optional[int] = None,
        due_date: Optional[datetime] = None,
        definition_of_done: Optional[str] = None,
    ) -> Task:
        """Update task fields."""
        
        task = await self.repository.get_by_id(task_id)
        if not task:
            raise ValueError(f"Task {task_id} not found")
        
        if title is not None:
            task.title = title
        if description is not None:
            task.description = description
        if assignee_name is not None:
            task.assignee_name = assignee_name
        if assignee_telegram_id is not None:
            task.assignee_telegram_id = assignee_telegram_id
        if due_date is not None:
            task.due_date = due_date
        if definition_of_done is not None:
            task.definition_of_done = definition_of_done
        
        task = await self.repository.update(task)
        
        logger.info("task_updated", task_id=task_id)
        
        return task
