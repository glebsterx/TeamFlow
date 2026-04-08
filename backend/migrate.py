#!/usr/bin/env python3
"""One-shot migration script. Run inside container."""
import asyncio
import os
import sys

DB_URL = os.environ.get("DATABASE_URL", "sqlite+aiosqlite:///./data/teamflow.db")
DB_FILE = DB_URL.replace("sqlite+aiosqlite:///", "")

MIGRATIONS = [
    # (table, column, sql)
    ("tasks",          "assignee_id",           "ALTER TABLE tasks ADD COLUMN assignee_id INTEGER"),
    ("tasks",          "source_chat_id",         "ALTER TABLE tasks ADD COLUMN source_chat_id BIGINT"),
    ("tasks",          "started_at",             "ALTER TABLE tasks ADD COLUMN started_at DATETIME"),
    ("tasks",          "completed_at",           "ALTER TABLE tasks ADD COLUMN completed_at DATETIME"),
    ("tasks",          "archived",               "ALTER TABLE tasks ADD COLUMN archived BOOLEAN DEFAULT 0"),
    ("tasks",          "deleted",                "ALTER TABLE tasks ADD COLUMN deleted BOOLEAN DEFAULT 0"),
    ("tasks",          "due_date",               "ALTER TABLE tasks ADD COLUMN due_date DATETIME"),
    ("tasks",          "definition_of_done",     "ALTER TABLE tasks ADD COLUMN definition_of_done TEXT"),
    ("tasks",          "assignee_telegram_id",   "ALTER TABLE tasks ADD COLUMN assignee_telegram_id BIGINT"),
    ("tasks",          "parent_task_id",         "ALTER TABLE tasks ADD COLUMN parent_task_id INTEGER REFERENCES tasks(id)"),
    ("tasks",          "priority",               "ALTER TABLE tasks ADD COLUMN priority VARCHAR(10) DEFAULT 'NORMAL'"),
    ("tasks",          "backlog",                "ALTER TABLE tasks ADD COLUMN backlog BOOLEAN DEFAULT 0"),
    ("tasks",          "backlog_added_at",       "ALTER TABLE tasks ADD COLUMN backlog_added_at DATETIME"),
    ("telegram_users", None, """CREATE TABLE IF NOT EXISTS telegram_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id BIGINT NOT NULL UNIQUE,
        username VARCHAR(100),
        first_name VARCHAR(100) NOT NULL DEFAULT '',
        last_name VARCHAR(100),
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )"""),
    ("comments", None, """CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL REFERENCES tasks(id),
        text TEXT NOT NULL,
        author_name VARCHAR(100),
        author_telegram_id BIGINT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )"""),
    ("push_subscriptions", None, """CREATE TABLE IF NOT EXISTS push_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        user_telegram_id BIGINT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )"""),
    ("blockers", "resolved_at", "ALTER TABLE blockers ADD COLUMN resolved_at DATETIME"),
    ("projects", "parent_project_id", "ALTER TABLE projects ADD COLUMN parent_project_id INTEGER REFERENCES projects(id)"),
    ("tags", None, """CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(50) NOT NULL UNIQUE,
        color VARCHAR(7) NOT NULL DEFAULT '#6366f1',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )"""),
    ("task_tags", None, """CREATE TABLE IF NOT EXISTS task_tags (
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (task_id, tag_id)
    )"""),
    ("task_dependencies", None, """CREATE TABLE IF NOT EXISTS task_dependencies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        depends_on_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(task_id, depends_on_id)
    )"""),
    ("tasks", "recurrence", "ALTER TABLE tasks ADD COLUMN recurrence VARCHAR(20)"),
    ("tasks", "recurrence_end_date", "ALTER TABLE tasks ADD COLUMN recurrence_end_date DATETIME"),
    # Meetings v2
    ("meetings", "title",        "ALTER TABLE meetings ADD COLUMN title VARCHAR(255)"),
    ("meetings", "meeting_type", "ALTER TABLE meetings ADD COLUMN meeting_type VARCHAR(30)"),
    ("meetings", "duration_min", "ALTER TABLE meetings ADD COLUMN duration_min INTEGER"),
    ("meetings", "agenda",       "ALTER TABLE meetings ADD COLUMN agenda TEXT"),
    ("meeting_projects", None, """CREATE TABLE IF NOT EXISTS meeting_projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE
    )"""),
    ("meeting_participants", None, """CREATE TABLE IF NOT EXISTS meeting_participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
        telegram_user_id INTEGER REFERENCES telegram_users(id) ON DELETE SET NULL,
        display_name VARCHAR(100) NOT NULL
    )"""),
    ("meeting_tasks", None, """CREATE TABLE IF NOT EXISTS meeting_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE
    )"""),

    # bot_heartbeat — статус бота, пишется из процесса бота, читается API
    ("bot_heartbeat", None, """CREATE TABLE IF NOT EXISTS bot_heartbeat (
        id INTEGER PRIMARY KEY DEFAULT 1,
        last_seen DATETIME NOT NULL,
        username VARCHAR(100),
        started_at DATETIME NOT NULL
    )"""),
    # deadline_notifications — лог уведомлений о дедлайнах
    ("deadline_notifications", None, """CREATE TABLE IF NOT EXISTS deadline_notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        threshold_hours INTEGER NOT NULL,
        sent_at DATETIME NOT NULL,
        user_telegram_id BIGINT NOT NULL
    )"""),
    # webhooks — вебхуки для внешних интеграций
    ("webhooks", None, """CREATE TABLE IF NOT EXISTS webhooks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        events TEXT NOT NULL,
        secret VARCHAR(64),
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_triggered_at DATETIME
    )"""),
    # webhook_logs — логи вызовов вебхуков
    ("webhook_logs", None, """CREATE TABLE IF NOT EXISTS webhook_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        webhook_id INTEGER NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
        event TEXT NOT NULL,
        status_code INTEGER,
        response TEXT,
        error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )"""),
    # api_key_logs — логи использования API-ключей
    ("api_key_logs", None, """CREATE TABLE IF NOT EXISTS api_key_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        api_key_id INTEGER NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
        endpoint VARCHAR(200) NOT NULL,
        method VARCHAR(10) NOT NULL,
        ip_address VARCHAR(45),
        user_agent VARCHAR(255),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )"""),
    # time_spent — потраченное время на задачу (минуты)
    ("tasks", "time_spent", "ALTER TABLE tasks ADD COLUMN time_spent INTEGER DEFAULT 0"),
    # project_members — участники проекта
    ("project_members", None, """CREATE TABLE IF NOT EXISTS project_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        telegram_user_id INTEGER NOT NULL REFERENCES local_accounts(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL DEFAULT 'viewer',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )"""),
    # #260 — Индексы для оптимизации запросов
    (None, None, "CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)"),
    (None, None, "CREATE INDEX IF NOT EXISTS idx_tasks_assignee_id ON tasks(assignee_id)"),
    (None, None, "CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id)"),
    (None, None, "CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON tasks(parent_task_id)"),
    (None, None, "CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority)"),
    (None, None, "CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date)"),
    # Композитный индекс для частого запроса GET /api/tasks (фильтр по статусу + сортировка)
    (None, None, "CREATE INDEX IF NOT EXISTS idx_tasks_status_created ON tasks(status, created_at DESC)"),
    # Индекс для бэклога
    (None, None, "CREATE INDEX IF NOT EXISTS idx_tasks_backlog ON tasks(backlog, archived, deleted)"),
]

async def run():
    import aiosqlite

    if not os.path.exists(DB_FILE):
        print(f"DB not found: {DB_FILE}")
        sys.exit(1)

    async with aiosqlite.connect(DB_FILE) as db:
        # Текущие таблицы
        async with db.execute("SELECT name FROM sqlite_master WHERE type='table'") as cur:
            tables = {r[0] async for r in cur}
        print(f"Tables: {tables}")

        for table, column, sql in MIGRATIONS:
            # Для CREATE TABLE / CREATE INDEX — просто выполняем (IF NOT EXISTS защищает)
            if column is None:
                await db.execute(sql)
                target = table or "index"
                print(f"  ✓ Table/index {target} ensured")
                continue

            # Для ALTER TABLE — проверяем есть ли уже колонка
            async with db.execute(f"PRAGMA table_info({table})") as cur:
                cols = {r[1] async for r in cur}

            if column not in cols:
                await db.execute(sql)
                print(f"  ✓ Added {table}.{column}")
            else:
                print(f"  - {table}.{column} already exists")

        await db.commit()
        print("\n✅ Done!")

if __name__ == "__main__":
    asyncio.run(run())
