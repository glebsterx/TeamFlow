"""Telegram command handlers - Fixed version."""
from aiogram import Router, F
from aiogram.filters import Command
from aiogram.types import Message, CallbackQuery, InlineKeyboardMarkup, InlineKeyboardButton
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from app.core.db import AsyncSessionLocal
from app.services.task_service import TaskService
from app.domain.enums import TaskStatus, TaskSource
from app.telegram.keyboards.task_keyboards import get_task_action_keyboard
from app.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)
router = Router()


class TaskCreationStates(StatesGroup):
    """States for task creation dialog."""
    waiting_for_title = State()
    waiting_for_description = State()


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


@router.message(Command("task"))
async def cmd_task(message: Message, state: FSMContext):
    """Handle /task command - start task creation dialog."""
    await state.clear()
    
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


@router.callback_query(F.data == "skip_description")
async def handle_skip_description(callback: CallbackQuery, state: FSMContext):
    """Handle skip description button."""
    data = await state.get_data()
    title = data.get("title")
    
    if not title:
        await callback.answer("❌ Ошибка")
        return
    
    # Create task without description
    try:
        async with AsyncSessionLocal() as session:
            service = TaskService(session)
            task = await service.create_task(
                title=title,
                description=None,
                source=TaskSource.MANUAL_COMMAND
            )
            await session.commit()
        
        web_url = f"{settings.web_url}/?task={task.id}"
        await callback.message.edit_text(
            f"✅ *Задача создана!*\n\n"
            f"#{task.id} {task.title}\n"
            f"Статус: {task.status}\n\n"
            f"🔗 [Открыть в браузере]({web_url})",
            reply_markup=get_task_action_keyboard(task.id),
            parse_mode="Markdown"
        )
        await state.clear()
        logger.info("task_created", task_id=task.id, title=title)

    except Exception as e:
        await callback.message.edit_text(f"❌ Ошибка: {str(e)}")
        await state.clear()
        logger.error("task_creation_error", error=str(e))
    
    await callback.answer()


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
    
    try:
        async with AsyncSessionLocal() as session:
            service = TaskService(session)
            task = await service.create_task(
                title=title,
                description=description,
                source=TaskSource.MANUAL_COMMAND
            )
            await session.commit()
        
        web_url = f"{settings.web_url}/?task={task.id}"
        await message.answer(
            f"✅ *Задача создана!*\n\n"
            f"#{task.id} {task.title}\n"
            f"Статус: {task.status}\n\n"
            f"🔗 [Открыть в браузере]({web_url})",
            reply_markup=get_task_action_keyboard(task.id),
            parse_mode="Markdown"
        )
        
        await state.clear()
        logger.info("task_created", task_id=task.id, title=title)
        
    except Exception as e:
        await message.answer(
            f"❌ Ошибка при создании задачи: {str(e)}\n"
            f"Попробуйте ещё раз с /task"
        )
        await state.clear()
        logger.error("task_creation_error", error=str(e), title=title)


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
