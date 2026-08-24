"""System settings routes — runtime-configurable settings stored in DB."""
import os
import re
import asyncio
import logging
import socket
import time
from typing import Optional
import aiohttp
from aiohttp_socks import ProxyConnector
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.db import get_db, AsyncSessionLocal
from app.core.deps import get_current_account_id
from app.core.clock import Clock
from app.config import settings
from app.domain.models import LocalAccount, AppSetting
from app.services.settings_service import SettingsService

logger = logging.getLogger(__name__)

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
async def get_bot_token(db: AsyncSession = Depends(get_db), account_id: int = Depends(get_current_account_id)):
    """Получить маскированный токен бота."""
    val = await SettingsService.get(db, "telegram_bot_token")
    if not val:
        return {"token": None}
    # Показываем только первые и последние 4 символа
    masked = val[:4] + "••" if len(val) > 8 else "••"
    return {"token": masked}


@router.put("/bot-token")
async def save_bot_token(data: BotTokenRequest, db: AsyncSession = Depends(get_db), account_id: int = Depends(get_current_account_id)):
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
async def get_system_settings(db: AsyncSession = Depends(get_db), account_id: int = Depends(get_current_account_id)):
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
async def save_system_settings(data: SystemSettings, db: AsyncSession = Depends(get_db), account_id: int = Depends(get_current_account_id)):
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
    
    result = await db.execute(select(LocalAccount).where(LocalAccount.is_active == True).limit(1))
    has_users = result.scalar_one_or_none() is not None
    
    vals = await SettingsService.get_many(db, ["bot_username"])
    bot_configured = bool(vals.get("bot_username"))
    
    return {
        "has_users": has_users,
        "bot_configured": bot_configured,
        "ready": has_users,
    }


# ============= SETTINGS: VERSION / RESTART / PROXY / AI =============


@router.get("/version")
async def get_version():
    """Получить версию приложения."""
    return {"version": settings.VERSION, "app_name": settings.APP_NAME}


@router.post("/restart/{service}")
async def restart_service(service: str):
    """Перезапустить контейнер backend или frontend через Docker socket API."""

    allowed = {"backend": "teamflow-backend", "frontend": "teamflow-frontend"}
    if service not in allowed:
        raise HTTPException(
            status_code=400, detail="service must be 'backend' or 'frontend'"
        )
    container = allowed[service]

    def _docker_post(path: str) -> int:
        """HTTP POST к Docker socket — возвращает только статус-код."""
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        sock.settimeout(8)
        try:
            sock.connect("/var/run/docker.sock")
            request = f"POST {path} HTTP/1.1\r\nHost: localhost\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
            sock.sendall(request.encode())
            # Читаем только первую строку — статус
            data = b""
            while b"\r\n" not in data:
                chunk = sock.recv(256)
                if not chunk:
                    break
                data += chunk
        finally:
            sock.close()
        first_line = data.split(b"\r\n")[0].decode(errors="replace")
        try:
            return int(first_line.split(" ")[1])
        except (IndexError, ValueError):
            return 500

    try:
        status = _docker_post(f"/containers/{container}/restart")
        # 204 = success, 404 = not found, 500 = error
        if status in (204, 200):
            return {"ok": True, "service": service, "container": container}
        elif status == 404:
            raise HTTPException(
                status_code=404, detail=f"Container {container} not found"
            )
        else:
            raise HTTPException(status_code=500, detail=f"Docker API returned {status}")
    except HTTPException:
        raise
    except FileNotFoundError:
        raise HTTPException(
            status_code=500, detail="Docker socket not found at /var/run/docker.sock"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _read_proxy_from_env_file(env_path: str = "/app/.env") -> Optional[str]:
    """Sync helper — always run via asyncio.to_thread from a route, never
    called directly from async code (blocks the event loop otherwise)."""

    if not os.path.exists(env_path):
        return None
    with open(env_path) as f:
        content = f.read()
    m = re.search(r"^TELEGRAM_PROXY_URL=(.+)$", content, re.MULTILINE)
    if not m:
        return None
    return m.group(1).strip() or None


def _write_proxy_to_env_file(proxy_url: Optional[str], env_path: str = "/app/.env") -> None:
    """Sync helper — always run via asyncio.to_thread from a route."""

    if not os.path.exists(env_path):
        return
    with open(env_path) as f:
        content = f.read()
    if re.search(r"^TELEGRAM_PROXY_URL=.*$", content, re.MULTILINE):
        if proxy_url:
            content = re.sub(
                r"^TELEGRAM_PROXY_URL=.*$",
                f"TELEGRAM_PROXY_URL={proxy_url}",
                content,
                flags=re.MULTILINE,
            )
        else:
            content = re.sub(r"^TELEGRAM_PROXY_URL=.*\n?", "", content, flags=re.MULTILINE)
    elif proxy_url:
        content = content.rstrip("\n") + f"\nTELEGRAM_PROXY_URL={proxy_url}\n"
    with open(env_path, "w") as f:
        f.write(content)


@router.get("/proxy")
async def get_proxy_settings():
    """Получить текущий URL прокси — из БД."""
    # Сначала пробуем из БД
    try:

        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(AppSetting).where(AppSetting.key == "telegram_proxy_url")
            )
            setting = result.scalar_one_or_none()
            if setting and setting.value:
                return {"proxy_url": setting.value}
    except Exception:
        pass

    # Fallback: читаем из .env (для обратной совместимости)
    try:
        proxy_url = await asyncio.to_thread(_read_proxy_from_env_file)
        if proxy_url:
            return {"proxy_url": proxy_url}
    except Exception:
        pass
    return {"proxy_url": None}


@router.post("/proxy")
async def set_proxy_settings(req: dict):
    """Сохранить прокси в БД и .env. Принимает только SOCKS5/HTTP прокси."""
    raw = (req.get("proxy_url") or "").strip()
    proxy_url = raw if raw else None

    # Читаем старый прокси из БД перед изменением
    old_proxy_url = None
    try:

        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(AppSetting).where(AppSetting.key == "telegram_proxy_url")
            )
            setting = result.scalar_one_or_none()
            if setting and setting.value:
                old_proxy_url = setting.value
    except Exception:
        pass

    # Fallback: читаем из .env
    if not old_proxy_url:
        try:
            old_proxy_url = await asyncio.to_thread(_read_proxy_from_env_file)
        except Exception:
            pass

    # Сохраняем новый прокси в БД
    try:

        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(AppSetting).where(AppSetting.key == "telegram_proxy_url")
            )
            setting = result.scalar_one_or_none()
            if setting:
                setting.value = proxy_url
                setting.updated_at = Clock.now()
            else:
                setting = AppSetting(key="telegram_proxy_url", value=proxy_url)
                session.add(setting)
            await session.commit()
    except Exception as e:
        logger.warning("proxy_save_to_db_failed", error=str(e))

    # Также сохраняем в .env (для обратной совместимости)
    try:
        await asyncio.to_thread(_write_proxy_to_env_file, proxy_url)
    except Exception as e:
        logger.warning("proxy_save_to_env_failed", error=str(e))

    return {
        "ok": True,
        "proxy_url": proxy_url,
        "normalized": proxy_url != raw if raw else False,
    }


# ============= SETTINGS: AI =============

@router.get("/ai")
async def get_ai_settings():
    """Получить текущие AI настройки."""
    try:

        keys = ["ai_api_key", "ai_provider", "ai_model", "ai_custom_endpoint"]
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(AppSetting).where(AppSetting.key.in_(keys))
            )
            settings = {s.key: s.value for s in result.scalars().all()}
        return {
            "ai_api_key": settings.get("ai_api_key", ""),
            "ai_provider": settings.get("ai_provider", "openrouter"),
            "ai_model": settings.get("ai_model", "openrouter/free"),
            "ai_custom_endpoint": settings.get("ai_custom_endpoint", ""),
        }
    except Exception:
        return {
            "ai_api_key": "",
            "ai_provider": "openrouter",
            "ai_model": "openrouter/free",
            "ai_custom_endpoint": "",
        }


@router.post("/ai")
async def set_ai_settings(req: dict):
    """Сохранить AI настройки в БД."""
    try:

        ai_api_key = req.get("ai_api_key", "")
        ai_provider = req.get("ai_provider", "openrouter")
        ai_model = req.get("ai_model", "openrouter/free")
        ai_custom_endpoint = req.get("ai_custom_endpoint", "")

        async with AsyncSessionLocal() as session:
            for key, value in [
                ("ai_api_key", ai_api_key),
                ("ai_provider", ai_provider),
                ("ai_model", ai_model),
                ("ai_custom_endpoint", ai_custom_endpoint),
            ]:
                result = await session.execute(
                    select(AppSetting).where(AppSetting.key == key)
                )
                setting = result.scalar_one_or_none()
                if setting:
                    setting.value = value
                else:
                    setting = AppSetting(key=key, value=value)
                    session.add(setting)
            await session.commit()
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/proxy/check")
async def check_proxy_connectivity():
    """Проверить доступность Telegram через текущий прокси.

    ВАЖНО: читает TELEGRAM_PROXY_URL напрямую из /app/.env (не из кэша settings),
    чтобы отражать последнее сохранённое значение без перезапуска.
    """

    # Читаем актуальный прокси из БД, с fallback на .env
    proxy_url: Optional[str] = None
    try:

        async with AsyncSessionLocal() as session:
            result = await session.execute(
                select(AppSetting).where(AppSetting.key == "telegram_proxy_url")
            )
            setting = result.scalar_one_or_none()
            if setting and setting.value:
                proxy_url = setting.value
    except Exception:
        pass

    # Fallback: читаем из .env
    if not proxy_url:
        try:
            proxy_url = await asyncio.to_thread(_read_proxy_from_env_file)
        except Exception:
            pass

    result: dict = {
        "proxy_configured": bool(proxy_url),
        "proxy_url": proxy_url or "",
        "proxy_type": None,
        "reachable": False,
        "http_status": None,
        "latency_ms": None,
        "error": None,
    }

    connector = None
    try:
        if proxy_url:
            if proxy_url.startswith(("socks4://", "socks5://")):

                connector = ProxyConnector.from_url(proxy_url)
                result["proxy_type"] = "SOCKS5"
            elif proxy_url.startswith(("http://", "https://")):

                connector = ProxyConnector.from_url(proxy_url)
                result["proxy_type"] = "HTTP"
            elif proxy_url.startswith("mtproto://"):
                result["error"] = (
                    "MTProxy не поддерживается. Используйте SOCKS5 прокси."
                )
                result["proxy_type"] = "MTProxy (не поддерживается)"
                return result
            else:
                result["error"] = f"Неизвестная схема: {proxy_url.split('://')[0]}://"
                return result
        else:
            result["proxy_type"] = "direct (нет прокси)"

        t0 = time.monotonic()
        async with aiohttp.ClientSession(connector=connector) as session:
            async with session.get(
                "https://api.telegram.org",
                timeout=aiohttp.ClientTimeout(total=15),  # 15s — медленные прокси
                allow_redirects=False,  # 302 от Telegram = успех, не редиректим
            ) as resp:
                # Telegram отвечает 302 или 200 — оба означают доступность
                result["reachable"] = resp.status in (200, 301, 302, 307, 308)
                result["http_status"] = resp.status
                result["latency_ms"] = round((time.monotonic() - t0) * 1000)

    except asyncio.TimeoutError:
        result["error"] = "timeout (15s) — прокси не отвечает"
    except ImportError:
        result["error"] = "aiohttp-socks не установлен: pip install aiohttp-socks"
    except Exception as e:
        result["error"] = str(e)

    return result
