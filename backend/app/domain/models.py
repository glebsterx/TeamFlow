"""Domain models."""
from datetime import datetime
from app.core.clock import Clock
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
    created_at = Column(DateTime, nullable=False, default=Clock.now)

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
    created_at = Column(DateTime, nullable=False, default=Clock.now)

    # Nested projects (subprojects)
    parent_project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    subprojects = relationship("Project", backref=backref("parent", remote_side="Project.id"))

    tasks = relationship("Task", back_populates="project")

    def __repr__(self):
        return f"<Project(id={self.id}, name='{self.name}')>"


class TeamMember(Base):
    """Команда (team) — пользователи и их роли."""
    __tablename__ = "team_members"

    id = Column(Integer, primary_key=True, autoincrement=True)
    # Maps to local_accounts.id (column name kept for backward compatibility)
    telegram_user_id = Column(Integer, ForeignKey("local_accounts.id", ondelete="CASCADE"), nullable=False, unique=True)
    role = Column(String(20), nullable=False)  # owner / admin / member / viewer
    joined_at = Column(DateTime, nullable=False, default=Clock.now)
    invited_by_id = Column(Integer, ForeignKey("team_members.id"), nullable=True)

    user = relationship("LocalAccount", foreign_keys=[telegram_user_id])
    invited_by = relationship("TeamMember", remote_side=[id])

    def __repr__(self):
        return f"<TeamMember(id={self.id}, telegram_user_id={self.telegram_user_id}, role='{self.role}')>"


class TeamInvite(Base):
    """Приглашение в команду."""
    __tablename__ = "team_invites"

    id = Column(Integer, primary_key=True, autoincrement=True)
    invite_token = Column(String(64), nullable=False, unique=True, index=True)
    telegram_username = Column(String(100), nullable=True)
    email = Column(String(255), nullable=True)
    role = Column(String(20), nullable=False, default="member")
    created_by_id = Column(Integer, ForeignKey("team_members.id"), nullable=False)
    created_at = Column(DateTime, nullable=False, default=Clock.now)
    expires_at = Column(DateTime, nullable=False)
    is_active = Column(Boolean, default=True)
    used_at = Column(DateTime, nullable=True)
    used_by_telegram_id = Column(Integer, nullable=True)

    def __repr__(self):
        return f"<TeamInvite(token='{self.invite_token[:8]}...', role='{self.role}')>"


class ProjectMember(Base):
    """Член проекта — M2M пользователь ↔ проект."""
    __tablename__ = "project_members"

    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    # Maps to local_accounts.id (column name kept for backward compatibility)
    telegram_user_id = Column(Integer, ForeignKey("local_accounts.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(20), nullable=False, default="viewer")  # admin / editor / viewer
    created_at = Column(DateTime, nullable=False, default=Clock.now)

    project = relationship("Project")
    user = relationship("LocalAccount", foreign_keys=[telegram_user_id])

    def __repr__(self):
        return f"<ProjectMember(project_id={self.project_id}, telegram_user_id={self.telegram_user_id}, role='{self.role}')>"


class LocalAccount(Base):
    """Единый аккаунт пользователя."""
    __tablename__ = "local_accounts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    display_name = Column(String(100), nullable=True)
    first_name = Column(String(100), nullable=False, default="")
    last_name = Column(String(100), nullable=True)
    username = Column(String(100), nullable=True, index=True)
    email = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True)
    system_role = Column(String(20), nullable=False, default="user")  # admin / user
    timezone = Column(String(64), nullable=True)
    created_at = Column(DateTime, nullable=False, default=Clock.now)
    updated_at = Column(DateTime, nullable=False, default=Clock.now, onupdate=Clock.now)

    local_identity = relationship("LocalIdentity", back_populates="account", uselist=False)
    oauth_identities = relationship("UserIdentity", back_populates="account")
    # assigned_tasks = relationship("Task", back_populates="assignee", foreign_keys="Task.assignee_id")

    @property
    def display(self) -> str:
        if self.display_name:
            return self.display_name
        if self.username:
            return f"@{self.username}"
        if self.last_name:
            return f"{self.first_name} {self.last_name}"
        return self.first_name or f"User #{self.id}"

    def __repr__(self):
        return f"<LocalAccount(id={self.id}, display='{self.display}')>"


class LocalIdentity(Base):
    """Логин/пароль."""
    __tablename__ = "local_identities"

    id = Column(Integer, primary_key=True, autoincrement=True)
    local_account_id = Column(Integer, ForeignKey("local_accounts.id", ondelete="CASCADE"), nullable=False, unique=True)
    login = Column(String(100), nullable=False, unique=True, index=True)
    password_hash = Column(String(255), nullable=False)
    email = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, nullable=False, default=Clock.now)
    account = relationship("LocalAccount", back_populates="local_identity")


class UserIdentity(Base):
    """OAuth: telegram / google / yandex."""
    __tablename__ = "user_identities"

    id = Column(Integer, primary_key=True, autoincrement=True)
    local_account_id = Column(Integer, ForeignKey("local_accounts.id", ondelete="CASCADE"), nullable=False)
    provider = Column(String(20), nullable=False)
    provider_user_id = Column(String(255), nullable=False)
    email = Column(String(255), nullable=True)
    access_token = Column(Text, nullable=True)
    refresh_token = Column(Text, nullable=True)
    linked_at = Column(DateTime, nullable=False, default=Clock.now)
    account = relationship("LocalAccount", back_populates="oauth_identities")


class Task(Base):
    """Task entity."""
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)

    # Project
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True)

    # Assignee
    assignee_id = Column(Integer, ForeignKey("local_accounts.id"), nullable=True, index=True)
    assignee = relationship("LocalAccount", foreign_keys=[assignee_id])

    # Subtasks
    parent_task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True, index=True)

    # Status and dates
    status = Column(String(20), nullable=False, default=TaskStatus.TODO.value, index=True)
    priority = Column(String(10), nullable=False, default=TaskPriority.NORMAL.value, index=True)
    due_date = Column(DateTime, nullable=True, index=True)
    definition_of_done = Column(Text, nullable=True)

    # Source tracking
    source = Column(String(20), nullable=False)
    source_message_id = Column(Integer, nullable=True)
    source_chat_id = Column(BigInteger, nullable=True)

    # Archive / Soft delete
    archived = Column(Boolean, default=False, nullable=False)
    deleted = Column(Boolean, default=False, nullable=False)
    
    # Idea (not a regular task)
    is_idea = Column(Boolean, default=False, nullable=False, index=True)

    # Backlog
    backlog = Column(Boolean, default=False, nullable=False)
    backlog_added_at = Column(DateTime, nullable=True)

    # Recurrence — повторяющиеся задачи
    recurrence = Column(String(20), nullable=True)  # daily / weekly / monthly / None
    recurrence_end_date = Column(DateTime, nullable=True)  # до какой даты повторять

    # Time tracking — потраченное время в минутах
    time_spent = Column(Integer, default=0, nullable=False)

    # Timestamps
    created_at = Column(DateTime, nullable=False, default=Clock.now)
    updated_at = Column(DateTime, nullable=False, default=Clock.now, onupdate=Clock.now)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    # Relationships
    project = relationship("Project", back_populates="tasks")
    assignee = relationship("LocalAccount", foreign_keys=[assignee_id])
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
    created_at = Column(DateTime, nullable=False, default=Clock.now)
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
    created_at = Column(DateTime, nullable=False, default=Clock.now)

    task = relationship("Task", back_populates="comments")


class Meeting(Base):
    """Meeting entity — v2."""
    __tablename__ = "meetings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    meeting_date = Column(DateTime, nullable=False)
    summary = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False, default=Clock.now)

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
    """Meeting participant — local account or external name."""
    __tablename__ = "meeting_participants"

    id = Column(Integer, primary_key=True, autoincrement=True)
    meeting_id = Column(Integer, ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False)
    account_id = Column(Integer, ForeignKey("local_accounts.id", ondelete="SET NULL"), nullable=True)
    display_name = Column(String(100), nullable=False)  # always stored for display

    meeting = relationship("Meeting", back_populates="participants")
    account = relationship("LocalAccount")


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
    account_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, nullable=False, default=Clock.now)


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
    created_at = Column(DateTime, nullable=False, default=Clock.now)

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
    created_at = Column(DateTime, nullable=False, default=Clock.now)

    sprint = relationship("Sprint", back_populates="tasks")
    task = relationship("Task")

    def __repr__(self):
        return f"<SprintTask(sprint={self.sprint_id}, task={self.task_id}, position={self.position})>"


class ApiKey(Base):
    """API key for external access."""
    __tablename__ = "api_keys"

    id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String(64), unique=True, nullable=False, index=True)  # SHA256 hash of raw key
    key_prefix = Column(String(12), nullable=True)  # First 12 chars of raw key for display
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, nullable=False, default=Clock.now)
    last_used_at = Column(DateTime, nullable=True)

    def __repr__(self):
        return f"<ApiKey(id={self.id}, name='{self.name}')>"


class ApiKeyLog(Base):
    """Лог использования API-ключей."""
    __tablename__ = "api_key_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    api_key_id = Column(Integer, ForeignKey("api_keys.id", ondelete="CASCADE"), nullable=False)
    endpoint = Column(String(200), nullable=False)
    method = Column(String(10), nullable=False)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(255), nullable=True)
    created_at = Column(DateTime, nullable=False, default=Clock.now)

    api_key = relationship("ApiKey", backref="logs")

    def __repr__(self):
        return f"<ApiKeyLog(id={self.id}, api_key_id={self.api_key_id}, endpoint='{self.endpoint}')>"


class TaskDependency(Base):
    """Явная зависимость: task_id зависит от depends_on_id (depends_on блокирует task)."""
    __tablename__ = "task_dependencies"

    id = Column(Integer, primary_key=True, autoincrement=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    depends_on_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, nullable=False, default=Clock.now)

    task = relationship("Task", foreign_keys=[task_id], back_populates="dependencies")
    depends_on = relationship("Task", foreign_keys=[depends_on_id], back_populates="blocking")


class DeadlineNotification(Base):
    """Лог отправленных уведомлений о дедлайнах — предотвращает дубли."""
    __tablename__ = "deadline_notifications"

    id = Column(Integer, primary_key=True, autoincrement=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    threshold_hours = Column(Integer, nullable=False)  # За сколько часов отправили (3, 24, ...)
    sent_at = Column(DateTime, nullable=False, default=Clock.now)
    user_telegram_id = Column(BigInteger, nullable=False)

    __table_args__ = (
        # Один порог — одно уведомление на задачу
        {"sqlite_autoincrement": True},
    )


class BotHeartbeat(Base):
    """Heartbeat бота — пишется ботом, читается API. Одна запись с id=1."""
    __tablename__ = "bot_heartbeat"

    id = Column(Integer, primary_key=True, default=1)
    last_seen = Column(DateTime, nullable=False, default=Clock.now)
    username = Column(String(100), nullable=True)
    started_at = Column(DateTime, nullable=False, default=Clock.now)


class AppSetting(Base):
    """Настройки приложения — key-value хранилище."""
    __tablename__ = "app_settings"

    key = Column(String(100), primary_key=True)
    value = Column(Text, nullable=True)
    updated_at = Column(DateTime, nullable=False, default=Clock.now, onupdate=Clock.now)

    def __repr__(self):
        return f"<AppSetting(key='{self.key}', value='{self.value[:50] if self.value else None}')>"


class Webhook(Base):
    """Вебхук для внешних интеграций."""
    __tablename__ = "webhooks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    url = Column(Text, nullable=False)
    events = Column(Text, nullable=False)  # JSON array: ["task.created", "task.status_changed"]
    secret = Column(String(64), nullable=True)  # For HMAC signature
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, nullable=False, default=Clock.now)
    last_triggered_at = Column(DateTime, nullable=True)

    def __repr__(self):
        return f"<Webhook(id={self.id}, url='{self.url[:30]}...', events={self.events})>"


class WebhookLog(Base):
    """Лог вызовов вебхуков."""
    __tablename__ = "webhook_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    webhook_id = Column(Integer, ForeignKey("webhooks.id", ondelete="CASCADE"), nullable=False)
    event = Column(String(50), nullable=False)  # task.created, task.status_changed, etc.
    status_code = Column(Integer, nullable=True)
    response = Column(Text, nullable=True)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=Clock.now)

    webhook = relationship("Webhook", backref="logs")

    def __repr__(self):
        return f"<WebhookLog(id={self.id}, webhook_id={self.webhook_id}, event='{self.event}', status={self.status_code})>"


class DomainEvent(Base):
    """Domain events log for audit trail."""
    __tablename__ = "domain_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_type = Column(String(50), nullable=False)  # task.created, task.status_changed, etc.
    payload = Column(Text, nullable=False)  # JSON payload
    task_id = Column(Integer, nullable=True)  # Optional link to task
    created_at = Column(DateTime, nullable=False, default=Clock.now)

    def __repr__(self):
        return f"<DomainEvent(id={self.id}, type='{self.event_type}', task_id={self.task_id})>"


# ============= KNOWLEDGE BASE =============


class KnowledgeFolder(Base):
    """Папка/раздел в базе знаний."""
    __tablename__ = "knowledge_folders"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    parent_id = Column(Integer, ForeignKey("knowledge_folders.id", ondelete="CASCADE"), nullable=True)
    order = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, nullable=False, default=Clock.now)
    updated_at = Column(DateTime, nullable=False, default=Clock.now, onupdate=Clock.now)

    children = relationship("KnowledgeFolder", backref=backref("parent", remote_side=[id]), order_by="KnowledgeFolder.order")
    pages = relationship("KnowledgePage", back_populates="folder", cascade="all, delete-orphan", order_by="KnowledgePage.order")


class KnowledgePage(Base):
    """Страница/статья в базе знаний."""
    __tablename__ = "knowledge_pages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(200), nullable=False)
    content = Column(Text, nullable=True)  # Markdown content
    folder_id = Column(Integer, ForeignKey("knowledge_folders.id", ondelete="CASCADE"), nullable=True)
    order = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, nullable=False, default=Clock.now)
    updated_at = Column(DateTime, nullable=False, default=Clock.now, onupdate=Clock.now)

    folder = relationship("KnowledgeFolder", back_populates="pages")
