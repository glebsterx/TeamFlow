"""Domain models."""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, BigInteger, Boolean
from sqlalchemy.orm import relationship, backref, Mapped, mapped_column
from app.core.db import Base
from app.domain.enums import TaskStatus, TaskSource, TaskPriority


class Project(Base):
    """Проект/направление — группировка задач."""
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False, unique=True)
    description = Column(Text, nullable=True)
    emoji = Column(String(10), nullable=True, default="📁")
    is_active = Column(Boolean, default=True)
    deleted = Column(Boolean, default=False, nullable=False)  # Soft delete
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    # Nested projects (subprojects)
    parent_project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    subprojects = relationship("Project", backref=backref("parent", remote_side="Project.id"))

    tasks = relationship("Task", back_populates="project")

    def __repr__(self):
        return f"<Project(id={self.id}, name='{self.name}')>"


class TelegramUser(Base):
    """Telegram user."""
    __tablename__ = "telegram_users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    telegram_id = Column(BigInteger, unique=True, nullable=False, index=True)
    username = Column(String(100), nullable=True)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    assigned_tasks = relationship("Task", back_populates="assignee", foreign_keys="Task.assignee_id")

    @property
    def display_name(self) -> str:
        if self.username:
            return f"@{self.username}"
        if self.last_name:
            return f"{self.first_name} {self.last_name}"
        return self.first_name

    def __repr__(self):
        return f"<TelegramUser(id={self.telegram_id}, name='{self.display_name}')>"


class Task(Base):
    """Task entity."""
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)

    # Project
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)

    # Assignee
    assignee_id = Column(Integer, ForeignKey("telegram_users.id"), nullable=True)
    assignee_name = Column(String(100), nullable=True)
    assignee_telegram_id = Column(BigInteger, nullable=True)

    # Subtasks
    parent_task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True)

    # Status and dates
    status = Column(String(20), nullable=False, default=TaskStatus.TODO.value)
    priority = Column(String(10), nullable=False, default=TaskPriority.NORMAL.value)
    due_date = Column(DateTime, nullable=True)
    definition_of_done = Column(Text, nullable=True)

    # Source tracking
    source = Column(String(20), nullable=False)
    source_message_id = Column(Integer, nullable=True)
    source_chat_id = Column(BigInteger, nullable=True)

    # Archive / Soft delete
    archived = Column(Boolean, default=False, nullable=False)
    deleted = Column(Boolean, default=False, nullable=False)

    # Backlog
    backlog = Column(Boolean, default=False, nullable=False)
    backlog_added_at = Column(DateTime, nullable=True)

    # Timestamps
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    # Relationships
    project = relationship("Project", back_populates="tasks")
    assignee = relationship("TelegramUser", back_populates="assigned_tasks", foreign_keys=[assignee_id])
    blockers = relationship("Blocker", back_populates="task", cascade="all, delete-orphan")
    comments = relationship("Comment", back_populates="task", cascade="all, delete-orphan", order_by="Comment.created_at")
    subtasks = relationship(
        "Task",
        backref=backref("parent_task", remote_side="Task.id"),
        foreign_keys="Task.parent_task_id",
    )

    def __repr__(self):
        return f"<Task(id={self.id}, title='{self.title}', status='{self.status}')>"


class Blocker(Base):
    """Blocker entity."""
    __tablename__ = "blockers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False)
    text = Column(Text, nullable=False)
    created_by = Column(BigInteger, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)  # When the blocker was resolved (status changed from BLOCKED)

    task = relationship("Task", back_populates="blockers")


class Comment(Base):
    """Comment on a task."""
    __tablename__ = "comments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False)
    text = Column(Text, nullable=False)
    author_name = Column(String(100), nullable=True)
    author_telegram_id = Column(BigInteger, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    task = relationship("Task", back_populates="comments")


class Meeting(Base):
    """Meeting entity."""
    __tablename__ = "meetings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    meeting_date = Column(DateTime, nullable=False)
    summary = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class PushSubscription(Base):
    """Web Push subscription (VAPID)."""
    __tablename__ = "push_subscriptions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    endpoint = Column(Text, nullable=False, unique=True)
    p256dh = Column(Text, nullable=False)
    auth = Column(Text, nullable=False)
    user_telegram_id = Column(BigInteger, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class Sprint(Base):
    """Sprint/Iteration for task planning."""
    __tablename__ = "sprints"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)  # Optional project association
    start_date = Column(DateTime, nullable=False)
    end_date = Column(DateTime, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    tasks = relationship("SprintTask", back_populates="sprint", cascade="all, delete-orphan")
    project = relationship("Project")

    def __repr__(self):
        return f"<Sprint(id={self.id}, name='{self.name}', start={self.start_date})>"


class SprintTask(Base):
    """Task in a sprint queue."""
    __tablename__ = "sprint_tasks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    sprint_id = Column(Integer, ForeignKey("sprints.id"), nullable=False)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False)
    position = Column(Integer, default=0)  # Order in sprint queue
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    sprint = relationship("Sprint", back_populates="tasks")
    task = relationship("Task")

    def __repr__(self):
        return f"<SprintTask(sprint={self.sprint_id}, task={self.task_id}, position={self.position})>"


class ApiKey(Base):
    """API key for external access."""
    __tablename__ = "api_keys"

    id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String(64), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    last_used_at = Column(DateTime, nullable=True)

    def __repr__(self):
        return f"<ApiKey(id={self.id}, name='{self.name}')>"
