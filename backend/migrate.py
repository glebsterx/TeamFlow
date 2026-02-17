#!/usr/bin/env python3
"""One-shot migration script. Run inside container."""
import asyncio
import os
import sys

DB_URL = os.environ.get("DATABASE_URL", "sqlite+aiosqlite:///./data/teamflow.db")
DB_FILE = DB_URL.replace("sqlite+aiosqlite:///", "")

MIGRATIONS = [
    # (table, column, sql)
    ("tasks",          "assignee_id",    "ALTER TABLE tasks ADD COLUMN assignee_id INTEGER"),
    ("tasks",          "source_chat_id", "ALTER TABLE tasks ADD COLUMN source_chat_id BIGINT"),
    ("telegram_users", None,             """CREATE TABLE IF NOT EXISTS telegram_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id BIGINT NOT NULL UNIQUE,
        username VARCHAR(100),
        first_name VARCHAR(100) NOT NULL DEFAULT '',
        last_name VARCHAR(100),
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )"""),
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
            # Для CREATE TABLE — просто выполняем (IF NOT EXISTS защищает)
            if column is None:
                await db.execute(sql)
                print(f"  ✓ Table {table} ensured")
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
