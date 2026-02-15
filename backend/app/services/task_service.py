from typing import Optional
from uuid import UUID
from sqlalchemy.orm import Session, joinedload
from app.models.task import Task, TaskStatus, TaskPriority
from app.schemas.task import TaskCreate, TaskUpdate


class TaskService:
    @staticmethod
    def get_by_id(db: Session, task_id: UUID, with_users: bool = False) -> Optional[Task]:
        """Get task by ID."""
        query = db.query(Task).filter(Task.id == task_id)
        
        if with_users:
            query = query.options(joinedload(Task.creator), joinedload(Task.assignee))
        
        return query.first()
    
    @staticmethod
    def get_all(
        db: Session,
        skip: int = 0,
        limit: int = 100,
        status: Optional[TaskStatus] = None,
        priority: Optional[TaskPriority] = None,
        assignee_id: Optional[UUID] = None,
        creator_id: Optional[UUID] = None,
        with_users: bool = False
    ) -> list[Task]:
        """Get all tasks with optional filters."""
        query = db.query(Task)
        
        if status:
            query = query.filter(Task.status == status)
        if priority:
            query = query.filter(Task.priority == priority)
        if assignee_id:
            query = query.filter(Task.assignee_id == assignee_id)
        if creator_id:
            query = query.filter(Task.creator_id == creator_id)
        
        if with_users:
            query = query.options(joinedload(Task.creator), joinedload(Task.assignee))
        
        return query.order_by(Task.created_at.desc()).offset(skip).limit(limit).all()
    
    @staticmethod
    def create(db: Session, task_create: TaskCreate, creator_id: UUID) -> Task:
        """Create new task."""
        db_task = Task(
            **task_create.model_dump(),
            creator_id=creator_id
        )
        
        db.add(db_task)
        db.commit()
        db.refresh(db_task)
        return db_task
    
    @staticmethod
    def update(db: Session, task_id: UUID, task_update: TaskUpdate) -> Optional[Task]:
        """Update task."""
        db_task = TaskService.get_by_id(db, task_id)
        if not db_task:
            return None
        
        update_data = task_update.model_dump(exclude_unset=True)
        
        for field, value in update_data.items():
            setattr(db_task, field, value)
        
        db.commit()
        db.refresh(db_task)
        return db_task
    
    @staticmethod
    def delete(db: Session, task_id: UUID) -> bool:
        """Delete task."""
        db_task = TaskService.get_by_id(db, task_id)
        if not db_task:
            return False
        
        db.delete(db_task)
        db.commit()
        return True
    
    @staticmethod
    def get_user_tasks(
        db: Session,
        user_id: UUID,
        include_created: bool = True,
        include_assigned: bool = True,
        status: Optional[TaskStatus] = None
    ) -> list[Task]:
        """Get all tasks related to a user (created or assigned)."""
        query = db.query(Task)
        
        filters = []
        if include_created:
            filters.append(Task.creator_id == user_id)
        if include_assigned:
            filters.append(Task.assignee_id == user_id)
        
        if filters:
            query = query.filter(db.or_(*filters))
        
        if status:
            query = query.filter(Task.status == status)
        
        return query.order_by(Task.created_at.desc()).all()
