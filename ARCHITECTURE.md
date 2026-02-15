# TaskFlow - Архитектура MVP

## Обзор проекта

TaskFlow - это легковесный инструмент управления задачами для малых команд (2-5 человек). MVP фокусируется на базовом функционале создания и управления задачами.

## Технологический стек

### Backend
- **Python 3.11+**
- **FastAPI** - современный асинхронный веб-фреймворк
- **SQLAlchemy** - ORM для работы с БД
- **PostgreSQL** - основная база данных
- **Alembic** - миграции БД
- **Pydantic** - валидация данных
- **JWT** - аутентификация

### Frontend
- **React 18+**
- **TypeScript** - типизация
- **Vite** - сборщик
- **TanStack Query (React Query)** - управление состоянием сервера
- **Zustand** - локальное состояние
- **Tailwind CSS** - стилизация
- **Axios** - HTTP клиент

### DevOps
- **Docker & Docker Compose**
- **Nginx** - reverse proxy (для продакшена)
- **pytest** - тестирование backend
- **Vitest** - тестирование frontend

## Архитектура системы

```
┌─────────────────────────────────────────────────────────┐
│                    Client Browser                        │
│                     (React App)                          │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP/HTTPS
                       │ REST API
┌──────────────────────▼──────────────────────────────────┐
│                   API Gateway                            │
│                  (FastAPI Server)                        │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Authentication Middleware (JWT)                 │   │
│  └──────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐   │
│  │  API Routes                                      │   │
│  │  • /auth/*    - Authentication                   │   │
│  │  • /tasks/*   - Task management                  │   │
│  │  • /users/*   - User management                  │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│              Business Logic Layer                        │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Services                                        │   │
│  │  • TaskService                                   │   │
│  │  • UserService                                   │   │
│  │  • AuthService                                   │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│               Data Access Layer                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  SQLAlchemy Models & Repositories                │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                   PostgreSQL                             │
│                   Database                               │
└─────────────────────────────────────────────────────────┘
```

## Структура базы данных

### Основные таблицы

#### users
```sql
id              UUID PRIMARY KEY
email           VARCHAR(255) UNIQUE NOT NULL
username        VARCHAR(100) UNIQUE NOT NULL
hashed_password VARCHAR(255) NOT NULL
full_name       VARCHAR(255)
is_active       BOOLEAN DEFAULT TRUE
created_at      TIMESTAMP DEFAULT NOW()
updated_at      TIMESTAMP DEFAULT NOW()
```

#### tasks
```sql
id              UUID PRIMARY KEY
title           VARCHAR(255) NOT NULL
description     TEXT
status          VARCHAR(50) NOT NULL DEFAULT 'todo'
                -- 'todo', 'in_progress', 'done'
priority        VARCHAR(50) DEFAULT 'medium'
                -- 'low', 'medium', 'high', 'urgent'
assignee_id     UUID FOREIGN KEY REFERENCES users(id)
creator_id      UUID FOREIGN KEY REFERENCES users(id) NOT NULL
due_date        TIMESTAMP
created_at      TIMESTAMP DEFAULT NOW()
updated_at      TIMESTAMP DEFAULT NOW()
```

### Индексы
- `idx_tasks_assignee` на `tasks.assignee_id`
- `idx_tasks_creator` на `tasks.creator_id`
- `idx_tasks_status` на `tasks.status`
- `idx_tasks_due_date` на `tasks.due_date`

## API Endpoints

### Authentication
- `POST /api/auth/register` - Регистрация нового пользователя
- `POST /api/auth/login` - Вход (получение JWT токена)
- `POST /api/auth/refresh` - Обновление токена
- `GET /api/auth/me` - Получение данных текущего пользователя

### Tasks
- `GET /api/tasks` - Список всех задач (с фильтрами)
  - Query params: `status`, `assignee_id`, `priority`, `limit`, `offset`
- `POST /api/tasks` - Создание новой задачи
- `GET /api/tasks/{task_id}` - Получение задачи по ID
- `PUT /api/tasks/{task_id}` - Полное обновление задачи
- `PATCH /api/tasks/{task_id}` - Частичное обновление задачи
- `DELETE /api/tasks/{task_id}` - Удаление задачи

### Users
- `GET /api/users` - Список пользователей команды
- `GET /api/users/{user_id}` - Информация о пользователе

## Frontend архитектура

```
src/
├── components/           # Переиспользуемые компоненты
│   ├── ui/              # Базовые UI компоненты (Button, Input, etc)
│   ├── TaskCard/        # Карточка задачи
│   ├── TaskList/        # Список задач
│   ├── TaskForm/        # Форма создания/редактирования
│   └── Layout/          # Layout компоненты
├── pages/               # Страницы приложения
│   ├── Login/
│   ├── Dashboard/
│   ├── TaskDetails/
│   └── Settings/
├── api/                 # API клиент
│   ├── client.ts        # Axios instance
│   ├── tasks.ts         # Task endpoints
│   └── auth.ts          # Auth endpoints
├── hooks/               # Custom React hooks
│   ├── useTasks.ts
│   ├── useAuth.ts
│   └── useUsers.ts
├── stores/              # Zustand stores
│   └── authStore.ts
├── types/               # TypeScript типы
│   ├── task.ts
│   └── user.ts
├── utils/               # Утилиты
│   ├── formatters.ts
│   └── validators.ts
└── App.tsx
```

## Backend архитектура

```
backend/
├── app/
│   ├── api/
│   │   ├── deps.py           # Dependencies (auth, db session)
│   │   └── v1/
│   │       ├── endpoints/
│   │       │   ├── auth.py
│   │       │   ├── tasks.py
│   │       │   └── users.py
│   │       └── router.py
│   ├── core/
│   │   ├── config.py         # Конфигурация (settings)
│   │   ├── security.py       # JWT, hashing
│   │   └── database.py       # DB connection
│   ├── models/
│   │   ├── user.py           # SQLAlchemy models
│   │   └── task.py
│   ├── schemas/
│   │   ├── user.py           # Pydantic schemas
│   │   └── task.py
│   ├── services/
│   │   ├── user_service.py   # Business logic
│   │   └── task_service.py
│   └── main.py               # FastAPI app
├── alembic/
│   └── versions/             # Миграции
├── tests/
│   ├── test_auth.py
│   └── test_tasks.py
└── requirements.txt
```

## Принципы архитектуры

### 1. Separation of Concerns
- **API Layer** - только обработка HTTP запросов/ответов
- **Service Layer** - бизнес-логика
- **Data Layer** - работа с БД

### 2. Dependency Injection
FastAPI использует DI для передачи зависимостей (DB session, current user)

### 3. Type Safety
- Backend: Pydantic схемы
- Frontend: TypeScript

### 4. Stateless Authentication
JWT токены для stateless аутентификации

### 5. RESTful Design
Следование REST принципам для предсказуемого API

## Безопасность

1. **Password Hashing** - bcrypt для хеширования паролей
2. **JWT Tokens** - короткий срок жизни (15 мин access, 7 дней refresh)
3. **CORS** - настроенный CORS для frontend
4. **Rate Limiting** - защита от брутфорса (опционально для MVP)
5. **Input Validation** - Pydantic валидация всех входных данных
6. **SQL Injection Protection** - SQLAlchemy ORM

## Масштабируемость

Для маленькой команды (2-5 человек) текущая архитектура избыточна по производительности.

### Возможности роста:
1. **Горизонтальное масштабирование** - добавление API серверов
2. **Кеширование** - Redis для частых запросов
3. **Message Queue** - для асинхронных задач (уведомления)
4. **Websockets** - для real-time обновлений

## Развертывание

### Development
```bash
docker-compose up
```

### Production
- **Backend**: Uvicorn за Nginx
- **Frontend**: Static build на CDN или Nginx
- **Database**: Managed PostgreSQL (AWS RDS, DigitalOcean)
- **Secrets**: Environment variables через .env

## Мониторинг (для будущего)

- **Logs**: Structured logging (JSON)
- **Metrics**: Prometheus + Grafana
- **Error Tracking**: Sentry
- **Uptime**: UptimeRobot

## Roadmap (после MVP)

1. **Комментарии к задачам**
2. **Приоритеты и метки**
3. **Канбан доска**
4. **Уведомления**
5. **История изменений**
6. **Поиск и фильтрация**
7. **Экспорт данных**
8. **API для интеграций**
