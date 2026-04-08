"""Deadline notification scheduler — runs alongside bot polling."""
import asyncio
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from sqlalchemy import select, text
from sqlalchemy.orm import selectinload
from app.core.db import AsyncSessionLocal
from app.core.clock import Clock
from app.core.logging import get_logger
from app.config import settings
from app.domain.models import LocalAccount

logger = get_logger(__name__)

DEFAULT_NOTIFY_HOURS = [24, 3]
CHECK_INTERVAL_MINUTES = 30

_started_at: datetime | None = None


async def _get_notify_hours() -> list[int]:
    """Read deadline notify hours from DB, fallback to default."""
    try:
        from app.domain.models import AppSetting
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(AppSetting.value).where(AppSetting.key == "deadline_notify_hours")
            )
            val = result.scalar_one_or_none()
            if val:
                return [int(h.strip()) for h in val.split(",") if h.strip()]
    except Exception:
        pass
    return DEFAULT_NOTIFY_HOURS


def record_heartbeat_sync():
    """Маркер времени старта — вызывается синхронно до event loop."""
    global _started_at
    if _started_at is None:
        _started_at = Clock.now()


async def record_heartbeat(username: str = ""):
    """Записать heartbeat в БД — видно из любого процесса."""
    global _started_at
    now = Clock.now()
    if _started_at is None:
        _started_at = now

    async with AsyncSessionLocal() as db:
        await db.execute(text("""
            INSERT OR REPLACE INTO bot_heartbeat (id, last_seen, username, started_at)
            VALUES (1, :last_seen, :username, :started_at)
        """), {"last_seen": now, "username": username, "started_at": _started_at})
        await db.commit()


async def get_bot_status_from_db() -> dict:
    """Читать статус бота из БД."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            text("SELECT last_seen, username, started_at FROM bot_heartbeat WHERE id=1")
        )
        row = result.fetchone()

    if not row:
        return {"ok": False, "username": None, "last_seen": None,
                "uptime_sec": None, "error": "Bot not started yet"}

    last_seen, username, started_at = row
    if isinstance(last_seen, str):
        last_seen = datetime.fromisoformat(last_seen)
    if isinstance(started_at, str):
        started_at = datetime.fromisoformat(started_at)

    now = Clock.now()
    seconds_ago = (now - last_seen).total_seconds()
    uptime = int((now - started_at).total_seconds()) if started_at else None

    if seconds_ago > 90:
        return {"ok": False, "username": username, "last_seen": last_seen.isoformat(),
                "uptime_sec": uptime, "error": f"No heartbeat for {int(seconds_ago)}s"}
    return {"ok": True, "username": username, "last_seen": last_seen.isoformat(),
            "uptime_sec": uptime, "error": None}


async def check_deadlines(bot):
    """Проверить дедлайны и отправить уведомления."""
    from app.domain.models import Task, DeadlineNotification, UserIdentity

    notify_hours = await _get_notify_hours()
    if not notify_hours:
        return

    now = Clock.now()

    async with AsyncSessionLocal() as db:
        window_end = now + timedelta(hours=max(notify_hours) + 1)
        result = await db.execute(
            select(Task)
            .options(selectinload(Task.assignee))
            .where(
                Task.due_date != None,
                Task.due_date <= window_end,
                Task.due_date > now,
                Task.status.notin_(["DONE", "CANCELLED"]),
                Task.deleted == False,
                Task.archived == False,
                Task.assignee_id != None,
            )
        )
        tasks = result.scalars().all()

        for task in tasks:
            if not task.assignee_id:
                continue
            
            # Find telegram_id through UserIdentity
            identity_result = await db.execute(
                select(UserIdentity).where(
                    UserIdentity.local_account_id == task.assignee_id,
                    UserIdentity.provider == "telegram",
                )
            )
            identity = identity_result.scalar_one_or_none()
            if not identity:
                continue
            
            telegram_id = int(identity.provider_user_id)

            # Get user's timezone for displaying deadline
            account_result = await db.execute(
                select(LocalAccount).where(LocalAccount.id == task.assignee_id)
            )
            account = account_result.scalar_one_or_none()
            user_tz_str = account.timezone if account and account.timezone else None

            # Fallback: system default from AppSettings
            if not user_tz_str:
                try:
                    sys_result = await db.execute(
                        select(AppSetting.value).where(AppSetting.key == "default_timezone")
                    )
                    user_tz_str = sys_result.scalar_one_or_none()
                except Exception:
                    pass
                user_tz_str = user_tz_str or "UTC"

            try:
                user_tz = ZoneInfo(user_tz_str)
            except Exception:
                user_tz = ZoneInfo("UTC")

            due_utc = task.due_date.replace(tzinfo=timezone.utc)
            due_user_tz = due_utc.astimezone(user_tz)
            hours_left = (due_utc - now.replace(tzinfo=timezone.utc)).total_seconds() / 3600

            for threshold in notify_hours:
                if hours_left <= threshold:
                    notif_result = await db.execute(
                        select(DeadlineNotification).where(
                            DeadlineNotification.task_id == task.id,
                            DeadlineNotification.threshold_hours == threshold,
                        )
                    )
                    if notif_result.scalar_one_or_none():
                        continue

                    tz_label = due_user_tz.strftime("%H:%M")
                    due_str = due_user_tz.strftime(f"%d.%m в {tz_label}")
                    urgency = "🔴 Через несколько часов!" if threshold <= 3 else "⚠️ Завтра дедлайн"

                    text_msg = (
                        f"{urgency}\n\n"
                        f"📋 *{task.title}*\n"
                        f"📅 Дедлайн: {due_str}\n"
                        f"⏰ Осталось: ~{int(hours_left)}ч\n"
                    )
                    if task.project_id:
                        text_msg += f"\n[Открыть задачу]({settings.web_url}/?task={task.id})"

                    try:
                        await bot.send_message(
                            chat_id=telegram_id,
                            text=text_msg,
                            parse_mode="Markdown",
                        )
                        db.add(DeadlineNotification(
                            task_id=task.id,
                            threshold_hours=threshold,
                            sent_at=now.replace(tzinfo=None),
                            user_telegram_id=telegram_id,
                        ))
                        await db.commit()
                        logger.info("deadline_notification_sent",
                                    task_id=task.id, threshold=threshold,
                                    user=telegram_id)
                    except Exception as e:
                        logger.warning("deadline_notification_failed",
                                       task_id=task.id, error=str(e))
                    break


async def run_deadline_checker(bot):
    """Запускаем бесконечный цикл проверки дедлайнов + heartbeat."""
    try:
        me = await bot.get_me()
        username = me.username or ""
    except Exception:
        username = ""

    await record_heartbeat(username)
    logger.info("deadline_checker_started", username=username,
                interval_min=CHECK_INTERVAL_MINUTES)

    await asyncio.sleep(60)
    while True:
        await record_heartbeat(username)
        try:
            await check_deadlines(bot)
        except Exception as e:
            logger.error("deadline_checker_error", error=str(e))
        for _ in range(CHECK_INTERVAL_MINUTES * 2):
            await asyncio.sleep(30)
            await record_heartbeat(username)
