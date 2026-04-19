"""Help and menu handlers."""
from aiogram import Router, F
from aiogram.filters import Command, CommandStart
from aiogram.types import Message, CallbackQuery, WebAppInfo
from aiogram.utils.keyboard import InlineKeyboardBuilder
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
from app.config import settings
from app.core.logging import get_logger
from app.core.clock import Clock
from datetime import timedelta

router = Router()
logger = get_logger(__name__)


def get_main_menu_keyboard() -> InlineKeyboardMarkup:
    builder = InlineKeyboardBuilder()
    builder.row(
        InlineKeyboardButton(text="📝 Создать задачу", callback_data="menu:task"),
        InlineKeyboardButton(text="📋 Мои задачи",     callback_data="menu:my"),
    )
    builder.row(
        InlineKeyboardButton(text="🏃 Спринт",         callback_data="menu:sprint"),
        InlineKeyboardButton(text="📅 Неделя",         callback_data="menu:week"),
    )
    builder.row(
        InlineKeyboardButton(text="📊 Дайджест",       callback_data="menu:digest"),
        InlineKeyboardButton(text="🤝 Встреча",        callback_data="menu:meeting"),
    )
    # Кнопка Mini App — показывается только если WEBAPP_URL задан и использует HTTPS
    if settings.WEBAPP_URL and settings.WEBAPP_URL.startswith("https://"):
        builder.row(
            InlineKeyboardButton(
                text="🌐 Открыть TeamFlow",
                web_app=WebAppInfo(url=settings.WEBAPP_URL),
            )
        )
    builder.row(
        InlineKeyboardButton(text="❓ Справка",        callback_data="menu:help"),
    )
    return builder.as_markup()


HELP_TEXT = (
    "🤖 *TeamFlow Bot — Справка*\n\n"

    "*📝 Задачи:*\n"
    "• /task — создать новую задачу\n"
    "• /task (ответом на сообщение) — задача из сообщения\n"
    "• /tasks — список задач с фильтрами\n"
    "• /my — мои активные задачи по приоритету\n"
    "• /week — недельная доска\n\n"

    "*🏃 Спринты:*\n"
    "• /sprint — активный спринт (кнопки ▶/✅ прямо в боте)\n"
    "• /sprint list — все спринты со статусами\n"
    "• /sprint start <id> — запустить спринт\n"
    "• /sprint end <id> — завершить спринт\n\n"

    "*🤝 Встречи:*\n"
    "• /meeting — зафиксировать встречу\n"
    "• /meetings — история встреч\n\n"

    "*📊 Аналитика:*\n"
    "• /digest — еженедельный дайджест\n\n"

    "*💡 Автоматика:*\n"
    "Напишите в чат фразу с ключевым словом:\n"
    "_«нужно починить баг»_ или _«todo: обновить доку»_\n"
    "Бот предложит создать задачу и назначить исполнителя.\n"
    "Добавьте `#НазваниеПроекта` чтобы привязать к проекту.\n\n"

    "*📱 Мобильный доступ к спринтам:*\n"
    "Команда /sprint показывает доску с кнопками — можно\n"
    "менять статусы задач прямо из Telegram на телефоне.\n\n"

    + (
        f"*🌐 Mini App:* доступен через кнопку меню\n"
        if settings.WEBAPP_URL and settings.WEBAPP_URL.startswith("https://") else ""
    )
    + f"*🔗 Web UI:* {settings.web_url}"
)


@router.message(CommandStart())
async def cmd_start(message: Message):
    # Обработка deep link для авторизации через веб
    args = message.text.split() if message.text else []
    if len(args) > 1 and (args[1].startswith("weblogin") or args[1].startswith("bind")):
        import hashlib
        import jwt
        from app.domain.models import LocalAccount, UserIdentity
        from app.core.db import AsyncSessionLocal
        from sqlalchemy import select

        user = message.from_user
        if not user:
            return

        # Определяем тип: weblogin или bind
        is_bind = args[1].startswith("bind")
        prefix = "bind" if is_bind else "weblogin"
        
        # Извлекаем токен сессии
        session_token = args[1].split("_", 1)[1] if "_" in args[1] else str(user.id)
        logger.debug("deep_link_parse", prefix=prefix, arg=args[1], session_token=session_token)

        # Ищем или создаём LocalAccount через UserIdentity
        async with AsyncSessionLocal() as db:
            # Сначала ищем через UserIdentity (привязанный Telegram)
            identity_result = await db.execute(
                select(UserIdentity).where(
                    UserIdentity.provider == "telegram",
                    UserIdentity.provider_user_id == str(user.id),
                )
            )
            identity = identity_result.scalar_one_or_none()
            
            if identity:
                account_result = await db.execute(
                    select(LocalAccount).where(LocalAccount.id == identity.local_account_id)
                )
                account = account_result.scalar_one_or_none()
            
            if not account:
                account = LocalAccount(
                    username=user.username,
                    first_name=user.first_name,
                    last_name=user.last_name,
                    display_name=user.username or user.first_name,
                    is_active=True,
                )
                db.add(account)
                await db.flush()
                
                # Создаём UserIdentity для telegram
                identity = UserIdentity(
                    local_account_id=account.id,
                    provider="telegram",
                    provider_user_id=str(user.id),
                )
                db.add(identity)
                await db.flush()
            
            await db.commit()

        # Создаём JWT токены
        from datetime import timedelta
        token_data = {"sub": str(account.id), "type": "telegram"}

        access_token = jwt.encode(
            {**token_data, "exp": Clock.now() + timedelta(days=30)},
            settings.SECRET_KEY,
            algorithm="HS256"
        )
        refresh_token = jwt.encode(
            {**token_data, "exp": Clock.now() + timedelta(days=90), "type": "refresh"},
            settings.SECRET_KEY,
            algorithm="HS256"
        )

        # Сохраняем токены в pending-login чтобы веб мог забрать
        from app.services.settings_service import SettingsService
        import json
        async with AsyncSessionLocal() as db2:
            await SettingsService.set(db2, f"pending_login_{session_token}", json.dumps({
                "account_id": account.id,
                "access_token": access_token,
                "refresh_token": refresh_token,
                "telegram_id": user.id,
            }))
            await db2.commit()

        # Разные сообщения для weblogin и bind
        if is_bind:
            await message.answer(
                f"✅ Telegram привязан к аккаунту!"
            )
        else:
            await message.answer(
                f"✅ Вход выполнен! Вернитесь в браузер."
            )
        return

    await message.answer(
        f"👋 *Привет!* Я TeamFlow — бот для управления задачами команды.\n\n"
        f"• /task — создать задачу\n"
        f"• /my — мои задачи\n"
        f"• /sprint — текущий спринт\n"
        f"• /help — полная справка",
        reply_markup=get_main_menu_keyboard(),
        parse_mode="Markdown"
    )


@router.message(Command("menu"))
async def cmd_menu(message: Message):
    await message.answer(
        "📱 *Главное меню TeamFlow*\n\nВыберите действие:",
        reply_markup=get_main_menu_keyboard(),
        parse_mode="Markdown"
    )


@router.message(Command("help"))
async def cmd_help(message: Message):
    await message.answer(
        HELP_TEXT,
        reply_markup=get_main_menu_keyboard(),
        parse_mode="Markdown"
    )


# ─── Menu callbacks ───────────────────────────────────────────────────────────

from app.telegram.handlers import task_handlers, week_handlers, meeting_handlers, digest_handlers


@router.callback_query(F.data.startswith("menu:"))
async def handle_menu_callback(callback: CallbackQuery):
    action = callback.data.split(":")[1]
    try:
        await callback.answer()
    except Exception:
        pass

    message = callback.message

    if action == "task":
        from aiogram.fsm.context import FSMContext
        from aiogram.fsm.storage.base import StorageKey
        from app.telegram.bot import dp, bot
        key = StorageKey(bot_id=bot.id, chat_id=message.chat.id, user_id=callback.from_user.id)
        state = FSMContext(storage=dp.storage, key=key)
        await task_handlers.cmd_task(message, state)

    elif action == "my":
        from app.telegram.handlers.my_handler import get_my_tasks_text
        user = callback.from_user
        display = f"@{user.username}" if user.username else user.first_name
        text = await get_my_tasks_text(user.id, user.username, display)
        await message.answer(text, parse_mode="Markdown")

    elif action == "sprint":
        from app.telegram.handlers.sprint_handlers import _cmd_sprint_current
        await _cmd_sprint_current(message)

    elif action == "tasks":
        from app.telegram.handlers.tasks_list_handler import cmd_tasks
        await cmd_tasks(message)

    elif action == "week":
        await week_handlers.cmd_week(message)

    elif action == "meeting":
        from aiogram.fsm.context import FSMContext
        from aiogram.fsm.storage.base import StorageKey
        from app.telegram.bot import dp, bot
        key = StorageKey(bot_id=bot.id, chat_id=message.chat.id, user_id=callback.from_user.id)
        state = FSMContext(storage=dp.storage, key=key)
        await meeting_handlers.cmd_meeting(message, state)

    elif action == "meetings":
        await meeting_handlers.cmd_meetings_list(message)

    elif action == "digest":
        await digest_handlers.cmd_digest(message)

    elif action == "help":
        await message.answer(HELP_TEXT, reply_markup=get_main_menu_keyboard(), parse_mode="Markdown")
