# CLAUDE.md

## Проект

TeamFlow — Telegram-first менеджер задач для малой команды. Telegram-бот + веб-интерфейс.

## Стек

### Backend
- Python 3.11+
- FastAPI (async)
- SQLAlchemy 2.0 (async engine)
- SQLite (миграции — `backend/migrate.py` + `app/core/db.py::_run_migrations()`, без Alembic)
- aiogram 3.x (Telegram-бот, FSM)
- Pydantic v2 (схемы и валидация)

### Frontend
- React 18+ с TypeScript (strict)
- Vite (dev-режим с HMR — прод тоже работает через `vite --host`, не через `vite build`)
- Tailwind CSS

### Инфраструктура
- Docker / Docker Compose
- Деплой: `rsync` кода на сервер + `docker build`/`docker compose up -d --force-recreate` (не через git pull на сервере — там не git-репозиторий)

## Структура проекта

```
teamflow/
├── backend/
│   ├── app/
│   │   ├── web/          # FastAPI роуты (routes.py, routes_auth.py, routes_*.py, app.py)
│   │   ├── telegram/     # Telegram-бот (aiogram): bot.py, handlers/
│   │   ├── domain/       # SQLAlchemy модели (models.py, enums.py, user.py)
│   │   ├── repositories/ # Запросы к БД, без бизнес-логики
│   │   ├── services/     # Бизнес-логика
│   │   └── core/         # config, db, auth deps, logging, clock
│   ├── migrate.py        # Разовый миграционный скрипт (запускать вручную при необходимости)
│   └── tests/            # pytest, изолированная sqlite (tests/test_teamflow.db)
├── frontend/
│   ├── src/
│   │   ├── pages/         # Основные страницы (многие — крупные файлы, см. "Известные проблемы")
│   │   ├── modals/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── api/           # api/client.ts — общий axios-инстанс с auth-интерцептором
│   │   ├── constants/      # constants/taskDisplay.ts — API_URL и текстовые константы
│   │   └── utils/
│   └── tests/              # vitest + Testing Library
├── scripts/check.sh        # Локальный CI: ruff + pytest + tsc + eslint + vitest
├── .githooks/pre-push       # Блокирует push при красном scripts/check.sh (включается вручную)
├── .mcp.json                # MCP-серверы
├── TASKS.md                 # Задачи
├── DECISIONS.md              # Архитектурные решения
├── PLAN.md                   # Аудит и план приведения в порядок (открытые пункты)
├── ROADMAP.md                 # Продуктовый roadmap, история спринтов
├── docker-compose.yml         # Прод (build из исходников, без bind-mount)
└── docker-compose.dev.yml     # Dev (bind-mount, hot reload)
```

## Локальный CI

GitHub здесь используется только как хранилище кода — Actions не запускаются.
`./scripts/check.sh` гоняет то же самое локально. Хук `git config core.hooksPath .githooks`
включается один раз в своём клоне (git его не активирует сам). Подробности — DEVELOPMENT.md.

## Конвенции кода

### Python (backend)
- Имена переменных и функций: snake_case, на английском
- Async по умолчанию для всех эндпоинтов и DB-операций
- Бизнес-логика в `services/`, не в роутах
- Роуты тонкие: парсинг → сервис → ответ
- Pydantic-схемы отдельно от SQLAlchemy-моделей (`app/web/schemas.py` vs `app/domain/models.py`)
- Все эндпоинты с type hints и response_model
- Защищённые эндпоинты: `account_id: int = Depends(get_current_account_id)` (`app/core/deps.py`) —
  никогда не брать `account_id` из query/body от клиента для операций от имени пользователя (IDOR)

### TypeScript (frontend)
- Strict mode
- Функциональные компоненты + hooks
- Интерфейс пропсов: `ComponentNameProps`
- Обработчики событий: `handleVerbNoun`
- HTTP-запросы — через `apiClient` (`api/client.ts`) или голый `axios` (у него тоже есть
  auth-интерцептор, повешен глобально на модуль) — никогда `fetch()` для приватных
  эндпоинтов напрямую, он не пришлёт `Authorization`

### Общие
- Коммиты на русском или английском, осмысленные
- **ВАЖНО: НИКОГДА не делать git commit самостоятельно — только по явному запросу пользователя**
- Не коммитить секреты, `.env` в `.gitignore`
- Логи и комментарии в коде — на английском

## Управление задачами

- Задачи ведутся в `TASKS.md` в корне проекта.
- Перед началом работы прочитай TASKS.md и найди свою задачу.
- После завершения отметь задачу как [x] и обнови статус.
- Формат: `- [ ] **TASK-N:** описание (агент)`
- **Не помечай задачу DONE, если код не подключён/не импортируется** — на этом уже
  ловили: рефакторинг #333 был помечен DONE, но новые модули никем не использовались
  (см. PLAN.md FIX-13). Проверяй реальные call sites, а не факт написания файла.

## Архитектурные решения

- Записываются в `DECISIONS.md` с контекстом и обоснованием.
- Перед предложением альтернативного подхода — проверь DECISIONS.md.

## Тестирование

- Backend: pytest + httpx (AsyncClient для FastAPI), изолированная sqlite — НЕ прод-БД
- Frontend: Vitest + Testing Library
- E2E: не настроено (нет Playwright/Cypress в проекте — не утверждать, что есть)
- Команда запуска: `./scripts/check.sh` (всё сразу) или по отдельности —
  `python3 -m pytest` (backend), `npx vitest run` / `npx tsc --noEmit` / `npx eslint .` (frontend)

## Что НЕ делать

- Не менять структуру БД без миграции (`migrate.py` + `db.py::_run_migrations()` — Alembic не используется)
- Не ставить новые пакеты без подтверждения
- Не хардкодить URL, токены, порты — всё через env/config; для API_URL на фронте —
  относительный путь (проксируется vite/nginx на backend), не абсолютный URL с портом,
  иначе ловим mixed-content на HTTPS-странице за внешним reverse-proxy
- Не писать `SELECT *` — перечислять колонки
- Не оставлять `print()` / `console.log` в коде
- Не использовать `asyncio.create_task` с SQLAlchemy сессией — сессия уже закрыта к моменту выполнения; использовать FastAPI `BackgroundTasks`. Для фоновых задач вне request-цикла — держать strong-ref на Task (иначе GC) и открывать свою сессию
- Не оборачивать `run_bot()`/долгоживущие процессы так, чтобы transient-исключение (сетевой сбой) валило соседний процесс через общий `finally` — уже случалось (см. `app/main.py`, PLAN.md)
- Не экспортировать не-компоненты (`export function foo`) из файлов с React-компонентами — ломает Vite Fast Refresh
- `docker restart` не перечитывает `env_file` из docker-compose — для новых env vars нужно `docker compose up -d --force-recreate`
- Web Push (PushManager) работает только на HTTPS или localhost
- SQLite миграции — через `docker exec teamflow-backend python3 -c "import sqlite3; db=sqlite3.connect('/app/data/teamflow.db'); db.execute('ALTER TABLE ...')"`
- Deep link URL чистить после обработки параметров: `history.replaceState(history.state, '', window.location.pathname)`
- Base-образы в Dockerfile закреплены по digest (не просто тегом) — сеть до Docker Hub с
  прод-сервера систематически рвётся на DNS/TLS; при обновлении версии образа сознательно
  обновляй digest, не просто убирай пин
