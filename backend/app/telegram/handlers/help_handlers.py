"""Help and menu handlers."""
from aiogram import Router, F
from aiogram.filters import Command, CommandStart
from aiogram.types import Message, CallbackQuery
from aiogram.utils.keyboard import InlineKeyboardBuilder
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
from app.config import settings
from app.core.logging import get_logger

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

    f"*🌐 Web UI:* {settings.web_url}"
)


@router.message(CommandStart())
async def cmd_start(message: Message):
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
        from app.telegram.handlers.my_handler import cmd_my
        # Подделываем from_user для /my
        class _FakeMsg:
            text = "/my"
            chat = message.chat
            from_user = callback.from_user
            async def answer(self, *a, **kw): return await message.answer(*a, **kw)
        await cmd_my(_FakeMsg())

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
