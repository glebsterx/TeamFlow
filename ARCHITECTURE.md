# TeamFlow — Архитектура

## Технический стек

### Backend
- **Python 3.11**, **FastAPI** (async) — Web API
- **aiogram 3.4.1** — Telegram Bot
- **SQLAlchemy 2.0 (async)** + **aiosqlite** — ORM + SQLite драйвер
- **Pydantic 2** + **pydantic-settings** — валидация схем и конфига
- **aiohttp-socks** — SOCKS5/HTTP прокси для Telegram бота
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
- **MemoryStorage** — FSM storage для aiogram (Redis убран)
- **Docker Unix socket** — управление контейнерами из бэкенда (restart API)

---

## Высокоуровневая схема

```
Telegram ←→ aiogram Bot (прокси: SOCKS5/HTTP; MTProxy был попробован и не заработал в v0.8.15)
                 ↓
            Services → Repository → SQLite WAL
                 ↕
        FastAPI Web API ←→ React UI
```

Принципы:
- единый источник истины — база данных
- бизнес-логика не зависит от Telegram
- Web и Bot используют один сервисный слой
- бот и API в **разных процессах** (multiprocessing.Process) — shared state только через БД

---

## Процессная архитектура

```
main.py
├── asyncio.run(startup())       ← инициализация БД + миграции
├── Process(run_api)             ← FastAPI/uvicorn, порт 8000 (внешний 8180)
└── run_bot()                    ← aiogram polling
    ├── _make_bot_async()        ← прокси: SOCKS5/HTTP (MTProxy удалён)
    └── asyncio.create_task(run_deadline_checker)
        └── heartbeat каждые 30с → bot_heartbeat таблица
```

---

## Структура пакетов

```
backend/app/
├── main.py                          ← точка входа, запуск процессов
├── config.py                        ← Settings (pydantic-settings, extra="ignore")
│
├── core/
│   ├── db.py                        ← NullPool + AsyncSessionLocal
│   ├── logging.py
│   └── clock.py
│
├── domain/
│   ├── models.py                    ← все SQLAlchemy модели
│   └── enums.py                     ← TaskStatus, TaskPriority, TaskSource
│
├── repositories/
│   ├── task_repository.py
│   ├── user_repository.py
│   ├── project_repository.py
│   └── meeting_repository.py
│
├── services/
│   ├── task_service.py
│   ├── board_service.py
│   ├── digest_service.py
│   ├── account_service.py           ← LocalAccount CRUD, JWT, OAuth
│   ├── settings_service.py          ← app_settings CRUD
│   └── webhook_service.py           ← trigger_webhooks, HMAC, retry
│
├── telegram/
│   ├── bot.py                       ← _make_bot_async(), start_bot()
│   ├── deadline_notifier.py         ← уведомления + heartbeat в БД
│   ├── middleware.py                ← UserTrackingMiddleware
│   └── handlers/
│       ├── task_handlers.py         ← /task FSM
│       ├── tasks_list_handler.py    ← /tasks с фильтрами
│       ├── week_handlers.py         ← /week
│       ├── sprint_handlers.py       ← /sprint (inline board)
│       ├── my_handler.py            ← /my + get_my_tasks_text()
│       ├── meeting_handlers.py      ← /meeting, /meetings
│       ├── digest_handlers.py       ← /digest
│       ├── remind_handler.py        ← /remind
│       ├── help_handlers.py         ← /help, /menu, menu: callbacks
│       └── message_handlers.py      ← автопарсинг сообщений
│
└── web/
    ├── app.py                       ← FastAPI, CORS, API Key middleware, роутеры
    ├── routes.py                    ← основные endpoints
    ├── routes_auth.py               ← auth endpoints (login, register, OAuth, users)
    ├── routes_tags.py               ← /api/tags
    ├── routes_templates.py          ← /api/task-templates
    ├── routes_webapp.py             ← /api/webapp/* (Telegram Mini App)
    ├── routes_webhooks.py           ← /api/webhooks
    └── schemas.py                   ← Pydantic response schemas
```

---

## Модель данных (актуальная — v0.8.19)

```
tasks: id, title, description, status, priority, due_date,
       parent_task_id, project_id, assignee_id FK local_accounts.id,
       archived, deleted, backlog, backlog_added_at,
       source, source_message_id, source_chat_id,
       recurrence, recurrence_end_date,
       time_spent (INTEGER, минуты),
       created_at, updated_at, started_at, completed_at

projects: id, name, description, emoji, is_active, parent_project_id, deleted, created_at

sprints: id, name, description, project_id,
         status (planned|active|completed|archived), position,
         start_date, end_date, is_deleted, created_at
sprint_tasks: id, sprint_id, task_id, position, created_at

meetings: id, summary, meeting_date, title, meeting_type, duration_min, agenda, created_at
meeting_participants: id, meeting_id, display_name, account_id FK local_accounts.id
meeting_projects: meeting_id, project_id
meeting_tasks: id, meeting_id, task_id, created_at

tags: id, name, color
task_tags: task_id, tag_id
task_dependencies: task_id, depends_on_id, created_at
task_templates: id, name, fields_json, created_at

blockers: id, task_id, text, created_by, created_at, resolved_at
comments: id, task_id, text, author_name, author_telegram_id, created_at, updated_at
api_keys: id, name, description, key_hash, is_active, created_at, last_used_at
api_key_logs: id, api_key_id, endpoint, method, ip_address, user_agent, timestamp

webhooks: id, url, events (JSON), secret, is_active, created_at
webhook_logs: id, webhook_id, event, status_code, response, attempt, timestamp

deadline_notifications: id, task_id, threshold_hours, sent_at, user_telegram_id
bot_heartbeat: id=1, last_seen, username, started_at   ← одна запись, пишет бот
push_subscriptions: id, user_id, subscription_json, created_at
app_settings: key PK, value, updated_at  ← система настроек (OAuth, invite_only, bot_username)

# === Авторизация и пользователи ===
local_accounts: id, display_name, first_name, last_name, username, email,
                is_active, system_role (admin/user), created_at, updated_at
local_identities: id, local_account_id FK, login, password_hash, email, is_active
user_identities: id, local_account_id FK, provider (telegram|google|yandex),
                 provider_user_id, email, access_token, refresh_token, linked_at
team_members: id, telegram_user_id FK local_accounts.id, role (owner/admin/member/viewer),
              joined_at, invited_by_id
team_invites: id, invite_token, email, telegram_username, role, created_by_id,
              is_active, expires_at, used_at, used_by_telegram_id, created_at
```

> **TelegramUser таблица удалена** в v0.8.19. Все ссылки на пользователей теперь через LocalAccount.
> **Task.assignee_id** ссылается на `local_accounts.id`, не на `telegram_users.id`.

---

## Слои приложения

| Слой | Директория | Ответственность |
|------|-----------|----------------|
| Transport | `telegram/`, `web/` | Обработка запросов, форматирование ответов |
| Service | `services/` | Бизнес-логика, оркестрация |
| Repository | `repositories/` | Абстракция доступа к данным |
| Domain | `domain/` | Модели, перечисления |

**Правила:** handlers не содержат логики; бизнес-логика только в services; repository только SQL.

---

## Domain Events

События используются для логирования и аудита; в текущей версии не публикуются во внешние системы.

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

## Repository методы (TaskRepository)

```python
get_all() -> list[Task]
get_by_id(task_id) -> Task | None
get_archived() -> list[Task]
get_deleted() -> list[Task]
update(task) -> Task
delete(task_id)  # физическое удаление, не используется — только soft delete
```

**Сортировка:** `get_all()` сортирует по приоритету (URGENT→LOW), затем по `created_at DESC`.

---

## SQLite оптимизации

```sql
PRAGMA journal_mode=WAL;       -- concurrent reads
PRAGMA synchronous=NORMAL;
PRAGMA cache_size=-64000;      -- 64MB кеш
PRAGMA temp_store=MEMORY;
```

NullPool вместо StaticPool — решает deadlock при async SQLite.

---

## Авторизация (v0.8.19)

### Архитектура
- **LocalAccount** — основная сущность пользователя
- **LocalIdentity** — логин/пароль для LocalAccount
- **UserIdentity** — OAuth провайдеры (telegram, google, yandex)
- **System roles**: `admin` (доступ к настройкам), `user` (обычный доступ)
- **Team roles**: `owner`, `admin`, `member`, `viewer` (независимы от system roles)

### Flow авторизации
1. **Локальный вход**: POST /api/auth/local/login → JWT (30 дней access, 90 дней refresh)
2. **Telegram deep link**: `/start weblogin_{token}` → бот сохраняет токены → polling → вход
3. **Google/Yandex OAuth**: редирект → callback → обмен кода → JWT
4. **Invite-only**: если включено, регистрация только с кодом приглашения или email

### API Key Middleware
- Все запросы к `/api/*` (кроме auth) требуют `Origin` с разрешённого домена или `X-API-Key`
- Фронтенд проходит по Origin, внешние клиенты — по API ключу
