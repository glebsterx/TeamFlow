"""VAPID keys management — stored in app_settings DB."""
import base64
from typing import Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.domain.models import AppSetting
from app.core.logging import get_logger

logger = get_logger(__name__)

DB_KEY_PRIVATE = "vapid_private_key"
DB_KEY_PUBLIC = "vapid_public_key"
DB_KEY_EMAIL = "vapid_claims_email"


def _get_default_email() -> str:
    """Auto-detect email from BASE_URL: mail@domain.com."""
    from urllib.parse import urlparse
    from app.config import settings
    base_url = settings.BASE_URL or 'http://localhost'
    parsed = urlparse(base_url)
    domain = parsed.hostname or 'localhost'
    return f'mail@{domain}'


async def get_vapid_private_key(db: AsyncSession) -> Optional[str]:
    """Get VAPID private key (DER base64) from DB."""
    result = await db.execute(
        select(AppSetting.value).where(AppSetting.key == DB_KEY_PRIVATE)
    )
    return result.scalar_one_or_none()


async def get_vapid_public_key(db: AsyncSession) -> Optional[str]:
    """Get VAPID public key (EC point, URL-safe base64) from DB."""
    result = await db.execute(
        select(AppSetting.value).where(AppSetting.key == DB_KEY_PUBLIC)
    )
    return result.scalar_one_or_none()


async def get_vapid_claims_email(db: AsyncSession) -> str:
    """Get VAPID claims email from DB, fallback to auto-detected mail@domain."""
    result = await db.execute(
        select(AppSetting.value).where(AppSetting.key == DB_KEY_EMAIL)
    )
    email = result.scalar_one_or_none()
    return email or _get_default_email()


async def set_vapid_keys(
    db: AsyncSession,
    private_key: str,
    public_key: str,
) -> None:
    """Store VAPID keys in app_settings."""
    for key, value in [(DB_KEY_PRIVATE, private_key), (DB_KEY_PUBLIC, public_key)]:
        result = await db.execute(
            select(AppSetting).where(AppSetting.key == key)
        )
        setting = result.scalar_one_or_none()
        if setting:
            setting.value = value
        else:
            db.add(AppSetting(key=key, value=value))
    await db.commit()
    logger.info("VAPID keys saved to DB")


async def set_vapid_claims_email(db: AsyncSession, email: str) -> None:
    """Store VAPID claims email in app_settings."""
    result = await db.execute(
        select(AppSetting).where(AppSetting.key == DB_KEY_EMAIL)
    )
    setting = result.scalar_one_or_none()
    if setting:
        setting.value = email
    else:
        db.add(AppSetting(key=DB_KEY_EMAIL, value=email))
    await db.commit()
    logger.info(f"VAPID claims email set to: {email}")


def generate_vapid_keys() -> tuple[str, str]:
    """Generate new VAPID key pair.

    Returns:
        (private_key_urlsafe_base64, public_key_ec_point_urlsafe_base64)

    #272 — FIX: pywebpush → py_vapid.from_string() uses b64urldecode,
    so the private key MUST be URL-safe base64 (not standard base64).
    """
    import base64
    from py_vapid import Vapid
    from cryptography.hazmat.primitives.serialization import (
        Encoding, PrivateFormat, NoEncryption,
        load_pem_public_key, PublicFormat,
    )

    v = Vapid()
    v.generate_keys()
    v.from_pem(v.private_pem())

    # Private key: DER format, URL-safe base64 (py_vapid.from_string uses b64urldecode)
    der_bytes = v.private_key.private_bytes(
        Encoding.DER, PrivateFormat.TraditionalOpenSSL, NoEncryption()
    )
    private_key = base64.urlsafe_b64encode(der_bytes).rstrip(b"=").decode()

    # Public key: raw EC point (65 bytes), URL-safe base64 (what pushManager expects)
    pem_pub = v.public_pem().decode('utf-8')
    pub_key = load_pem_public_key(pem_pub.encode('utf-8'))
    ec_point = pub_key.public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
    public_key = base64.urlsafe_b64encode(ec_point).rstrip(b"=").decode()

    return private_key, public_key
