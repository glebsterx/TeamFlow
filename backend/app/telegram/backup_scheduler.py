"""Periodic DB backup — runs alongside bot polling (see bot.py::start_bot).

app/core/bootstrap.py::backup_database() only runs once, at process
startup. On a prod instance that stays up for weeks (which is the goal —
see the crash-loop fix in app/main.py), that means no fresh backup is
ever taken between restarts. This adds a daily backup on top, and — since
a silent backup failure is worse than no backup at all, you'd only find
out when you actually need to restore — pages any admin with a linked
Telegram account when a backup run fails.
"""
import asyncio
from sqlalchemy import select

from app.core.clock import Clock
from app.core.logging import get_logger
from app.core.bootstrap import backup_database
from app.domain.models import LocalAccount, UserIdentity

logger = get_logger(__name__)

BACKUP_INTERVAL_HOURS = 24


async def _notify_admins(bot, message: str) -> None:
    from app.core.db import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(UserIdentity.provider_user_id)
            .join(LocalAccount, LocalAccount.id == UserIdentity.local_account_id)
            .where(LocalAccount.system_role == "admin", UserIdentity.provider == "telegram")
        )
        telegram_ids = [int(row[0]) for row in result.all()]

    if not telegram_ids:
        logger.warning("backup_alert_no_admin_telegram", message=message)
        return

    for telegram_id in telegram_ids:
        try:
            await bot.send_message(chat_id=telegram_id, text=message, parse_mode="Markdown")
        except Exception as e:
            logger.warning("backup_alert_send_failed", telegram_id=telegram_id, error=str(e))


async def run_backup_checker(bot) -> None:
    """Daily DB backup with a Telegram alert to admins on failure."""
    while True:
        await asyncio.sleep(BACKUP_INTERVAL_HOURS * 3600)
        try:
            await asyncio.to_thread(backup_database, raise_on_error=True)
            logger.info("scheduled_backup_ok", at=Clock.now().isoformat())
        except Exception as e:
            logger.error("scheduled_backup_failed", error=str(e))
            await _notify_admins(
                bot,
                f"⚠️ *Резервная копия БД не создалась*\n\n`{e}`\n\nПроверьте место на диске и логи backend.",
            )
