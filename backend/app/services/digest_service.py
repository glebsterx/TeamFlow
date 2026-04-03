"""Digest service."""
from datetime import datetime, timedelta
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from app.domain.models import Task, Meeting
from app.domain.enums import TaskStatus, TaskPriority
from app.repositories.task_repository import TaskRepository
from app.repositories.meeting_repository import MeetingRepository
from app.core.logging import get_logger

logger = get_logger(__name__)

PRIORITY_EMOJI = {
    TaskPriority.URGENT.value: "🔴",
    TaskPriority.HIGH.value:   "🟠",
    TaskPriority.NORMAL.value: "🟡",
    TaskPriority.LOW.value:    "⚪",
}

class DigestService:
    """Service for generating digests."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.task_repo = TaskRepository(session)
        self.meeting_repo = MeetingRepository(session)

    async def generate_weekly_digest(self) -> str:
        """Generate digest based on all active tasks (not filtered by creation date)."""
        from app.core.clock import Clock

        now = Clock.now()
        today = now.date()
        soon = today + timedelta(days=7)
        week_start = now - timedelta(days=now.weekday())
        week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)

        all_tasks = await self.task_repo.get_all()

        terminal = {TaskStatus.DONE.value, TaskStatus.ON_HOLD.value}
        active_statuses = {TaskStatus.TODO.value, TaskStatus.DOING.value, TaskStatus.BLOCKED.value}

        active_tasks = [t for t in all_tasks if t.status in active_statuses]
        done_this_week = [
            t for t in all_tasks
            if t.status == TaskStatus.DONE.value and t.completed_at
            and t.completed_at.replace(tzinfo=now.tzinfo) >= week_start
        ]
        overdue = sorted(
            [t for t in all_tasks if t.due_date and t.due_date.date() < today and t.status not in terminal],
            key=lambda t: t.due_date
        )
        due_soon = sorted(
            [t for t in all_tasks if t.due_date and today <= t.due_date.date() <= soon and t.status not in terminal],
            key=lambda t: t.due_date
        )

        # Встречи на этой неделе
        all_meetings = await self.meeting_repo.get_recent(days=7)
        week_meetings = [
            m for m in all_meetings
            if m.meeting_date and m.meeting_date.replace(tzinfo=now.tzinfo) >= week_start
        ]

        digest = self._build_digest_message(
            active_tasks, done_this_week, overdue, due_soon, week_meetings, today
        )
        logger.info("digest_generated", active=len(active_tasks), done_week=len(done_this_week))
        return digest

    def _build_digest_message(
        self,
        active_tasks: List[Task],
        done_this_week: List[Task],
        overdue: List[Task],
        due_soon: List[Task],
        meetings: List[Meeting],
        today: "date") -> str:
        """Build formatted digest message."""
        doing = [t for t in active_tasks if t.status == TaskStatus.DOING.value]
        blocked = [t for t in active_tasks if t.status == TaskStatus.BLOCKED.value]
        todo = [t for t in active_tasks if t.status == TaskStatus.TODO.value]

        message = f"📊 *Дайджест* — {today.strftime('%d.%m.%Y')}\n\n"

        # Активные задачи
        message += "*📈 Активные задачи:*\n"
        message += f"  🔄 В работе: {len(doing)}\n"
        message += f"  📝 К выполнению: {len(todo)}\n"
        message += f"  🚫 Заблокировано: {len(blocked)}\n"
        message += f"  ✅ Закрыто на этой неделе: {len(done_this_week)}\n\n"

        # Разбивка по приоритетам
        urgent = [t for t in active_tasks if t.priority == TaskPriority.URGENT.value]
        high = [t for t in active_tasks if t.priority == TaskPriority.HIGH.value]
        if urgent or high:
            message += "*🎯 Высокий приоритет:*\n"
            for t in (urgent + high)[:7]:
                emoji = PRIORITY_EMOJI.get(t.priority, "•")
                message += f"  {emoji} {t.title}\n"
            rest = len(urgent) + len(high) - 7
            if rest > 0:
                message += f"  _...и ещё {rest}_\n"
            message += "\n"

        # Просроченные
        if overdue:
            message += f"*🔥 Просроченные задачи ({len(overdue)}):*\n"
            for t in overdue[:5]:
                days = (today - t.due_date.date()).days
                message += f"  • {t.title} _{days} дн. назад_\n"
            if len(overdue) > 5:
                message += f"  _...и ещё {len(overdue) - 5}_\n"
            message += "\n"

        # Дедлайны на неделе
        if due_soon:
            message += f"*⏰ Дедлайн на неделе ({len(due_soon)}):*\n"
            for t in due_soon[:5]:
                date_str = t.due_date.strftime("%d.%m")
                message += f"  • {t.title} _{date_str}_\n"
            if len(due_soon) > 5:
                message += f"  _...и ещё {len(due_soon) - 5}_\n"
            message += "\n"

        # Заблокированные с причиной
        if blocked:
            message += "*⚠️ Блокеры:*\n"
            for task in blocked[:5]:
                message += f"  • {task.title}\n"
                if task.blockers:
                    message += f"    🚫 {task.blockers[-1].text}\n"
            message += "\n"

        # Встречи
        if meetings:
            message += "*🤝 Встречи на неделе:*\n"
            for m in sorted(meetings, key=lambda m: m.meeting_date):
                date_str = m.meeting_date.strftime("%d.%m %H:%M")
                summary = m.summary[:60] + "..." if len(m.summary) > 60 else m.summary
                message += f"  • *{date_str}:* {summary}\n"
            message += "\n"

        message += "---\n🎯 Продуктивной недели!"
        return message
    
    def _format_assignee(self, task: Task) -> str:
        """Форматируем имя исполнителя без дублирования @."""
        if task.assignee:
            return task.assignee.display_name
        elif task:
            # Убираем @ если он уже есть
            return task if task.startswith('@') else f"@{task}"
        return ""
    
    async def get_overdue_reminder(self) -> str:
        """Get reminder about overdue tasks."""
        from app.core.clock import Clock
        
        all_tasks = await self.task_repo.get_all()
        now = Clock.now()
        
        overdue = [
            t for t in all_tasks
            if t.due_date and t.due_date < now and t.status != TaskStatus.DONE.value
        ]
        
        if not overdue:
            return None
        
        message = "⏰ *Напоминание о просроченных задачах:*\n\n"
        
        for task in overdue:
            days_overdue = (now - task.due_date).days
            assignee = f" ({self._format_assignee(task)})" if task.assignee or task else ""
            message += f"  • {task.title}{assignee}\n"
            message += f"    📅 Просрочено на {days_overdue} дн.\n"
        
        return message
