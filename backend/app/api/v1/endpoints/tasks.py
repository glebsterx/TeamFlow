from typing import Annotated, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.user import User
from app.models.task import TaskStatus, TaskPriority
from app.schemas.task import Task, TaskCreate, TaskUpdate, TaskWithUsers
from app.services.task_service import TaskService
from app.api.deps import get_current_user

router = APIRouter()


@router.get("/", response_model=list[TaskWithUsers])
def get_tasks(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    status: Optional[TaskStatus] = None,
    priority: Optional[TaskPriority] = None,
    assignee_id: Optional[UUID] = None,
    creator_id: Optional[UUID] = None,
):
    """Get all tasks with optional filters."""
    tasks = TaskService.get_all(
        db,
        skip=skip,
        limit=limit,
        status=status,
        priority=priority,
        assignee_id=assignee_id,
        creator_id=creator_id,
        with_users=True
    )
    return tasks


@router.get("/my", response_model=list[TaskWithUsers])
def get_my_tasks(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    status: Optional[TaskStatus] = None,
):
    """Get tasks created by or assigned to current user."""
    tasks = TaskService.get_user_tasks(
        db,
        user_id=current_user.id,
        status=status
    )
    return tasks


@router.get("/{task_id}", response_model=TaskWithUsers)
def get_task(
    task_id: UUID,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Get task by ID."""
    task = TaskService.get_by_id(db, task_id, with_users=True)
    
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    
    return task


@router.post("/", response_model=Task, status_code=status.HTTP_201_CREATED)
def create_task(
    task_create: TaskCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Create a new task."""
    task = TaskService.create(db, task_create, creator_id=current_user.id)
    return task


@router.put("/{task_id}", response_model=Task)
def update_task(
    task_id: UUID,
    task_update: TaskUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Update a task."""
    # Check if task exists
    existing_task = TaskService.get_by_id(db, task_id)
    if not existing_task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    
    # Update task
    task = TaskService.update(db, task_id, task_update)
    return task


@router.patch("/{task_id}", response_model=Task)
def patch_task(
    task_id: UUID,
    task_update: TaskUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Partially update a task."""
    # Check if task exists
    existing_task = TaskService.get_by_id(db, task_id)
    if not existing_task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    
    # Update task
    task = TaskService.update(db, task_id, task_update)
    return task


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    task_id: UUID,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Delete a task."""
    # Check if task exists
    existing_task = TaskService.get_by_id(db, task_id)
    if not existing_task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found"
        )
    
    # Only creator can delete task
    if existing_task.creator_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this task"
        )
    
    TaskService.delete(db, task_id)
    return None
