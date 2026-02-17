"""TelegramUser repository."""
from typing import Optional, List
from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession
from app.domain.models import TelegramUser


class UserRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_telegram_id(self, telegram_id: int) -> Optional[TelegramUser]:
        result = await self.session.execute(
            select(TelegramUser).where(TelegramUser.telegram_id == telegram_id)
        )
        return result.scalar_one_or_none()

    async def get_all(self) -> List[TelegramUser]:
        result = await self.session.execute(
            select(TelegramUser)
            .where(TelegramUser.is_active == True)
            .order_by(TelegramUser.first_name)
        )
        return list(result.scalars().all())

    async def create_or_update(
        self,
        telegram_id: int,
        first_name: str,
        username: Optional[str] = None,
        last_name: Optional[str] = None,
    ) -> TelegramUser:
        """Upsert через INSERT OR REPLACE — атомарно, без race condition."""
        stmt = sqlite_insert(TelegramUser).values(
            telegram_id=telegram_id,
            first_name=first_name,
            username=username,
            last_name=last_name,
            is_active=True,
        )
        # ON CONFLICT — обновляем поля если запись уже есть
        stmt = stmt.on_conflict_do_update(
            index_elements=["telegram_id"],
            set_={
                "first_name": first_name,
                "username": username,
                "last_name": last_name,
            },
        )
        await self.session.execute(stmt)
        await self.session.flush()

        # Возвращаем актуальный объект
        return await self.get_by_telegram_id(telegram_id)
