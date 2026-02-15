from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field
from app.models.task import TaskStatus, TaskPriority


# Base schemas
class TaskBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    status: TaskStatus = TaskStatus.TODO
    priority: TaskPriority = TaskPriority.MEDIUM
    assignee_id: Optional[UUID] = None
    due_date: Optional[datetime] = None


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    status: Optional[TaskStatus] = None
    priority: Optional[TaskPriority] = None
    assignee_id: Optional[UUID] = None
    due_date: Optional[datetime] = None


# Response schemas
class Task(TaskBase):
    id: UUID
    creator_id: UUID
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


# Extended response with user details
class TaskWithUsers(Task):
    creator: Optional["UserShort"] = None
    assignee: Optional["UserShort"] = None


class UserShort(BaseModel):
    id: UUID
    username: str
    full_name: Optional[str] = None
    
    class Config:
        from_attributes = True


# Update forward references
TaskWithUsers.model_rebuild()
