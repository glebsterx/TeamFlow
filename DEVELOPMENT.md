# TeamFlow — Development Guide

## Стандарты кода

### Python
- Python 3.11+, type hints обязательны
- `async/await` везде (SQLAlchemy async, aiogram 3, FastAPI)
- Pydantic для API схем, SQLAlchemy models для domain
- Один файл — одна ответственность

### Архитектурные правила
- Бизнес-логика только в `services/`
- Handlers не содержат логики — только вызовы сервисов
- Repository только SQL-запросы, без бизнес-логики
- Явные зависимости, без глобальных объектов

### TypeScript / React
- Функциональные компоненты + hooks, строгий режим
- TanStack Query для всех HTTP запросов и кеша
- Tailwind CSS классы напрямую, без CSS файлов
- Все даты из бэкенда — через `parseUTC()` из `utils/dateUtils.ts`
- Статусы задач: `TODO | DOING | DONE | BLOCKED | ON_HOLD` (не `IN_PROGRESS`!)
- Не экспортировать не-компоненты из файлов с React-компонентами (ломает Vite HMR)

---

## Чеклист перед началом фичи

- [ ] Схема БД продумана, миграция написана
- [ ] Pydantic схема ответа (`schemas.py`) определена
- [ ] API endpoint задокументирован
- [ ] Компонент / изменение Dashboard.tsx спланировано

---

## Частые ловушки

| Проблема | Решение |
|---------|---------|
| `ResponseValidationError` при возврате task | Использовать `TaskRepository.get_by_id()` с `selectinload` |
| Stale closure в useEffect | Использовать `useRef` для обработчиков событий |
| Nullable поля (due_date, parent_task_id) | Использовать `model_fields_set` чтобы отличить "не передано" от `null` |
| SQLite deadlock | NullPool в `db.py` (уже настроен) |
| pydantic ValidationError при старте | Лишние поля в .env → `extra = "ignore"` в Settings.Config |
| AiohttpSession(connector=...) | aiogram 3.4.1 не принимает `connector=`; только `proxy="url"` строкой |
| ProxyConnector на уровне модуля | Требует event loop — вызывать только внутри async-функции |
| aiohttp-socks пропал после rebuild | После `docker compose build` — проверить: `docker exec backend python3 -c "import aiohttp_socks"` |

---

## Работа с контейнерами

```bash
# Frontend — изменения применяются автоматически (Vite HMR)
# src/ volume-mounted, никаких действий не нужно

# Backend — перезапуск после изменений:
docker restart teamflow-backend

# Логи:
docker logs teamflow-backend -f
docker logs teamflow-frontend -f

# Миграция БД:
docker exec -it teamflow-backend python migrate.py

# Проверка API:
curl http://localhost:8180/api/tasks | python3 -m json.tool
```

---

## Структура Dashboard.tsx

Один файл, все компоненты:

| Компонент | Назначение |
|-----------|-----------|
| `Dashboard` | State, mutations, nav history, фильтры |
| `ProjectNavPage` | Directory navigation: Проекты → Задача → Подзадачи |
| `TaskModal` | Просмотр/редактирование задачи |
| `NewTaskModal` | Создание задачи (с предзаполнением из контекста) |
| `ProjectModal`, `NewProjectModal` | CRUD проектов |
| `MeetingModal`, `NewMeetingModal` | CRUD встреч |
| `ArchivePage` | Архив + корзина |
| `DigestPage` | Статистика и дайджест |
