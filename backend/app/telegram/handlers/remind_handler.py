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
    "• /remind 123 18:00 — сегодня в 18:00 (в вашем часовом поясе из аккаунта)\n\n"
    " ID задачи можно узнать командой /tasks"
)


async def _get_account_timezone(telegram_id: int) -> str:
    """Resolve the caller's timezone: their account setting, else the
    system default, else UTC."""
    from app.core.db import AsyncSessionLocal
    from app.services.account_service import AccountService
    from app.services.settings_service import SettingsService

    async with AsyncSessionLocal() as session:
        account = await AccountService.get_by_telegram_id(session, telegram_id)
        if account and account.timezone:
            return account.timezone
        default_tz = await SettingsService.get(session, "default_timezone")
        return default_tz or "UTC"


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
            # #319 — was hardcoded MSK (UTC+3) for everyone regardless of the
            # account's actual timezone setting (AccountPage already lets
            # users pick one, LocalAccount.timezone already stores it — this
            # was the one place still ignoring it, AUD-4).
            tz_name = await _get_account_timezone(message.from_user.id)
            now_local = Clock.now_tz(tz_name)
            target = now_local.replace(hour=hour, minute=minute, second=0, microsecond=0)
            if target <= now_local:
                target += timedelta(days=1)
            delay_sec = int((target - now_local).total_seconds())
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
    remind_at = Clock.now() + timedelta(seconds=delay_sec)

    from app.core.db import AsyncSessionLocal
    from app.domain.models import Reminder

    async with AsyncSessionLocal() as session:
        reminder_row = Reminder(task_id=task_id, chat_id=chat_id, remind_at=remind_at)
        session.add(reminder_row)
        await session.commit()
        await session.refresh(reminder_row)
        reminder_id = reminder_row.id

    await message.answer(
        f"✅ Напомню о задаче *#{task_id}* через *{human}*\n"
        f"📋 {task_title}",
        parse_mode="Markdown",
    )

    _schedule_reminder(reminder_id, task_id, task_title, chat_id, delay_sec)
    logger.info("reminder_set", task_id=task_id, delay_sec=delay_sec, chat_id=chat_id)


def _schedule_reminder(reminder_id: int, task_id: int, task_title: str, chat_id: int, delay_sec: float) -> None:
    """Schedule an in-process delivery task and drop the DB row once it fires.

    The DB row (persisted by the caller before this runs) is what survives a
    restart — see restore_reminders(), called at bot startup — this in-memory
    task is just the timer for the common case where the process stays up.
    """
    web_url = get_web_url_cached()
    task_link = f"[Открыть задачу]({web_url}/?task={task_id})"

    async def _send_reminder():
        if delay_sec > 0:
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
        finally:
            from app.core.db import AsyncSessionLocal
            from app.domain.models import Reminder
            async with AsyncSessionLocal() as session:
                row = await session.get(Reminder, reminder_id)
                if row:
                    await session.delete(row)
                    await session.commit()

    reminder_task = asyncio.create_task(_send_reminder())
    _pending_reminders.add(reminder_task)
    reminder_task.add_done_callback(_pending_reminders.discard)


async def restore_reminders() -> None:
    """Re-schedule reminders left in the DB from before a restart.

    Called once at bot startup. Anything whose remind_at already passed while
    the process was down fires immediately instead of being silently dropped.
    """
    from sqlalchemy import select
    from app.core.db import AsyncSessionLocal
    from app.domain.models import Reminder, Task

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Reminder, Task.title).join(Task, Task.id == Reminder.task_id)
        )
        rows = result.all()

    if not rows:
        return

    now = Clock.now()
    for reminder_row, task_title in rows:
        delay_sec = max(0, (reminder_row.remind_at - now).total_seconds())
        _schedule_reminder(reminder_row.id, reminder_row.task_id, task_title, reminder_row.chat_id, delay_sec)

    logger.info("reminders_restored", count=len(rows))