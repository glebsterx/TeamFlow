"""Board service for weekly task board."""
from typing import Dict, List
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from app.domain.models import Task
from app.domain.enums import TaskStatus
from app.repositories.task_repository import TaskRepository

class BoardService:
    """Service for board operations."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self.task_repository = TaskRepository(session)
    
    async def get_week_board(self) -> Dict[str, List[Task]]:
        """Get all open tasks (не DONE) grouped by status, старые сверху."""
        # Получаем все задачи
        all_tasks = await self.task_repository.get_all()
        
        # Фильтруем незакрытые и сортируем по дате создания (старые сверху)
        open_tasks = [t for t in all_tasks if t.status != TaskStatus.DONE.value]
        open_tasks.sort(key=lambda t: t.created_at)
        
        # Group by status
        board = {
            TaskStatus.TODO.value: [],
            TaskStatus.DOING.value: [],
            TaskStatus.DONE.value: [],
            TaskStatus.BLOCKED.value: []
        }
        
        for task in open_tasks:
            if task.status in board:
                board[task.status].append(task)
        
        return board
    
    async def get_user_tasks(self, telegram_id: int) -> Dict[str, List[Task]]:
        """Get tasks for specific user grouped by status."""
        tasks = await self.task_repository.get_all(assignee_id = assignee_id)
        
        board = {
            TaskStatus.TODO.value: [],
            TaskStatus.DOING.value: [],
            TaskStatus.DONE.value: [],
            TaskStatus.BLOCKED.value: []
        }
        
        for task in tasks:
            if task.status in board:
                board[task.status].append(task)
        
        return board
    
    async def get_overdue_tasks(self) -> List[Task]:
        """Get all overdue tasks."""
        all_tasks = await self.task_repository.get_all()
        now = datetime.utcnow()
        
        overdue = []
        for task in all_tasks:
            if task.due_date and task.due_date < now and task.status != TaskStatus.DONE.value:
                overdue.append(task)
        
        return overdue
    
    def format_board_message(self, board: Dict[str, List[Task]]) -> str:
        """Format board as text message."""
        from app.core.clock import Clock
        
        status_emoji = {
            TaskStatus.TODO.value: "📝",
            TaskStatus.DOING.value: "🔄",
            TaskStatus.DONE.value: "✅",
            TaskStatus.BLOCKED.value: "🚫"
        }
        
        status_names = {
            TaskStatus.TODO.value: "К выполнению",
            TaskStatus.DOING.value: "В работе",
            TaskStatus.DONE.value: "Выполнено",
            TaskStatus.BLOCKED.value: "Заблокировано"
        }
        
        # Текущая неделя (Пн-Вс)
        now = Clock.now()
        week_start = now - timedelta(days=now.weekday())
        week_end = week_start + timedelta(days=6)
        
        message = (
            f"📅 *Недельная доска задач*\n"
            f"{week_start.strftime('%d.%m')} - {week_end.strftime('%d.%m.%Y')}\n\n"
        )
        
        for status in [TaskStatus.TODO.value, TaskStatus.DOING.value, 
                       TaskStatus.DONE.value, TaskStatus.BLOCKED.value]:
            tasks = board[status]
            if tasks:
                emoji = status_emoji[status]
                name = status_names[status]
                message += f"{emoji} *{name}* ({len(tasks)}):\n"
                
                for task in tasks:
                    # Исправляем двойной @
                    if task.assignee:
                        assignee = f" 👤 {task.assignee.display_name}"
                    elif task:
                        # Убираем @ если он уже есть
                        name = task if task.startswith('@') else f"@{task}"
                        assignee = f" 👤 {name}"
                    else:
                        assignee = ""
                    message += f"  #{task.id} {task.title}{assignee}\n"
                message += "\n"
        
        total = sum(len(tasks) for tasks in board.values())
        message += f"📊 Всего задач: {total}"
        
        return message
