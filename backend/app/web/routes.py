"""Web API routes (with simple password auth)."""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from app.core.db import get_db
from app.core.simple_auth import verify_password, create_simple_access_token, verify_simple_token, DEFAULT_PASSWORD_HASH
from app.services.task_service import TaskService
from app.domain.enums import TaskStatus
from app.web.schemas import TaskResponse, TaskDetailResponse, StatsResponse, BotInfoResponse
from app.config import settings

router = APIRouter()


class LoginRequest(BaseModel):
    """Login request with password."""
    password: str


class LoginResponse(BaseModel):
    """Login response with token."""
    access_token: str
    token_type: str = "bearer"


def get_current_user(authorization: Optional[str] = Header(None)) -> str:
    """Get current user from token."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    try:
        scheme, token = authorization.split()
        if scheme.lower() != "bearer":
            raise HTTPException(status_code=401, detail="Invalid authentication scheme")
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    
    username = verify_simple_token(token)
    if not username:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    return username


@router.get("/bot-info", response_model=BotInfoResponse)
async def get_bot_info():
    """Get bot information (public endpoint, no auth required)."""
    return BotInfoResponse(
        username=settings.TELEGRAM_BOT_USERNAME,
        bot_name=settings.APP_NAME
    )


@router.post("/auth/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    """Simple password authentication."""
    # Get password hash from env or use default
    password_hash = getattr(settings, 'WEB_PASSWORD_HASH', DEFAULT_PASSWORD_HASH)
    
    if not verify_password(request.password, password_hash):
        raise HTTPException(status_code=401, detail="Invalid password")
    
    access_token = create_simple_access_token("user")
    return LoginResponse(access_token=access_token)


@router.get("/me")
async def get_me(current_user: str = Depends(get_current_user)):
    """Get current user info."""
    return {
        "username": current_user,
        "authenticated": True
    }


@router.get("/tasks", response_model=List[TaskResponse])
async def get_tasks(
    status: Optional[TaskStatus] = None,
    assignee_telegram_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user)
):
    """Get all tasks with optional filters."""
    service = TaskService(db)
    tasks = await service.get_all_tasks(status, assignee_telegram_id)
    return tasks


@router.get("/tasks/{task_id}", response_model=TaskDetailResponse)
async def get_task(
    task_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user)
):
    """Get task by ID with full details."""
    service = TaskService(db)
    task = await service.get_task(task_id)
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return task


@router.get("/tasks/week/current", response_model=List[TaskResponse])
async def get_week_tasks(
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user)
):
    """Get tasks for current week."""
    service = TaskService(db)
    tasks = await service.get_week_tasks()
    return tasks


@router.get("/stats", response_model=StatsResponse)
async def get_stats(
    db: AsyncSession = Depends(get_db),
    current_user: str = Depends(get_current_user)
):
    """Get task statistics."""
    service = TaskService(db)
    tasks = await service.get_all_tasks()
    
    stats = {
        "total": len(tasks),
        "todo": len([t for t in tasks if t.status == TaskStatus.TODO.value]),
        "doing": len([t for t in tasks if t.status == TaskStatus.DOING.value]),
        "done": len([t for t in tasks if t.status == TaskStatus.DONE.value]),
        "blocked": len([t for t in tasks if t.status == TaskStatus.BLOCKED.value]),
    }
    
    return stats
