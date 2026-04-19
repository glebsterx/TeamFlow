"""FastAPI web application."""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
import time
from app.config import settings
from app.core.clock import Clock
from app.core.logging import get_logger

logger = get_logger(__name__)
from app.web.routes import router as api_router
from app.web.routes_tags import router as tags_router
from app.web.routes_templates import router as templates_router
from app.web.routes_webapp import router as webapp_router
from app.web.routes_webhooks import router as webhooks_router
from app.web.routes_auth import router as auth_router
from app.web.routes_system_settings import router as system_settings_router

app = FastAPI(
    title="TeamFlow API",
    version=settings.VERSION,
    description="TeamFlow API for task management"
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Return AI errors as JSON, not 500."""
    if "Лимит" in str(exc) or "AI" in str(type(exc).__name__):
        return JSONResponse(status_code=400, content={"detail": str(exc)})
    raise exc


# Auth routes that don't require API key
AUTH_PATHS = [
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
    "/api/bot-info",
    "/health",
    "/",
    "/docs",
    "/openapi.json",
]

def is_frontend_request(request: Request) -> bool:
    """Check if request is from frontend (no API key required)."""
    # Has JWT authorization header
    if request.headers.get("authorization", "").startswith("Bearer "):
        return True
    # Check Origin header matches frontend
    origin = request.headers.get("origin", "")
    referer = request.headers.get("referer", "")
    allowed_origins = [settings.web_url, settings.BASE_URL]
    for allowed in allowed_origins:
        if origin.startswith(allowed) or referer.startswith(allowed):
            return True
    return False

# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    path = request.url.path
    
    # Skip API key check for exact auth routes
    is_auth_path = path in AUTH_PATHS or any(path.startswith(p) for p in AUTH_PATHS if p != "/")
    
    if path.startswith("/api") and not is_auth_path:
        # Check if request is from frontend
        if not is_frontend_request(request):
            # Require API key
            api_key_header = request.headers.get("X-API-Key")
            if not api_key_header:
                return JSONResponse(
                    status_code=401,
                    content={"detail": "API ключ обязателен. Добавьте заголовок X-API-Key."}
                )
            
            # Validate API key
            from app.core.db import AsyncSessionLocal
            from app.domain.models import ApiKey, ApiKeyLog
            from app.core.security import hash_api_key
            from sqlalchemy import select
            
            key_hash = hash_api_key(api_key_header)
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(ApiKey).where(ApiKey.key == key_hash, ApiKey.is_active == True)
                )
                api_key = result.scalar_one_or_none()
                
                if not api_key:
                    return JSONResponse(
                        status_code=401,
                        content={"detail": "Неверный API ключ"}
                    )
                
                # Update last_used_at
                from datetime import datetime
                api_key.last_used_at = Clock.now()
                
                # Log the request
                log = ApiKeyLog(
                    api_key_id=api_key.id,
                    endpoint=path,
                    method=request.method,
                    ip_address=request.client.host if request.client else None,
                    user_agent=request.headers.get("user-agent"),
                )
                db.add(log)
                await db.commit()
    
    logger.debug("http_request", method=request.method, path=path)

    response = await call_next(request)

    process_time = time.time() - start_time
    logger.debug("http_response", method=request.method, path=path, status_code=response.status_code, duration_ms=round(process_time * 1000))
    
    return response

# CORS - restrict to allowed origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.web_url, settings.BASE_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routes
app.include_router(api_router, prefix="/api")
app.include_router(tags_router, prefix="/api")
app.include_router(templates_router, prefix="/api")
app.include_router(webapp_router, prefix="/api")
app.include_router(webhooks_router, prefix="/api")
app.include_router(auth_router, prefix="/api/auth")
app.include_router(system_settings_router, prefix="/api/settings")


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
