"""Keyboards for task actions."""
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton


def get_task_action_keyboard(task_id: int, status: str = "TODO") -> InlineKeyboardMarkup:
    """Клавиатура действий с задачей."""
    buttons = []
    if status == "TODO":
        buttons.append([
            InlineKeyboardButton(text="▶️ Взять в работу", callback_data=f"task:{task_id}:start"),
            InlineKeyboardButton(text="👤 Назначить", callback_data=f"assign_menu:{task_id}"),
        ])
    elif status == "DOING":
        buttons.append([
            InlineKeyboardButton(text="✅ Выполнено", callback_data=f"task:{task_id}:done"),
            InlineKeyboardButton(text="👤 Назначить", callback_data=f"assign_menu:{task_id}"),
        ])
        buttons.append([
            InlineKeyboardButton(text="🚫 Заблокировать", callback_data=f"task:{task_id}:block"),
        ])
    elif status == "BLOCKED":
        buttons.append([
            InlineKeyboardButton(text="▶️ Возобновить", callback_data=f"task:{task_id}:start"),
            InlineKeyboardButton(text="✅ Выполнено", callback_data=f"task:{task_id}:done"),
        ])
    elif status == "DONE":
        buttons.append([
            InlineKeyboardButton(text="🔄 Переоткрыть", callback_data=f"task:{task_id}:reopen"),
        ])
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def get_confirmation_keyboard(message_id: int) -> InlineKeyboardMarkup:
    """Клавиатура подтверждения создания задачи из сообщения."""
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="✅ Создать", callback_data=f"confirm_task:{message_id}"),
        InlineKeyboardButton(text="❌ Отмена", callback_data=f"cancel_task:{message_id}"),
    ]])
