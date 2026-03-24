"""Domain models."""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, BigInteger, Boolean, Table
from sqlalchemy.orm import relationship, backref, Mapped, mapped_column
from app.core.db import Base
from app.domain.enums import TaskStatus, TaskSource, TaskPriority

# M2M table: task ↔ tag
task_tags = Table(
    "task_tags",
    Base.metadata,
    Column("task_id", Integer, ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", Integer, ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Tag(Base):
    """Тег/метка для поперечной категоризации задач."""
    __tablename__ = "tags"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(50), nullable=False, unique=True)
    color = Column(String(7), nullable=False, default="#6366f1")  # hex color
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    tasks = relationship("Task", secondary=task_tags, back_populates="tags")

    def __repr__(self):
        return f"<Tag(id={self.id}, name='{self.name}')>"


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

    # Recurrence — повторяющиеся задачи
    recurrence = Column(String(20), nullable=True)  # daily / weekly / monthly / None
    recurrence_end_date = Column(DateTime, nullable=True)  # до какой даты повторять

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
    tags = relationship("Tag", secondary="task_tags", back_populates="tasks")
    dependencies = relationship("TaskDependency", foreign_keys="TaskDependency.task_id", back_populates="task", cascade="all, delete-orphan")
    blocking = relationship("TaskDependency", foreign_keys="TaskDependency.depends_on_id", back_populates="depends_on", cascade="all, delete-orphan")

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
    """Meeting entity — v2."""
    __tablename__ = "meetings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    meeting_date = Column(DateTime, nullable=False)
    summary = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    # v2 fields
    title = Column(String(255), nullable=True)
    meeting_type = Column(String(30), nullable=True)  # standup/planning/retro/review/1:1/other
    duration_min = Column(Integer, nullable=True)
    agenda = Column(Text, nullable=True)  # JSON list of agenda items

    # Relationships v2
    projects = relationship("MeetingProject", back_populates="meeting", cascade="all, delete-orphan")
    participants = relationship("MeetingParticipant", back_populates="meeting", cascade="all, delete-orphan")
    meeting_tasks = relationship("MeetingTask", back_populates="meeting", cascade="all, delete-orphan")


class MeetingProject(Base):
    """M2M: meeting ↔ project."""
    __tablename__ = "meeting_projects"

    id = Column(Integer, primary_key=True, autoincrement=True)
    meeting_id = Column(Integer, ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)

    meeting = relationship("Meeting", back_populates="projects")
    project = relationship("Project")


class MeetingParticipant(Base):
    """Meeting participant — telegram user or external name."""
    __tablename__ = "meeting_participants"

    id = Column(Integer, primary_key=True, autoincrement=True)
    meeting_id = Column(Integer, ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False)
    telegram_user_id = Column(Integer, ForeignKey("telegram_users.id", ondelete="SET NULL"), nullable=True)
    display_name = Column(String(100), nullable=False)  # always stored for display

    meeting = relationship("Meeting", back_populates="participants")
    user = relationship("TelegramUser")


class MeetingTask(Base):
    """M2M: meeting ↔ task (action items born in meeting)."""
    __tablename__ = "meeting_tasks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    meeting_id = Column(Integer, ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)

    meeting = relationship("Meeting", back_populates="meeting_tasks")
    task = relationship("Task")


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
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    status = Column(String(20), nullable=False, default="planned")  # planned/active/completed/archived
    position = Column(Integer, nullable=False, default=0)  # Explicit ordering
    is_deleted = Column(Boolean, default=False)  # Soft delete
    start_date = Column(DateTime, nullable=False)
    end_date = Column(DateTime, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    tasks = relationship("SprintTask", back_populates="sprint", cascade="all, delete-orphan")
    project = relationship("Project")

    def __repr__(self):
        return f"<Sprint(id={self.id}, name='{self.name}', status='{self.status}')>"

    @property
    def is_active(self):
        """Legacy alias for Pydantic compatibility."""
        return self.status == 'active'


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


class TaskDependency(Base):
    """Явная зависимость: task_id зависит от depends_on_id (depends_on блокирует task)."""
    __tablename__ = "task_dependencies"

    id = Column(Integer, primary_key=True, autoincrement=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    depends_on_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    task = relationship("Task", foreign_keys=[task_id], back_populates="dependencies")
    depends_on = relationship("Task", foreign_keys=[depends_on_id], back_populates="blocking")


class DeadlineNotification(Base):
    """Лог отправленных уведомлений о дедлайнах — предотвращает дубли."""
    __tablename__ = "deadline_notifications"

    id = Column(Integer, primary_key=True, autoincrement=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    threshold_hours = Column(Integer, nullable=False)  # За сколько часов отправили (3, 24, ...)
    sent_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    user_telegram_id = Column(BigInteger, nullable=False)

    __table_args__ = (
        # Один порог — одно уведомление на задачу
        {"sqlite_autoincrement": True},
    )


class BotHeartbeat(Base):
    """Heartbeat бота — пишется ботом, читается API. Одна запись с id=1."""
    __tablename__ = "bot_heartbeat"

    id = Column(Integer, primary_key=True, default=1)
    last_seen = Column(DateTime, nullable=False, default=datetime.utcnow)
    username = Column(String(100), nullable=True)
    started_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class AppSetting(Base):
    """Настройки приложения — key-value хранилище."""
    __tablename__ = "app_settings"

    key = Column(String(100), primary_key=True)
    value = Column(Text, nullable=True)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<AppSetting(key='{self.key}', value='{self.value[:50] if self.value else None}')>"
