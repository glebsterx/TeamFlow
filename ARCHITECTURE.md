# TeamFlow - Архитектура проекта

## Обзор

TeamFlow - Telegram-first инструмент управления задачами для малых команд (3-5 человек).

## Технический стек

### Backend
- **Python 3.11**
- **FastAPI** - Web API
- **aiogram 3.4.1** - Telegram Bot
- **SQLAlchemy 2.0.27** - ORM (async)
- **aiosqlite 0.20.0** - SQLite драйвер
- **Pydantic 2.5.3** - Валидация
- **Structlog** - Структурированное логирование

### Frontend
- **React 18.2** - UI библиотека
- **TypeScript 5.3** - Типизация
- **Vite 5.0** - Сборщик
- **TanStack Query** - Управление состоянием
- **Tailwind CSS 3.4** - Стилизация
- **Axios** - HTTP клиент

### Infrastructure
- **Docker & Docker Compose** - Контейнеризация
- **SQLite (WAL mode)** - База данных
- **Nginx** - Reverse proxy (опционально)

## Архитектурные паттерны

### Backend Architecture

```
app/
├── core/           # Общая инфраструктура
│   ├── db.py      # Database setup
│   ├── auth.py    # Telegram Auth
│   ├── logging.py # Structured logging
│   └── clock.py   # Time utilities
│
├── domain/        # Доменные модели
│   ├── models.py  # SQLAlchemy models
│   ├── enums.py   # Enums (Status, Source)
│   └── events.py  # Domain events
│
├── repositories/  # Доступ к данным
│   ├── task_repository.py
│   └── meeting_repository.py
│
├── services/      # Бизнес-логика
│   ├── task_service.py
│   ├── board_service.py
│   └── digest_service.py
│
├── telegram/      # Telegram интеграция
│   ├── bot.py
│   └── handlers/
│       ├── help_handlers.py
│       ├── task_handlers.py
│       ├── week_handlers.py
│       └── ...
│
└── web/          # Web API
    ├── app.py    # FastAPI app
    ├── routes.py # API endpoints
    └── schemas.py # Pydantic schemas
```

### Слои приложения

1. **Transport Layer** (telegram/, web/)
   - Обработка входящих запросов
   - Валидация ввода
   - Форматирование ответов

2. **Service Layer** (services/)
   - Бизнес-логика
   - Оркестрация репозиториев
   - Генерация событий

3. **Repository Layer** (repositories/)
   - Абстракция доступа к данным
   - CRUD операции

4. **Domain Layer** (domain/)
   - Модели данных
   - Бизнес-правила
   - События

## Модель данных

### Task
- id, title, description
- assignee_name, assignee_telegram_id
- status (TODO, DOING, DONE, BLOCKED)
- due_date, definition_of_done
- source (MANUAL_COMMAND, CHAT_MESSAGE)
- created_at, updated_at

### Blocker
- id, task_id, text
- created_by, created_at

### Meeting
- id, meeting_date, summary
- created_at

## Авторизация

### Telegram Auth (JWT)
1. Frontend загружает Telegram Login Widget
2. Пользователь авторизуется через Telegram
3. Backend проверяет подпись Telegram
4. Возвращается JWT токен (24 часа)
5. Токен используется для API запросов

### Безопасность
- Проверка подписи Telegram (HMAC-SHA256)
- JWT токены с expiration
- CORS для frontend
- Protected API endpoints

## Конфигурация

### Двухуровневая система .env

**`.env` (корень)** - для Docker Compose:
```env
BACKEND_PORT=8180
FRONTEND_PORT=5180
BASE_URL=http://localhost
```

**`backend/.env`** - для приложения:
```env
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
TELEGRAM_BOT_USERNAME=...
BASE_URL=http://localhost
BACKEND_PORT=8180
FRONTEND_PORT=5180
DATABASE_URL=sqlite+aiosqlite:///./data/teamflow.db
SECRET_KEY=...
```

## Deployment

### Development
```bash
docker-compose up --build -d
```

### Production
```bash
docker-compose -f docker-compose.prod.yml up -d
```

## Оптимизации

### SQLite
- WAL mode для concurrent reads
- Cache size: 64MB
- Synchronous: NORMAL
- Temp store: MEMORY

### Async везде
- Async SQLAlchemy
- Async aiogram
- Async FastAPI

### Connection Pooling
- StaticPool для SQLite
- Reuse connections

## Мониторинг

### Structured Logging
- JSON формат
- Timestamp, event, context
- Уровни: INFO, WARNING, ERROR

### Health Checks
- `/health` endpoint
- Docker healthcheck
- Retry logic

## Roadmap

### v0.4.0
- Настройки через Web UI
- Роли пользователей
- Scheduled digests

### v1.0.0
- PostgreSQL support
- Telegram Mini App
- Webhooks
- Mobile app
