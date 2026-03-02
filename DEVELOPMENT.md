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
- Все компоненты в `Dashboard.tsx` (монолит, ~1700 строк)
- TanStack Query для всех HTTP запросов и кеша
- Tailwind CSS классы напрямую, без CSS файлов

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
| `ResponseValidationError` при возврате task | Использовать `TaskRepository.get_by_id()` вместо `db.refresh()` |
| Stale closure в useEffect | Использовать `useRef` для обработчиков событий |
| Nullable поля (due_date, parent_task_id) | Использовать `model_fields_set` чтобы отличить "не передано" от `null` |
| SQLite deadlock | NullPool в `db.py` (уже настроен) |
| Vite build check | `npx vite build` — проверяет JSX без TS ошибок |

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
