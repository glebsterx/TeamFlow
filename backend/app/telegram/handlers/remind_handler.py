"""Handler for /remind command — reminder for a specific task."""
import asyncio
from datetime import datetime, timezone, timedelta
from app.core.clock import Clock
from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message
from app.core.logging import get_logger
from app.config import settings

router = Router()
logger = get_logger(__name__)

HELP_TEXT = (
    "⏰ *Напоминание о задаче*\n\n"
    "Использование:\n"
    "`/remind <id> <время>`\n\n"
    "Примеры:\n"
    "`/remind 42 30m` — через 30 минут\n"
    "`/remind 42 2h` — через 2 часа\n"
    "`/remind 42 1d` — через 1 день\n"
    "`/remind 42 18:00` — сегодня в 18:00 (UTC+3)\n"
)


def _parse_delay(arg: str) -> int | None:
    """Парсим строку задержки → секунды. None если не распознано."""
    arg = arg.strip().lower()
    try:
        if arg.endswith("m"):
            return int(arg[:-1]) * 60
        if arg.endswith("h"):
            return int(arg[:-1]) * 3600
        if arg.endswith("d"):
            return int(arg[:-1]) * 86400
        # Формат HH:MM — сегодня в это время (UTC+3 = MSK)
        if ":" in arg:
            h, m = arg.split(":")
            now_msk = Clock.now() + timedelta(hours=3)
            target = now_msk.replace(hour=int(h), minute=int(m), second=0, microsecond=0)
            if target <= now_msk:
                target += timedelta(days=1)
            delay = int((target - now_msk).total_seconds())
            return max(delay, 60)
    except (ValueError, TypeError):
        pass
    return None


@router.message(Command("remind"))
async def cmd_remind(message: Message):
    """Установить напоминание: /remind <task_id> <время>"""
    from sqlalchemy import select
    from app.core.db import AsyncSessionFactory
    from app.domain.models import Task
    from app.telegram.bot import bot

    args = (message.text or "").split(maxsplit=2)[1:]

    if len(args) < 2:
        await message.answer(HELP_TEXT)
        return

    # Парсим task_id
    try:
        task_id = int(args[0])
    except ValueError:
        await message.answer("❌ Неверный ID задачи. Пример: `/remind 42 2h`")
        return

    # Парсим задержку
    delay_sec = _parse_delay(args[1])
    if delay_sec is None or delay_sec <= 0:
        await message.answer(
            "❌ Не распознал время. Примеры: `30m`, `2h`, `1d`, `18:00`"
        )
        return

    if delay_sec > 30 * 86400:
        await message.answer("❌ Максимальный срок напоминания — 30 дней.")
        return

    # Получаем задачу
    async with AsyncSessionFactory() as db:
        result = await db.execute(
            select(Task).where(Task.id == task_id, Task.deleted == False)
        )
        task = result.scalar_one_or_none()

    if not task:
        await message.answer(f"❌ Задача #{task_id} не найдена.")
        return

    # Форматируем время
    if delay_sec < 3600:
        human = f"{delay_sec // 60} мин"
    elif delay_sec < 86400:
        h = delay_sec // 3600
        m = (delay_sec % 3600) // 60
        human = f"{h}ч {m}м" if m else f"{h}ч"
    else:
        human = f"{delay_sec // 86400} дн"

    chat_id = message.chat.id
    task_title = task.title

    await message.answer(
        f"✅ Напомню о задаче *#{task_id}* через *{human}*\n"
        f"📋 {task_title}"
    )

    # Запускаем asyncio task с задержкой
    async def _send_reminder():
        await asyncio.sleep(delay_sec)
        try:
            await bot.send_message(
                chat_id=chat_id,
                text=(
                    f"⏰ *Напоминание!*\n\n"
                    f"📋 *#{task_id} {task_title}*\n"
                    f"[Открыть задачу]({settings.web_url}/?task={task_id})"
                ),
                parse_mode="Markdown",
            )
        except Exception as e:
            logger.warning("remind_send_failed", task_id=task_id, error=str(e))

    asyncio.create_task(_send_reminder())
    logger.info("reminder_set", task_id=task_id, delay_sec=delay_sec, chat_id=chat_id)
