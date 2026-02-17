"""Telegram bot setup and runner."""
import asyncio
from aiogram import Bot, Dispatcher
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from app.config import settings
from app.core.logging import get_logger
from app.telegram.middleware import UserTrackingMiddleware
from app.telegram.handlers import (
    help_handlers,
    task_handlers,
    week_handlers,
    meeting_handlers,
    digest_handlers,
    message_handlers,
)
from app.telegram.handlers.tasks_list_handler import router as tasks_list_router

logger = get_logger(__name__)

bot = Bot(
    token=settings.TELEGRAM_BOT_TOKEN,
    default=DefaultBotProperties(parse_mode=ParseMode.MARKDOWN)
)
storage = MemoryStorage()
dp = Dispatcher(storage=storage)


def setup_handlers():
    """Register all handlers in priority order."""
    # Middleware — автосохранение пользователей
    dp.message.middleware(UserTrackingMiddleware())
    dp.callback_query.middleware(UserTrackingMiddleware())

    # Help and menu (highest priority)
    dp.include_router(help_handlers.router)

    # Tasks list with filters
    dp.include_router(tasks_list_router)

    # Command handlers
    dp.include_router(task_handlers.router)
    dp.include_router(week_handlers.router)
    dp.include_router(meeting_handlers.router)
    dp.include_router(digest_handlers.router)

    # Message handler (lowest priority)
    dp.include_router(message_handlers.router)

    logger.info("handlers_registered")


async def start_bot():
    """Start the bot."""
    setup_handlers()
    logger.info("bot_starting")

    # Регистрируем команды в меню Telegram
    from aiogram.types import BotCommand
    await bot.set_my_commands([
        BotCommand(command="task",     description="Создать новую задачу"),
        BotCommand(command="tasks",    description="Список задач с фильтрами"),
        BotCommand(command="week",     description="Недельная доска"),
        BotCommand(command="meeting",  description="Зафиксировать встречу"),
        BotCommand(command="meetings", description="История встреч"),
        BotCommand(command="digest",   description="Еженедельный дайджест"),
        BotCommand(command="menu",     description="Главное меню"),
        BotCommand(command="help",     description="Справка"),
    ])

    try:
        await dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types())
    finally:
        await bot.session.close()


def run_bot():
    """Run bot in event loop."""
    asyncio.run(start_bot())
