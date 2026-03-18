"""Telegram command handlers - Fixed version."""
import re
from datetime import datetime
from aiogram import Router, F
from aiogram.filters import Command
from aiogram.types import Message, CallbackQuery, InlineKeyboardMarkup, InlineKeyboardButton
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from app.core.db import AsyncSessionLocal
from app.services.task_service import TaskService
from app.repositories.user_repository import UserRepository
from app.domain.enums import TaskStatus, TaskSource
from app.telegram.keyboards.task_keyboards import get_task_action_keyboard
from app.config import settings
from app.core.logging import get_logger

# Accepts: "ДД.ММ ЧЧ:ММ" or "ДД.ММ.ГГГГ ЧЧ:ММ"
_DUE_DATE_RE = re.compile(
    r'^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?\s+(\d{1,2}):(\d{2})$'
)


def _parse_due_date(text: str) -> datetime | None:
    m = _DUE_DATE_RE.match(text.strip())
    if not m:
        return None
    day, month, year, hour, minute = (
        int(m.group(1)), int(m.group(2)),
        int(m.group(3)) if m.group(3) else datetime.now().year,
        int(m.group(4)), int(m.group(5)),
    )
    try:
        return datetime(year, month, day, hour, minute)
    except ValueError:
        return None

logger = get_logger(__name__)
router = Router()


class TaskCreationStates(StatesGroup):
    """States for task creation dialog."""
    waiting_for_title = State()
    waiting_for_description = State()
    waiting_for_due_date = State()


def get_cancel_keyboard() -> InlineKeyboardMarkup:
    """Кнопка отмены."""
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="❌ Отменить", callback_data="cancel_task_creation")
    ]])


def get_skip_keyboard() -> InlineKeyboardMarkup:
    """Кнопка пропуска."""
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="⏭️ Пропустить", callback_data="skip_description")
    ]])


def get_skip_due_date_keyboard() -> InlineKeyboardMarkup:
    """Кнопка пропуска дедлайна."""
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="⏭️ Без дедлайна", callback_data="skip_due_date")
    ]])


@router.message(Command("task"))
async def cmd_task(message: Message, state: FSMContext):
    """Handle /task command - start task creation dialog."""
    await state.clear()

    # Check if replying to another message
    if message.reply_to_message:
        # Create task directly from reply
        reply_text = message.reply_to_message.text or message.reply_to_message.caption or ""
        reply_from = message.reply_to_message.from_user
        
        if len(reply_text.strip()) < 5:
            await message.answer("❌ Сообщение слишком короткое для задачи")
            return
        
        async with AsyncSessionLocal() as db:
            service = TaskService(db)
            user_repo = UserRepository(db)
            
            # Get or create user
            user = await user_repo.get_by_telegram_id(message.from_user.id)
            if not user:
                user = await user_repo.create(
                    telegram_id=message.from_user.id,
                    username=message.from_user.username or "",
                    first_name=message.from_user.first_name or "",
                    last_name=message.from_user.last_name or ""
                )
            
            # Create task with reply context
            title = reply_text[:255]  # Truncate if too long
            description = f"Из сообщения от @{reply_from.username or reply_from.first_name}:\n\n{reply_text}" if reply_text else None
            
            task = await service.create_task(
                title=title,
                description=description[:2000] if description else None,
                source=TaskSource.CHAT_MESSAGE,
                source_message_id=message.reply_to_message.message_id,
                source_chat_id=message.chat.id
            )
            
            await message.answer(
                f"✅ Задача #{task.id} создана из сообщения:\n\n*{title}*\n\n"
                f"👤 Автор: @{reply_from.username or reply_from.first_name}\n"
                f"📅 Создана: {task.created_at.strftime('%d.%m.%Y %H:%M')}",
                parse_mode="Markdown"
            )
            logger.info("task_created_from_reply", task_id=task.id, user_id=message.from_user.id)
        return

    # Normal task creation flow
    await message.answer(
        "📝 *Создание новой задачи*\n\n"
        "Введите название задачи:",
        reply_markup=get_cancel_keyboard(),
        parse_mode="Markdown"
    )
    await state.set_state(TaskCreationStates.waiting_for_title)
    logger.info("task_creation_started", user_id=message.from_user.id)


@router.message(Command("cancel"))
async def cmd_cancel(message: Message, state: FSMContext):
    """Cancel task creation."""
    current_state = await state.get_state()
    if current_state is None:
        await message.answer("Нечего отменять 🤷")
        return
    
    await state.clear()
    await message.answer("❌ Создание задачи отменено")
    logger.info("task_creation_cancelled", user_id=message.from_user.id)


@router.callback_query(F.data == "cancel_task_creation")
async def handle_cancel_button(callback: CallbackQuery, state: FSMContext):
    """Handle cancel button."""
    await state.clear()
    await callback.message.edit_text("❌ Создание задачи отменено")
    await callback.answer()


async def _create_and_reply(target, state: FSMContext, due_date: datetime | None = None):
    """Create task from FSM state and send reply to message or callback."""
    data = await state.get_data()
    title = data.get("title")
    description = data.get("description")

    async with AsyncSessionLocal() as session:
        service = TaskService(session)
        task = await service.create_task(
            title=title,
            description=description,
            due_date=due_date,
            source=TaskSource.MANUAL_COMMAND,
        )
        await session.commit()

    await state.clear()
    due_line = f"\n📅 Дедлайн: {due_date.strftime('%d.%m.%Y %H:%M')}" if due_date else ""
    web_url = f"{settings.web_url}/?task={task.id}"
    text = (
        f"✅ *Задача создана!*\n\n"
        f"#{task.id} {task.title}{due_line}\n\n"
        f"🔗 [Открыть в браузере]({web_url})"
    )
    kb = get_task_action_keyboard(task.id)
    if hasattr(target, 'message'):
        await target.message.edit_text(text, reply_markup=kb, parse_mode="Markdown")
        await target.answer()
    else:
        await target.answer(text, reply_markup=kb, parse_mode="Markdown")
    logger.info("task_created", task_id=task.id, title=title)


@router.callback_query(F.data == "skip_description")
async def handle_skip_description(callback: CallbackQuery, state: FSMContext):
    """Handle skip description button — move to due date step."""
    data = await state.get_data()
    if not data.get("title"):
        await callback.answer("❌ Ошибка")
        return

    await state.update_data(description=None)
    await callback.message.edit_text(
        "📅 Укажите дедлайн задачи в формате *ДД.ММ ЧЧ:ММ*\n"
        "Например: `25.03 18:00`",
        reply_markup=get_skip_due_date_keyboard(),
        parse_mode="Markdown",
    )
    await state.set_state(TaskCreationStates.waiting_for_due_date)
    await callback.answer()


@router.callback_query(F.data == "skip_due_date")
async def handle_skip_due_date(callback: CallbackQuery, state: FSMContext):
    """Create task without due date."""
    try:
        await _create_and_reply(callback, state, due_date=None)
    except Exception as e:
        await callback.message.edit_text(f"❌ Ошибка: {str(e)}")
        await state.clear()
        logger.error("task_creation_error", error=str(e))


@router.message(TaskCreationStates.waiting_for_title)
async def process_task_title(message: Message, state: FSMContext):
    """Process task title input."""
    # Игнорируем команды - они должны обрабатываться как команды
    if message.text and message.text.startswith('/'):
        return
    
    title = message.text.strip() if message.text else ""
    
    if not title:
        await message.answer("❌ Название не может быть пустым. Попробуйте ещё раз:")
        return
    
    await state.update_data(title=title)
    await message.answer(
        f"✅ Название: *{title}*\n\n"
        "Теперь введите описание задачи:",
        reply_markup=get_skip_keyboard(),
        parse_mode="Markdown"
    )
    await state.set_state(TaskCreationStates.waiting_for_description)


@router.message(TaskCreationStates.waiting_for_description)
async def process_task_description(message: Message, state: FSMContext):
    """Process task description input and create task."""
    
    # Игнорируем команды - они должны обрабатываться как команды
    if message.text and message.text.startswith('/'):
        return
    
    data = await state.get_data()
    title = data.get("title")
    
    if not title:
        await message.answer(
            "❌ Ошибка: название задачи потеряно.\n"
            "Начните заново с /task"
        )
        await state.clear()
        logger.error("task_creation_failed_no_title", user_id=message.from_user.id)
        return
    
    description = message.text.strip() if message.text else None
    await state.update_data(description=description)

    await message.answer(
        "📅 Укажите дедлайн задачи в формате *ДД.ММ ЧЧ:ММ*\n"
        "Например: `25.03 18:00`",
        reply_markup=get_skip_due_date_keyboard(),
        parse_mode="Markdown",
    )
    await state.set_state(TaskCreationStates.waiting_for_due_date)


@router.message(TaskCreationStates.waiting_for_due_date)
async def process_due_date(message: Message, state: FSMContext):
    """Process due date input in format DD.MM HH:MM."""
    if message.text and message.text.startswith('/'):
        return

    due_date = _parse_due_date(message.text or "")
    if due_date is None:
        await message.answer(
            "❌ Неверный формат. Введите дедлайн как *ДД.ММ ЧЧ:ММ*\n"
            "Например: `25.03 18:00`",
            reply_markup=get_skip_due_date_keyboard(),
            parse_mode="Markdown",
        )
        return

    try:
        await _create_and_reply(message, state, due_date=due_date)
    except Exception as e:
        await message.answer(f"❌ Ошибка при создании задачи: {str(e)}\nПопробуйте ещё раз с /task")
        await state.clear()
        logger.error("task_creation_error", error=str(e))


@router.callback_query(F.data.startswith("task:"))
async def handle_task_action(callback: CallbackQuery):
    """Handle task action callbacks - with error handling."""
    
    try:
        parts = callback.data.split(":")
        if len(parts) != 3:
            try:
                await callback.answer("❌ Неверный формат команды")
            except:
                pass
            return
        
        task_id = int(parts[1])
        action = parts[2]
        
        async with AsyncSessionLocal() as session:
            service = TaskService(session)
            
            if action == "start":
                task = await service.change_status(task_id, TaskStatus.DOING)
                message_text = f"🔄 Задача #{task.id} в работе"
                answer_text = "✅ Задача взята в работу"
                
            elif action == "done":
                task = await service.change_status(task_id, TaskStatus.DONE)
                message_text = f"✅ Задача #{task.id} выполнена"
                answer_text = "✅ Задача выполнена!"
                
            elif action == "block":
                task = await service.change_status(task_id, TaskStatus.BLOCKED)
                message_text = f"🚫 Задача #{task.id} заблокирована"
                answer_text = "🚫 Задача заблокирована"
            else:
                try:
                    await callback.answer("❌ Неизвестная команда")
                except:
                    pass
                return
            
            await session.commit()
        
        try:
            await callback.answer(answer_text)
        except Exception as e:
            logger.warning("callback_answer_failed", error=str(e))
        
        try:
            await callback.message.edit_text(
                message_text + f"\n{task.title}\nСтатус: {task.status}",
                reply_markup=get_task_action_keyboard(task.id)
            )
        except Exception as e:
            logger.warning("message_edit_failed", error=str(e))
        
        logger.info("task_action_completed", task_id=task_id, action=action)
        
    except ValueError as e:
        logger.error("invalid_task_id", error=str(e), data=callback.data)
        try:
            await callback.answer("❌ Неверный ID задачи")
        except:
            pass
            
    except Exception as e:
        logger.error("callback_error", error=str(e), data=callback.data)
        try:
            await callback.answer(f"❌ Ошибка: {str(e)[:50]}")
        except:
            pass
