"""Middleware для автосохранения пользователей."""
from typing import Callable, Any, Awaitable
from aiogram import BaseMiddleware
from aiogram.types import TelegramObject, Message, CallbackQuery
from app.core.db import AsyncSessionLocal
from app.repositories.user_repository import UserRepository


class UserTrackingMiddleware(BaseMiddleware):
    """Создаёт/обновляет TelegramUser при каждом событии.
    
    Передаёт telegram_id в data["tg_user_id"] — не сам объект,
    чтобы избежать DetachedInstanceError после закрытия сессии.
    Handlers сами загружают пользователя если нужно.
    """

    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict], Awaitable[Any]],
        event: TelegramObject,
        data: dict,
    ) -> Any:
        from_user = None
        if isinstance(event, Message) and event.from_user:
            from_user = event.from_user
        elif isinstance(event, CallbackQuery) and event.from_user:
            from_user = event.from_user

        if from_user and not from_user.is_bot:
            try:
                async with AsyncSessionLocal() as session:
                    repo = UserRepository(session)
                    await repo.create_or_update(
                        telegram_id=from_user.id,
                        first_name=from_user.first_name,
                        username=from_user.username,
                        last_name=from_user.last_name,
                    )
                    await session.commit()
            except Exception as e:
                # Не ломаем обработку события из-за ошибки трекинга
                import logging
                logging.getLogger(__name__).warning(f"UserTracking failed: {e}")

            # Передаём только telegram_id — безопасно
            data["tg_user_id"] = from_user.id

        return await handler(event, data)
