"""FastAPI web application."""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import time
from app.config import settings
from app.web.routes import router as api_router
from app.web.routes_tags import router as tags_router
from app.web.routes_templates import router as templates_router

app = FastAPI(
    title="TeamFlow API",
    version=settings.VERSION,
    description="TeamFlow API for task management"
)

# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    print(f"[REQUEST] {request.method} {request.url.path}")
    
    response = await call_next(request)
    
    process_time = time.time() - start_time
    print(f"[RESPONSE] {request.method} {request.url.path} - {response.status_code} - {process_time:.3f}s")
    
    return response

# CORS - allow all for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Разрешаем всё для отладки
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routes
app.include_router(api_router, prefix="/api")
app.include_router(tags_router, prefix="/api")
app.include_router(templates_router, prefix="/api")


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
