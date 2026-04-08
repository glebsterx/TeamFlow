"""Auth routes — LocalAccount as primary identity."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from datetime import datetime

from app.core.db import get_db
from app.config import settings
from app.domain.models import LocalAccount, LocalIdentity, UserIdentity, AppSetting, TeamMember
from sqlalchemy import select
from app.services.account_service import AccountService

router = APIRouter()


from passlib.context import CryptContext
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _account_to_dict(account: LocalAccount, identity: Optional[LocalIdentity] = None) -> dict:
    providers = []
    if hasattr(account, 'oauth_identities') and account.oauth_identities:
        for p in account.oauth_identities:
            providers.append({"provider": p.provider, "email": p.email})

    return {
        "id": account.id,
        "username": account.username,
        "display_name": account.display,
        "first_name": account.first_name or "",
        "last_name": account.last_name,
        "email": account.email,
        "system_role": account.system_role,
        "login": identity.login if identity else None,
        "has_password": bool(identity and identity.password_hash),
        "is_active": account.is_active,
        "created_at": account.created_at.isoformat() if account.created_at else None,
        "updated_at": account.updated_at.isoformat() if account.updated_at else None,
    }


# ============= ACCOUNT ME =============

@router.get("/account/me")
async def get_my_account(
    account_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    account = await AccountService.get_by_id(db, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Аккаунт не найден")
    return _account_to_dict(account, account.local_identity)


# ============= HAS USERS =============

@router.get("/has-users")
async def has_users(db: AsyncSession = Depends(get_db)):
    """Проверить, есть ли в системе хотя бы один пользователь."""
    result = await db.execute(select(LocalAccount).where(LocalAccount.is_active == True).limit(1))
    user = result.scalar_one_or_none()
    return {"has_users": user is not None}


# ============= REGISTER =============

class RegisterRequest(BaseModel):
    login: str
    password: str
    email: Optional[str] = None
    invite_code: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    user: dict


@router.post("/local/register", response_model=TokenResponse)
async def local_register(request: RegisterRequest, db: AsyncSession = Depends(get_db)):
    from app.services.settings_service import SettingsService
    
    # Rate limit: 3 registrations per IP per 5 minutes
    from app.domain.models import ApiKeyLog
    from datetime import datetime, timedelta
    five_min_ago = datetime.utcnow() - timedelta(minutes=5)
    
    # Проверяем нужно ли приглашение
    invite_only = await SettingsService.get(db, "registration_by_invite_only")
    if invite_only == "true":
        from app.domain.models import TeamInvite
        from datetime import datetime
        
        # Try invite_code first, then email
        invite_obj = None
        if request.invite_code:
            invite = await db.execute(
                select(TeamInvite).where(
                    TeamInvite.invite_token == request.invite_code,
                    TeamInvite.is_active == True,
                    TeamInvite.used_at == None,
                    (TeamInvite.expires_at == None) | (TeamInvite.expires_at > datetime.utcnow()),
                )
            )
            invite_obj = invite.scalar_one_or_none()
        
        if not invite_obj and request.email:
            invite = await db.execute(
                select(TeamInvite).where(
                    TeamInvite.email == request.email,
                    TeamInvite.is_active == True,
                    TeamInvite.used_at == None,
                    (TeamInvite.expires_at == None) | (TeamInvite.expires_at > datetime.utcnow()),
                )
            )
            invite_obj = invite.scalar_one_or_none()
        
        if not invite_obj:
            raise HTTPException(status_code=403, detail="Регистрация только по приглашениям. Введите код приглашения.")
        invite_obj.used_at = datetime.utcnow()
    
    login = request.login.strip().lower()
    existing = await AccountService.get_identity_by_login(db, login)
    if existing:
        raise HTTPException(status_code=400, detail="Логин уже занят")

    account = await AccountService.create_account(db, first_name=login, display_name=login, email=request.email)
    await AccountService.create_local_identity(db, account, login, request.password, email=request.email)
    await db.flush()
    await db.commit()

    account = await AccountService.get_by_id(db, account.id)
    tokens = AccountService.generate_jwt(account.id, "local")
    return TokenResponse(access_token=tokens["access_token"], refresh_token=tokens["refresh_token"], user=_account_to_dict(account, account.local_identity))


# ============= LOGIN =============

class LoginRequest(BaseModel):
    login: str
    password: str


@router.post("/local/login", response_model=TokenResponse)
async def local_login(request: LoginRequest, db: AsyncSession = Depends(get_db)):
    identity = await AccountService.get_identity_by_login(db, request.login)
    if not identity or not identity.is_active:
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")

    if not AccountService.verify_password(request.password, identity.password_hash):
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")

    account = await AccountService.get_by_id(db, identity.local_account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Аккаунт не найден")

    # Update last login timestamp
    account.updated_at = datetime.utcnow()
    await db.flush()
    await db.commit()

    tokens = AccountService.generate_jwt(account.id, "local")
    return TokenResponse(access_token=tokens["access_token"], refresh_token=tokens["refresh_token"], user=_account_to_dict(account, identity))


# ============= LINK LOCAL =============

class LinkLocalRequest(BaseModel):
    login: str
    password: str
    email: Optional[str] = None


@router.post("/local/link")
async def link_local_account(request: LinkLocalRequest, account_id: int = Query(...), db: AsyncSession = Depends(get_db)):
    account = await AccountService.get_by_id(db, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Аккаунт не найден")

    if account.local_identity:
        raise HTTPException(status_code=400, detail="Локальный аккаунт уже привязан")

    login = request.login.strip().lower()
    existing = await AccountService.get_identity_by_login(db, login)
    if existing:
        raise HTTPException(status_code=400, detail="Логин уже занят")

    await AccountService.create_local_identity(db, account, login, request.password, email=request.email)
    await db.commit()
    return {"ok": True, "message": "Локальный аккаунт привязан", "login": login}


# ============= CHANGE PASSWORD =============

class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


@router.post("/local/change-password")
async def change_password(request: ChangePasswordRequest, account_id: int = Query(...), db: AsyncSession = Depends(get_db)):
    account = await AccountService.get_by_id(db, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Аккаунт не найден")

    identity = account.local_identity
    if not identity:
        raise HTTPException(status_code=404, detail="Локальный аккаунт не найден")

    if not AccountService.verify_password(request.old_password, identity.password_hash):
        raise HTTPException(status_code=401, detail="Неверный текущий пароль")

    identity.password_hash = AccountService.hash_password(request.new_password)
    await db.commit()
    return {"ok": True, "message": "Пароль изменён"}


from passlib.context import CryptContext
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ============= ACCOUNT STATUS =============

@router.get("/local/account-status")
async def get_account_status(account_id: int = Query(...), db: AsyncSession = Depends(get_db)):
    account = await AccountService.get_by_id(db, account_id)
    if not account:
        return {"has_local_account": False}
    identity = account.local_identity
    return {"has_local_account": identity is not None, "login": identity.login if identity else None}


# ============= LINKED ACCOUNTS =============

@router.get("/linked-accounts")
async def get_linked_accounts(account_id: int = Query(...), db: AsyncSession = Depends(get_db)):
    providers = await AccountService.get_oauth_providers(db, account_id)
    return [{"provider": p.provider, "email": p.email, "linked_at": p.linked_at.isoformat() if p.linked_at else None} for p in providers]


# ============= UNLINK =============

@router.delete("/unlink-account")
async def unlink_account(account_id: int = Query(...), provider: str = Query(...), db: AsyncSession = Depends(get_db)):
    account = await AccountService.get_by_id(db, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Аккаунт не найден")

    providers = await AccountService.get_oauth_providers(db, account_id)
    has_local = account.local_identity is not None

    if len(providers) <= 1 and not has_local and provider != "telegram":
        raise HTTPException(status_code=400, detail="Нельзя отвязать последний способ входа")

    success = await AccountService.unlink_oauth(db, account_id, provider)
    if not success:
        raise HTTPException(status_code=404, detail="Провайдер не привязан")
    await db.commit()
    return {"ok": True, "message": f"{provider} отвязан"}


# ============= UPDATE PROFILE =============

class UpdateProfileRequest(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    display_name: Optional[str] = None
    email: Optional[str] = None


@router.patch("/account/profile")
async def update_profile(request: UpdateProfileRequest, account_id: int = Query(...), db: AsyncSession = Depends(get_db)):
    account = await AccountService.get_by_id(db, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Аккаунт не найден")

    await AccountService.update_profile(db, account, first_name=request.first_name, last_name=request.last_name, display_name=request.display_name, email=request.email)
    await db.commit()
    return _account_to_dict(account, account.local_identity)


# ============= TELEGRAM AUTH =============

class TelegramAuthData(BaseModel):
    id: int
    first_name: str
    last_name: Optional[str] = None
    username: Optional[str] = None
    photo_url: Optional[str] = None
    auth_date: int
    hash: str


@router.post("/telegram")
async def telegram_auth(data: TelegramAuthData, db: AsyncSession = Depends(get_db)):
    import hashlib, hmac
    secret = hashlib.sha256(settings.TELEGRAM_BOT_TOKEN.encode()).digest()
    check_string = "\n".join(f"{k}={v}" for k, v in sorted(data.model_dump(exclude={"hash"}).items(), key=lambda x: x[0]))
    computed_hash = hmac.new(secret, check_string.encode(), hashlib.sha256).hexdigest()
    if computed_hash != data.hash:
        raise HTTPException(status_code=401, detail="Invalid Telegram signature")

    if (datetime.utcnow().timestamp() - data.auth_date) > 86400:
        raise HTTPException(status_code=401, detail="Telegram data is too old")

    account = await AccountService.find_account_by_telegram(db, data.id)

    if not account:
        account = await AccountService.create_account(
            db, first_name=data.first_name, last_name=data.last_name,
            username=data.username, display_name=data.username or data.first_name,
        )
        await AccountService.link_telegram(db, account, data.id, username=data.username, first_name=data.first_name, last_name=data.last_name)

    # Update last login timestamp
    account.updated_at = datetime.utcnow()
    await db.flush()
    await db.commit()

    tokens = AccountService.generate_jwt(account.id, "telegram")
    return {"access_token": tokens["access_token"], "refresh_token": tokens["refresh_token"], "user": _account_to_dict(account)}


# ============= OAUTH SETTINGS =============

class OAuthSettings(BaseModel):
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = ""
    yandex_client_id: str = ""
    yandex_client_secret: str = ""
    yandex_redirect_uri: str = ""


@router.get("/oauth-settings", response_model=OAuthSettings)
async def get_oauth_settings(db: AsyncSession = Depends(get_db)):
    """Получить OAuth настройки."""
    from app.services.settings_service import SettingsService
    keys = [
        "google_client_id", "google_client_secret", "google_redirect_uri",
        "yandex_client_id", "yandex_client_secret", "yandex_redirect_uri",
    ]
    vals = await SettingsService.get_many(db, keys)
    # Не возвращаем секреты в полном виде — только последние 4 символа
    def mask(v: Optional[str]) -> str:
        if not v:
            return ""
        return v

    return OAuthSettings(
        google_client_id=vals.get("google_client_id") or "",
        google_client_secret=mask(vals.get("google_client_secret")),
        google_redirect_uri=vals.get("google_redirect_uri") or "",
        yandex_client_id=vals.get("yandex_client_id") or "",
        yandex_client_secret=mask(vals.get("yandex_client_secret")),
        yandex_redirect_uri=vals.get("yandex_redirect_uri") or "",
    )


@router.put("/oauth-settings")
async def save_oauth_settings(data: OAuthSettings, db: AsyncSession = Depends(get_db)):
    """Сохранить OAuth настройки."""
    from app.services.settings_service import SettingsService
    mapping = {
        "google_client_id": data.google_client_id,
        "google_client_secret": data.google_client_secret,
        "google_redirect_uri": data.google_redirect_uri,
        "yandex_client_id": data.yandex_client_id,
        "yandex_client_secret": data.yandex_client_secret,
        "yandex_redirect_uri": data.yandex_redirect_uri,
    }
    for key, val in mapping.items():
        await SettingsService.set(db, key, val or "")
    await db.commit()
    return {"status": "ok"}


@router.get("/oauth-providers")
async def get_available_oauth_providers(db: AsyncSession = Depends(get_db)):
    """Какие OAuth провайдеры настроены."""
    from app.services.settings_service import SettingsService
    vals = await SettingsService.get_many(db, ["google_client_id", "google_client_secret", "yandex_client_id", "yandex_client_secret"])
    return {
        "google": bool(vals.get("google_client_id") and vals.get("google_client_secret")),
        "yandex": bool(vals.get("yandex_client_id") and vals.get("yandex_client_secret")),
    }


# ============= REGISTRATION SETTINGS =============

@router.get("/registration-settings")
async def get_registration_settings(db: AsyncSession = Depends(get_db)):
    """Получить настройки регистрации."""
    from app.services.settings_service import SettingsService
    invite_only = await SettingsService.get(db, "registration_by_invite_only")
    return {"invite_only": invite_only == "true"}


@router.put("/registration-settings")
async def save_registration_settings(data: dict, db: AsyncSession = Depends(get_db)):
    """Сохранить настройки регистрации."""
    from app.services.settings_service import SettingsService
    await SettingsService.set(db, "registration_by_invite_only", "true" if data.get("invite_only") else "false")
    await db.commit()
    return {"status": "ok"}


# ============= INVITATIONS =============

class InviteRequest(BaseModel):
    email: Optional[str] = None
    telegram_username: Optional[str] = None
    role: str = "member"
    expires_days: int = 30


@router.get("/invitations")
async def get_invitations(db: AsyncSession = Depends(get_db)):
    """Получить список приглашений."""
    from app.domain.models import TeamInvite
    result = await db.execute(
        select(TeamInvite).order_by(TeamInvite.created_at.desc()).limit(50)
    )
    invites = result.scalars().all()
    return [
        {
            "id": inv.id,
            "email": inv.email,
            "telegram_username": inv.telegram_username,
            "role": inv.role,
            "invite_token": inv.invite_token,
            "is_active": inv.is_active,
            "expires_at": inv.expires_at.isoformat() if inv.expires_at else None,
            "used_at": inv.used_at.isoformat() if inv.used_at else None,
            "created_at": inv.created_at.isoformat(),
        }
        for inv in invites
    ]


@router.post("/invitations")
async def create_invitation(data: InviteRequest, db: AsyncSession = Depends(get_db)):
    """Создать приглашение."""
    import secrets
    from datetime import datetime, timedelta
    from app.domain.models import TeamInvite, TeamMember
    
    # Находим первого участника (owner) для created_by_id
    owner = await db.execute(
        select(TeamMember).where(TeamMember.role == "owner").limit(1)
    )
    owner_obj = owner.scalar_one_or_none()
    if not owner_obj:
        # Создаём owner если нет
        first_user = await db.execute(select(LocalAccount).limit(1))
        first_user_obj = first_user.scalar_one_or_none()
        if first_user_obj:
            owner_obj = TeamMember(telegram_user_id=first_user_obj.id, role="owner")
            db.add(owner_obj)
            await db.flush()
    
    invite = TeamInvite(
        invite_token=secrets.token_urlsafe(32),
        email=data.email,
        telegram_username=data.telegram_username,
        role=data.role,
        created_by_id=owner_obj.id if owner_obj else 1,
        is_active=True,
        expires_at=datetime.utcnow() + timedelta(days=data.expires_days),
    )
    db.add(invite)
    await db.commit()
    
    return {
        "id": invite.id,
        "invite_token": invite.invite_token,
        "email": invite.email,
        "expires_at": invite.expires_at.isoformat(),
    }


@router.delete("/invitations/{invite_id}")
async def delete_invitation(invite_id: int, db: AsyncSession = Depends(get_db)):
    """Удалить/деактивировать приглашение."""
    from app.domain.models import TeamInvite
    result = await db.execute(select(TeamInvite).where(TeamInvite.id == invite_id))
    invite = result.scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=404, detail="Приглашение не найдено")
    invite.is_active = False
    await db.commit()
    return {"status": "ok"}


@router.get("/pending-login/{session_token}")
async def check_pending_login(session_token: str, db: AsyncSession = Depends(get_db)):
    """Проверить есть ли pending login от бота."""
    from app.services.settings_service import SettingsService
    import json
    data = await SettingsService.get(db, f"pending_login_{session_token}")
    if data:
        # Удаляем pending login после получения
        setting = await db.execute(
            select(AppSetting).where(AppSetting.key == f"pending_login_{session_token}")
        )
        setting_obj = setting.scalar_one_or_none()
        if setting_obj:
            await db.delete(setting_obj)
            await db.commit()
        return json.loads(data)
    return {}


# ============= USER MANAGEMENT =============

@router.get("/users/manage")
async def get_users_for_management(
    account_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Получить список пользователей для управления (только admin)."""
    # Check if user is system admin
    result = await db.execute(select(LocalAccount).where(LocalAccount.id == account_id))
    user = result.scalar_one_or_none()
    if not user or user.system_role != "admin":
        raise HTTPException(status_code=403, detail="Нет прав для управления пользователями")
    
    # Get all users
    result = await db.execute(
        select(LocalAccount).where(LocalAccount.is_active == True).order_by(LocalAccount.created_at)
    )
    users = result.scalars().all()
    
    return [
        {
            "id": u.id,
            "display_name": u.display_name or u.first_name,
            "username": u.username,
            "email": u.email,
            "is_active": u.is_active,
            "system_role": u.system_role,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in users
    ]


@router.patch("/users/{user_id}/role")
async def update_user_role(
    user_id: int,
    data: dict,
    account_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Изменить системную роль пользователя (только admin)."""
    # Check if user is system admin
    result = await db.execute(select(LocalAccount).where(LocalAccount.id == account_id))
    user = result.scalar_one_or_none()
    if not user or user.system_role != "admin":
        raise HTTPException(status_code=403, detail="Нет прав")
    
    new_role = data.get("system_role")
    if new_role not in ("admin", "user"):
        raise HTTPException(status_code=400, detail="Неверная роль")
    
    # Update user
    result = await db.execute(select(LocalAccount).where(LocalAccount.id == user_id))
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    
    target.system_role = new_role
    await db.commit()
    return {"status": "ok", "system_role": new_role}


@router.delete("/users/{user_id}")
async def deactivate_user(
    user_id: int,
    account_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Деактивировать пользователя (только owner)."""
    from app.services.team_service import TeamService
    
    # Only owner can deactivate users
    role = await TeamService.get_member_role(db, account_id)
    if role != "owner":
        raise HTTPException(status_code=403, detail="Только владелец может деактивировать пользователей")
    
    # Can't deactivate yourself
    if user_id == account_id:
        raise HTTPException(status_code=400, detail="Нельзя деактивировать самого себя")
    
    result = await db.execute(select(LocalAccount).where(LocalAccount.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    
    user.is_active = False
    await db.commit()
    return {"status": "ok"}


# ============= OAUTH ROUTES =============

@router.get("/google/link")
async def google_link(
    account_id: Optional[int] = Query(None),
    state: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Редирект на Google OAuth."""
    from app.services.settings_service import SettingsService
    vals = await SettingsService.get_many(db, ["google_client_id", "google_redirect_uri"])
    client_id = vals.get("google_client_id")
    redirect_uri = vals.get("google_redirect_uri") or f"{settings.api_url}/api/auth/google/callback"
    
    if not client_id:
        raise HTTPException(status_code=400, detail="Google OAuth не настроен")
    
    # Сохраняем account_id в state если есть
    state_data = state or ""
    if account_id:
        state_data = f"account_{account_id}"
    
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "state": state_data,
    }
    url = "https://accounts.google.com/o/oauth2/v2/auth?" + "&".join(f"{k}={v}" for k, v in params.items())
    return RedirectResponse(url=url)


@router.get("/google/callback")
async def google_callback(
    code: str = Query(...),
    state: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Callback от Google OAuth."""
    import httpx
    from app.services.settings_service import SettingsService
    
    vals = await SettingsService.get_many(db, ["google_client_id", "google_client_secret", "google_redirect_uri"])
    client_id = vals.get("google_client_id")
    client_secret = vals.get("google_client_secret")
    redirect_uri = vals.get("google_redirect_uri") or f"{settings.api_url}/api/auth/google/callback"
    
    if not client_id or not client_secret:
        raise HTTPException(status_code=400, detail="Google OAuth не настроен")
    
    # Обменяем code на токен
    async with httpx.AsyncClient() as client:
        resp = await client.post("https://oauth2.googleapis.com/token", data={
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        })
        token_data = resp.json()
        print(f"DEBUG Google token response: {token_data}")
    
    if "access_token" not in token_data:
        error_desc = token_data.get("error_description", token_data.get("error", "unknown"))
        raise HTTPException(status_code=400, detail=f"Google OAuth: {error_desc}")
    
    # Получим информацию о пользователе
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {token_data['access_token']}"}
        )
        user_info = resp.json()
    
    email = user_info.get("email")
    provider_user_id = str(user_info.get("id"))
    
    # Найдём существующую привязку
    existing_identity = await db.execute(
        select(UserIdentity).where(
            UserIdentity.provider == "google",
            UserIdentity.provider_user_id == provider_user_id,
        )
    )
    existing_link = existing_identity.scalar_one_or_none()
    
    if state and state.startswith("account_"):
        # Привязка к существующему аккаунту
        existing_account_id = int(state.split("_")[1])
        
        # Проверяем не привязан ли уже к другому аккаунту
        if existing_link and existing_link.local_account_id != existing_account_id:
            return RedirectResponse(url=f"{settings.web_url}/account?error=already_linked_to_other")
        
        existing = await AccountService.get_by_id(db, existing_account_id)
        if existing:
            if not existing_link:
                await AccountService.link_oauth(
                    db, existing, "google", provider_user_id,
                    email=email,
                    access_token=token_data.get("access_token"),
                    refresh_token=token_data.get("refresh_token"),
                )
            else:
                # Обновляем токены
                existing_link.access_token = token_data.get("access_token")
                existing_link.refresh_token = token_data.get("refresh_token")
            await db.commit()
            return RedirectResponse(url=f"{settings.web_url}/account?success=google_linked")
    
    if existing_link:
        # Уже привязан — используем существующий аккаунт
        account = await AccountService.get_by_id(db, existing_link.local_account_id)
        existing_link.access_token = token_data.get("access_token")
        existing_link.refresh_token = token_data.get("refresh_token")
        await db.commit()
    else:
        # Проверяем нужно ли приглашение для регистрации
        invite_only = await SettingsService.get(db, "registration_by_invite_only")
        if invite_only == "true":
            # Ищем активное приглашение по email
            from app.domain.models import TeamInvite
            from datetime import datetime
            invite = await db.execute(
                select(TeamInvite).where(
                    TeamInvite.email == email,
                    TeamInvite.is_active == True,
                    TeamInvite.used_at == None,
                    (TeamInvite.expires_at == None) | (TeamInvite.expires_at > datetime.utcnow()),
                )
            )
            invite_obj = invite.scalar_one_or_none()
            if not invite_obj:
                return RedirectResponse(url=f"{settings.web_url}/login?error=invite_required")
            # Помечаем приглашение как использованное
            invite_obj.used_at = datetime.utcnow()
        
        # Создаём новый аккаунт
        account = await AccountService.create_account(
            db, email=email,
            display_name=user_info.get("name") or email,
            first_name=user_info.get("given_name", ""),
            last_name=user_info.get("family_name"),
        )
        await AccountService.link_oauth(
            db, account, "google", provider_user_id,
            email=email,
            access_token=token_data.get("access_token"),
            refresh_token=token_data.get("refresh_token"),
        )
        await db.commit()
    
    # Генерируем токены и редиректим
    tokens = AccountService.generate_jwt(account.id, "google")
    return RedirectResponse(
        url=f"{settings.web_url}/login#access_token={tokens['access_token']}&refresh_token={tokens['refresh_token']}&account_id={account.id}"
    )


@router.get("/yandex/link")
async def yandex_link(
    account_id: Optional[int] = Query(None),
    state: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Редирект на Yandex OAuth."""
    from app.services.settings_service import SettingsService
    vals = await SettingsService.get_many(db, ["yandex_client_id", "yandex_redirect_uri"])
    client_id = vals.get("yandex_client_id")
    redirect_uri = vals.get("yandex_redirect_uri") or f"{settings.api_url}/api/auth/yandex/callback"
    
    if not client_id:
        raise HTTPException(status_code=400, detail="Yandex OAuth не настроен")
    
    state_data = state or ""
    if account_id:
        state_data = f"account_{account_id}"
    
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "login:email login:info",
        "state": state_data,
    }
    url = "https://oauth.yandex.ru/authorize?" + "&".join(f"{k}={v}" for k, v in params.items())
    return RedirectResponse(url=url)


@router.get("/yandex/callback")
async def yandex_callback(
    code: str = Query(...),
    state: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Callback от Yandex OAuth."""
    import httpx
    from app.services.settings_service import SettingsService
    
    vals = await SettingsService.get_many(db, ["yandex_client_id", "yandex_client_secret", "yandex_redirect_uri"])
    client_id = vals.get("yandex_client_id")
    client_secret = vals.get("yandex_client_secret")
    redirect_uri = vals.get("yandex_redirect_uri") or f"{settings.api_url}/api/auth/yandex/callback"
    
    if not client_id or not client_secret:
        raise HTTPException(status_code=400, detail="Yandex OAuth не настроен")
    
    # Обменяем code на токен
    async with httpx.AsyncClient() as client:
        resp = await client.post("https://oauth.yandex.ru/token", data={
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        })
        token_data = resp.json()
        print(f"DEBUG Yandex token response: {token_data}")
    
    if "access_token" not in token_data:
        error_desc = token_data.get("error_description", token_data.get("error", "unknown"))
        raise HTTPException(status_code=400, detail=f"Yandex OAuth: {error_desc}")
    
    # Получим информацию о пользователе
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://login.yandex.ru/info",
            headers={"Authorization": f"OAuth {token_data['access_token']}"}
        )
        user_info = resp.json()
    
    email = user_info.get("default_email")
    provider_user_id = str(user_info.get("id"))
    
    # Найдём существующую привязку
    existing_identity = await db.execute(
        select(UserIdentity).where(
            UserIdentity.provider == "yandex",
            UserIdentity.provider_user_id == provider_user_id,
        )
    )
    existing_link = existing_identity.scalar_one_or_none()
    
    if state and state.startswith("account_"):
        existing_account_id = int(state.split("_")[1])
        
        # Проверяем не привязан ли уже к другому аккаунту
        if existing_link and existing_link.local_account_id != existing_account_id:
            return RedirectResponse(url=f"{settings.web_url}/account?error=already_linked_to_other")
        
        existing = await AccountService.get_by_id(db, existing_account_id)
        if existing:
            if not existing_link:
                await AccountService.link_oauth(
                    db, existing, "yandex", provider_user_id,
                    email=email,
                    access_token=token_data.get("access_token"),
                    refresh_token=token_data.get("refresh_token"),
                )
            else:
                existing_link.access_token = token_data.get("access_token")
                existing_link.refresh_token = token_data.get("refresh_token")
            await db.commit()
            return RedirectResponse(url=f"{settings.web_url}/account?success=yandex_linked")
    
    if existing_link:
        account = await AccountService.get_by_id(db, existing_link.local_account_id)
        existing_link.access_token = token_data.get("access_token")
        existing_link.refresh_token = token_data.get("refresh_token")
        await db.commit()
    else:
        # Проверяем нужно ли приглашение для регистрации
        invite_only = await SettingsService.get(db, "registration_by_invite_only")
        if invite_only == "true":
            from app.domain.models import TeamInvite
            from datetime import datetime
            invite = await db.execute(
                select(TeamInvite).where(
                    TeamInvite.email == email,
                    TeamInvite.is_active == True,
                    TeamInvite.used_at == None,
                    (TeamInvite.expires_at == None) | (TeamInvite.expires_at > datetime.utcnow()),
                )
            )
            invite_obj = invite.scalar_one_or_none()
            if not invite_obj:
                return RedirectResponse(url=f"{settings.web_url}/login?error=invite_required")
            invite_obj.used_at = datetime.utcnow()
        
        account = await AccountService.create_account(
            db, email=email,
            display_name=user_info.get("display_name") or user_info.get("real_name") or email,
            first_name=user_info.get("first_name", ""),
            last_name=user_info.get("last_name"),
        )
        await AccountService.link_oauth(
            db, account, "yandex", provider_user_id,
            email=email,
            access_token=token_data.get("access_token"),
            refresh_token=token_data.get("refresh_token"),
        )
        await db.commit()
    
    tokens = AccountService.generate_jwt(account.id, "yandex")
    return RedirectResponse(
        url=f"{settings.web_url}/login#access_token={tokens['access_token']}&refresh_token={tokens['refresh_token']}&account_id={account.id}"
    )


# ============= TEAM ENDPOINTS =============

@router.get("/team")
async def get_team_members(db: AsyncSession = Depends(get_db)):
    """Получить список участников команды."""
    result = await db.execute(
        select(TeamMember).order_by(TeamMember.joined_at)
    )
    members = result.scalars().all()
    
    # Get user info for each member
    response = []
    for m in members:
        user_result = await db.execute(select(LocalAccount).where(LocalAccount.id == m.telegram_user_id))
        user = user_result.scalar_one_or_none()
        response.append({
            "id": m.id,
            "telegram_user_id": m.telegram_user_id,
            "role": m.role,
            "joined_at": m.joined_at.isoformat() if m.joined_at else None,
            "invited_by_id": m.invited_by_id,
            "user": {
                "id": user.id,
                "username": user.username,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "display_name": user.display_name,
            } if user else None,
        })
    return response
