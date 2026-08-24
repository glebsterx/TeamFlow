"""FastAPI web application."""
from fastapi import FastAPI, Request, Depends
from fastapi.responses import JSONResponse
import time
from app.config import settings, get_base_url_async, get_frontend_port_async
from app.core.logging import get_logger
from app.core.deps import get_current_account_id
from app.services.settings_service import SettingsService

logger = get_logger(__name__)
from app.web.routes import router as api_router, public_router as api_public_router
from app.web.routes_tags import router as tags_router
from app.web.routes_templates import router as templates_router
from app.web.routes_webapp import router as webapp_router
from app.web.routes_webhooks import router as webhooks_router
from app.web.routes_auth import router as auth_router
from app.web.routes_system_settings import router as system_settings_router
from app.web.routes_events import router as events_router
from app.web.routes_knowledge_base import router as knowledge_base_router
from app.web.routes_meetings import router as meetings_router
from app.web.routes_projects import router as projects_router
from app.web.routes_sprints import router as sprints_router
from app.web.routes_push import router as push_router
from app.web.routes_ai import router as ai_router

app = FastAPI(
    title="TeamFlow API",
    version=settings.VERSION,
    description="TeamFlow API for task management"
)

_cors_origins_cache: list[str] = []


class DynamicCORSMiddleware:
    """ASGI middleware that adds CORS headers dynamically."""
    
    def __init__(self, app):
        self.app = app
    
    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        
        try:
            origins = get_cors_origins()
        except Exception:
            origins = ["http://localhost:5180"]
        headers = {k.decode(): v.decode() for k, v in scope.get("headers", [])}
        origin = headers.get("origin", "")
        
        async def send_with_cors(message):
            if message["type"] == "http.response.start":
                resp_headers = list(message["headers"])
                # Simple: use origin from request
                if origin:
                    resp_origin = origin
                elif origins:
                    resp_origin = origins[0] if origins else "*"
                else:
                    resp_origin = "*"
                resp_headers.extend([
                    (b"access-control-allow-origin", resp_origin.encode()),
                    (b"access-control-allow-credentials", b"true"),
                    (b"access-control-allow-methods", b"GET,POST,PUT,PATCH,DELETE,OPTIONS"),
                    (b"access-control-allow-headers", b"*"),
                ])
                message = {**message, "headers": resp_headers}
            await send(message)
        
        await self.app(scope, receive, send_with_cors)


app = FastAPI(
    title="TeamFlow API",
    version=settings.VERSION,
    description="TeamFlow API for task management"
)

# Add CORS middleware BEFORE routes - it will check origins at runtime
app.add_middleware(DynamicCORSMiddleware)


async def load_cors_origins():
    """Load CORS origins from DB with smart fallbacks."""
    global _cors_origins_cache
    from app.core.db import AsyncSessionLocal
    
    # Default origins for fallback
    origins = ["http://localhost:5180", "https://localhost:5180"]
    errors = []
    
    try:
        async with AsyncSessionLocal() as db:
            cors_db = await SettingsService.get(db, "cors_origins")
            if cors_db:
                origins = [o.strip() for o in cors_db.replace("\n", ",").split(",") if o.strip()]
    except Exception as e:
        errors.append(f"БД недоступна: {e}")
    
    try:
        base = await get_base_url_async()
        port = await get_frontend_port_async()
        if not base or base == "http://localhost":
            errors.append(f"BASE_URL не настроен (текущий: {base}). Настройте в Setup Wizard.")
        
        localhost_defaults = [f"http://localhost:{port}", f"https://localhost:{port}"]
        for o in localhost_defaults:
            if o and o not in origins:
                origins.insert(0, o)
        
        if base:
            origins.append(base)
            origins.append(f"{base}:{port}")
            # Also add without port for convenience (HTTPS = 443, HTTP = 80)
            clean_base = base.replace("https://", "").replace("http://", "").rstrip("/")
            origins.append(clean_base)
            if clean_base:
                origins.append(f"https://{clean_base}")
                origins.append(f"http://{clean_base}")
    except Exception as e:
        errors.append(f"Ошибка读取 base_url: {e}")
    
    _cors_origins_cache = origins
    
    if errors:
        logger.warning("cors_config_issues", errors=errors)
        for err in errors:
            logger.warning(err)
    else:
        logger.info("cors_origins_loaded", origins=_cors_origins_cache)


def get_cors_origins() -> list[str]:
    """Get CORS origins from cache."""
    if _cors_origins_cache:
        return _cors_origins_cache
    from app.config import get_web_url_cached
    return [get_web_url_cached(), settings.BASE_URL or "http://localhost", "http://localhost:5180"]


async def reload_cors_origins():
    """Reload CORS origins from DB (called after settings save)."""
    await load_cors_origins()
    logger.info("cors_origins_reloaded", origins=_cors_origins_cache)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Return AI errors as JSON, not 500."""
    if "Лимит" in str(exc) or "AI" in str(type(exc).__name__):
        return JSONResponse(status_code=400, content={"detail": str(exc)})
    raise exc


# Frontend-only paths (no API key required)
FRONTEND_PATHS = [
    "/api/auth/local/login",
    "/api/auth/local/register",
    "/api/auth/telegram",
    "/api/auth/google/link",
    "/api/auth/google/callback",
    "/api/auth/yandex/link",
    "/api/auth/yandex/callback",
    "/api/auth/pending-login",
    "/api/auth/refresh",
    "/api/auth/has-users",
    "/api/auth/oauth-providers",
    "/api/auth/registration-settings",
    "/api/auth/notification-settings",
    "/api/push/config",
    "/api/push/subscribe",
    "/api/push/unsubscribe",
    "/api/settings/startup-check",
    "/api/settings/config-status",
    "/api/bot-info",
    "/api/events",
    "/api/events/enabled",
    "/api/ideas",
    "/api/knowledge-base",
    "/api/bot-info",
    "/api/users",
    "/api/stats",
    "/health",
    "/",
    "/docs",
    "/openapi.json",
]


def is_frontend_api_path(path: str) -> bool:
    """Check if this is an API path that frontend uses."""
    # Allow all standard CRUD paths that frontend uses
    if "/api/" not in path:
        return False
    if path.startswith("/api/tasks"):
        return True
    if path.startswith("/api/projects"):
        return True
    if path.startswith("/api/backlog"):
        return True
    if path.startswith("/api/archive"):
        return True
    if path.startswith("/api/meetings"):
        return True
    if path.startswith("/api/sprints"):
        return True
    if path.startswith("/api/tags"):
        return True
    return False


def is_frontend_request(request: Request) -> bool:
    """Check if request is from frontend (no API key required)."""
    if request.headers.get("authorization", "").startswith("Bearer "):
        return True
    origin = request.headers.get("origin", "")
    referer = request.headers.get("referer", "")
    allowed_origins = get_cors_origins()
    for allowed in allowed_origins:
        if allowed and (origin.startswith(allowed) or referer.startswith(allowed)):
            return True
    return False


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    path = request.url.path
    
    response = await call_next(request)
    
    process_time = time.time() - start_time
    logger.debug("http_response", method=request.method, path=path, status_code=response.status_code, duration_ms=round(process_time * 1000))
    
    return response


@app.on_event("startup")
async def on_app_startup():
    """Load CORS origins from DB at startup."""
    await load_cors_origins()
    logger.info("cors_origins_ready", origins=get_cors_origins())


# Handle CORS preflight
@app.options("/{path:path}")
async def handle_options(path: str):
    """Handle CORS preflight."""
    from fastapi.responses import Response
    return Response(status_code=200)


# Routers that require a logged-in account (valid JWT access token).
_auth_dep = [Depends(get_current_account_id)]

app.include_router(api_public_router, prefix="/api")
app.include_router(api_router, prefix="/api", dependencies=_auth_dep)
app.include_router(tags_router, prefix="/api", dependencies=_auth_dep)
app.include_router(templates_router, prefix="/api", dependencies=_auth_dep)
app.include_router(knowledge_base_router, prefix="/api", dependencies=_auth_dep)
app.include_router(meetings_router, prefix="/api", dependencies=_auth_dep)
app.include_router(projects_router, prefix="/api", dependencies=_auth_dep)
app.include_router(sprints_router, prefix="/api", dependencies=_auth_dep)
app.include_router(push_router, prefix="/api", dependencies=_auth_dep)
app.include_router(ai_router, prefix="/api", dependencies=_auth_dep)
# webapp_router: Telegram Mini App bootstrap — used inside Telegram before any
# web session/JWT exists (auth is done via telegram_id / Telegram WebApp
# context, not a Bearer token). Left public on purpose.
app.include_router(webapp_router, prefix="/api")
# webhooks_router only exposes webhook *management* CRUD (no public inbound
# delivery/receiver endpoint here) — require login for all of it.
app.include_router(webhooks_router, prefix="/api", dependencies=_auth_dep)
# auth_router is mixed public (login/register/oauth) + private (profile,
# settings, admin) — gated per-route inside routes_auth.py instead.
app.include_router(auth_router, prefix="/api/auth")
# system_settings_router is mixed public (startup-check, used by the Setup
# Wizard/Welcome page before any account exists) + private (bot token, system
# config) — gated per-route inside routes_system_settings.py instead.
app.include_router(system_settings_router, prefix="/api/settings")
app.include_router(events_router, prefix="/api/events", dependencies=_auth_dep)


@app.get("/")
def root():
    """Root endpoint."""
    return {
        "name": settings.APP_NAME,
        "version": settings.VERSION,
        "docs": "/docs"
    }


@app.get("/health")
def health():
    """Health check."""
    return {"status": "healthy"}


@app.get("/telegram-widget")
async def telegram_widget():
    """Страница с Telegram Login Widget для popup."""
    from fastapi.responses import HTMLResponse
    html = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Telegram Login</title>
    <style>
        body {{ display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f9fafb; }}
    </style>
</head>
<body>
    <script async src="https://telegram.org/js/telegram-widget.js?23"
        data-telegram-login="{settings.TELEGRAM_BOT_USERNAME}"
        data-size="large"
        data-onauth="onTelegramAuth(user)"
        data-request-access="write">
    </script>
    <script>
        function onTelegramAuth(user) {{
            if (window.opener) {{
                window.opener.postMessage({{ type: 'telegram-auth', user }}, '*');
                window.close();
            }}
        }}
    </script>
</body>
</html>"""
    return HTMLResponse(content=html)
