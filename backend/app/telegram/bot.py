"""Telegram bot setup and runner."""
import asyncio
import re
import os
from aiogram import Bot, Dispatcher
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from app.config import settings
from app.core.logging import get_logger
from app.core.db import AsyncSessionLocal
from sqlalchemy import select
from app.domain.models import AppSetting
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
from app.telegram.handlers.sprint_handlers import router as sprint_router
from app.telegram.handlers.my_handler import router as my_router
from app.telegram.handlers.remind_handler import router as remind_router
from app.telegram.deadline_notifier import run_deadline_checker

logger = get_logger(__name__)


def _read_proxy_url_from_env_file() -> str | None:
    """Read TELEGRAM_PROXY_URL from mounted /app/.env (sync I/O, small file)."""
    env_path = "/app/.env"
    try:
        if os.path.exists(env_path):
            with open(env_path) as f:
                content = f.read()
            m = re.search(r"^TELEGRAM_PROXY_URL=(.+)$", content, re.MULTILINE)
            if m:
                url = m.group(1).strip()
                return url or None
    except Exception:
        pass
    return settings.TELEGRAM_PROXY_URL or None


async def _read_proxy_url_async() -> str | None:
    """Read proxy URL from AppSetting in DB, then .env, then pydantic settings.

    Runs DB access on the bot's event loop (no nested loop / ThreadPoolExecutor).
    """
    from sqlalchemy import select
    from app.domain.models import AppSetting
    from app.core.db import AsyncSessionLocal

    async def _from_db() -> str | None:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(AppSetting).where(AppSetting.key == "telegram_proxy_url")
            )
            setting = result.scalar_one_or_none()
            return setting.value if setting and setting.value else None

    try:
        val = await asyncio.wait_for(_from_db(), timeout=2.0)
        if val:
            return val
    except (asyncio.TimeoutError, Exception):
        pass

    return _read_proxy_url_from_env_file()


def _docker_request(method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
     """Минимальный HTTP-клиент для Docker Unix socket."""
     import socket, json
     sock_path = "/var/run/docker.sock"
     try:
         sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
         sock.settimeout(8)
         sock.connect(sock_path)
         payload = json.dumps(body).encode() if body else b""
         headers = (
             f"{method} {path} HTTP/1.1\r\n"
             f"Host: localhost\r\n"
             f"Content-Type: application/json\r\n"
             f"Content-Length: {len(payload)}\r\n"
             f"Connection: close\r\n\r\n"
         )
         sock.sendall(headers.encode() + payload)
         resp = b""
         while True:
             chunk = sock.recv(4096)
             if not chunk:
                 break
             resp += chunk
         sock.close()
         parts = resp.split(b"\r\n\r\n", 1)
         status_line = parts[0].split(b"\r\n")[0].decode()
         status = int(status_line.split()[1])
         body_raw = parts[1] if len(parts) > 1 else b"{}"
         try:
             return status, json.loads(body_raw)
         except Exception:
             return status, {}
     except Exception as e:
         logger.warning("docker_socket_error", error=str(e))
         return 0, {}


async def _get_bot_token() -> str | None:
    """Get bot token: .env -> DB fallback."""
    token = settings.TELEGRAM_BOT_TOKEN
    if token:
        return token

    # Fallback: read from DB
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(AppSetting).where(AppSetting.key == "telegram_bot_token")
        )
        setting = result.scalar_one_or_none()
        if setting and setting.value:
            return setting.value
    return None


async def _make_bot_async() -> Bot:
    """Создать Bot с прокси (только SOCKS5/HTTP)."""
    proxy_url = await _read_proxy_url_async()
    bot_token = await _get_bot_token()

    kwargs: dict = {
        "token": bot_token or "0:placeholder",
        "default": DefaultBotProperties(parse_mode=ParseMode.MARKDOWN),
    }

    if not proxy_url:
        logger.info("bot_no_proxy")
        return Bot(**kwargs)

    try:
        from aiogram.client.session.aiohttp import AiohttpSession

        if proxy_url.startswith(("socks4://", "socks5://", "http://", "https://")):
            kwargs["session"] = AiohttpSession(proxy=proxy_url)
            logger.info("proxy_applied", proxy=proxy_url)
        else:
            logger.warning("unknown_proxy_scheme", proxy=proxy_url)

    except Exception as e:
        logger.warning("proxy_init_failed", error=str(e))

    return Bot(**kwargs)


# Глобальные объекты — bot пересоздаётся в start_bot() уже с прокси
# Здесь нужен объект для импорта хендлерами (dp, storage), bot — placeholder
storage = MemoryStorage()
dp = Dispatcher(storage=storage)

# bot создаётся без прокси как placeholder для импортов на уровне модуля.
# Настоящий bot с прокси создаётся асинхронно в start_bot() и заменяет этот объект.
# Если токен не задан — placeholder с фейковым токеном (бот не запустится, но API работает)
# bot создаётся без прокси как placeholder для импортов на уровне модуля.
# Настоящий bot с прокси создаётся асинхронно в start_bot() и заменяет этот объект.
# placeholder — dummy, real token читается асинхронно в start_bot через _get_bot_token()
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from aiogram import Bot
    bot: Bot  # noqa: F821
else:
    bot = None

def setup_handlers():
    """Register all handlers in priority order."""
    dp.message.middleware(UserTrackingMiddleware())
    dp.callback_query.middleware(UserTrackingMiddleware())

    dp.include_router(help_handlers.router)
    dp.include_router(tasks_list_router)
    dp.include_router(task_handlers.router)
    dp.include_router(week_handlers.router)
    dp.include_router(meeting_handlers.router)
    dp.include_router(digest_handlers.router)
    dp.include_router(sprint_router)
    dp.include_router(my_router)
    dp.include_router(remind_router)
    dp.include_router(message_handlers.router)

    logger.info("handlers_registered")


async def start_bot():
    """Start the bot — создаём прокси-сессию здесь, в async-контексте."""
    global bot

    bot_token = await _get_bot_token()
    if not bot_token:
        logger.warning("bot_token_missing", hint="Set TELEGRAM_BOT_TOKEN or configure via UI")
        logger.info("bot_disabled_waiting_for_token")
        while True:
            await asyncio.sleep(3600)
        return

    logger.info("bot_token_loaded", source="db" if not settings.TELEGRAM_BOT_TOKEN else ".env")

    from app.telegram.deadline_notifier import record_heartbeat_sync
    setup_handlers()
    logger.info("bot_starting")
    record_heartbeat_sync()

    # Пересоздаём bot с прокси (ProxyConnector требует запущенного event loop)
    old_bot = bot
    bot = await _make_bot_async()
    try:
        await old_bot.session.close()
    except Exception:
        pass

    # Регистрируем команды меню (не критично если Telegram недоступен)
    try:
        from aiogram.types import BotCommand
        await asyncio.wait_for(bot.set_my_commands([
            BotCommand(command="task",     description="Создать новую задачу"),
            BotCommand(command="tasks",    description="Список задач с фильтрами"),
            BotCommand(command="my",       description="Мои активные задачи"),
            BotCommand(command="sprint",   description="Текущий спринт (кнопки прямо в боте)"),
            BotCommand(command="week",     description="Недельная доска"),
            BotCommand(command="meeting",  description="Зафиксировать встречу"),
            BotCommand(command="meetings", description="История встреч"),
            BotCommand(command="digest",   description="Еженедельный дайджест"),
            BotCommand(command="remind",   description="Напомнить о задаче: /remind 42 2h"),
            BotCommand(command="menu",     description="Главное меню"),
            BotCommand(command="help",     description="Справка по всем командам"),
        ]), timeout=15)
        logger.info("set_my_commands_ok")
    except Exception as e:
        logger.warning("set_my_commands_failed", error=str(e))

    # Сохраняем username бота в БД для /api/bot-info
    try:
        me = await asyncio.wait_for(bot.get_me(), timeout=10)
        from app.core.db import AsyncSessionLocal
        from app.services.settings_service import SettingsService
        from datetime import datetime
        async with AsyncSessionLocal() as db:
            await SettingsService.set(db, "bot_username", me.username)
            await db.commit()
            logger.info("bot_username_saved", username=me.username)
    except Exception as e:
        logger.warning("bot_username_save_failed", error=str(e))

    checker_task = None
    try:
        checker_task = asyncio.create_task(run_deadline_checker(bot))
        await dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types())
    finally:
        if checker_task:
            checker_task.cancel()
        await bot.session.close()


def run_bot():
    """Run bot in event loop."""
    asyncio.run(start_bot())
