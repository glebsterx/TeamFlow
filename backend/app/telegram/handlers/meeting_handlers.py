"""Meeting handlers — v2."""
from aiogram import Router, F
from aiogram.filters import Command
from aiogram.types import Message, CallbackQuery, InlineKeyboardMarkup, InlineKeyboardButton
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from datetime import datetime
from app.core.clock import Clock
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.db import AsyncSessionLocal
from app.domain.models import Meeting, MeetingParticipant, MeetingTask, Task
from app.domain.enums import TaskSource
from app.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)
router = Router()

MEETING_TYPES = {
    "standup":  "☀️ Стендап",
    "planning": "📋 Планирование",
    "retro":    "🔄 Ретро",
    "review":   "✅ Ревью",
    "1:1":      "👥 1:1",
    "other":    "💬 Другое",
}


class MeetingStates(StatesGroup):
    choosing_type = State()
    waiting_for_summary = State()
    waiting_for_action_items = State()


def _type_keyboard() -> InlineKeyboardMarkup:
    buttons = []
    row = []
    for key, label in MEETING_TYPES.items():
        row.append(InlineKeyboardButton(text=label, callback_data=f"mtype:{key}"))
        if len(row) == 2:
            buttons.append(row)
            row = []
    if row:
        buttons.append(row)
    buttons.append([InlineKeyboardButton(text="⏭ Пропустить", callback_data="mtype:skip")])
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def _action_keyboard(meeting_id: int, items: list) -> InlineKeyboardMarkup:
    buttons = []
    for i, item in enumerate(items[:8]):
        short = item[:40] + "…" if len(item) > 40 else item
        buttons.append([InlineKeyboardButton(
            text=f"+ {short}", callback_data=f"mac:{meeting_id}:{i}"
        )])
    buttons.append([
        InlineKeyboardButton(text="✅ Готово", callback_data=f"mac_done:{meeting_id}"),
    ])
    return InlineKeyboardMarkup(inline_keyboard=buttons)


@router.message(Command("meeting"))
async def cmd_meeting(message: Message, state: FSMContext):
    await message.answer(
        "🤝 *Новая встреча*\n\nВыберите тип:",
        parse_mode="Markdown",
        reply_markup=_type_keyboard()
    )
    await state.set_state(MeetingStates.choosing_type)


@router.callback_query(F.data.startswith("mtype:"))
async def choose_type(callback: CallbackQuery, state: FSMContext):
    mtype = callback.data.split(":")[1]
    if mtype != "skip":
        await state.update_data(meeting_type=mtype)
        label = MEETING_TYPES.get(mtype, mtype)
        await callback.message.edit_text(
            f"🤝 *Встреча — {label}*\n\nВведите итоги встречи:",
            parse_mode="Markdown"
        )
    else:
        await state.update_data(meeting_type=None)
        await callback.message.edit_text(
            "🤝 *Новая встреча*\n\nВведите итоги встречи:",
            parse_mode="Markdown"
        )
    await callback.answer()
    await state.set_state(MeetingStates.waiting_for_summary)


@router.message(MeetingStates.waiting_for_summary)
async def process_meeting_summary(message: Message, state: FSMContext):
    data = await state.get_data()
    summary = message.text or ""
    meeting_type = data.get("meeting_type")
    tg_id = message.from_user.id
    username = message.from_user.username
    display = f"@{username}" if username else message.from_user.first_name

    async with AsyncSessionLocal() as session:
        meeting = Meeting(
            meeting_date=Clock.now(),
            summary=summary,
            meeting_type=meeting_type,
        )
        session.add(meeting)
        await session.flush()

        # Добавляем автора как участника
        session.add(MeetingParticipant(
            meeting_id=meeting.id,
            display_name=display,
        ))
        await session.commit()
        meeting_id = meeting.id

    await state.update_data(meeting_id=meeting_id, summary=summary)

    # Парсим action items
    import re
    items = []
    for pat in [
        r"[-*]\s*\[\s*\]\s*(.+)",
        r"(?:ACTION|Задача|TODO|ЗАДАЧА)[:\s]+(.+)",
        r"(?:нужно|надо|сделать|исправить|реализовать)\s+(.+)",
    ]:
        for m in re.finditer(pat, summary, re.IGNORECASE | re.MULTILINE):
            item = m.group(1).strip()[:120]
            if item and item not in items:
                items.append(item)

    web_url = f"{settings.web_url}/?meeting={meeting_id}"
    type_label = MEETING_TYPES.get(meeting_type, "") if meeting_type else ""

    if items:
        await state.update_data(action_items=items)
        await state.set_state(MeetingStates.waiting_for_action_items)
        await message.answer(
            f"✅ *Встреча зафиксирована* {'— ' + type_label if type_label else ''}\n"
            f"[Открыть в web]({web_url})\n\n"
            f"🤖 Найдены action items — создать задачи?",
            parse_mode="Markdown",
            reply_markup=_action_keyboard(meeting_id, items)
        )
    else:
        await state.clear()
        await message.answer(
            f"✅ *Встреча зафиксирована* {'— ' + type_label if type_label else ''}\n\n"
            f"[Открыть в web]({web_url})",
            parse_mode="Markdown"
        )
    logger.info("meeting_recorded", meeting_id=meeting_id)


@router.callback_query(F.data.startswith("mac:"))
async def create_action_task(callback: CallbackQuery, state: FSMContext):
    _, meeting_id_str, idx_str = callback.data.split(":")
    meeting_id = int(meeting_id_str)
    idx = int(idx_str)
    data = await state.get_data()
    items = data.get("action_items", [])
    if idx >= len(items):
        await callback.answer("Уже создана")
        return

    title = items[idx]
    async with AsyncSessionLocal() as session:
        task = Task(
            title=title,
            source=TaskSource.MEETING.value,
            status="TODO",
        )
        session.add(task)
        await session.flush()
        session.add(MeetingTask(meeting_id=meeting_id, task_id=task.id))
        await session.commit()
        task_id = task.id

    # Убираем обработанный item
    items[idx] = f"✅ {title}"
    await state.update_data(action_items=items)

    await callback.answer(f"Задача #{task_id} создана")
    try:
        await callback.message.edit_reply_markup(
            reply_markup=_action_keyboard(meeting_id, [i for i in items if not i.startswith("✅")])
        )
    except Exception:
        pass


@router.callback_query(F.data.startswith("mac_done:"))
async def finish_action_items(callback: CallbackQuery, state: FSMContext):
    await state.clear()
    await callback.message.edit_reply_markup(reply_markup=None)
    await callback.answer("Готово!")


@router.message(Command("meetings"))
async def cmd_meetings_list(message: Message):
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Meeting)
            .options(
                selectinload(Meeting.participants),
                selectinload(Meeting.meeting_tasks),
            )
            .where(Meeting.meeting_date >= datetime(Clock.now().year, Clock.now().month, 1))
            .order_by(Meeting.meeting_date.desc())
            .limit(15)
        )
        meetings = result.scalars().all()

    if not meetings:
        await message.answer("📋 Встреч в этом месяце не было.")
        return

    lines = ["📅 *Встречи этого месяца:*\n"]
    for m in meetings:
        date_str = m.meeting_date.strftime("%d.%m %H:%M")
        type_label = {
            "standup":"☀️","planning":"📋","retro":"🔄",
            "review":"✅","1:1":"👥","other":"💬"
        }.get(m.meeting_type or "", "🤝")
        participants = ", ".join(p.display_name for p in m.participants) if m.participants else ""
        tasks_count = len(m.meeting_tasks) if m.meeting_tasks else 0
        url = f"{settings.web_url}/?meeting={m.id}"

        summary_short = m.summary[:60] + "…" if len(m.summary) > 60 else m.summary
        line = f"{type_label} [{date_str}]({url}) {summary_short}"
        if participants:
            line += f"\n  👥 {participants}"
        if tasks_count:
            line += f"  ✅ {tasks_count} задач"
        lines.append(line)

    await message.answer("\n\n".join(lines), parse_mode="Markdown", disable_web_page_preview=True)
