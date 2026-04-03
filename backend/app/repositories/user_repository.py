"""User repository."""
from typing import Optional, List
from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession
from app.domain.models import TelegramUser, LocalAccount, UserIdentity


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

    async def get_all_accounts(self) -> List[LocalAccount]:
        """Get all active LocalAccount users."""
        result = await self.session.execute(
            select(LocalAccount)
            .where(LocalAccount.is_active == True)
            .order_by(LocalAccount.first_name)
        )
        return list(result.scalars().all())

    async def create_or_update(
        self,
        telegram_id: int,
        first_name: str,
        username: Optional[str] = None,
        last_name: Optional[str] = None,
    ) -> TelegramUser:
        stmt = sqlite_insert(TelegramUser).values(
            telegram_id=telegram_id,
            first_name=first_name,
            username=username,
            last_name=last_name,
            is_active=True,
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["telegram_id"],
            set_={"first_name": first_name, "username": username, "last_name": last_name},
        )
        await self.session.execute(stmt)
        await self.session.flush()
        return await self.get_by_telegram_id(telegram_id)

    async def get_local_account_by_telegram_id(self, telegram_id: int) -> Optional[LocalAccount]:
        """Найти LocalAccount через UserIdentity (привязанный Telegram)."""
        result = await self.session.execute(
            select(UserIdentity).where(
                UserIdentity.provider == "telegram",
                UserIdentity.provider_user_id == str(telegram_id),
            )
        )
        identity = result.scalar_one_or_none()
        if not identity:
            return None
        result = await self.session.execute(
            select(LocalAccount).where(LocalAccount.id == identity.local_account_id)
        )
        return result.scalar_one_or_none()

    async def create_local_account_from_telegram(
        self,
        telegram_id: int,
        first_name: str,
        username: Optional[str] = None,
        last_name: Optional[str] = None,
    ) -> LocalAccount:
        account = LocalAccount(
            first_name=first_name,
            username=username,
            last_name=last_name,
            display_name=username or first_name,
        )
        self.session.add(account)
        await self.session.flush()

        identity = UserIdentity(
            local_account_id=account.id,
            provider="telegram",
            provider_user_id=str(telegram_id),
            username=username,
        )
        self.session.add(identity)
        await self.session.flush()
        return account
