"""Week board handler."""
from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message
from app.core.db import AsyncSessionLocal
from app.services.board_service import BoardService

router = Router()


@router.message(Command("week"))
async def cmd_week(message: Message):
    """Handle /week command - show weekly board."""
    from app.telegram.handlers.help_handlers import get_main_menu_keyboard
    
    async with AsyncSessionLocal() as session:
        board_service = BoardService(session)
        board = await board_service.get_week_board()
        board_message = board_service.format_board_message(board)
    
    await message.answer(board_message, parse_mode="Markdown")
    await message.answer("📱 Главное меню:", reply_markup=get_main_menu_keyboard())
