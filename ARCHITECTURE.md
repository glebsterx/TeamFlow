# TeamFlow — Архитектура

## Технический стек

### Backend
- **Python 3.11**, **FastAPI** — Web API
- **aiogram 3.4.1** — Telegram Bot
- **SQLAlchemy 2.0 (async)** + **aiosqlite** — ORM + SQLite драйвер
- **Pydantic 2** — валидация схем
- **Structlog** — структурированное логирование

### Frontend
- **React 18** + **TypeScript** — UI
- **Vite 5** — dev сервер + сборщик
- **TanStack Query** — управление состоянием / кеш
- **Tailwind CSS** — стилизация
- **Axios** — HTTP клиент

### Infrastructure
- **Docker Compose** — контейнеризация
- **SQLite (WAL mode)** — база данных
- **Redis** — FSM storage для aiogram

---

## Высокоуровневая схема

```
Telegram Chat → aiogram Bot → Services → Repository → SQLite
                                   ↕
                              FastAPI Web API → React UI
```

Принципы:
- единый источник истины — база данных
- бизнес-логика не зависит от Telegram
- Web и Bot используют один сервисный слой
- минимальная инфраструктура

---

## Структура пакетов

```
backend/app/
├── main.py
├── config.py
├── bot.py
│
├── core/
│   ├── db.py           # NullPool + async engine
│   ├── logging.py      # Structured logging
│   └── clock.py        # Time utilities
│
├── domain/
│   ├── models.py       # SQLAlchemy models (Task, Project, Meeting, Blocker, TelegramUser)
│   ├── enums.py        # TaskStatus, TaskPriority, TaskSource
│   └── events.py       # Domain events
│
├── repositories/
│   ├── task_repository.py      # get_all, get_by_id, get_archived, get_deleted
│   ├── user_repository.py
│   ├── project_repository.py
│   └── meeting_repository.py
│
├── services/
│   ├── task_service.py
│   ├── board_service.py
│   └── digest_service.py
│
├── telegram/
│   └── handlers/
│       ├── task_handlers.py
│       ├── week_handlers.py
│       ├── meeting_handlers.py
│       ├── digest_handlers.py
│       └── help_handlers.py
│
└── web/
    ├── app.py
    ├── routes.py       # REST endpoints
    └── schemas.py      # Pydantic response schemas
```

---

## Слои приложения

| Слой | Директория | Ответственность |
|------|-----------|----------------|
| Transport | `telegram/`, `web/` | Обработка запросов, форматирование ответов |
| Service | `services/` | Бизнес-логика, оркестрация |
| Repository | `repositories/` | Абстракция доступа к данным |
| Domain | `domain/` | Модели, перечисления, события |

**Правила:** handlers не содержат логики; бизнес-логика только в services; repository только SQL.

---

## Модель данных

### Task
```
id, title, description
status: TODO | DOING | DONE | BLOCKED
priority: URGENT | HIGH | NORMAL | LOW
due_date, definition_of_done
parent_task_id FK tasks.id    -- произвольная глубина подзадач
project_id FK projects.id
assignee_id, assignee_name, assignee_telegram_id
archived: bool, deleted: bool  -- soft delete
source: MANUAL_COMMAND | CHAT_MESSAGE
created_at, updated_at, started_at, completed_at
```

### Project
```
id, name, description, emoji, is_active, created_at
```

### Meeting
```
id, summary, meeting_date, created_at
```

### Blocker
```
id, task_id, text, created_by, created_at
```

### TelegramUser
```
id, telegram_id, username, first_name, last_name, display_name, is_active
```

---

## Repository Contracts

### TaskRepository
```python
create(task) -> Task
get_by_id(task_id) -> Task | None        # с selectinload subtasks, blockers, assignee
get_all(status?, assignee_telegram_id?) -> list[Task]  # фильтр archived=False, deleted=False
get_archived() -> list[Task]
get_deleted() -> list[Task]
update(task) -> Task
delete(task_id)                          # физическое, не используется — только soft delete
```

### Сортировка
`get_all()` сортирует по приоритету (URGENT→LOW), затем по `created_at DESC`.

---

## Domain Events

События используются для логирования; в текущей версии не публикуются во внешние системы.

- `TaskCreated` — task_id, source, created_at
- `TaskStatusChanged` — task_id, old_status, new_status
- `BlockerAdded` — task_id, blocker_id
- `MeetingLogged` — meeting_id

---

## Обработка ошибок

| Уровень | Тип | Поведение |
|---------|-----|-----------|
| Domain | DomainError | Логируется, пользователю — безопасное сообщение |
| Repository | RepositoryError | Не выбрасывается наружу из сервисного слоя |
| Transport | TransportError | Обрабатывается в handler |

---

## SQLite оптимизации

```sql
PRAGMA journal_mode=WAL;       -- concurrent reads
PRAGMA synchronous=NORMAL;
PRAGMA cache_size=-64000;      -- 64MB кеш
PRAGMA temp_store=MEMORY;
```

NullPool используется вместо StaticPool — решает deadlock при async SQLite.

---

## Авторизация

Telegram Login Widget + JWT не реализованы — требуют HTTPS.
Текущий статус: Web UI открыт без авторизации (только для локальных/VPS команд).
Планируется в v1.0.0.
