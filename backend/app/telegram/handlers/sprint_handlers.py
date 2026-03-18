"""Telegram handlers for /sprint command."""
from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.db import AsyncSessionLocal
from app.domain.models import Sprint, SprintTask, Task
from app.core.logging import get_logger

logger = get_logger(__name__)
router = Router()

STATUS_EMOJI = {
    "planned":   "🗓 Запланирован",
    "active":    "🏃 Активный",
    "completed": "✅ Завершён",
    "archived":  "🗄 Архив",
}

TASK_STATUS_EMOJI = {
    "TODO":    "⬜",
    "DOING":   "🔄",
    "DONE":    "✅",
    "BLOCKED": "🚫",
    "ON_HOLD": "⏸",
}


def _format_date(dt) -> str:
    if dt is None:
        return "—"
    return dt.strftime("%d.%m.%Y")


def _sprint_progress(sprint_tasks: list) -> tuple[int, int]:
    """Return (done, total) counts."""
    total = len(sprint_tasks)
    done = sum(1 for st in sprint_tasks if st.task and st.task.status == "DONE")
    return done, total


async def _get_active_sprint():
    """Fetch the active sprint with tasks eagerly loaded."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Sprint)
            .where(Sprint.status == "active", Sprint.is_deleted.is_(False))
            .options(selectinload(Sprint.tasks).selectinload(SprintTask.task))
            .order_by(Sprint.id.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()


async def _get_all_sprints():
    """Fetch all non-deleted sprints ordered by position."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Sprint)
            .where(Sprint.is_deleted.is_(False))
            .options(selectinload(Sprint.tasks).selectinload(SprintTask.task))
            .order_by(Sprint.position, Sprint.id)
        )
        return result.scalars().all()


@router.message(Command("sprint"))
async def cmd_sprint(message: Message):
    """Handle /sprint, /sprint list, /sprint start <id>, /sprint end <id>."""
    args = (message.text or "").split(maxsplit=2)
    sub = args[1].strip().lower() if len(args) > 1 else ""

    if sub == "list":
        await _cmd_sprint_list(message)
    elif sub == "start":
        sprint_id = args[2].strip() if len(args) > 2 else ""
        await _cmd_sprint_start(message, sprint_id)
    elif sub == "end":
        sprint_id = args[2].strip() if len(args) > 2 else ""
        await _cmd_sprint_end(message, sprint_id)
    else:
        await _cmd_sprint_current(message)


async def _cmd_sprint_current(message: Message):
    """Show the currently active sprint."""
    try:
        sprint = await _get_active_sprint()
    except Exception as e:
        logger.error("sprint_current_error", error=str(e))
        await message.answer("❌ Ошибка при получении спринта. Попробуйте позже.")
        return

    if sprint is None:
        await message.answer(
            "🏃 *Активный спринт*\n\nСейчас нет активного спринта.\n"
            "Используйте `/sprint list` для просмотра всех спринтов.",
            parse_mode="Markdown",
        )
        return

    done, total = _sprint_progress(sprint.tasks)
    progress_bar = _make_progress_bar(done, total)

    lines = [
        f"🏃 *{sprint.name}*",
        f"📅 {_format_date(sprint.start_date)} — {_format_date(sprint.end_date)}",
        f"📊 Прогресс: {done}/{total} {progress_bar}",
        "",
    ]

    if sprint.tasks:
        lines.append("*Задачи:*")
        sorted_tasks = sorted(sprint.tasks, key=lambda st: st.position)
        for st in sorted_tasks:
            if st.task:
                emoji = TASK_STATUS_EMOJI.get(st.task.status, "▪️")
                lines.append(f"  {emoji} #{st.task.id} {st.task.title}")
    else:
        lines.append("_Задачи не добавлены_")

    await message.answer("\n".join(lines), parse_mode="Markdown")
    logger.info("sprint_current_shown", sprint_id=sprint.id)


async def _cmd_sprint_list(message: Message):
    """Show all sprints with statuses."""
    try:
        sprints = await _get_all_sprints()
    except Exception as e:
        logger.error("sprint_list_error", error=str(e))
        await message.answer("❌ Ошибка при получении спринтов. Попробуйте позже.")
        return

    if not sprints:
        await message.answer(
            "🗓 *Список спринтов*\n\nСпринтов пока нет.",
            parse_mode="Markdown",
        )
        return

    lines = ["🗓 *Список спринтов*\n"]
    for sprint in sprints:
        done, total = _sprint_progress(sprint.tasks)
        status_label = STATUS_EMOJI.get(sprint.status, sprint.status)
        lines.append(
            f"*#{sprint.id} {sprint.name}*\n"
            f"  {status_label}\n"
            f"  📅 {_format_date(sprint.start_date)} — {_format_date(sprint.end_date)}\n"
            f"  📊 {done}/{total} задач выполнено"
        )

    await message.answer("\n\n".join(lines), parse_mode="Markdown")
    logger.info("sprint_list_shown", count=len(sprints))


def _make_progress_bar(done: int, total: int, width: int = 10) -> str:
    if total == 0:
        return "▱" * width
    filled = round(done / total * width)
    return "▰" * filled + "▱" * (width - filled)


async def _cmd_sprint_start(message: Message, sprint_id_str: str):
    """Activate a sprint by id. Deactivates any currently active sprint first."""
    if not sprint_id_str.isdigit():
        await message.answer(
            "⚠️ Укажите ID спринта: `/sprint start <id>`",
            parse_mode="Markdown",
        )
        return

    sprint_id = int(sprint_id_str)
    try:
        async with AsyncSessionLocal() as session:
            sprint = await session.get(Sprint, sprint_id)
            if sprint is None or sprint.is_deleted:
                await message.answer(f"❌ Спринт #{sprint_id} не найден.")
                return
            if sprint.status == "active":
                await message.answer(f"ℹ️ Спринт *#{sprint_id} {sprint.name}* уже активен.", parse_mode="Markdown")
                return
            if sprint.status == "completed":
                await message.answer(f"❌ Спринт *#{sprint_id} {sprint.name}* уже завершён.", parse_mode="Markdown")
                return

            # Deactivate currently active sprint if any
            active_result = await session.execute(
                select(Sprint).where(Sprint.status == "active", Sprint.is_deleted.is_(False))
            )
            active_sprints = active_result.scalars().all()
            for active in active_sprints:
                active.status = "planned"

            sprint.status = "active"
            await session.commit()

            done, total = _sprint_progress(sprint.tasks) if sprint.tasks else (0, 0)
    except Exception as e:
        logger.error("sprint_start_error", error=str(e))
        await message.answer("❌ Ошибка при активации спринта. Попробуйте позже.")
        return

    text = (
        f"🚀 *Спринт запущен!*\n\n"
        f"*#{sprint.id} {sprint.name}*\n"
        f"📅 {_format_date(sprint.start_date)} — {_format_date(sprint.end_date)}\n"
        f"📊 Задач: {total}\n\n"
        f"Вперёд, команда! 💪"
    )
    await message.answer(text, parse_mode="Markdown")
    logger.info("sprint_started", sprint_id=sprint.id)


async def _cmd_sprint_end(message: Message, sprint_id_str: str):
    """Complete a sprint by id."""
    if not sprint_id_str.isdigit():
        await message.answer(
            "⚠️ Укажите ID спринта: `/sprint end <id>`",
            parse_mode="Markdown",
        )
        return

    sprint_id = int(sprint_id_str)
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(Sprint)
                .where(Sprint.id == sprint_id, Sprint.is_deleted.is_(False))
                .options(selectinload(Sprint.tasks).selectinload(SprintTask.task))
            )
            sprint = result.scalar_one_or_none()
            if sprint is None:
                await message.answer(f"❌ Спринт #{sprint_id} не найден.")
                return
            if sprint.status == "completed":
                await message.answer(f"ℹ️ Спринт *#{sprint_id} {sprint.name}* уже завершён.", parse_mode="Markdown")
                return

            done, total = _sprint_progress(sprint.tasks)
            sprint.status = "completed"
            await session.commit()
    except Exception as e:
        logger.error("sprint_end_error", error=str(e))
        await message.answer("❌ Ошибка при завершении спринта. Попробуйте позже.")
        return

    progress_bar = _make_progress_bar(done, total)
    text = (
        f"🏁 *Спринт завершён!*\n\n"
        f"*#{sprint.id} {sprint.name}*\n"
        f"📅 {_format_date(sprint.start_date)} — {_format_date(sprint.end_date)}\n"
        f"📊 Итог: {done}/{total} задач выполнено {progress_bar}\n\n"
        f"Отличная работа, команда! 🎉"
    )
    await message.answer(text, parse_mode="Markdown")
    logger.info("sprint_ended", sprint_id=sprint.id)
