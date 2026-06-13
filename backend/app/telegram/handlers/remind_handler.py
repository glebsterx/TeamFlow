"""Handler for /remind command — reminder for a specific task."""
import asyncio
from datetime import timedelta
from app.core.clock import Clock
from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message
from app.core.logging import get_logger
from app.config import get_web_url_cached

router = Router()
logger = get_logger(__name__)

# Keep references to scheduled reminder tasks so they are not garbage-collected.
_pending_reminders: set[asyncio.Task] = set()

HELP_TEXT = (
    "⏰ *Напоминание о задаче*\n\n"
    "Использование: /remind <id> <время>\n\n"
    "Примеры:\n"
    "• /remind 123 30m — через 30 минут\n"
    "• /remind 123 2h — через 2 часа\n"
    "• /remind 123 1d — через 1 день\n"
    "• /remind 123 18:00 — сегодня в 18:00\n\n"
    " ID задачи можно узнать командой /tasks"
)


@router.message(Command("remind"))
async def cmd_remind(message: Message):
    """Обработчик команды /remind."""
    parts = message.text.strip().split()
    if len(parts) < 3:
        await message.answer(HELP_TEXT, parse_mode="Markdown")
        return

    try:
        task_id = int(parts[1])
    except ValueError:
        await message.answer("❌ Неверный ID задачи\n" + HELP_TEXT, parse_mode="Markdown")
        return

    from app.core.db import AsyncSessionLocal
    from app.services.task_service import TaskService
    async with AsyncSessionLocal() as session:
        service = TaskService(session)
        task = await service.get_task(task_id)

    if not task:
        await message.answer(f"❌ Задача #{task_id} не найдена", parse_mode="Markdown")
        return

    time_arg = parts[2].lower()
    delay_sec = 0

    if ":" in time_arg:
        try:
            hour, minute = map(int, time_arg.split(":"))
            now_msk = Clock.now() + timedelta(hours=3)  # MSK = UTC+3
            target = now_msk.replace(hour=hour, minute=minute, second=0, microsecond=0)
            if target <= now_msk:
                target += timedelta(days=1)
            delay_sec = int((target - now_msk).total_seconds())
        except Exception:
            await message.answer("❌ Неверный формат времени\n" + HELP_TEXT, parse_mode="Markdown")
            return
    elif time_arg.endswith("m"):
        try:
            delay_sec = int(time_arg[:-1]) * 60
        except ValueError:
            await message.answer("❌ Неверный формат времени\n" + HELP_TEXT, parse_mode="Markdown")
            return
    elif time_arg.endswith("h"):
        try:
            delay_sec = int(time_arg[:-1]) * 3600
        except ValueError:
            await message.answer("❌ Неверный формат времени\n" + HELP_TEXT, parse_mode="Markdown")
            return
    elif time_arg.endswith("d"):
        try:
            delay_sec = int(time_arg[:-1]) * 86400
        except ValueError:
            await message.answer("❌ Неверный формат времени\n" + HELP_TEXT, parse_mode="Markdown")
            return
    else:
        await message.answer("❌ Неверный формат времени\n" + HELP_TEXT, parse_mode="Markdown")
        return

    if delay_sec <= 0:
        await message.answer("❌ Время должно быть в будущем\n" + HELP_TEXT, parse_mode="Markdown")
        return

    if delay_sec > 30 * 86400:
        await message.answer("❌ Максимум 30 дней\n" + HELP_TEXT, parse_mode="Markdown")
        return

    h = delay_sec // 3600
    m = (delay_sec % 3600) // 60
    if h > 0:
        human = f"{h}ч {m}м" if m else f"{h}ч"
    elif m > 0:
        human = f"{m}м"
    else:
        human = f"{delay_sec}сек"

    chat_id = message.chat.id
    task_title = task.title

    await message.answer(
        f"✅ Напомню о задаче *#{task_id}* через *{human}*\n"
        f"📋 {task_title}",
        parse_mode="Markdown",
    )

    web_url = get_web_url_cached()
    task_link = f"[Открыть задачу]({web_url}/?task={task_id})"

    async def _send_reminder():
        await asyncio.sleep(delay_sec)
        from app.telegram.bot import bot
        try:
            await bot.send_message(
                chat_id=chat_id,
                text=(
                    f"⏰ *Напоминание!*\n\n"
                    f"📋 *#{task_id} {task_title}*\n"
                    f"{task_link}"
                ),
                parse_mode="Markdown",
            )
        except Exception as e:
            logger.warning("remind_send_failed", task_id=task_id, error=str(e))

    reminder_task = asyncio.create_task(_send_reminder())
    _pending_reminders.add(reminder_task)
    reminder_task.add_done_callback(_pending_reminders.discard)
    logger.info("reminder_set", task_id=task_id, delay_sec=delay_sec, chat_id=chat_id)