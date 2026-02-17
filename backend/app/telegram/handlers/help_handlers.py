"""Help and menu handlers."""
from aiogram import Router, F
from aiogram.filters import Command, CommandStart
from aiogram.types import Message, CallbackQuery
from aiogram.utils.keyboard import InlineKeyboardBuilder
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
from app.config import settings

router = Router()


def get_main_menu_keyboard() -> InlineKeyboardMarkup:
    """Get main menu keyboard with all commands."""
    builder = InlineKeyboardBuilder()

    builder.row(
        InlineKeyboardButton(text="📝 Создать задачу", callback_data="menu:task"),
        InlineKeyboardButton(text="📋 Список задач", callback_data="menu:tasks"),
    )
    builder.row(
        InlineKeyboardButton(text="📅 Недельная доска", callback_data="menu:week"),
        InlineKeyboardButton(text="📊 Дайджест", callback_data="menu:digest"),
    )
    builder.row(
        InlineKeyboardButton(text="🤝 Фиксация встречи", callback_data="menu:meeting"),
        InlineKeyboardButton(text="📋 История встреч", callback_data="menu:meetings"),
    )

    return builder.as_markup()


@router.message(CommandStart())
async def cmd_start(message: Message):
    """Handle /start command."""
    await message.answer(
        f"👋 *Привет!* Я TeamFlow — бот для управления задачами команды.\n\n"
        f"Выберите действие из меню или используйте команды:\n"
        f"• /task — создать задачу\n"
        f"• /tasks — список задач\n"
        f"• /week — недельная доска\n"
        f"• /help — справка",
        reply_markup=get_main_menu_keyboard(),
        parse_mode="Markdown"
    )


@router.message(Command("menu"))
async def cmd_menu(message: Message):
    """Show main menu."""
    await message.answer(
        "📱 *Главное меню TeamFlow*\n\nВыберите действие:",
        reply_markup=get_main_menu_keyboard(),
        parse_mode="Markdown"
    )


@router.message(Command("help"))
async def cmd_help(message: Message):
    """Show help message."""
    help_text = (
        "🤖 *TeamFlow Bot — Справка*\n\n"
        "*📝 Задачи:*\n"
        "• /task — создать новую задачу\n"
        "• /tasks — список задач с фильтрами\n"
        "• /week — недельная доска\n\n"
        "*🤝 Встречи:*\n"
        "• /meeting — зафиксировать встречу\n"
        "• /meetings — история встреч\n\n"
        "*📊 Аналитика:*\n"
        "• /digest — еженедельный дайджест\n\n"
        "*💡 Автоматика:*\n"
        "Напишите в чат фразу с ключевым словом:\n"
        "_«нужно починить баг»_ или _«todo: обновить доку»_\n"
        "Бот предложит создать задачу и назначить исполнителя.\n\n"
        f"*🌐 Web UI:* {settings.web_url}"
    )
    await message.answer(
        help_text,
        reply_markup=get_main_menu_keyboard(),
        parse_mode="Markdown"
    )


# Import handlers for triggering from menu
from app.telegram.handlers import task_handlers, week_handlers, meeting_handlers, digest_handlers


@router.callback_query(F.data.startswith("menu:"))
async def handle_menu_callback(callback: CallbackQuery):
    """Handle menu button callbacks - trigger actual handlers."""
    from aiogram.fsm.context import FSMContext
    from aiogram.fsm.storage.base import StorageKey
    
    action = callback.data.split(":")[1]
    
    # Answer callback immediately
    await callback.answer()
    
    # Create message object for handlers
    message = callback.message
    
    if action == "task":
        from app.telegram.bot import dp, bot
        storage = dp.storage
        key = StorageKey(bot_id=bot.id, chat_id=message.chat.id, user_id=callback.from_user.id)
        state = FSMContext(storage=storage, key=key)
        await task_handlers.cmd_task(message, state)

    elif action == "tasks":
        from app.telegram.handlers.tasks_list_handler import cmd_tasks
        await cmd_tasks(message)

    elif action == "week":
        await week_handlers.cmd_week(message)

    elif action == "meeting":
        from app.telegram.bot import dp, bot
        storage = dp.storage
        key = StorageKey(bot_id=bot.id, chat_id=message.chat.id, user_id=callback.from_user.id)
        state = FSMContext(storage=storage, key=key)
        await meeting_handlers.cmd_meeting(message, state)

    elif action == "meetings":
        await meeting_handlers.cmd_meetings_list(message)

    elif action == "digest":
        await digest_handlers.cmd_digest(message)

    elif action == "overdue":
        await digest_handlers.cmd_overdue(message)
