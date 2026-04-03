"""Deadline notification scheduler — runs alongside bot polling."""
import asyncio
from datetime import datetime, timezone, timedelta
from sqlalchemy import select, text
from sqlalchemy.orm import selectinload
from app.core.db import AsyncSessionLocal
from app.core.logging import get_logger
from app.config import settings

logger = get_logger(__name__)

NOTIFY_BEFORE_HOURS = [24, 3]
CHECK_INTERVAL_MINUTES = 30

_started_at: datetime | None = None


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def record_heartbeat_sync():
    """Маркер времени старта — вызывается синхронно до event loop."""
    global _started_at
    if _started_at is None:
        _started_at = _now_utc().replace(tzinfo=None)


async def record_heartbeat(username: str = ""):
    """Записать heartbeat в БД — видно из любого процесса."""
    global _started_at
    now = _now_utc().replace(tzinfo=None)
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

    now = _now_utc().replace(tzinfo=None)
    seconds_ago = (now - last_seen).total_seconds()
    uptime = int((now - started_at).total_seconds()) if started_at else None

    if seconds_ago > 90:
        return {"ok": False, "username": username, "last_seen": last_seen.isoformat(),
                "uptime_sec": uptime, "error": f"No heartbeat for {int(seconds_ago)}s"}
    return {"ok": True, "username": username, "last_seen": last_seen.isoformat(),
            "uptime_sec": uptime, "error": None}


async def check_deadlines(bot):
    """Проверить дедлайны и отправить уведомления."""
    from app.domain.models import Task, DeadlineNotification

    now = _now_utc()

    async with AsyncSessionLocal() as db:
        window_end = now + timedelta(hours=max(NOTIFY_BEFORE_HOURS) + 1)
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

            hours_left = (task.due_date.replace(tzinfo=timezone.utc) - now).total_seconds() / 3600

            for threshold in NOTIFY_BEFORE_HOURS:
                if hours_left <= threshold:
                    notif_result = await db.execute(
                        select(DeadlineNotification).where(
                            DeadlineNotification.task_id == task.id,
                            DeadlineNotification.threshold_hours == threshold,
                        )
                    )
                    if notif_result.scalar_one_or_none():
                        continue

                    due_str = task.due_date.replace(tzinfo=timezone.utc).strftime("%d.%m в %H:%M UTC")
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
