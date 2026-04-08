"""Settings service — CRUD для app_settings."""
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.domain.models import AppSetting


class SettingsService:

    @staticmethod
    async def get(db: AsyncSession, key: str) -> Optional[str]:
        result = await db.execute(
            select(AppSetting.value).where(AppSetting.key == key)
        )
        row = result.scalar_one_or_none()
        return row

    @staticmethod
    async def set(db: AsyncSession, key: str, value: str) -> AppSetting:
        result = await db.execute(
            select(AppSetting).where(AppSetting.key == key)
        )
        setting = result.scalar_one_or_none()
        if setting:
            setting.value = value
        else:
            setting = AppSetting(key=key, value=value)
            db.add(setting)
        await db.flush()
        return setting

    @staticmethod
    async def get_many(db: AsyncSession, keys: list[str]) -> dict[str, Optional[str]]:
        result = await db.execute(
            select(AppSetting.key, AppSetting.value).where(AppSetting.key.in_(keys))
        )
        rows = result.all()
        return {row[0]: row[1] for row in rows}

    @staticmethod
    async def delete(db: AsyncSession, key: str) -> bool:
        result = await db.execute(
            select(AppSetting).where(AppSetting.key == key)
        )
        setting = result.scalar_one_or_none()
        if setting:
            await db.delete(setting)
            return True
        return False
