"""Test /remind timezone resolution (#319 / AUD-4).

`/remind 42 18:00` used to always interpret HH:MM as MSK (UTC+3) for
every user, regardless of the timezone already stored on their account
(LocalAccount.timezone, settable from AccountPage). _get_account_timezone
is what cmd_remind now uses instead — tested directly here since driving
the full aiogram Message handler needs a lot of unrelated mocking.
"""
import time
import pytest
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import AppSetting, LocalAccount, UserIdentity
from app.services.settings_service import SettingsService
from app.telegram.handlers.remind_handler import _get_account_timezone


@pytest.mark.asyncio
async def test_uses_account_timezone_when_set(test_db_session: AsyncSession):
    telegram_id = int(time.time() * 1000) % 1_000_000_000
    account = LocalAccount(first_name="Test", timezone="Asia/Yekaterinburg")
    test_db_session.add(account)
    await test_db_session.flush()
    test_db_session.add(UserIdentity(
        local_account_id=account.id, provider="telegram", provider_user_id=str(telegram_id),
    ))
    await test_db_session.commit()

    assert await _get_account_timezone(telegram_id) == "Asia/Yekaterinburg"


@pytest.mark.asyncio
async def test_falls_back_to_system_default_when_account_has_no_timezone(test_db_session: AsyncSession):
    telegram_id = int(time.time() * 1000) % 1_000_000_000 + 1
    account = LocalAccount(first_name="Test", timezone=None)
    test_db_session.add(account)
    await test_db_session.flush()
    test_db_session.add(UserIdentity(
        local_account_id=account.id, provider="telegram", provider_user_id=str(telegram_id),
    ))
    await SettingsService.set(test_db_session, "default_timezone", "Europe/Kaliningrad")
    await test_db_session.commit()

    assert await _get_account_timezone(telegram_id) == "Europe/Kaliningrad"


@pytest.mark.asyncio
async def test_falls_back_to_utc_when_no_account_linked(test_db_session: AsyncSession):
    unknown_telegram_id = 987654321
    # Other tests in this module may have already set default_timezone —
    # clear it so this test is self-contained regardless of run order.
    await test_db_session.execute(delete(AppSetting).where(AppSetting.key == "default_timezone"))
    await test_db_session.commit()

    assert await _get_account_timezone(unknown_telegram_id) == "UTC"
