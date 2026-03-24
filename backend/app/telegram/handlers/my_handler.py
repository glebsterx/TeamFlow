"""Command /my — tasks assigned to the current user, grouped by status."""
from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message
from sqlalchemy import select
from app.core.db import AsyncSessionLocal
from app.domain.models import Task
from app.core.logging import get_logger

logger = get_logger(__name__)
router = Router()

STATUS_ORDER = ["DOING", "TODO", "BLOCKED", "ON_HOLD"]
STATUS_EMOJI = {
    "DOING":   "🔄 В работе",
    "TODO":    "📝 К выполнению",
    "BLOCKED": "🚫 Заблокировано",
    "ON_HOLD": "⏸ Отложено",
}
ACTIVE_STATUSES = {"DOING", "TODO", "BLOCKED", "ON_HOLD"}

PRIORITY_ORDER = ["URGENT", "HIGH", "NORMAL", "LOW"]
PRIORITY_EMOJI = {
    "URGENT": "🔴",
    "HIGH":   "🟠",
    "NORMAL": "",
    "LOW":    "",
}


async def get_my_tasks_text(tg_id: int, username: str | None, display: str) -> str:
    """Получить текст доски 'мои задачи' по telegram_id. Используется из обработчиков и меню."""
    try:
        async with AsyncSessionLocal() as session:
            stmt = (
                select(
                    Task.id,
                    Task.title,
                    Task.status,
                    Task.priority,
                    Task.assignee_telegram_id,
                    Task.assignee_name,
                )
                .where(
                    Task.deleted.is_(False),
                    Task.archived.is_(False),
                    Task.status.in_(list(ACTIVE_STATUSES)),
                )
            )
            result = await session.execute(stmt)
            rows = result.all()

        at_username = f"@{username}" if username else None
        tasks = [
            r for r in rows
            if r.assignee_telegram_id == tg_id
            or (at_username and r.assignee_name == at_username)
        ]

        if not tasks:
            return f"👤 *Мои задачи — {display}*\n\nУ вас нет активных задач 🎉"

        grouped: dict[str, list] = {s: [] for s in STATUS_ORDER}
        for t in tasks:
            if t.status in grouped:
                grouped[t.status].append(t)

        def priority_key(task) -> int:
            return PRIORITY_ORDER.index(task.priority) if task.priority in PRIORITY_ORDER else len(PRIORITY_ORDER)

        lines = [f"👤 *Мои задачи — {display}*\n"]
        total = 0
        for status in STATUS_ORDER:
            bucket = sorted(grouped[status], key=priority_key)
            if not bucket:
                continue
            lines.append(f"{STATUS_EMOJI[status]} ({len(bucket)}):")
            for t in bucket:
                p_emoji = PRIORITY_EMOJI.get(t.priority, "")
                prefix = f"{p_emoji} " if p_emoji else "  "
                lines.append(f"{prefix}• #{t.id} {t.title}")
            lines.append("")
            total += len(bucket)

        lines.append(f"Всего активных: {total}")
        return "\n".join(lines)

    except Exception as e:
        logger.error("my_tasks_error", error=str(e))
        return "❌ Ошибка при получении задач. Попробуйте позже."


@router.message(Command("my"))
async def cmd_my(message: Message):
    """Show tasks assigned to the current user."""
    tg_id = message.from_user.id
    username = message.from_user.username
    display = f"@{username}" if username else message.from_user.first_name

    text = await get_my_tasks_text(tg_id, username, display)
    await message.answer(text, parse_mode="Markdown")
    logger.info("my_tasks_sent", tg_id=tg_id)
