"""Telegram handlers for /sprint command — interactive sprint board."""
from aiogram import Router, F
from aiogram.filters import Command
from aiogram.types import Message, CallbackQuery, InlineKeyboardMarkup, InlineKeyboardButton
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.db import AsyncSessionLocal
from app.domain.models import Sprint, SprintTask, Task
from app.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)
router = Router()

STATUS_LABEL = {
    "planned":   "🗓 Запланирован",
    "active":    "🏃 Активный",
    "completed": "✅ Завершён",
    "archived":  "🗄 Архив",
}

TASK_EMOJI = {
    "TODO":    "⬜",
    "DOING":   "🔄",
    "DONE":    "✅",
    "BLOCKED": "🚫",
    "ON_HOLD": "⏸",
}

NEXT_STATUS = {
    "TODO":    "DOING",
    "DOING":   "DONE",
    "DONE":    "TODO",
    "BLOCKED": "TODO",
    "ON_HOLD": "TODO",
}
NEXT_STATUS_LABEL = {
    "TODO":    "▶ Взять",
    "DOING":   "✅ Готово",
    "DONE":    "↩ Вернуть",
    "BLOCKED": "↩ Разблок.",
    "ON_HOLD": "▶ Возобновить",
}


def _format_date(dt) -> str:
    return dt.strftime("%d.%m.%Y") if dt else "—"


def _sprint_progress(sprint_tasks: list) -> tuple[int, int]:
    total = len(sprint_tasks)
    done = sum(1 for st in sprint_tasks if st.task and st.task.status == "DONE")
    return done, total


def _make_progress_bar(done: int, total: int, width: int = 10) -> str:
    if total == 0:
        return "▱" * width
    filled = round(done / total * width)
    return "▰" * filled + "▱" * (width - filled)


async def _get_active_sprint():
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
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Sprint)
            .where(Sprint.is_deleted.is_(False))
            .options(selectinload(Sprint.tasks).selectinload(SprintTask.task))
            .order_by(Sprint.position, Sprint.id)
        )
        return result.scalars().all()


def _build_sprint_board(sprint) -> tuple[str, InlineKeyboardMarkup]:
    """Build message text + inline keyboard for the active sprint board."""
    done, total = _sprint_progress(sprint.tasks)
    bar = _make_progress_bar(done, total)

    lines = [
        f"🏃 *{sprint.name}*",
        f"📅 {_format_date(sprint.start_date)} — {_format_date(sprint.end_date)}",
        f"📊 {done}/{total} {bar}",
        "",
    ]

    buttons = []
    for st in sorted(sprint.tasks, key=lambda s: s.position):
        t = st.task
        if not t:
            continue
        emoji = TASK_EMOJI.get(t.status, "▪️")
        lines.append(f"{emoji} #{t.id} {t.title}")
        buttons.append([
            InlineKeyboardButton(
                text=NEXT_STATUS_LABEL.get(t.status, "▶"),
                callback_data=f"sp_s:{t.id}:{NEXT_STATUS.get(t.status,'DOING')}:{sprint.id}"
            ),
            InlineKeyboardButton(
                text=f"↗ #{t.id}",
                url=f"{settings.web_url}/?task={t.id}"
            ),
        ])

    buttons.append([
        InlineKeyboardButton(text="🔄 Обновить", callback_data=f"sp_r:{sprint.id}"),
        InlineKeyboardButton(text="🌐 Все спринты", url=f"{settings.web_url}/?page=sprints"),
    ])

    return "\n".join(lines), InlineKeyboardMarkup(inline_keyboard=buttons)


# ─── Commands ────────────────────────────────────────────────────────────────

@router.message(Command("sprint"))
async def cmd_sprint(message: Message):
    args = (message.text or "").split(maxsplit=2)
    sub = args[1].strip().lower() if len(args) > 1 else ""
    if sub == "list":
        await _cmd_sprint_list(message)
    elif sub == "start":
        await _cmd_sprint_start(message, args[2].strip() if len(args) > 2 else "")
    elif sub == "end":
        await _cmd_sprint_end(message, args[2].strip() if len(args) > 2 else "")
    else:
        await _cmd_sprint_current(message)


async def _cmd_sprint_current(message: Message):
    try:
        sprint = await _get_active_sprint()
    except Exception as e:
        logger.error("sprint_current_error", error=str(e))
        await message.answer("❌ Ошибка при получении спринта.")
        return

    if sprint is None:
        await message.answer(
            "🏃 *Активный спринт*\n\nСейчас нет активного спринта.\n"
            "Используйте `/sprint list` для просмотра всех спринтов.",
            parse_mode="Markdown",
        )
        return

    text, kb = _build_sprint_board(sprint)
    await message.answer(text, parse_mode="Markdown", reply_markup=kb)
    logger.info("sprint_current_shown", sprint_id=sprint.id)


async def _cmd_sprint_list(message: Message):
    try:
        sprints = await _get_all_sprints()
    except Exception as e:
        logger.error("sprint_list_error", error=str(e))
        await message.answer("❌ Ошибка при получении спринтов.")
        return

    if not sprints:
        await message.answer("🗓 *Список спринтов*\n\nСпринтов пока нет.", parse_mode="Markdown")
        return

    lines = ["🗓 *Список спринтов*\n"]
    for s in sprints:
        done, total = _sprint_progress(s.tasks)
        lines.append(
            f"*#{s.id} {s.name}*\n"
            f"  {STATUS_LABEL.get(s.status, s.status)}\n"
            f"  📅 {_format_date(s.start_date)} — {_format_date(s.end_date)}\n"
            f"  📊 {done}/{total} задач выполнено"
        )
    await message.answer("\n\n".join(lines), parse_mode="Markdown")


async def _cmd_sprint_start(message: Message, sprint_id_str: str):
    if not sprint_id_str.isdigit():
        await message.answer("⚠️ Укажите ID: `/sprint start <id>`", parse_mode="Markdown")
        return
    sid = int(sprint_id_str)
    try:
        async with AsyncSessionLocal() as session:
            sprint = await session.get(Sprint, sid)
            if not sprint or sprint.is_deleted:
                await message.answer(f"❌ Спринт #{sid} не найден.")
                return
            if sprint.status == "active":
                await message.answer(f"ℹ️ Спринт *#{sid}* уже активен.", parse_mode="Markdown")
                return
            if sprint.status == "completed":
                await message.answer(f"❌ Спринт *#{sid}* уже завершён.", parse_mode="Markdown")
                return
            res = await session.execute(
                select(Sprint).where(Sprint.status == "active", Sprint.is_deleted.is_(False))
            )
            for s in res.scalars().all():
                s.status = "planned"
            sprint.status = "active"
            name = sprint.name
            await session.commit()
    except Exception as e:
        logger.error("sprint_start_error", error=str(e))
        await message.answer("❌ Ошибка при активации спринта.")
        return
    await message.answer(
        f"🚀 *Спринт запущен!*\n\n*#{sid} {name}*\n\nВперёд, команда! 💪",
        parse_mode="Markdown",
    )
    logger.info("sprint_started", sprint_id=sid)


async def _cmd_sprint_end(message: Message, sprint_id_str: str):
    if not sprint_id_str.isdigit():
        await message.answer("⚠️ Укажите ID: `/sprint end <id>`", parse_mode="Markdown")
        return
    sid = int(sprint_id_str)
    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(Sprint)
                .where(Sprint.id == sid, Sprint.is_deleted.is_(False))
                .options(selectinload(Sprint.tasks).selectinload(SprintTask.task))
            )
            sprint = result.scalar_one_or_none()
            if not sprint:
                await message.answer(f"❌ Спринт #{sid} не найден.")
                return
            if sprint.status == "completed":
                await message.answer(f"ℹ️ Спринт *#{sid}* уже завершён.", parse_mode="Markdown")
                return
            done, total = _sprint_progress(sprint.tasks)
            sprint.status = "completed"
            name = sprint.name
            await session.commit()
    except Exception as e:
        logger.error("sprint_end_error", error=str(e))
        await message.answer("❌ Ошибка при завершении спринта.")
        return
    bar = _make_progress_bar(done, total)
    await message.answer(
        f"🏁 *Спринт завершён!*\n\n*#{sid} {name}*\n"
        f"📊 Итог: {done}/{total} {bar}\n\nОтличная работа! 🎉",
        parse_mode="Markdown",
    )
    logger.info("sprint_ended", sprint_id=sid)


# ─── Callbacks ───────────────────────────────────────────────────────────────

@router.callback_query(F.data.startswith("sp_s:"))
async def handle_sprint_task_status(callback: CallbackQuery):
    """Toggle task status directly from sprint board."""
    try:
        _, task_id_str, new_status, sprint_id_str = callback.data.split(":")
        task_id = int(task_id_str)
        sprint_id = int(sprint_id_str)
    except (ValueError, TypeError):
        await callback.answer("❌ Неверный формат")
        return

    try:
        async with AsyncSessionLocal() as session:
            task = await session.get(Task, task_id)
            if not task:
                await callback.answer("❌ Задача не найдена")
                return
            old_status = task.status
            task.status = new_status
            await session.commit()

        sprint = await _get_active_sprint()
        if sprint and sprint.id == sprint_id:
            text, kb = _build_sprint_board(sprint)
            await callback.message.edit_text(text, parse_mode="Markdown", reply_markup=kb)

        await callback.answer(f"#{task_id}: {old_status} → {new_status}")
        logger.info("sprint_task_status", task_id=task_id, status=new_status)
    except Exception as e:
        logger.error("sprint_task_status_error", error=str(e))
        await callback.answer("❌ Ошибка")


@router.callback_query(F.data.startswith("sp_r:"))
async def handle_sprint_refresh(callback: CallbackQuery):
    """Refresh sprint board."""
    try:
        sprint = await _get_active_sprint()
        if not sprint:
            await callback.answer("Нет активного спринта")
            return
        text, kb = _build_sprint_board(sprint)
        await callback.message.edit_text(text, parse_mode="Markdown", reply_markup=kb)
        await callback.answer("🔄 Обновлено")
    except Exception as e:
        logger.error("sprint_refresh_error", error=str(e))
        await callback.answer("❌ Ошибка")
