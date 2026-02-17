"""Domain models."""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, BigInteger, Boolean
from sqlalchemy.orm import relationship
from app.core.db import Base
from app.domain.enums import TaskStatus, TaskSource


class TelegramUser(Base):
    """Telegram user — создаётся автоматически при первом контакте с ботом."""

    __tablename__ = "telegram_users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    telegram_id = Column(BigInteger, unique=True, nullable=False, index=True)
    username = Column(String(100), nullable=True)   # @username (может не быть)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Задачи назначенные на этого пользователя
    assigned_tasks = relationship("Task", back_populates="assignee", foreign_keys="Task.assignee_id")

    @property
    def display_name(self) -> str:
        """Имя для отображения."""
        if self.username:
            return f"@{self.username}"
        if self.last_name:
            return f"{self.first_name} {self.last_name}"
        return self.first_name

    def __repr__(self) -> str:
        return f"<TelegramUser(id={self.telegram_id}, name='{self.display_name}')>"


class Task(Base):
    """Task entity."""

    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)

    # Assignee — FK на TelegramUser
    assignee_id = Column(Integer, ForeignKey("telegram_users.id"), nullable=True)
    # Оставляем для обратной совместимости
    assignee_name = Column(String(100), nullable=True)
    assignee_telegram_id = Column(BigInteger, nullable=True)

    # Status and dates
    status = Column(String(20), nullable=False, default=TaskStatus.TODO.value)
    due_date = Column(DateTime, nullable=True)
    definition_of_done = Column(Text, nullable=True)

    # Source tracking
    source = Column(String(20), nullable=False)
    source_message_id = Column(Integer, nullable=True)
    source_chat_id = Column(BigInteger, nullable=True)

    # Timestamps
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    assignee = relationship("TelegramUser", back_populates="assigned_tasks", foreign_keys=[assignee_id])
    blockers = relationship("Blocker", back_populates="task", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Task(id={self.id}, title='{self.title}', status='{self.status}')>"


class Blocker(Base):
    """Blocker entity."""

    __tablename__ = "blockers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False)
    text = Column(Text, nullable=False)
    created_by = Column(BigInteger, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    task = relationship("Task", back_populates="blockers")


class Meeting(Base):
    """Meeting entity."""

    __tablename__ = "meetings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    meeting_date = Column(DateTime, nullable=False)
    summary = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
