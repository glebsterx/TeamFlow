"""Команда /tasks — список задач с фильтрами и назначением."""
from aiogram import Router, F
from aiogram.filters import Command
from aiogram.types import Message, CallbackQuery, InlineKeyboardMarkup, InlineKeyboardButton
from app.core.db import AsyncSessionLocal
from app.services.task_service import TaskService
from app.repositories.user_repository import UserRepository
from app.domain.enums import TaskStatus
from app.domain.models import TelegramUser
from app.core.logging import get_logger

logger = get_logger(__name__)
router = Router()

STATUS_EMOJI = {
    "TODO": "📝",
    "DOING": "🔄",
    "DONE": "✅",
    "BLOCKED": "🚫",
}


def tasks_keyboard(filter_status: str = "all", show_mine: bool = False) -> InlineKeyboardMarkup:
    """Клавиатура фильтров для списка задач."""
    def btn(text, data):
        return InlineKeyboardButton(text=text, callback_data=data)

    return InlineKeyboardMarkup(inline_keyboard=[
        [
            btn("📋 Все" if filter_status != "all" else "📋 ●Все", "tasks:all"),
            btn("🔄 В работе" if filter_status != "DOING" else "🔄 ●В работе", "tasks:DOING"),
            btn("📝 TODO" if filter_status != "TODO" else "📝 ●TODO", "tasks:TODO"),
        ],
        [
            btn("✅ Готово" if filter_status != "DONE" else "✅ ●Готово", "tasks:DONE"),
            btn("🚫 Блок" if filter_status != "BLOCKED" else "🚫 ●Блок", "tasks:BLOCKED"),
            btn("👤 Мои" if not show_mine else "👤 ●Мои", "tasks:mine"),
        ],
        [btn("🔄 Обновить", "tasks:refresh")],
    ])


def assign_keyboard(task_id: int, users: list[TelegramUser]) -> InlineKeyboardMarkup:
    """Клавиатура для назначения задачи."""
    buttons = []
    for user in users[:8]:  # Максимум 8 участников
        buttons.append([InlineKeyboardButton(
            text=f"👤 {user.display_name}",
            callback_data=f"assign:{task_id}:{user.telegram_id}"
        )])
    buttons.append([InlineKeyboardButton(text="↩️ Назад", callback_data="tasks:all")])
    return InlineKeyboardMarkup(inline_keyboard=buttons)


async def format_tasks_message(tasks, filter_status="all", show_mine=False) -> str:
    """Форматирует список задач в текст."""
    if not tasks:
        filter_label = {
            "all": "задач нет",
            "TODO": "задач в TODO нет",
            "DOING": "задач в работе нет",
            "DONE": "выполненных задач нет",
            "BLOCKED": "заблокированных задач нет",
            "mine": "задач назначенных на вас нет",
        }.get(filter_status, "задач нет")
        return f"📋 Список задач\n\n✨ {filter_label}"

    lines = ["📋 *Список задач*\n"]
    for task in tasks[:15]:  # Максимум 15 задач в сообщении
        emoji = STATUS_EMOJI.get(task.status, "•")
        assignee = ""
        if task.assignee:
            assignee = f" → {task.assignee.display_name}"
        elif task.assignee_name:
            assignee = f" → {task.assignee_name}"
        lines.append(f"{emoji} #{task.id} {task.title}{assignee}")

    if len(tasks) > 15:
        lines.append(f"\n_...и ещё {len(tasks) - 15} задач_")

    return "\n".join(lines)


@router.message(Command("tasks"))
async def cmd_tasks(message: Message):
    """Показать список задач."""
    async with AsyncSessionLocal() as session:
        service = TaskService(session)
        tasks = await service.get_all_tasks()

    text = await format_tasks_message(tasks)
    await message.answer(
        text,
        reply_markup=tasks_keyboard(),
        parse_mode="Markdown"
    )


@router.callback_query(F.data.startswith("tasks:"))
async def handle_tasks_filter(callback: CallbackQuery, tg_user_id: int = 0):
    """Обработка фильтров списка задач."""
    action = callback.data.split(":")[1]

    try:
        async with AsyncSessionLocal() as session:
            service = TaskService(session)

            if action == "mine":
                tasks = await service.get_all_tasks()
                tasks = [t for t in tasks if t.assignee_telegram_id == tg_user_id]
                text = await format_tasks_message(tasks, "mine", show_mine=True)
                kb = tasks_keyboard(show_mine=True)
            elif action in ("TODO", "DOING", "DONE", "BLOCKED"):
                status = TaskStatus(action)
                tasks = await service.get_all_tasks(status=status)
                text = await format_tasks_message(tasks, action)
                kb = tasks_keyboard(filter_status=action)
            else:  # all / refresh
                tasks = await service.get_all_tasks()
                text = await format_tasks_message(tasks)
                kb = tasks_keyboard()

        await callback.message.edit_text(text, reply_markup=kb, parse_mode="Markdown")
        await callback.answer()

    except Exception as e:
        logger.error("tasks_filter_error", error=str(e))
        try:
            await callback.answer("❌ Ошибка")
        except:
            pass


@router.callback_query(F.data.startswith("assign:"))
async def handle_assign(callback: CallbackQuery):
    """Назначить задачу пользователю."""
    parts = callback.data.split(":")
    task_id = int(parts[1])
    assignee_telegram_id = int(parts[2])

    try:
        async with AsyncSessionLocal() as session:
            service = TaskService(session)
            user_repo = UserRepository(session)

            user = await user_repo.get_by_telegram_id(assignee_telegram_id)
            if not user:
                await callback.answer("❌ Пользователь не найден")
                return

            task = await service.assign_task(task_id, user)
            await session.commit()

        await callback.answer(f"✅ Назначено на {user.display_name}")
        await callback.message.edit_text(
            f"✅ Задача #{task.id} назначена на {user.display_name}\n*{task.title}*",
            parse_mode="Markdown"
        )
        logger.info("task_assigned", task_id=task_id, assignee=user.display_name)

    except Exception as e:
        logger.error("assign_error", error=str(e))
        try:
            await callback.answer("❌ Ошибка назначения")
        except:
            pass


@router.callback_query(F.data.startswith("assign_menu:"))
async def handle_assign_menu(callback: CallbackQuery):
    """Показать меню выбора исполнителя."""
    task_id = int(callback.data.split(":")[1])

    async with AsyncSessionLocal() as session:
        user_repo = UserRepository(session)
        users = await user_repo.get_all()

    if not users:
        await callback.answer("❌ Нет пользователей. Попросите команду написать /start боту.")
        return

    await callback.message.edit_text(
        f"👤 *Назначить задачу #{task_id}*\n\nВыберите исполнителя:",
        reply_markup=assign_keyboard(task_id, users),
        parse_mode="Markdown"
    )
    await callback.answer()
