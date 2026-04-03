"""Domain enumerations."""
from enum import Enum


class TaskStatus(str, Enum):
    """Task status values."""
    TODO = "TODO"
    DOING = "DOING"
    DONE = "DONE"
    BLOCKED = "BLOCKED"
    ON_HOLD = "ON_HOLD"


class TaskSource(str, Enum):
    """Task creation source."""
    MANUAL_COMMAND = "MANUAL_COMMAND"
    CHAT_MESSAGE = "CHAT_MESSAGE"
    MEETING = "MEETING"


class TaskPriority(str, Enum):
    """Task priority levels."""
    URGENT = "URGENT"
    HIGH = "HIGH"
    NORMAL = "NORMAL"
    LOW = "LOW"


class SprintStatus(str, Enum):
    """Sprint status values."""
    PLANNED = "planned"
    ACTIVE = "active"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class TeamRole(str, Enum):
    """Роль участника команды."""
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"
    VIEWER = "viewer"
