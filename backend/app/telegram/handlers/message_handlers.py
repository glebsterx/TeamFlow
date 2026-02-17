"""Message handler — реакция на ключевые слова в любом чате."""
import re
from aiogram import Router, F
from aiogram.types import Message, CallbackQuery, InlineKeyboardMarkup, InlineKeyboardButton
from app.core.db import AsyncSessionLocal
from app.services.task_service import TaskService
from app.repositories.user_repository import UserRepository
from app.domain.enums import TaskSource
from app.telegram.keyboards.task_keyboards import get_confirmation_keyboard
from app.core.logging import get_logger

logger = get_logger(__name__)
router = Router()

# Ключевые слова (RU + EN) которые триггерят предложение создать задачу
TASK_KEYWORDS = re.compile(
    r'\b(нужно|надо|необходимо|сделать|задача|задачу|todo|need to|needs to|'
    r'please do|fix|исправить|добавить|реализовать|проверить|разобраться|'
    r'не забыть|напомни|remind)\b',
    re.IGNORECASE
)

# Минимальная длина сообщения чтобы не триггерить на "нужно" без контекста
MIN_MESSAGE_LEN = 10


def extract_task_title(text: str) -> str:
    """Вырезаем ключевое слово из начала и возвращаем суть."""
    cleaned = re.sub(
        r'^(нужно|надо|необходимо|сделать|задача|задачу|todo|need to|needs to|please|fix|'
        r'исправить|добавить|реализовать|проверить|разобраться|не забыть|напомни|remind)[:\s]+',
        '', text.strip(), flags=re.IGNORECASE
    ).strip()
    # Обрезаем до 200 символов
    return cleaned[:200] if cleaned else text[:200]


def make_assign_keyboard(task_id: int, users: list) -> InlineKeyboardMarkup:
    """Клавиатура назначения после создания задачи из сообщения."""
    buttons = [[
        InlineKeyboardButton(text="👤 Взять себе", callback_data=f"assign:{task_id}:{users[0].telegram_id if users else 0}:self"),
    ]]
    # Остальные участники
    others = [InlineKeyboardButton(
        text=f"→ {u.display_name}",
        callback_data=f"assign:{task_id}:{u.telegram_id}"
    ) for u in users[:6]]
    if others:
        buttons.append(others)
    buttons.append([InlineKeyboardButton(text="⏭ Без исполнителя", callback_data=f"assign_skip:{task_id}")])
    return InlineKeyboardMarkup(inline_keyboard=buttons)


# Хранилище pending задач (message_id → title)
# В продакшне лучше Redis, но для MVP памяти хватит
_pending: dict[str, str] = {}


@router.message(F.text & ~F.text.startswith('/'))
async def process_chat_message(message: Message):
    """Ищем ключевые слова в любом сообщении."""
    if not message.text or message.from_user.is_bot:
        return
    if len(message.text) < MIN_MESSAGE_LEN:
        return
    if not TASK_KEYWORDS.search(message.text):
        return

    title = extract_task_title(message.text)
    key = f"{message.chat.id}:{message.message_id}"
    _pending[key] = title

    await message.reply(
        f"📋 Создать задачу?\n\n*{title}*",
        reply_markup=get_confirmation_keyboard(message.message_id),
        parse_mode="Markdown"
    )
    logger.info("task_keyword_detected", chat_id=message.chat.id, title=title)


@router.callback_query(F.data.startswith("confirm_task:"))
async def handle_confirm_task(callback: CallbackQuery):
    """Подтверждение создания задачи из сообщения."""
    message_id = callback.data.split(":")[1]
    key = f"{callback.message.chat.id}:{message_id}"
    title = _pending.pop(key, None)

    if not title:
        await callback.answer("❌ Время истекло, попробуйте снова")
        return

    try:
        async with AsyncSessionLocal() as session:
            service = TaskService(session)
            user_repo = UserRepository(session)

            task = await service.create_task(
                title=title,
                source=TaskSource.AUTO_DETECTED,
                source_message_id=int(message_id),
                source_chat_id=callback.message.chat.id,
            )
            await session.commit()

            # Предлагаем назначить
            users = await user_repo.get_all()

        if users:
            # Обновляем сообщение — предлагаем назначить
            await callback.message.edit_text(
                f"✅ Задача #{task.id} создана!\n*{task.title}*\n\nНазначить исполнителя?",
                reply_markup=make_assign_keyboard(task.id, users),
                parse_mode="Markdown"
            )
        else:
            await callback.message.edit_text(
                f"✅ Задача #{task.id} создана!\n*{task.title}*\n\n"
                f"Исполнитель не назначен. Используйте /tasks → Назначить",
                parse_mode="Markdown"
            )

        await callback.answer("✅ Задача создана!")
        logger.info("task_created_from_message", task_id=task.id, title=title)

    except Exception as e:
        logger.error("confirm_task_error", error=str(e))
        await callback.answer("❌ Ошибка создания задачи")


@router.callback_query(F.data.startswith("cancel_task:"))
async def handle_cancel_task(callback: CallbackQuery):
    """Отмена создания задачи."""
    message_id = callback.data.split(":")[1]
    key = f"{callback.message.chat.id}:{message_id}"
    _pending.pop(key, None)
    await callback.message.delete()
    await callback.answer("Отменено")


@router.callback_query(F.data.startswith("assign_skip:"))
async def handle_assign_skip(callback: CallbackQuery):
    """Пропустить назначение."""
    task_id = callback.data.split(":")[1]
    await callback.message.edit_text(
        f"📋 Задача #{task_id} создана без исполнителя\n\nИспользуйте /tasks чтобы назначить позже",
        parse_mode="Markdown"
    )
    await callback.answer()
