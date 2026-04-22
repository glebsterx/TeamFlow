"""Account service — LocalAccount as primary identity."""
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from datetime import datetime
import bcrypt
import jwt

from app.domain.models import LocalAccount, LocalIdentity, UserIdentity
from app.config import get_secret_key
from app.core.clock import Clock


class AccountService:

    @staticmethod
    def hash_password(password: str) -> str:
        return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

    @staticmethod
    def verify_password(plain: str, hashed: str) -> bool:
        return bcrypt.checkpw(plain.encode(), hashed.encode())

    @staticmethod
    async def create_account(
        db: AsyncSession,
        *,
        first_name: str = "",
        last_name: Optional[str] = None,
        display_name: Optional[str] = None,
        username: Optional[str] = None,
        email: Optional[str] = None,
        timezone: Optional[str] = None,
    ) -> LocalAccount:
        account = LocalAccount(
            first_name=first_name, last_name=last_name,
            display_name=display_name, username=username, email=email,
            timezone=timezone,
        )
        db.add(account)
        await db.flush()
        return account

    @staticmethod
    async def get_by_id(db: AsyncSession, account_id: int) -> Optional[LocalAccount]:
        result = await db.execute(
            select(LocalAccount)
            .options(selectinload(LocalAccount.local_identity), selectinload(LocalAccount.oauth_identities))
            .where(LocalAccount.id == account_id)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def get_by_telegram_id(db: AsyncSession, telegram_id: int) -> Optional[LocalAccount]:
        """Найти аккаунт через привязанный Telegram (UserIdentity)."""
        result = await db.execute(
            select(UserIdentity).where(
                UserIdentity.provider == "telegram",
                UserIdentity.provider_user_id == str(telegram_id),
            )
        )
        identity = result.scalar_one_or_none()
        if not identity:
            return None
        return await AccountService.get_by_id(db, identity.local_account_id)

    @staticmethod
    async def get_by_email(db: AsyncSession, email: str) -> Optional[LocalAccount]:
        result = await db.execute(select(LocalAccount).where(LocalAccount.email == email))
        return result.scalar_one_or_none()

    @staticmethod
    async def get_all(db: AsyncSession) -> List[LocalAccount]:
        result = await db.execute(
            select(LocalAccount).where(LocalAccount.is_active == True).order_by(LocalAccount.id)
        )
        return list(result.scalars().all())

    @staticmethod
    async def create_local_identity(
        db: AsyncSession, account: LocalAccount, login: str, password: str, email: Optional[str] = None,
    ) -> LocalIdentity:
        identity = LocalIdentity(
            local_account_id=account.id, login=login.lower().strip(),
            password_hash=AccountService.hash_password(password), email=email, is_active=True,
        )
        db.add(identity)
        await db.flush()
        return identity

    @staticmethod
    async def get_identity_by_login(db: AsyncSession, login: str) -> Optional[LocalIdentity]:
        login_lower = login.lower().strip()
        result = await db.execute(
            select(LocalIdentity).where(
                (LocalIdentity.login == login_lower) | (LocalIdentity.email == login_lower)
            )
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def link_oauth(
        db: AsyncSession, account: LocalAccount,
        provider: str, provider_user_id: str,
        email: Optional[str] = None,
        access_token: Optional[str] = None,
        refresh_token: Optional[str] = None,
    ) -> UserIdentity:
        identity = UserIdentity(
            local_account_id=account.id, provider=provider,
            provider_user_id=provider_user_id, email=email,
            access_token=access_token, refresh_token=refresh_token,
        )
        db.add(identity)
        await db.flush()
        return identity

    @staticmethod
    async def link_telegram(
        db: AsyncSession, account: LocalAccount,
        telegram_id: int, username: Optional[str] = None,
        first_name: str = "", last_name: Optional[str] = None,
    ) -> UserIdentity:
        identity = UserIdentity(
            local_account_id=account.id, provider="telegram",
            provider_user_id=str(telegram_id), username=username,
        )
        db.add(identity)
        await db.flush()
        # Больше не сохраняем telegram_id в LocalAccount
        if not account.username and username:
            account.username = username
        if not account.first_name and first_name:
            account.first_name = first_name
        return identity

    @staticmethod
    async def get_oauth_providers(db: AsyncSession, account_id: int) -> List[UserIdentity]:
        result = await db.execute(
            select(UserIdentity).where(UserIdentity.local_account_id == account_id)
        )
        return list(result.scalars().all())

    @staticmethod
    async def unlink_oauth(db: AsyncSession, account_id: int, provider: str) -> bool:
        result = await db.execute(
            select(UserIdentity).where(
                UserIdentity.local_account_id == account_id, UserIdentity.provider == provider,
            )
        )
        identity = result.scalar_one_or_none()
        if not identity:
            return False
        await db.delete(identity)
        return True

    @staticmethod
    async def find_account_by_oauth(
        db: AsyncSession, provider: str, provider_user_id: str,
    ) -> Optional[LocalAccount]:
        result = await db.execute(
            select(UserIdentity).where(
                UserIdentity.provider == provider, UserIdentity.provider_user_id == provider_user_id,
            )
        )
        identity = result.scalar_one_or_none()
        if not identity:
            return None
        return await AccountService.get_by_id(db, identity.local_account_id)

    @staticmethod
    async def find_account_by_telegram(db: AsyncSession, telegram_id: int) -> Optional[LocalAccount]:
        return await AccountService.get_by_telegram_id(db, telegram_id)

    @staticmethod
    def generate_jwt(account_id: int, provider: str = "local") -> dict:
        token_data = {"sub": str(account_id), "type": provider}
        access_token = jwt.encode(
            {**token_data, "exp": Clock.now().timestamp() + 30 * 86400},
            get_secret_key(), algorithm="HS256",
        )
        refresh_token = jwt.encode(
            {**token_data, "exp": Clock.now().timestamp() + 90 * 86400, "type": "refresh"},
            get_secret_key(), algorithm="HS256",
        )
        return {"access_token": access_token, "refresh_token": refresh_token}

    @staticmethod
    async def update_profile(
        db: AsyncSession, account: LocalAccount,
        *, first_name: Optional[str] = None, last_name: Optional[str] = None,
        display_name: Optional[str] = None, email: Optional[str] = None,
        timezone: Optional[str] = None,
    ) -> LocalAccount:
        if first_name is not None:
            account.first_name = first_name
        if last_name is not None:
            account.last_name = last_name
        if display_name is not None:
            account.display_name = display_name
        if email is not None:
            account.email = email
        if timezone is not None:
            account.timezone = timezone
        account.updated_at = Clock.now()
        await db.flush()
        return account
