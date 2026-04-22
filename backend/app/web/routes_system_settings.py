"""System settings routes — runtime-configurable settings stored in DB."""
import os
import re
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.db import get_db
from app.domain.models import AppSetting
from app.services.settings_service import SettingsService

router = APIRouter()


def _write_env_var(key: str, value: str):
    """Append or update a single env var in .env file."""
    path = "/app/.env"
    if not os.path.exists(path):
        return
    with open(path, "r") as f:
        content = f.read()
    if re.search(rf"^{key}=.*$", content, re.MULTILINE):
        content = re.sub(rf"^{key}=.*$", f"{key}={value}", content, flags=re.MULTILINE)
    else:
        content = content.rstrip("\n") + f"\n{key}={value}\n"
    with open(path, "w") as f:
        f.write(content)


class BotTokenRequest(BaseModel):
    token: str


@router.get("/bot-token")
async def get_bot_token(db: AsyncSession = Depends(get_db)):
    """Получить маскированный токен бота."""
    val = await SettingsService.get(db, "telegram_bot_token")
    if not val:
        return {"token": None}
    # Показываем только первые и последние 4 символа
    masked = val[:4] + "••" if len(val) > 8 else "••"
    return {"token": masked}


@router.put("/bot-token")
async def save_bot_token(data: BotTokenRequest, db: AsyncSession = Depends(get_db)):
    """Сохранить или удалить токен бота (пустая строка = удалить из БД, использовать .env)."""
    token = data.token.strip()
    
    if not token:
        # Delete from DB, revert to .env
        await SettingsService.delete(db, "telegram_bot_token")
        await db.commit()
        return {"status": "ok", "action": "deleted"}
    
    # Save to DB
    await SettingsService.set(db, "telegram_bot_token", token)
    
    # Save to .env
    try:
        _write_env_var("TELEGRAM_BOT_TOKEN", token)
    except Exception:
        pass
    
    # Update os.environ for current process
    os.environ["TELEGRAM_BOT_TOKEN"] = token
    
    await db.commit()
    return {"status": "ok", "action": "saved"}


class SystemSettings(BaseModel):
    deadline_notify_hours: str = "24,3"
    frontend_url: str = ""
    telegram_chat_id: Optional[str] = None
    cors_origins: str = ""
    bot_username: str = ""
    telegram_bot_token: Optional[str] = None
    default_timezone: str = "UTC"
    enabled_sections: str = "tasks,meetings,sprints,backlog,digest,archive,ideas,knowledge"


@router.get("/system", response_model=SystemSettings)
async def get_system_settings(db: AsyncSession = Depends(get_db)):
    """Получить системные настройки из БД."""
    keys = [
        "deadline_notify_hours", "webapp_url", "frontend_url",
        "telegram_chat_id", "cors_origins", "bot_username",
        "default_timezone", "enabled_sections",
    ]
    vals = await SettingsService.get_many(db, keys)
    bot_token = vals.get("telegram_bot_token")
    frontend_url = vals.get("frontend_url") or ""
    return SystemSettings(
        deadline_notify_hours=vals.get("deadline_notify_hours") or "24,3",
        frontend_url=frontend_url,
        telegram_chat_id=vals.get("telegram_chat_id"),
        enabled_sections=vals.get("enabled_sections") or "tasks,meetings,sprints,backlog,digest,archive,ideas,knowledge",
        cors_origins=vals.get("cors_origins") or "",
        bot_username=vals.get("bot_username") or "",
        telegram_bot_token=bot_token[:4] + "•" * (len(bot_token) - 8) + bot_token[-4:] if bot_token and len(bot_token) > 8 else None,
        default_timezone=vals.get("default_timezone") or "UTC",
    )


@router.put("/system")
async def save_system_settings(data: SystemSettings, db: AsyncSession = Depends(get_db)):
    """Сохранить системные настройки в БД."""
    mapping = {
        "deadline_notify_hours": data.deadline_notify_hours,
        "frontend_url": data.frontend_url,
        "telegram_chat_id": data.telegram_chat_id or "",
        "cors_origins": data.cors_origins,
        "bot_username": data.bot_username,
        "default_timezone": data.default_timezone,
        "enabled_sections": data.enabled_sections,
    }
    for key, val in mapping.items():
        await SettingsService.set(db, key, str(val) if val else "")
    await db.commit()
    return {"status": "ok"}


@router.get("/startup-check")
async def startup_check(db: AsyncSession = Depends(get_db)):
    """Проверка: готова ли система к работе.
    
    Возвращает что настроено, а что требует внимания.
    Используется Setup Wizard для определения шагов.
    """
    from app.domain.models import LocalAccount
    
    result = await db.execute(select(LocalAccount).where(LocalAccount.is_active == True).limit(1))
    has_users = result.scalar_one_or_none() is not None
    
    vals = await SettingsService.get_many(db, ["bot_username"])
    bot_configured = bool(vals.get("bot_username"))
    
    return {
        "has_users": has_users,
        "bot_configured": bot_configured,
        "ready": has_users,
    }
