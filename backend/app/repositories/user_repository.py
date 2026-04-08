"""User repository — LocalAccount only."""
from typing import Optional, List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.domain.models import LocalAccount, UserIdentity


class UserRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_all_accounts(self) -> List[LocalAccount]:
        """Get all active LocalAccount users."""
        result = await self.session.execute(
            select(LocalAccount)
            .where(LocalAccount.is_active == True)
            .order_by(LocalAccount.first_name)
        )
        return list(result.scalars().all())

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
        )
        self.session.add(identity)
        await self.session.flush()
        return account
